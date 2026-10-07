import type { Equipment, EquipmentCategory } from "./data/types";

export const EQUIPMENT_STATUS_LABELS = {
  dostupne: "Dostupné",
  pozicane: "Požičané",
  v_oprave: "V oprave / poškodené",
  stratene: "Stratené",
  vyradene: "Vyradené",
} as const;

export type EquipmentStatus = keyof typeof EQUIPMENT_STATUS_LABELS;

export function isEquipmentStatus(value: string): value is EquipmentStatus {
  return value in EQUIPMENT_STATUS_LABELS;
}

/**
 * Skupiny inventára podľa toho, na čo vec slúži. „Predaj“ klub 2026-09-24 zrušil —
 * všetko z neho je na prenájom (v databáze hodnota ostala, len sa nepoužíva).
 */
export const EQUIPMENT_PURPOSE_LABELS = {
  prenajom: "Prenájom",
  sklad: "Sklad a pomôcky",
} as const;

export type EquipmentPurpose = keyof typeof EQUIPMENT_PURPOSE_LABELS;

export function isEquipmentPurpose(value: string): value is EquipmentPurpose {
  return value in EQUIPMENT_PURPOSE_LABELS;
}

/**
 * Uhádne určenie z textu v hárku — nadpis sekcie, stĺpec alebo poznámka.
 * „PRENÁJOM“ aj starý „PREDAJ“ → prenajom, „pomôcky“ → sklad.
 */
export function parseEquipmentPurpose(value: string): EquipmentPurpose | "" {
  const text = normalizeCategoryName(value);
  if (!text) return "";
  if (text.includes("prenaj") || text.includes("pozic") || text.includes("predaj")) return "prenajom";
  if (text.includes("sklad") || text.includes("pomock") || text.includes("treningy")) return "sklad";
  return "";
}

export const CONDITION_LABELS = {
  nove: "Nové",
  stare: "Staré",
  dobre: "Dobrý stav",
  opotrebovane: "Opotrebované",
  poskodene: "Poškodené",
} as const;

export type EquipmentCondition = keyof typeof CONDITION_LABELS;

export function isCondition(value: string): value is EquipmentCondition {
  return value in CONDITION_LABELS;
}

/** Predvolené kategórie zo zadania klubu. Pri importe sa nesmú zakladať duplicitne. */
export const DEFAULT_CATEGORIES = [
  "Lyže",
  "Lyžiarky",
  "Palice",
  "Prilba",
  "Chránič",
  "Bunda",
  "Nohavice",
  "Kombinéza",
  "Iné",
];

export function normalizeCategoryName(value: string) {
  return value.trim().toLocaleLowerCase("sk").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

/**
 * „Nové“, „Staré“, „Kombinézy nové“… — hárky klubu tak delili výstroj podľa
 * veku, nie podľa druhu. To je opotrebenie, nie podkategória: keby bolo
 * podkategóriou, stĺpec by raz ukazoval vek a inokedy nič.
 * Vráti null, ak názov o veku nič nehovorí.
 */
export function wearFromLabel(value: string): "nove" | "stare" | null {
  const match = /(^|\s)(nov|star)[eayo](\s|$)/.exec(normalizeCategoryName(value));
  if (!match) return null;
  return match[2] === "nov" ? "nove" : "stare";
}

/**
 * Stĺpce, ktoré dávajú zmysel len pri niektorom druhu výstroja: klipsy majú
 * iba lyžiarky, a kombinézy sa v klube rozlišujú veľkosťou, nie farbou.
 */
export function groupColumns(groupName: string) {
  const group = normalizeCategoryName(groupName);
  return {
    buckles: group.startsWith("lyziark"),
    color: !group.startsWith("kombinez"),
  };
}

/** Cena kusu má prednosť pred cenou podkategórie, tá pred cenou kategórie. */
export function seasonPrice(item: Equipment, categories: EquipmentCategory[]): number {
  if (item.season_price !== null) return item.season_price;
  const category = categories.find((entry) => entry.id === item.category_id);
  if (category?.season_price !== null && category?.season_price !== undefined) return category.season_price;
  const parent = categories.find((entry) => entry.id === category?.parent_id);
  return parent?.season_price ?? 0;
}

/** „Lyže → Lyže staré“ pre zobrazenie v zozname. */
export function categoryPath(categoryId: string | null, categories: EquipmentCategory[]): string {
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category) return "—";
  const parent = categories.find((entry) => entry.id === category.parent_id);
  return parent ? `${parent.name} → ${category.name}` : category.name;
}

/** Kategória sedí, ak je to priamo ona alebo jej podkategória. */
export function matchesCategory(item: Equipment, categoryId: string, categories: EquipmentCategory[]) {
  if (item.category_id === categoryId) return true;
  const category = categories.find((entry) => entry.id === item.category_id);
  return category?.parent_id === categoryId;
}

/**
 * Kam import zaradí kus, keď súbor podkategóriu neuvádza (alebo v nej je len
 * „nové/staré“, ktoré sa číta ako opotrebenie):
 * 1. do podkategórie „Nová“/„Stará“, ak ju klub pod kategóriou založil — tam je cena
 *    (kombinézy: nová 40 €, stará 20 €),
 * 2. inak tam, kam kus niekto v appke už zaradil, pokiaľ je to tá istá kategória,
 * 3. inak do hlavnej kategórie.
 */
export function importLeafCategory(
  categoryId: string | null,
  condition: string | null,
  currentCategoryId: string | null,
  categories: EquipmentCategory[],
): string | null {
  const byWear = condition
    ? categories.find((entry) => entry.parent_id === categoryId && wearFromLabel(entry.name) === condition)
    : undefined;
  if (byWear) return byWear.id;
  const current = categories.find((entry) => entry.id === currentCategoryId);
  if (categoryId && current?.parent_id === categoryId) return current.id;
  return categoryId;
}

/**
 * Značka už býva v názve („Prilba - Rossignol“) — vedľa názvu ukážeme len to,
 * čo v ňom ešte nie je. Zdieľa to požičovňa aj detail dieťaťa, aby sa kus
 * volal na oboch miestach rovnako.
 */
export function equipmentExtra(item: { name: string; brand: string; model: string }) {
  return [
    item.brand && !item.name.toLocaleLowerCase("sk").includes(item.brand.toLocaleLowerCase("sk")) ? item.brand : "",
    item.model,
  ].filter(Boolean).join(" ");
}
