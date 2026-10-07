"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/data";
import { nameVariants, normalizeName } from "@/lib/attendance-import";
import { parseDate } from "@/lib/import-map";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { parseSpreadsheets } from "@/lib/parse-spreadsheet";

const MAX_BYTES = 10 * 1024 * 1024;

function pick(row: Record<string, string>, names: string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (names.some((name) => normalizeName(key).includes(normalizeName(name)))) return value.trim();
  }
  return "";
}

/**
 * Import z Informačného systému športu.
 * Zámerne nikdy nevytvára nové dieťa — iba dopĺňa registráciu existujúcim členom.
 */
export async function importSportRegistry(formData: FormData) {
  const { repo } = await requireAdmin("/is-sportu");
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);

  if (!files.length) redirect("/is-sportu?error=" + encodeURIComponent("Vyberte export z IS športu."));
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
    redirect("/is-sportu?error=" + encodeURIComponent("Súbory majú spolu viac než 10 MB."));
  }

  let message: string;
  try {
    const { rows } = await parseSpreadsheets(files);
    if (!rows.length) redirect("/is-sportu?error=" + encodeURIComponent("V súbore sa nenašli žiadne riadky."));

    const children = await repo.listChildren();

    // Presnejší kľúč je meno + dátum narodenia; meno samotné je záložná možnosť.
    const byNameAndDate = new Map<string, string[]>();
    const byName = new Map<string, string[]>();
    for (const child of children) {
      for (const variant of nameVariants(child.first_name, child.last_name)) {
        byName.set(variant, [...(byName.get(variant) ?? []), child.id]);
        const key = `${variant}|${child.birth_date}`;
        byNameAndDate.set(key, [...(byNameAndDate.get(key) ?? []), child.id]);
      }
    }

    let updated = 0;
    const unmatched: string[] = [];
    const ambiguous: string[] = [];

    for (const row of rows) {
      const firstName = pick(row, ["meno"]);
      const lastName = pick(row, ["priezvisko"]);
      if (!firstName || !lastName) continue;

      const birthDate = parseDate(pick(row, ["datum narodenia", "narodenie"]));
      const label = `${lastName} ${firstName}`;
      const variant = normalizeName(`${firstName} ${lastName}`);

      let matches = birthDate ? byNameAndDate.get(`${variant}|${birthDate}`) : undefined;
      if (!matches?.length) matches = byName.get(variant);

      if (!matches?.length) {
        unmatched.push(label);
        continue;
      }
      if (matches.length > 1) {
        ambiguous.push(label);
        continue;
      }

      const child = children.find((entry) => entry.id === matches[0]);
      if (!child) continue;

      const identifier = pick(row, ["jedinecny identifikator", "identifikator", "id osoby"]);
      const validFrom = parseDate(pick(row, ["platnost udajov", "platnost", "datum registracie"]));
      const nationalId = pick(row, ["rodne cislo"]);

      await repo.updateChild(child.id, {
        first_name: child.first_name,
        last_name: child.last_name,
        birth_date: child.birth_date,
        team: child.team,
        active: child.active,
        membership_date: child.membership_date,
        is_sport_registered: true,
        sport_registered_at: validFrom || child.sport_registered_at,
        sport_identifier: identifier || child.sport_identifier,
        // Rodné číslo dopĺňame, nikdy neprepisujeme existujúce.
        national_id: child.national_id || nationalId || null,
        permanent_address: child.permanent_address,
      });
      updated += 1;
    }

    const parts = [`${updated} detí označených ako registrované`];
    if (unmatched.length) parts.push(`nespárované (${unmatched.length}): ${unmatched.slice(0, 8).join(", ")}`);
    if (ambiguous.length) parts.push(`nejednoznačné: ${ambiguous.join(", ")}`);
    message = `Import hotový — ${parts.join(" · ")}. Nové deti sa nevytvárajú.`;
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/is-sportu?error=" + encodeURIComponent(`Import zlyhal: ${errorMessage(error)}`));
  }

  revalidatePath("/is-sportu");
  revalidatePath("/clenovia");
  redirect("/is-sportu?success=" + encodeURIComponent(message));
}
