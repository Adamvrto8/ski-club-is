import {
  isEquipmentStatus,
  normalizeCategoryName,
  parseEquipmentPurpose,
  wearFromLabel,
  type EquipmentCondition,
  type EquipmentPurpose,
  type EquipmentStatus,
} from "./equipment";
import type { ImportRow } from "./import-map";

export const EQUIPMENT_IMPORT_FIELDS = {
  code: "Inventárne číslo",
  name: "Názov",
  category: "Kategória",
  subcategory: "Podkategória",
  size: "Veľkosť / dĺžka",
  color: "Farba",
  brand: "Značka",
  model: "Model",
  buckles: "Počet klipsov",
  quantity: "Počet kusov (sklad)",
  price: "Cena za sezónu",
  purpose: "Určenie (prenájom/sklad)",
  status: "Stav (dostupné/požičané/…)",
  note: "Poznámka",
} as const;

export type EquipmentImportField = keyof typeof EQUIPMENT_IMPORT_FIELDS;

const aliases: Record<EquipmentImportField, string[]> = {
  code: ["inventarne cislo", "cislo", "kod", "id"],
  name: ["nazov", "name", "vystroj"],
  category: ["kategoria", "category"],
  subcategory: ["podkategoria", "subcategory"],
  // "dlzka" je dôležitý najmä pri lyžiach — dĺžka je ich obdoba veľkosti.
  size: ["velkost", "dlzka", "size"],
  color: ["farba", "color"],
  brand: ["znacka", "brand"],
  model: ["model"],
  // Klipsy (pracky) na lyžiarkach — podľa nich sa určuje cena požičania.
  buckles: ["klipsy", "pocet klipsov", "klipsov", "pracky"],
  quantity: ["pocet kusov", "pocet kusov (sklad)", "mnozstvo", "ks"],
  price: ["cena", "cena za sezonu", "price"],
  purpose: ["urcenie", "skupina", "pouzitie", "prenajom/predaj"],
  status: ["stav", "status"],
  note: ["poznamka", "note"],
};

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase("sk").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Rovnaká logika ako pri importe členov — uhádne mapovanie zo známych názvov stĺpcov. */
export function suggestEquipmentMapping(headers: string[]): Record<EquipmentImportField, string> {
  const mapping = Object.fromEntries(
    Object.keys(EQUIPMENT_IMPORT_FIELDS).map((field) => [field, ""]),
  ) as Record<EquipmentImportField, string>;
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    for (const [field, names] of Object.entries(aliases) as [EquipmentImportField, string[]][]) {
      if (!mapping[field] && names.some((name) => normalizeHeader(name) === normalized)) {
        mapping[field] = header;
      }
    }
  }
  return mapping;
}

export type MappedEquipmentRow = {
  code: string;
  /** Kód tak, ako bol v súbore — v náhľade ukazujeme, ak sme ho museli doplniť. */
  sourceCode: string;
  name: string;
  category: string;
  subcategory: string;
  size: string;
  color: string;
  brand: string;
  model: string;
  buckles: number | null;
  quantity: number | null;
  price: number | null;
  purpose: EquipmentPurpose | "";
  status: EquipmentStatus | "";
  /** Z „nové“/„staré“ v názve súboru; null = hárok o opotrebení nič nehovorí. */
  condition: EquipmentCondition | null;
  note: string;
  /** Riadok má vyplnené len poradové číslo — v hárkoch klubu je to medzera, nie chyba. */
  blank: boolean;
  errors: string[];
};

/**
 * Hodnoty, ktoré v súbore nie sú a zadáva ich admin raz pre celý import.
 *
 * Skladové zoznamy klubu majú kategóriu v názve súboru („kombinézy nové.csv“),
 * nie v stĺpci, a inventárne čísla začínajú v každom zozname znova od 1.
 */
export type EquipmentImportDefaults = {
  /** Predpona kódu, napr. „KOMB-N“ → KOMB-N-1, KOMB-N-2… */
  codePrefix: string;
  category: string;
  subcategory: string;
  /** Určenie pre celý súbor — pomôcky na tréningy sa importujú ako sklad. */
  purpose: EquipmentPurpose | "";
};

export const EMPTY_EQUIPMENT_DEFAULTS: EquipmentImportDefaults = {
  codePrefix: "",
  category: "",
  subcategory: "",
  purpose: "",
};

