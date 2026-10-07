"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { requireAdmin, type ChildInput } from "@/lib/data";
import { describeSkipped, memberKey, today, type SkippedImportRow } from "@/lib/domain";
import { IMPORT_FIELDS, mapImportRows, type ImportField } from "@/lib/import-map";
import { SOURCE_COLUMN, parseSpreadsheets } from "@/lib/parse-spreadsheet";
import { sendPushSafely } from "@/lib/push";

const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadImport(formData: FormData) {
  const { repo } = await requireAdmin("/import");

  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);

  if (!files.length) {
    redirect("/import?error=" + encodeURIComponent("Vyberte aspoň jeden súbor .xlsx alebo .csv."));
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
    redirect("/import?error=" + encodeURIComponent("Súbory majú spolu viac než 10 MB."));
  }

  let message: string;
  try {
    const { headers, rows, summary, perFile } = await parseSpreadsheets(files);
    if (!headers.length || !rows.length) {
      redirect("/import?error=" + encodeURIComponent("V súboroch sa nenašla hlavička ani žiadne riadky."));
    }
    await repo.savePendingImport({
      token: crypto.randomUUID(),
      kind: "members",
      file_name: summary,
      headers,
      rows,
      created_at: new Date().toISOString(),
    });
    message =
      perFile.length > 1
        ? `Načítaných ${perFile.length} súborov, spolu ${rows.length} riadkov. Skontroluj mapovanie a náhľad.`
        : "Súbor je načítaný. Skontroluj mapovanie stĺpcov a náhľad.";
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/import?error=" + encodeURIComponent(`Súbor sa nepodarilo prečítať: ${errorMessage(error)}`));
  }

  revalidatePath("/import");
  redirect("/import?success=" + encodeURIComponent(message));
}

export async function cancelImport() {
  const { repo } = await requireAdmin("/import");
  await repo.clearPendingImport();
  revalidatePath("/import");
  redirect("/import?success=" + encodeURIComponent("Import bol zrušený."));
}

/**
 * Potvrdenie importu. Token sa dá uplatniť len raz — druhé kliknutie
 * (alebo obnovenie stránky) už nové záznamy nevytvorí.
 */
export async function confirmImport(formData: FormData) {
  const { repo } = await requireAdmin("/import");

  const pending = await repo.pendingImport();
  if (!pending) redirect("/import?error=" + encodeURIComponent("Nie je pripravený žiadny import."));

  const token = String(formData.get("token") ?? "");
  if (token !== pending.token) {
    redirect("/import?error=" + encodeURIComponent("Náhľad importu sa medzitým zmenil. Skús to znova."));
  }
  if (!(await repo.claimImportToken(token))) {
    redirect("/import?error=" + encodeURIComponent("Tento import už prebehol — nič sa nevytvorilo dvakrát."));
  }

  const mapping = Object.fromEntries(
    Object.keys(IMPORT_FIELDS).map((field) => [field, String(formData.get(`map_${field}`) ?? "")]),
  ) as Record<ImportField, string>;

  const summary = { created: 0, updated: 0, skipped: 0 };
  let skipped: SkippedImportRow[] = [];
  try {
    const mapped = mapImportRows(pending.rows, mapping);
    skipped = describeSkipped(mapped, pending.rows.map((row) => row[SOURCE_COLUMN]));
    const [existing, existingContacts] = await Promise.all([repo.listChildren(), repo.listContacts()]);
    const byKey = new Map(
      existing.map((child) => [memberKey(child.first_name, child.last_name, child.birth_date), child]),
    );
    const contactByChild = new Map(existingContacts.map((contact) => [contact.child_id, contact]));

    for (const row of mapped) {
      if (row.errors.length || !row.team) {
        summary.skipped += 1;
        continue;
      }

      const contact = {
        father_name: row.father_name || null,
        father_phone: row.father_phone || null,
        mother_name: row.mother_name || null,
        mother_phone: row.mother_phone || null,
        address: row.contact_address || null,
        emails: row.emails,
      };
      const match = byKey.get(row.key);

      if (match) {
        // Aktualizácia dopĺňa, neprepisuje existujúce hodnoty prázdnymi.
        const merged: ChildInput = {
          first_name: match.first_name,
          last_name: match.last_name,
          birth_date: match.birth_date,
          team: row.team,
          active: match.active,
          membership_date: match.membership_date || row.membership_date,
          is_sport_registered: row.is_sport_registered || match.is_sport_registered,
          sport_registered_at: match.sport_registered_at,
          sport_identifier: row.sport_identifier || match.sport_identifier,
          national_id: row.national_id || match.national_id,
          permanent_address: row.permanent_address || match.permanent_address,
        };
        await repo.updateChild(match.id, merged);
        if (Object.values(contact).some((value) => (Array.isArray(value) ? value.length : value))) {
          // Aj kontakt len dopĺňame — prázdna bunka v hárku nesmie zmazať telefón,
          // ktorý už v appke je.
          const previous = contactByChild.get(match.id);
          await repo.saveContact(match.id, {
            father_name: contact.father_name ?? previous?.father_name ?? null,
            father_phone: contact.father_phone ?? previous?.father_phone ?? null,
            mother_name: contact.mother_name ?? previous?.mother_name ?? null,
            mother_phone: contact.mother_phone ?? previous?.mother_phone ?? null,
            address: contact.address ?? previous?.address ?? null,
            emails: contact.emails.length ? contact.emails : previous?.emails ?? [],
          });
        }
        summary.updated += 1;
        continue;
      }

      const child = await repo.createChild({
        first_name: row.first_name,
        last_name: row.last_name,
        birth_date: row.birth_date,
        team: row.team,
        active: true,
        membership_date: row.membership_date || today(),
        is_sport_registered: row.is_sport_registered,
        sport_registered_at: null,
        sport_identifier: row.sport_identifier || null,
        national_id: row.national_id || null,
        permanent_address: row.permanent_address || null,
      });
      byKey.set(row.key, child);
      if (Object.values(contact).some((value) => (Array.isArray(value) ? value.length : value))) {
        await repo.saveContact(child.id, contact);
      }
      summary.created += 1;
    }

    await repo.clearPendingImport();
    await sendPushSafely(repo, {
      title: "Import členov dokončený",
      body: `${summary.created} nových · ${summary.updated} aktualizovaných · ${summary.skipped} nespárovaných.`,
      url: "/clenovia",
      tag: "import",
    });
  } catch (error) {
    rethrowControlFlow(error);
    // Token je už spotrebovaný, preto zahodíme aj náhľad — inak by sa používateľ
    // zasekol na hláške „import už prebehol“ a nevedel by pokračovať.
    await repo.clearPendingImport();
    redirect(
      "/import?error=" +
        encodeURIComponent(`Import zlyhal: ${errorMessage(error)}. Časť záznamov mohla byť uložená — nahraj súbor znova, duplikáty sa nevytvoria.`),
    );
  }

  // Prepíše záznam z minulého importu členov — aj keď tentoraz nič nechýba, aby tam nestrašil starý zoznam.
  await repo.saveImportLog({
    kind: "members",
    file_name: pending.file_name,
    created_at: new Date().toISOString(),
    skipped,
  });
  revalidatePath("/import");
  revalidatePath("/clenovia");
  revalidatePath("/kontakty");
  revalidatePath("/prehlad");
  redirect(
    "/import?success=" +
      encodeURIComponent(`Import hotový: ${summary.created} nových, ${summary.updated} aktualizovaných, ${summary.skipped} nespárovaných.`),
  );
}
