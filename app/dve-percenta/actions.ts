"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, type TaxDonationInput } from "@/lib/data";
import { nameVariants, normalizeName } from "@/lib/attendance-import";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { parseSpreadsheets } from "@/lib/parse-spreadsheet";
import { donationFingerprint } from "@/lib/tax-donations";

const MAX_BYTES = 10 * 1024 * 1024;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function pick(row: Record<string, string>, names: string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (names.some((name) => normalizeName(key).includes(normalizeName(name)))) return value.trim();
  }
  return "";
}

function parseAmount(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(",", ".");
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

/** Import darovaných súm z Google Forms. Jedno dieťa môže mať viac darov. */
export async function importDonations(formData: FormData) {
  const { repo } = await requireAdmin("/dve-percenta");
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);

  if (!files.length) redirect("/dve-percenta?error=" + encodeURIComponent("Vyberte súbor s darmi."));
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
    redirect("/dve-percenta?error=" + encodeURIComponent("Súbory majú spolu viac než 10 MB."));
  }

  let message: string;
  try {
    const { rows } = await parseSpreadsheets(files);
    if (!rows.length) redirect("/dve-percenta?error=" + encodeURIComponent("V súbore sa nenašli žiadne riadky."));

    const [children, season] = await Promise.all([repo.listChildren(), repo.currentSeason()]);
    const byName = new Map<string, string[]>();
    for (const child of children) {
      for (const variant of nameVariants(child.first_name, child.last_name)) {
        byName.set(variant, [...(byName.get(variant) ?? []), child.id]);
      }
    }

    const inputs: TaxDonationInput[] = [];
    let matched = 0;
    let unassigned = 0;
    let skipped = 0;

    for (const row of rows) {
      const childName = pick(row, ["meno dietata", "dieta", "meno a priezvisko", "meno"]);
      const amount = parseAmount(pick(row, ["suma", "darovana suma", "amount", "castka"]));
      if (!childName || amount === null) {
        skipped += 1;
        continue;
      }

      const hits = byName.get(normalizeName(childName));
      const childId = hits?.length === 1 ? hits[0] : null;
      if (childId) matched += 1;
      else unassigned += 1;

      const donor = pick(row, ["darca", "meno darcu", "donor"]);
      inputs.push({
        season_id: season.id,
        child_id: childId,
        donor_name: donor,
        amount,
        // Nespárované meno si necháme v poznámke, aby sa dalo priradiť ručne.
        note: childId ? "" : `Nespárované meno: ${childName}`,
        fingerprint: donationFingerprint(
          season.id,
          pick(row, ["casova peciatka", "timestamp", "datum"]),
          childName,
          donor,
          amount,
        ),
      });
    }

    const saved = await repo.saveDonations(inputs);
    const duplicates = inputs.length - saved;
    message =
      `Import hotový: ${saved} nových darov · ${matched} priradených dieťaťu · ${unassigned} na ručné priradenie · ${skipped} preskočených` +
      (duplicates ? ` · ${duplicates} už bolo naimportovaných (nezapočítali sa znova).` : ".");
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/dve-percenta?error=" + encodeURIComponent(`Import zlyhal: ${errorMessage(error)}`));
  }

  revalidatePath("/dve-percenta");
  revalidatePath("/platby");
  redirect("/dve-percenta?success=" + encodeURIComponent(message));
}

export async function saveDonation(formData: FormData) {
  const { repo } = await requireAdmin("/dve-percenta");
  const id = text(formData, "id");
  const amount = parseAmount(text(formData, "amount"));

  try {
    if (id) {
      await repo.updateDonation(id, {
        child_id: text(formData, "child_id") || null,
        donor_name: text(formData, "donor_name"),
        amount: amount ?? 0,
        note: text(formData, "note"),
      });
    } else {
      if (amount === null) redirect("/dve-percenta?error=" + encodeURIComponent("Zadajte platnú sumu."));
      const season = await repo.currentSeason();
      await repo.saveDonations([
        {
          season_id: season.id,
          child_id: text(formData, "child_id") || null,
          donor_name: text(formData, "donor_name"),
          amount,
          note: text(formData, "note"),
          fingerprint: null,
        },
      ]);
    }
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/dve-percenta?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/dve-percenta");
  revalidatePath("/platby");
  redirect("/dve-percenta?success=" + encodeURIComponent("Dar bol uložený."));
}

export async function deleteDonations(formData: FormData) {
  const { repo } = await requireAdmin("/dve-percenta");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) redirect("/dve-percenta?error=" + encodeURIComponent("Vyberte aspoň jeden dar."));

  let removed = 0;
  try {
    removed = await repo.deleteDonations(ids);
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/dve-percenta?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/dve-percenta");
  redirect("/dve-percenta?success=" + encodeURIComponent(`Vymazaných darov: ${removed}.`));
}