/**
 * Namapuje surové riadky na polia appky.
 *
 * Dve veci, ktoré reálne súbory klubu porušujú a riešime ich tu:
 * 1. stĺpec „názov“ v nich často nie je vôbec — odvodíme ho z modelu,
 *    podkategórie alebo kategórie,
 * 2. inventárne čísla sa v jednom zozname opakujú (kombinéza č. 1 existuje
 *    pre každú veľkosť). Kód musí byť unikátny, inak by import jeden kus
 *    prepísal druhým — dopĺňame preto veľkosť, prípadne poradie, a v náhľade
 *    je vidieť výsledný kód.
 */
export function mapEquipmentRows(
  rows: ImportRow[],
  mapping: Record<EquipmentImportField, string>,
  defaults: EquipmentImportDefaults = EMPTY_EQUIPMENT_DEFAULTS,
): MappedEquipmentRow[] {
  const get = (row: ImportRow, field: EquipmentImportField) => (mapping[field] ? (row[mapping[field]] ?? "").trim() : "");
  const prefix = defaults.codePrefix.trim().replace(/[-\s]+$/, "");
  const used = new Set<string>();

  // Opakuje sa číslo v celom súbore? Potom veľkosť dopĺňame všetkým rovnako,
  // aby kus č. 1 vo veľkosti 128 nebol „1“ a ten vo veľkosti 140 „1-140“.
  const repeated = new Set<string>();
  const seen = new Set<string>();
  for (const row of rows) {
    const value = (mapping.code ? (row[mapping.code] ?? "").trim() : "").toLowerCase();
    if (!value) continue;
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }

  return rows.map((row) => {
    const sourceCode = get(row, "code");
    const category = get(row, "category") || defaults.category.trim();
    // „Kombinézy staré“ z názvu súboru je opotrebenie, nie podkategória.
    const rawSubcategory = get(row, "subcategory") || defaults.subcategory.trim();
    const condition = wearFromLabel(rawSubcategory);
    const subcategory = condition ? "" : rawSubcategory;
    const model = get(row, "model");
    const explicitName = get(row, "name");
    const size = get(row, "size");
    const name = explicitName || model || subcategory || category;

    const rawPrice = get(row, "price").replace(",", ".");
    const price = rawPrice && Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : null;

    // Tam, kde klipsy v hárku nikto nevyplnil, zostáva prázdno — nie nula.
    const rawBuckles = get(row, "buckles").replace(",", ".");
    const bucklesValue = Number(rawBuckles);
    const buckles = rawBuckles && Number.isInteger(bucklesValue) && bucklesValue > 0 && bucklesValue <= 10 ? bucklesValue : null;

    const rawQuantity = get(row, "quantity").replace(/\s|ks|kusov|kusy|cca/gi, "");
    const quantity = /^\d+$/.test(rawQuantity) ? Number(rawQuantity) : null;

    const rawStatus = normalizeCategoryName(get(row, "status")).replace(/\s/g, "_");
    const status = isEquipmentStatus(rawStatus) ? rawStatus : "";
    const purpose = parseEquipmentPurpose(get(row, "purpose")) || defaults.purpose;

    // Riadok, v ktorom je len poradové číslo, je v hárkoch klubu vynechané miesto.
    const blank =
      !explicitName && !model && !size && !get(row, "color") && !get(row, "brand") && !get(row, "note") && !rawPrice && !rawBuckles;

    let code = "";
    if (sourceCode) {
      const withPrefix = prefix ? `${prefix}-${sourceCode}` : sourceCode;
      const base = repeated.has(sourceCode.toLowerCase()) && size ? `${withPrefix}-${size}` : withPrefix;
      code = base;
      for (let index = 2; used.has(code.toLowerCase()); index += 1) code = `${base}-${index}`;
      used.add(code.toLowerCase());
    }

    const errors: string[] = [];
    if (!blank) {
      if (!code) errors.push("chýba inventárne číslo");
      if (!name) errors.push("chýba názov — namapuj stĺpec, alebo vyplň kategóriu pre celý súbor");
    }

    return {
      code,
      sourceCode,
      name,
      category,
      subcategory,
      size,
      color: get(row, "color"),
      brand: get(row, "brand"),
      model,
      buckles,
      quantity,
      price,
      purpose,
      status,
      condition,
      note: get(row, "note"),
      blank,
      errors,
    };
  });
}
