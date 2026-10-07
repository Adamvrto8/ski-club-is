import { parseDelimited, type ImportRow } from "./import-map";
import { isLegacyXls, readXlsxSheets } from "./xlsx-read";

export type Spreadsheet = { headers: string[]; rows: ImportRow[] };

/** Virtuálny stĺpec s názvom hárku/súboru — pridáva sa len ak je zdrojov viac. */
export const SOURCE_COLUMN = "Hárok";

/**
 * Normalizovaný tvar názvu stĺpca. „číslo“, „čislo“ aj „ČÍSLO “ je ten istý
 * stĺpec — bez toho sa pri spojení viacerých súborov rozpadne mapovanie,
 * lebo na jedno pole appky sa dá vybrať len jeden názov stĺpca.
 */
function headerKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("sk")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Z mriežky spraví hlavičku + riadky.
 *
 * Hlavička nemusí byť prvý neprázdny riadok — hárky klubu majú nad ňou nadpis
 * („PRENÁJOM“, „Lyže staré“). Nadpis je spravidla jedna bunka, hlavička viac,
 * takže berieme prvý riadok aspoň s dvoma vyplnenými bunkami.
 */
function gridToRows(grid: string[][]): Spreadsheet {
  const filled = (row: string[]) => row.filter((cell) => cell.trim()).length;
  let headerIndex = grid.findIndex((row) => filled(row) >= 2);
  if (headerIndex < 0) headerIndex = grid.findIndex((row) => filled(row) > 0);
  if (headerIndex < 0) return { headers: [], rows: [] };

  const headerRow = grid[headerIndex].map((cell) => cell.trim());
  const headers: string[] = [];
  const positions: number[] = [];

  /*
   * Prázdny názov stĺpca doteraz znamenal, že sa stĺpec zahodil úplne —
   * aj keby v ňom dáta boli. V reálnych tabuľkách klubu sa to stáva (farba
   * výstroja bez popisky hlavičky) a dáta potom nešlo namapovať vôbec.
   * Prázdnemu stĺpcu preto dáme zástupný názov, len ak má aspoň jeden riadok
   * vyplnený — inak by sme do mapovania ťahali aj skutočne prázdne stĺpce.
   */
  const hasData = (index: number) => grid.slice(headerIndex + 1).some((row) => (row[index] ?? "").trim());

  headerRow.forEach((header, index) => {
    const label = header || (hasData(index) ? `Stĺpec ${index + 1}` : "");
    if (!label) return;
    // Rovnaké názvy stĺpcov odlíšime, inak by sa v mapovaní prepísali.
    let unique = label;
    let suffix = 2;
    while (headers.some((existing) => headerKey(existing) === headerKey(unique))) unique = `${label} (${suffix++})`;
    headers.push(unique);
    positions.push(index);
  });

  const rows = grid
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => Object.fromEntries(headers.map((header, i) => [header, (row[positions[i]] ?? "").trim()])));

  return { headers, rows };
}

export type SpreadsheetSource = Spreadsheet & { label: string };

/** Zdroje jedného súboru — pri .xlsx je to jeden zdroj na hárok. */
export async function parseSpreadsheetSources(file: File): Promise<SpreadsheetSource[]> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return [{ label: file.name, ...parseDelimited(buffer.toString("utf8")) }];
  }
  if (isLegacyXls(buffer)) {
    throw new Error(
      `Súbor ${file.name} je v starom formáte .xls (Excel 97–2003). Otvor ho v Exceli a ulož cez „Uložiť ako“ do .xlsx alebo CSV.`,
    );
  }

  return readXlsxSheets(buffer)
    .map((sheet) => ({ label: sheet.name || file.name, ...gridToRows(sheet.grid) }))
    .filter((sheet) => sheet.rows.length);
}

export async function parseSpreadsheet(file: File): Promise<Spreadsheet> {
  return mergeSources(await parseSpreadsheetSources(file));
}

export type MultiSpreadsheet = Spreadsheet & {
  /** Popis zdrojov pre náhľad, napr. „deti-A.xlsx (12), deti-B.xlsx (9)“. */
  summary: string;
  perFile: { name: string; rows: number }[];
  /** Názvy hárkov/súborov v poradí — v náhľade sa dajú zaškrtnúť. */
  sources: string[];
};

/**
 * Spojí viacero zdrojov do jedného náhľadu.
 *
 * Stĺpce sa zjednotia podľa normalizovaného názvu — „číslo“ z jedného súboru
 * a „Čislo“ z druhého je jeden stĺpec, inak by sa dal namapovať len jeden
 * z nich a riadky druhého súboru by vyšli prázdne. Ak zdroj stĺpec nemá,
 * jeho riadky ho majú prázdny.
 */
function mergeSources(sources: SpreadsheetSource[]): Spreadsheet & { sources: string[] } {
  const canonical = new Map<string, string>();
  const headers: string[] = [];
  const rows: ImportRow[] = [];
  const labels = sources.map((source) => source.label);
  const tagSource = new Set(labels).size > 1;

  for (const source of sources) {
    const rename = new Map<string, string>();
    for (const header of source.headers) {
      const key = headerKey(header);
      if (!canonical.has(key)) {
        canonical.set(key, header);
        headers.push(header);
      }
      rename.set(header, canonical.get(key)!);
    }

    for (const row of source.rows) {
      const renamed: ImportRow = {};
      for (const [header, value] of Object.entries(row)) renamed[rename.get(header) ?? header] = value;
      if (tagSource) renamed[SOURCE_COLUMN] = source.label;
      rows.push(renamed);
    }
  }

  if (tagSource && !headers.includes(SOURCE_COLUMN)) headers.push(SOURCE_COLUMN);
  return { headers, rows, sources: labels };
}

/**
 * Načíta viacero súborov naraz a spojí ich do jedného náhľadu — vrátane
 * všetkých hárkov každého zošita. Vďaka tomu sa dá naimportovať napr. jeden
 * súbor na družstvo, alebo celý zošit inventára, v jednom kroku.
 */
export async function parseSpreadsheets(files: File[]): Promise<MultiSpreadsheet> {
  const sources: SpreadsheetSource[] = [];
  const perFile: { name: string; rows: number }[] = [];

  for (const file of files) {
    const parsed = await parseSpreadsheetSources(file);
    sources.push(...parsed);
    perFile.push({ name: file.name, rows: parsed.reduce((sum, sheet) => sum + sheet.rows.length, 0) });
  }

  const merged = mergeSources(sources);
  return {
    ...merged,
    perFile,
    summary: perFile.map((file) => `${file.name} (${file.rows})`).join(", "),
  };
}
