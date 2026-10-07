import { isTeam, memberKey, TEAM_LABELS, type Team } from "./domain";

export const IMPORT_FIELDS = {
  first_name: "Meno",
  last_name: "Priezvisko",
  birth_date: "Dátum narodenia",
  membership_date: "Dátum vstupu do klubu",
  team: "Družstvo",
  national_id: "Rodné číslo",
  permanent_address: "Trvalé bydlisko",
  father_name: "Otec - meno",
  father_phone: "Telefón otec",
  mother_name: "Mama - meno",
  mother_phone: "Telefón mama",
  contact_address: "Adresa",
  emails: "E-mail na oznamy",
  is_sport_registered: "IS šport registrovaný",
  sport_identifier: "Identifikátor IS športu",
} as const;

export type ImportField = keyof typeof IMPORT_FIELDS;

const aliases: Record<ImportField, string[]> = {
  first_name: ["meno", "first name", "firstname", "name"],
  last_name: ["priezvisko", "last name", "lastname", "surname"],
  birth_date: ["datum narodenia", "dátum narodenia", "narodenie", "narodeny", "narodená", "birth", "birth date"],
  membership_date: ["datum clenstva", "dátum členstva", "vstup", "membership"],
  team: ["druzstvo", "družstvo", "team", "skupina"],
  national_id: ["rodne cislo", "rodné číslo", "rc", "rč"],
  permanent_address: ["trvale bydlisko", "trvalé bydlisko", "adresa dietata", "address"],
  father_name: ["otec", "tata", "otec meno", "otec - meno", "father"],
  /*
   * Hárok klubu má dva stĺpce s rovnakou hlavičkou „telefón“ — prvý za otcom,
   * druhý za mamou. parseDelimited druhý premenuje na „telefón (2)“, takže
   * otcov chytí holé „telefon“ a mamin až tvar so zátvorkou. Preto mama
   * zámerne NEMÁ alias „telefon“ — inak by jej pripadol otcov stĺpec.
   */
  father_phone: ["telefon otec", "telefon", "telefón", "telefon 1", "tel", "phone"],
  mother_name: ["mama", "matka", "mama meno", "mama - meno", "mother"],
  mother_phone: ["telefon mama", "telefon (2)", "telefon 2", "tel 2", "phone 2"],
  contact_address: ["adresa", "bydlisko", "adresa rodicov"],
  emails: ["e-mail na oznamy", "email", "e-mail", "emaily", "mail"],
  is_sport_registered: ["is sport", "is šport", "registrovany", "registrovaný"],
  sport_identifier: ["is identifikator", "identifikator is", "sport id"],
};

export type ImportRow = Record<string, string>;

export type MappedMember = {
  first_name: string;
  last_name: string;
  birth_date: string;
  membership_date: string;
  team: Team | "";
  national_id: string;
  permanent_address: string;
  father_name: string;
  father_phone: string;
  mother_name: string;
  mother_phone: string;
  contact_address: string;
  emails: string[];
  is_sport_registered: boolean;
  sport_identifier: string;
  errors: string[];
  key: string;
};

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase("sk").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function suggestMapping(headers: string[]): Record<ImportField, string> {
  const mapping = Object.fromEntries(Object.keys(IMPORT_FIELDS).map((field) => [field, ""])) as Record<ImportField, string>;
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    for (const [field, names] of Object.entries(aliases) as [ImportField, string[]][]) {
      if (!mapping[field] && names.some((name) => normalized.includes(normalizeHeader(name)) || normalizeHeader(name) === normalized)) {
        mapping[field] = header;
        // Jeden stĺpec patrí najviac jednému poľu — bez toho by „telefón“ sadol
        // otcovi aj mame naraz a mamin stĺpec by sa stratil.
        break;
      }
    }
  }
  return mapping;
}

function excelSerialToIso(value: number) {
  const utc = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

export function parseDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dotted = trimmed.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial > 20000 && serial < 80000) return excelSerialToIso(serial);
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

export function parseTeam(value: string): Team | "" {
  const trimmed = value.trim();
  if (isTeam(trimmed)) return trimmed;
  const normalized = normalizeHeader(trimmed);
  for (const [team, label] of Object.entries(TEAM_LABELS) as [Team, string][]) {
    if (normalizeHeader(label) === normalized || normalized.includes(normalizeHeader(label))) return team;
  }
  if (normalized.includes("skola")) return "skola_lyzovania";
  if (normalized.includes("pretek")) return "pretekove_druzstvo";
  if (normalized.includes("sport")) return "sportove_druzstvo";
  return "";
}

function truthy(value: string) {
  return ["1", "true", "ano", "áno", "yes", "x"].includes(value.trim().toLocaleLowerCase("sk"));
}

