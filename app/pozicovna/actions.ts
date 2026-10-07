"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, type Equipment, type EquipmentInput } from "@/lib/data";
import { describeSkippedEquipment, today } from "@/lib/domain";
import {
  DEFAULT_CATEGORIES,
  isCondition,
  isEquipmentPurpose,
  isEquipmentStatus,
  importLeafCategory,
  normalizeCategoryName,
  seasonPrice,
} from "@/lib/equipment";
import { EQUIPMENT_IMPORT_FIELDS, mapEquipmentRows, type EquipmentImportField } from "@/lib/equipment-import";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { parseSpreadsheets, SOURCE_COLUMN } from "@/lib/parse-spreadsheet";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function price(formData: FormData, key: string): number | null {
  const raw = text(formData, key).replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

/** Hláška späť na stránku, z ktorej akcia vyšla — aj s jej filtrami v URL. */
function errorBack(back: string) {
  return (message: string) => `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}

function refresh() {
  revalidatePath("/pozicovna");
  revalidatePath("/pozicovna/vypozicky");
  revalidatePath("/pozicovna/kategorie");
}

/* ---------- Kategórie ---------- */

export async function saveEquipmentCategory(formData: FormData) {
  const { repo } = await requireAdmin("/pozicovna/kategorie");
  const name = text(formData, "name");
  if (!name) redirect("/pozicovna/kategorie?error=" + encodeURIComponent("Zadajte názov kategórie."));

  try {
    await repo.saveEquipmentCategory({
      id: text(formData, "id") || undefined,
      name,
      parent_id: text(formData, "parent_id") || null,
      season_price: price(formData, "season_price"),
    });
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/pozicovna/kategorie?error=" + encodeURIComponent(errorMessage(error)));
  }

  refresh();
  redirect("/pozicovna/kategorie?success=" + encodeURIComponent(`Kategória „${name}“ bola uložená.`));
}

export async function deleteEquipmentCategory(formData: FormData) {
  const { repo } = await requireAdmin("/pozicovna/kategorie");
  const id = text(formData, "id");

  try {
    await repo.deleteEquipmentCategory(id);
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/pozicovna/kategorie?error=" + encodeURIComponent(errorMessage(error)));
  }

  refresh();
  redirect("/pozicovna/kategorie?success=" + encodeURIComponent("Kategória bola vymazaná, kusy zostali bez zaradenia."));
}

/** Jednorazovo založí štandardné kategórie zo zadania, bez duplicít. */
export async function seedCategories() {
  const { repo } = await requireAdmin("/pozicovna/kategorie");

  let added = 0;
  try {
    const existing = await repo.listEquipmentCategories();
    const taken = new Set(existing.filter((c) => !c.parent_id).map((c) => normalizeCategoryName(c.name)));
    for (const name of DEFAULT_CATEGORIES) {
      if (taken.has(normalizeCategoryName(name))) continue;
      await repo.saveEquipmentCategory({ name, parent_id: null, season_price: null });
      added += 1;
    }
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/pozicovna/kategorie?error=" + encodeURIComponent(errorMessage(error)));
  }

  refresh();
  redirect(
    "/pozicovna/kategorie?success=" +
      encodeURIComponent(added ? `Doplnených ${added} štandardných kategórií.` : "Všetky štandardné kategórie už existujú."),
  );
}

/* ---------- Kusy výstroja ---------- */

function readEquipment(formData: FormData): EquipmentInput | null {
  const inventory_code = text(formData, "inventory_code");
  const name = text(formData, "name");
  if (!inventory_code || !name) return null;

  const condition = text(formData, "condition");
  const status = text(formData, "status");
  const purpose = text(formData, "purpose");

  // Prázdny počet klipsov musí zostať prázdny — nula by znamenala „bez klipsov“.
  const rawBuckles = text(formData, "buckles");
  const buckles = rawBuckles && Number.isInteger(Number(rawBuckles)) ? Number(rawBuckles) : null;

  return {
    inventory_code,
    name,
    category_id: text(formData, "category_id") || null,
    size: text(formData, "size"),
    brand: text(formData, "brand"),
    model: text(formData, "model"),
    color: text(formData, "color"),
    buckles: buckles !== null && buckles > 0 && buckles <= 10 ? buckles : null,
    quantity: /^\d+$/.test(text(formData, "quantity")) ? Number(text(formData, "quantity")) : null,
    season_price: price(formData, "season_price"),
    condition: isCondition(condition) ? condition : "nove",
    status: isEquipmentStatus(status) ? status : "dostupne",
    purpose: isEquipmentPurpose(purpose) ? purpose : "prenajom",
    note: text(formData, "note"),
  };
}

type Repo = Awaited<ReturnType<typeof requireAdmin>>["repo"];

/**
 * Stav „požičané“ v úprave kusu a výpožička musia hovoriť to isté.
 *
 * - požičané + vybraté dieťa → otvorená výpožička na toto dieťa (ak bola na
 *   iné dieťa, tú staršiu uzavrieme ako vrátenú),
 * - iný stav než požičané → otvorenú výpožičku uzavrieme,
 * - požičané bez vybratého dieťaťa → výpožičky nechávame tak, ako sú.
 */
async function syncBorrower(repo: Repo, item: Equipment, childId: string) {
  const loans = await repo.listLoans();
  const open = loans.filter((loan) => loan.equipment_id === item.id && !loan.returned);

  if (item.status !== "pozicane") {
    if (open.length) await repo.updateLoans(open.map((loan) => loan.id), { returned: true, returned_on: today() });
    return;
  }
  if (!childId) return;
  if (open.some((loan) => loan.child_id === childId)) return;

  if (open.length) await repo.updateLoans(open.map((loan) => loan.id), { returned: true, returned_on: today() });
  const [categories, season] = await Promise.all([repo.listEquipmentCategories(), repo.currentSeason()]);
  await repo.saveLoan({
    equipment_id: item.id,
    child_id: childId,
    season_id: season.id,
    borrowed_on: today(),
    returned_on: null,
    price: seasonPrice(item, categories),
    paid: false,
    returned: false,
    note: "",
  });
}

export async function saveEquipment(formData: FormData) {
  const { repo } = await requireAdmin("/pozicovna");
  const input = readEquipment(formData);
  const id = text(formData, "id");
  if (!input) redirect("/pozicovna?error=" + encodeURIComponent("Vyplňte inventárne číslo a názov."));

  try {
    const existing = await repo.listEquipment();
    const clash = existing.find(
      (item) => item.inventory_code.toLowerCase() === input.inventory_code.toLowerCase() && item.id !== id,
    );
    if (clash) {
      redirect("/pozicovna?error=" + encodeURIComponent(`Inventárne číslo ${input.inventory_code} už používa iný kus.`));
    }
    const saved = await repo.saveEquipment(id ? { ...input, id } : input);
    await syncBorrower(repo, saved, text(formData, "borrower_child_id"));
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/pozicovna?error=" + encodeURIComponent(errorMessage(error)));
  }

  refresh();
  redirect("/pozicovna?success=" + encodeURIComponent(`Kus ${input.inventory_code} bol uložený.`));
}

export async function bulkEquipment(formData: FormData) {
  const { repo } = await requireAdmin("/pozicovna");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const action = text(formData, "bulk_action");
  if (!ids.length) redirect("/pozicovna?error=" + encodeURIComponent("Vyberte aspoň jeden kus."));

  let message: string;
  try {
    if (action === "status") {
      const status = text(formData, "bulk_status");
      if (!isEquipmentStatus(status)) redirect("/pozicovna?error=" + encodeURIComponent("Vyberte stav."));
      message = `Zmenený stav u ${await repo.bulkEquipment(ids, { type: "status", status })} kusov.`;
    } else if (action === "category") {
      const categoryId = text(formData, "bulk_category");
      message = `Preradených kusov: ${await repo.bulkEquipment(ids, { type: "category", categoryId })}.`;
    } else if (action === "purpose") {
      const purpose = text(formData, "bulk_purpose");
      if (!isEquipmentPurpose(purpose)) redirect("/pozicovna?error=" + encodeURIComponent("Vyberte určenie."));
      message = `Určenie zmenené u ${await repo.bulkEquipment(ids, { type: "purpose", purpose })} kusov.`;
    } else if (action === "delete") {
      message = `Vymazaných kusov: ${await repo.bulkEquipment(ids, { type: "delete" })}.`;
    } else {
      redirect("/pozicovna?error=" + encodeURIComponent("Neznáma hromadná akcia."));
    }
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/pozicovna?error=" + encodeURIComponent(errorMessage(error)));
  }

  refresh();
  redirect("/pozicovna?success=" + encodeURIComponent(message));
}

/* ---------- Výpožičky ---------- */

export async function createLoan(formData: FormData) {
  // Požičať sa dá z Výpožičiek aj priamo zo zoznamu inventára — vraciame sa tam,
  // odkiaľ to admin spustil, aj s jeho filtrami.
  const back = text(formData, "back") || "/pozicovna/vypozicky";
  const { repo } = await requireAdmin(back);
  const equipmentId = text(formData, "equipment_id");
  const childId = text(formData, "child_id");
  if (!equipmentId || !childId) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=` + encodeURIComponent("Vyberte kus výstroja aj dieťa."));
  }

  let message: string;
  try {
    const [equipment, categories, loans, season] = await Promise.all([
      repo.listEquipment(),
      repo.listEquipmentCategories(),
      repo.listLoans(),
      repo.currentSeason(),
    ]);

    const item = equipment.find((entry) => entry.id === equipmentId);
    if (!item) redirect(errorBack(back)("Kus výstroja neexistuje."));
    if (loans.some((loan) => loan.equipment_id === equipmentId && !loan.returned)) {
      redirect(errorBack(back)(`Kus ${item.inventory_code} je už požičaný.`));
    }

    const custom = price(formData, "price");
    await repo.saveLoan({
      equipment_id: equipmentId,
      child_id: childId,
      season_id: season.id,
      borrowed_on: text(formData, "borrowed_on") || today(),
      returned_on: null,
      price: custom ?? seasonPrice(item, categories),
      paid: formData.get("paid") === "on",
      returned: false,
      note: text(formData, "note"),
    });
    // Stav kusu držíme v súlade s výpožičkou, nech zoznam nikdy neklame.
    await repo.saveEquipment({ ...item, id: item.id, status: "pozicane" });
    message = `Kus ${item.inventory_code} bol požičaný.`;
  } catch (error) {
    rethrowControlFlow(error);
    redirect(errorBack(back)(errorMessage(error)));
  }

  refresh();
  redirect(`${back}${back.includes("?") ? "&" : "?"}success=` + encodeURIComponent(message));
}

