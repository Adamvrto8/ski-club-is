/**
 * Čítanie dochádzkového hárku, ktorý vedú tréneri v Google Sheete.
 *
 * Formát: riadky sú ľudia (zoskupení pod názvami družstiev), stĺpce sú dni tréningov
 * a bunky obsahujú TRUE/FALSE. Hárok nemá pevnú štruktúru, preto hlavičku aj stĺpec
 * s menami hľadáme heuristicky.
 */
import { TEAM_LABELS, type Team } from "./domain";
import { parseDate } from "./import-map";

export type AttendancePerson = {
  rawName: string;
  /** Družstvo podľa nadpisu skupiny v hárku, ak sa dal rozpoznať. */
  groupTeam: Team | null;
  /** Dni, v ktorých je TRUE. */
  presentDates: string[];
  absentDates: string[];
};

export type AttendanceSheet = {
  dates: string[];
  people: AttendancePerson[];
};

export function normalizeName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("sk")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Meno sa v hárkoch píše raz ako „Priezvisko Meno“, inak „Meno Priezvisko“. */
export function nameVariants(first: string, last: string) {
  return [normalizeName(`${first} ${last}`), normalizeName(`${last} ${first}`)];
}

const TRUE_VALUES = new Set(["true", "1", "ano", "áno", "x", "p", "yes", "✓"]);
const FALSE_VALUES = new Set(["false", "0", "nie", "n", "-", "no"]);

function isTruthyCell(value: string) {
  return TRUE_VALUES.has(value.trim().toLocaleLowerCase("sk"));
}

function isFalsyCell(value: string) {
  return FALSE_VALUES.has(value.trim().toLocaleLowerCase("sk"));
}

function teamFromHeading(value: string): Team | null {
  const normalized = normalizeName(value);
  for (const [team, label] of Object.entries(TEAM_LABELS) as [Team, string][]) {
    if (normalized.includes(normalizeName(label))) return team;
  }
  if (normalized.includes("skola")) return "skola_lyzovania";
  if (normalized.includes("pretek")) return "pretekove_druzstvo";
  if (normalized.includes("sport")) return "sportove_druzstvo";
  return null;
}

/**
 * Hlavičkou je riadok s najväčším počtom rozpoznaných dátumov.
 * Vracia aj index stĺpca s menami — posledný textový stĺpec pred prvým dátumom.
 */
function findHeader(grid: string[][]) {
  let bestRow = -1;
  let bestDates: { index: number; date: string }[] = [];

  grid.forEach((row, rowIndex) => {
    const dates: { index: number; date: string }[] = [];
    row.forEach((cell, index) => {
      const date = parseDate(cell);
      if (date) dates.push({ index, date });
    });
    if (dates.length > bestDates.length) {
      bestDates = dates;
      bestRow = rowIndex;
    }
  });

  if (bestRow < 0 || bestDates.length === 0) return null;
  const firstDateColumn = Math.min(...bestDates.map((entry) => entry.index));
  return { headerRow: bestRow, dates: bestDates, nameColumn: Math.max(0, firstDateColumn - 1) };
}

export function readAttendanceSheet(grid: string[][]): AttendanceSheet | null {
  const header = findHeader(grid);
  if (!header) return null;

  const people: AttendancePerson[] = [];
  let currentTeam: Team | null = null;

  for (let rowIndex = header.headerRow + 1; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex];
    const name = (row[header.nameColumn] ?? "").trim();
    if (!name) continue;

    const marks = header.dates.filter(({ index }) => {
      const cell = (row[index] ?? "").trim();
      return cell && (isTruthyCell(cell) || isFalsyCell(cell));
    });

    // Riadok bez jedinej značky je nadpis skupiny (napr. „Pretekové družstvo“).
    if (!marks.length) {
      const team = teamFromHeading(name);
      if (team) currentTeam = team;
      continue;
    }

    const presentDates: string[] = [];
    const absentDates: string[] = [];
    for (const { index, date } of header.dates) {
      const cell = (row[index] ?? "").trim();
      if (isTruthyCell(cell)) presentDates.push(date);
      else if (isFalsyCell(cell)) absentDates.push(date);
    }

    people.push({ rawName: name, groupTeam: currentTeam, presentDates, absentDates });
  }

  return { dates: header.dates.map((entry) => entry.date), people };
}