export function mapImportRows(rows: ImportRow[], mapping: Record<ImportField, string>): MappedMember[] {
  return rows.map((row) => {
    const pick = (field: ImportField) => (mapping[field] ? row[mapping[field]] ?? "" : "").trim();
    const first_name = pick("first_name");
    const last_name = pick("last_name");
    const birth_date = parseDate(pick("birth_date"));
    const membership_date = parseDate(pick("membership_date")) || new Date().toISOString().slice(0, 10);
    const team = parseTeam(pick("team"));
    const errors: string[] = [];
    if (!first_name) errors.push("Chýba meno");
    if (!last_name) errors.push("Chýba priezvisko");
    if (!birth_date) errors.push("Neplatný dátum narodenia");
    if (!team) errors.push("Neznáme družstvo");
    return {
      first_name,
      last_name,
      birth_date,
      membership_date,
      team,
      national_id: pick("national_id"),
      permanent_address: pick("permanent_address"),
      father_name: pick("father_name"),
      father_phone: pick("father_phone"),
      mother_name: pick("mother_name"),
      mother_phone: pick("mother_phone"),
      contact_address: pick("contact_address"),
      emails: pick("emails").split(/[;,]/).map((email) => email.trim()).filter(Boolean),
      is_sport_registered: truthy(pick("is_sport_registered")),
      sport_identifier: pick("sport_identifier"),
      errors,
      key: memberKey(first_name, last_name, birth_date),
    };
  });
}

/**
 * CSV parser, ktor\u00FD re\u0161pektuje \u00FAvodzovky \u2014 bunka "Nov\u00E1kov\u00E1, Eva" zostane jednou bunkou
 * a zdvojen\u00E1 \u00FAvodzovka ("") sa pre\u010D\u00EDta ako znak ".
 */
function parseCsvCells(text: string, delimiter: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      grid.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell.trim());
  grid.push(row);
  return grid.filter((line) => line.some((value) => value));
}

/**
 * Surov\u00E1 mrie\u017Eka buniek z CSV, bez predpokladu, \u017Ee prv\u00FD riadok je hlavi\u010Dka.
 * Potrebuje ju doch\u00E1dzkov\u00FD h\u00E1rok, kde hlavi\u010Dka s d\u00E1tumami b\u00FDva a\u017E niekde ni\u017E\u0161ie.
 */
export function parseCsvGrid(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  // Odde\u013Eova\u010D h\u013Ead\u00E1me na riadku, ktor\u00FD ich m\u00E1 najviac \u2014 prv\u00FD riadok b\u00FDva nadpis.
  const lines = clean.split(/\r?\n/).slice(0, 10);
  const semicolons = Math.max(0, ...lines.map((line) => line.split(";").length));
  const commas = Math.max(0, ...lines.map((line) => line.split(",").length));
  return parseCsvCells(clean, semicolons >= commas ? ";" : ",");
}

export function parseDelimited(text: string): { headers: string[]; rows: ImportRow[] } {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  // Slovensk\u00FD Excel exportuje so stredn\u00EDkom, medzin\u00E1rodn\u00E9 n\u00E1stroje s \u010Diarkou.
  const delimiter = firstLine.split(";").length >= firstLine.split(",").length ? ";" : ",";

  const grid = parseCsvCells(clean, delimiter);
  if (!grid.length) return { headers: [], rows: [] };

  /*
   * Hlavička nemusí byť prvý riadok — exporty hárkov klubu majú nad ňou nadpis
   * („PRENÁJOM“, „Lyže staré“) v jedinej bunke. Berieme prvý riadok aspoň
   * s dvoma vyplnenými bunkami, inak prvý vyplnený.
   */
  const filled = (row: string[]) => row.filter((cell) => cell.trim()).length;
  let headerIndex = grid.findIndex((row) => filled(row) >= 2);
  if (headerIndex < 0) headerIndex = 0;

  const headers: string[] = [];
  const positions: number[] = [];
  /*
   * Prázdna hlavička doteraz znamenala zahodenie celého stĺpca, aj keď mal dáta —
   * reálne súbory klubu takéto stĺpce majú (napr. farba výstroja bez popisky).
   * Dostane zástupný názov, len ak niečo v ňom naozaj je.
   */
  const hasData = (index: number) => grid.slice(headerIndex + 1).some((row) => (row[index] ?? "").trim());
  grid[headerIndex].forEach((header, index) => {
    const trimmed = header.trim();
    const label = trimmed || (hasData(index) ? `Stĺpec ${index + 1}` : "");
    if (!label) return;
    let unique = label;
    let suffix = 2;
    while (headers.includes(unique)) unique = `${label} (${suffix++})`;
    headers.push(unique);
    positions.push(index);
  });

  const rows = grid
    .slice(headerIndex + 1)
    .map((cells) => Object.fromEntries(headers.map((header, i) => [header, cells[positions[i]] ?? ""])));
  return { headers, rows };
}