export async function bulkLoans(formData: FormData) {
  const { repo } = await requireAdmin("/pozicovna/vypozicky");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const action = text(formData, "bulk_action");
  if (!ids.length) redirect("/pozicovna/vypozicky?error=" + encodeURIComponent("Vyberte aspoň jednu výpožičku."));

  let message: string;
  try {
    if (action === "return") {
      const loans = await repo.listLoans();
      const equipment = await repo.listEquipment();
      const count = await repo.updateLoans(ids, { returned: true, returned_on: today() });
      // Vrátené kusy sa vracajú medzi dostupné, ak neboli medzitým poškodené či stratené.
      for (const loan of loans.filter((entry) => ids.includes(entry.id))) {
        const item = equipment.find((entry) => entry.id === loan.equipment_id);
        if (item && item.status === "pozicane") {
          await repo.saveEquipment({ ...item, id: item.id, status: "dostupne" });
        }
      }
      message = `Označených ako vrátené: ${count}.`;
    } else if (action === "paid") {
      message = `Označených ako zaplatené: ${await repo.updateLoans(ids, { paid: true })}.`;
    } else if (action === "unpaid") {
      message = `Vrátených medzi nezaplatené: ${await repo.updateLoans(ids, { paid: false })}.`;
    } else if (action === "delete") {
      message = `Vymazaných výpožičiek: ${await repo.deleteLoans(ids)}.`;
    } else {
      redirect("/pozicovna/vypozicky?error=" + encodeURIComponent("Neznáma hromadná akcia."));
    }
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/pozicovna/vypozicky?error=" + encodeURIComponent(errorMessage(error)));
  }

  refresh();
  redirect("/pozicovna/vypozicky?success=" + encodeURIComponent(message));
}

