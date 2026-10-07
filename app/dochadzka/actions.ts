"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { getSession, type AttendanceInput } from "@/lib/data";
import { nameVariants, normalizeName, readAttendanceSheet } from "@/lib/attendance-import";
import { parseCsvGrid } from "@/lib/import-map";
import { isLegacyXls, readXlsxSheets } from "@/lib/xlsx-read";

const MAX_BYTES = 10 * 1024 * 1024;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Zjednotené čítanie .xlsx aj .csv do surovej mriežky buniek.
 * Dôležité: nesmieme použiť parser členského importu, ten berie prvý riadok ako
 * hlavičku — v dochádzkovom hárku býva prvý riadok nadpis a dátumy sú až nižšie.
 *
 * Tréneri vedú dochádzku v jednom zošite s hárkom na mesiac, preto čítame
 * všetky hárky. Zápis je idempotentný (dieťa + dátum), takže naimportovať
 * celý zošit naraz je bezpečné.
 */
async function readGrids(file: File): Promise<{ label: string; grid: string[][] }[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return [{ label: file.name, grid: parseCsvGrid(buffer.toString("utf8")) }];
  }
  if (isLegacyXls(buffer)) {
    throw new Error(`${file.name} je v starom formáte .xls — otvor ho v Exceli a ulož ako .xlsx alebo CSV.`);
  }
  return readXlsxSheets(buffer).map((sheet) => ({ label: `${file.name} → ${sheet.name}`, grid: sheet.grid }));
}

/**
 * Import dochádzkového hárku. Zápis je idempotentný (dieťa + dátum),
 * takže opakovaný import ten istý deň len prepíše a nevytvorí duplikáty.
 */
export async function importAttendance(formData: FormData) {
  const { repo } = await getSession();

  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) redirect("/dochadzka?error=" + encodeURIComponent("Vyberte hárok s dochádzkou."));
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
    redirect("/dochadzka?error=" + encodeURIComponent("Súbory majú spolu viac než 10 MB."));
  }

  let message: string;
  try {
    const [children, season] = await Promise.all([repo.listChildren(), repo.currentSeason()]);

    // Meno v hárku môže byť „Priezvisko Meno“ aj „Meno Priezvisko“.
    const byName = new Map<string, string[]>();
    for (const child of children) {
      for (const variant of nameVariants(child.first_name, child.last_name)) {
        byName.set(variant, [...(byName.get(variant) ?? []), child.id]);
      }
    }

    const entries: AttendanceInput[] = [];
    const unmatched = new Set<string>();
    const ambiguous = new Set<string>();
    let days = 0;
    let matchedPeople = 0;

    // Hárky bez riadku s dátumami (napr. „Info“, „Kontakty“) len preskočíme —
    // chybu hlásime, až keď v celom súbore nebol ani jeden použiteľný hárok.
    const skippedSheets: string[] = [];
    let usedSheets = 0;

    for (const file of files) {
      const grids = await readGrids(file);
      let usedInFile = 0;

      for (const { label, grid } of grids) {
        const sheet = readAttendanceSheet(grid);
        if (!sheet) {
          skippedSheets.push(label);
          continue;
        }
        usedInFile += 1;
        usedSheets += 1;
        days += sheet.dates.length;

        for (const person of sheet.people) {
          const matches = byName.get(normalizeName(person.rawName));
          if (!matches?.length) {
            unmatched.add(person.rawName);
            continue;
          }
          if (matches.length > 1) {
            ambiguous.add(person.rawName);
            continue;
          }
          matchedPeople += 1;
          const childId = matches[0];
          for (const date of person.presentDates) {
            entries.push({ child_id: childId, season_id: season.id, date, present: true });
          }
          for (const date of person.absentDates) {
            entries.push({ child_id: childId, season_id: season.id, date, present: false });
          }
        }
      }

      if (!usedInFile) {
        redirect(
          "/dochadzka?error=" +
            encodeURIComponent(`V súbore ${file.name} sa nenašiel riadok s dátumami tréningov.`),
        );
      }
    }

    const saved = await repo.saveAttendance(entries);

    const parts = [`${saved} záznamov dochádzky`, `${matchedPeople} spárovaných detí`, `${days} dní`];
    if (usedSheets > 1) parts.unshift(`${usedSheets} hárkov`);
    if (skippedSheets.length) parts.push(`bez dátumov (preskočené): ${skippedSheets.slice(0, 5).join(", ")}`);
    if (unmatched.size) parts.push(`nespárované: ${[...unmatched].slice(0, 8).join(", ")}`);
    if (ambiguous.size) parts.push(`nejednoznačné mená: ${[...ambiguous].join(", ")}`);
    message = `Import hotový — ${parts.join(" · ")}.`;
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/dochadzka?error=" + encodeURIComponent(`Import zlyhal: ${errorMessage(error)}`));
  }

  revalidatePath("/dochadzka");
  redirect("/dochadzka?success=" + encodeURIComponent(message));
}

/** Ručný zápis trénera priamo v appke. */
export async function markAttendance(formData: FormData) {
  const { repo } = await getSession();

  const date = text(formData, "date");
  const presentIds = formData.getAll("present").map(String).filter(Boolean);
  const allIds = formData.getAll("child_ids").map(String).filter(Boolean);
  const back = text(formData, "back") || "/dochadzka";

  if (!date) redirect("/dochadzka?error=" + encodeURIComponent("Vyberte dátum tréningu."));
  if (!allIds.length) redirect("/dochadzka?error=" + encodeURIComponent("Vyberte družstvo so zapísanými deťmi."));

  try {
    const season = await repo.currentSeason();
    await repo.saveAttendance(
      allIds.map((childId) => ({
        child_id: childId,
        season_id: season.id,
        date,
        present: presentIds.includes(childId),
      })),
    );
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/dochadzka?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/dochadzka");
  const separator = back.includes("?") ? "&" : "?";
  redirect(
    `${back}${separator}success=` +
      encodeURIComponent(`Dochádzka na ${date} bola uložená (${presentIds.length} prítomných).`),
  );
}