/* ---------- Import inventára ---------- */

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Načíta súbory a odloží náhľad na potvrdenie. Nič sa ešte nezapisuje —
 * rovnaký princíp preview → mapovanie → potvrdenie ako pri importe členov.
 */
export async function uploadEquipmentImport(formData: FormData) {
  const { repo } = await requireAdmin("/pozicovna");
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);

  if (!files.length) redirect("/pozicovna?error=" + encodeURIComponent("Vyberte súbor s inventárom."));
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
    redirect("/pozicovna?error=" + encodeURIComponent("Súbory majú spolu viac než 10 MB."));
  }

  let message: string;
  try {
    const { headers, rows, summary, perFile } = await parseSpreadsheets(files);
    if (!rows.length) redirect("/pozicovna?error=" + encodeURIComponent("V súbore sa nenašli žiadne riadky."));

    await repo.savePendingImport({
      token: crypto.randomUUID(),
      kind: "equipment",
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
    redirect("/pozicovna?error=" + encodeURIComponent(`Súbor sa nepodarilo prečítať: ${errorMessage(error)}`));
  }

  refresh();
  redirect("/pozicovna?success=" + encodeURIComponent(message));
}

export async function cancelEquipmentImport() {
  const { repo } = await requireAdmin("/pozicovna");
  await repo.clearPendingImport();
  refresh();
  redirect("/pozicovna?success=" + encodeURIComponent("Import bol zrušený."));
}

/**
 * Potvrdenie importu inventára. Duplicity rozpoznávame podľa inventárneho
 * čísla, kategórie a podkategórie sa zakladajú len ak ešte neexistujú.
 * Token sa dá uplatniť len raz, rovnako ako pri importe členov.
 */
export async function confirmEquipmentImport(formData: FormData) {
  const { repo } = await requireAdmin("/pozicovna");

  const pending = await repo.pendingImport();
  if (!pending || pending.kind !== "equipment") {
    redirect("/pozicovna?error=" + encodeURIComponent("Nie je pripravený žiadny import inventára."));
  }

  const token = String(formData.get("token") ?? "");
  if (token !== pending.token) {
    redirect("/pozicovna?error=" + encodeURIComponent("Náhľad importu sa medzitým zmenil. Skús to znova."));
  }
  if (!(await repo.claimImportToken(token))) {
    redirect("/pozicovna?error=" + encodeURIComponent("Tento import už prebehol — nič sa nevytvorilo dvakrát."));
  }

  const mapping = Object.fromEntries(
    Object.keys(EQUIPMENT_IMPORT_FIELDS).map((field) => [field, String(formData.get(`map_${field}`) ?? "")]),
  ) as Record<EquipmentImportField, string>;

  const rawPurpose = String(formData.get("default_purpose") ?? "");
  const defaults = {
    codePrefix: String(formData.get("code_prefix") ?? ""),
    category: String(formData.get("default_category") ?? ""),
    subcategory: String(formData.get("default_subcategory") ?? ""),
    purpose: isEquipmentPurpose(rawPurpose) ? rawPurpose : ("" as const),
  };

  // Výber hárkov z náhľadu — prázdny zoznam znamená „súbor mal len jeden zdroj“.
  let picked: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(formData.get("sources") ?? "[]"));
    if (Array.isArray(parsed)) picked = parsed.map(String);
  } catch {
    picked = [];
  }

  let message: string;
  try {
    const selectedRows = picked.length
      ? pending.rows.filter((row) => picked.includes(row[SOURCE_COLUMN] ?? ""))
      : pending.rows;
    const mapped = mapEquipmentRows(selectedRows, mapping, defaults);
    const categories = await repo.listEquipmentCategories();
    const existing = await repo.listEquipment();
    const byCode = new Map(existing.map((item) => [item.inventory_code.toLowerCase(), item]));

    /** Nájde alebo založí kategóriu podľa názvu, bez vytvárania duplicít. */
    const ensureCategory = async (name: string, parentId: string | null): Promise<string | null> => {
      if (!name) return parentId;
      const match = categories.find(
        (entry) => normalizeCategoryName(entry.name) === normalizeCategoryName(name) && entry.parent_id === parentId,
      );
      if (match) return match.id;
      const created = await repo.saveEquipmentCategory({ name, parent_id: parentId, season_price: null });
      categories.push(created);
      return created.id;
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let blank = 0;

    for (const row of mapped) {
      // Riadok s jediným poradovým číslom je v hárkoch klubu medzera, nie chyba.
      if (row.blank) {
        blank += 1;
        continue;
      }
      if (row.errors.length) {
        skipped += 1;
        continue;
      }

      const categoryId = await ensureCategory(row.category, null);
      const match = byCode.get(row.code.toLowerCase());
      const leafId = row.subcategory
        ? await ensureCategory(row.subcategory, categoryId)
        : importLeafCategory(categoryId, row.condition, match?.category_id ?? null, categories);

      const input: EquipmentInput = {
        inventory_code: row.code,
        name: row.name,
        category_id: leafId,
        size: row.size,
        brand: row.brand,
        model: row.model,
        color: row.color,
        buckles: row.buckles ?? match?.buckles ?? null,
        quantity: row.quantity ?? match?.quantity ?? null,
        // Prázdna cena v súbore nechá cenu z appky — samostatné hárky klubu ceny nemajú.
        season_price: row.price ?? match?.season_price ?? null,
        // Skontrolovaný kus si opotrebenie nechá; inak berieme „staré“ z hárku,
        // a kde hárok nehovorí nič, vedieme kus ako nový.
        condition: match?.condition ?? row.condition ?? "nove",
        status: row.status || match?.status || "dostupne",
        purpose: row.purpose || match?.purpose || "prenajom",
        // Rovnako poznámka: ručne doplnenú v appke import bez poznámky nezmaže.
        note: row.note || match?.note || "",
      };

      if (match) {
        await repo.saveEquipment({ ...input, id: match.id });
        updated += 1;
      } else {
        const item = await repo.saveEquipment(input);
        byCode.set(row.code.toLowerCase(), item);
        created += 1;
      }
    }

    await repo.clearPendingImport();
    // Rovnako ako pri členoch: preskočené kusy zostanú v Import z Excelu, kým ich neprepíše ďalší import.
    await repo.saveImportLog({
      kind: "equipment",
      file_name: pending.file_name,
      created_at: new Date().toISOString(),
      skipped: describeSkippedEquipment(mapped, selectedRows.map((row) => row[SOURCE_COLUMN])),
    });
    message =
      `Import hotový: ${created} nových, ${updated} aktualizovaných, ${skipped} preskočených` +
      (blank ? `, ${blank} prázdnych riadkov.` : ".") +
      (skipped ? " Ktoré kusy a prečo, nájdeš v Import z Excelu." : "");
  } catch (error) {
    rethrowControlFlow(error);
    // Token je už spotrebovaný, preto zahodíme aj náhľad — inak by import zostal zaseknutý.
    await repo.clearPendingImport();
    redirect(
      "/pozicovna?error=" +
        encodeURIComponent(`Import zlyhal: ${errorMessage(error)}. Časť záznamov mohla byť uložená — nahraj súbor znova, duplikáty sa nevytvoria.`),
    );
  }

  refresh();
  redirect("/pozicovna?success=" + encodeURIComponent(message));
}
