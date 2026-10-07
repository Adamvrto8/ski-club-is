export const TEAM_LABELS = {
  skola_lyzovania: "Škola lyžovania",
  sportove_druzstvo: "Športové družstvo",
  pretekove_druzstvo: "Pretekové družstvo",
} as const;

export type Team = keyof typeof TEAM_LABELS;

export function isTeam(value: string): value is Team {
  return value in TEAM_LABELS;
}

/** Kľúč na rozpoznanie duplicity pri importe: meno + priezvisko + dátum narodenia. */
export function memberKey(firstName: string, lastName: string, birthDate: string) {
  return `${firstName.trim().toLocaleLowerCase("sk")}|${lastName.trim().toLocaleLowerCase("sk")}|${birthDate.trim()}`;
}

export type PaymentState = "paid" | "unpaid" | "overdue";

export function paymentStatus(paid: boolean, dueDate: string): { label: string; style: PaymentState } {
  if (paid) return { label: "Zaplatené", style: "paid" };
  const overdue = new Date(`${dueDate}T23:59:59`) < new Date();
  return overdue ? { label: "Po splatnosti", style: "overdue" } : { label: "Nezaplatené", style: "unpaid" };
}

export function formatMoney(amount: number) {
  return `${amount.toFixed(2).replace(".", ",")} €`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${Number(day)}. ${Number(month)}. ${year}` : value;
}

/** 2026-01-01 → 01.01.2026 — tvar dátumov na potvrdení, rovnaký ako obdobie. */
export function formatDateDotted(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

export function fullName(person: { first_name: string; last_name: string }) {
  return `${person.last_name} ${person.first_name}`;
}

export function sortByName<T extends { first_name: string; last_name: string }>(people: T[]) {
  return [...people].sort(
    (a, b) => a.last_name.localeCompare(b.last_name, "sk") || a.first_name.localeCompare(b.first_name, "sk"),
  );
}

/** Zoznam mesiacov po slovensky — používa sa aj mimo tohto súboru (napr. mesačný rozpis na potvrdení). */
export const MONTH_NAMES = [
  "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
  "Júl", "August", "September", "Október", "November", "December",
];
const MONTHS = MONTH_NAMES;

export function monthLabel(year: number, month: number) {
  return `${MONTHS[month - 1]} ${year}`;
}

/** Mesačný predpis: z počiatočného mesiaca vyrobí N období so splatnosťou v daný deň. */
export function monthlySchedule(startMonth: string, count: number, dueDay: number) {
  const [yearPart, monthPart] = startMonth.split("-").map(Number);
  const schedule: { period: string; dueDate: string }[] = [];
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(yearPart, monthPart - 1 + index, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(dueDay, lastDay);
    schedule.push({
      period: monthLabel(year, month),
      dueDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }
  return schedule;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

type WarnedMember = { id: string; first_name: string; last_name: string };

/**
 * Text do potvrdzovacieho okna. Akciu nezakazujeme — len vypíšeme, čo má
 * vybraný člen nevyriešené, nech sa to nestratí omylom spolu s ním.
 */
function blockerWarning(
  selected: string[],
  members: WarnedMember[],
  blockers: Record<string, string[]>,
  question: string,
  hint?: string,
) {
  const flagged = selected
    .map((id) => ({ member: members.find((row) => row.id === id), reasons: blockers[id] }))
    .filter((entry): entry is { member: WarnedMember; reasons: string[] } => Boolean(entry.member && entry.reasons?.length));

  if (!flagged.length) return question;

  const shown = flagged.slice(0, 10);
  const lines = shown.map(({ member, reasons }) => `• ${member.last_name} ${member.first_name} — ${reasons.join(", ")}`);
  if (flagged.length > shown.length) lines.push(`• …a ďalší: ${flagged.length - shown.length}`);

  return [
    `Pozor, nevyriešené záležitosti (${flagged.length} z ${selected.length}):`,
    "",
    ...lines,
    "",
    ...(hint ? [hint, ""] : []),
    question,
  ].join("\n");
}

export function deleteWarning(selected: string[], members: WarnedMember[], blockers: Record<string, string[]>) {
  return blockerWarning(
    selected,
    members,
    blockers,
    `Naozaj vymazať ${selected.length} členov aj s ich platbami a kontaktmi?`,
    "Namiesto vymazania ich môžete archivovať — história zostane zachovaná.",
  );
}

/** Archív = neaktívny člen: zmizne zo zoznamov, v databáze zostane aj s históriou. */
export function archiveWarning(selected: string[], members: WarnedMember[], blockers: Record<string, string[]>) {
  return blockerWarning(
    selected,
    members,
    blockers,
    `Presunúť ${selected.length} členov do archívu? Zmiznú zo zoznamov, v databáze zostanú aj s platbami a dajú sa obnoviť.`,
  );
}

/**
 * Rodičia súrodencov mávajú tú istú adresu — do hromadnej pošty patrí len raz.
 * Porovnávame bez ohľadu na veľkosť písmen, zachováme prvý zápis.
 */
export function uniqueEmails(lists: (string[] | undefined)[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list ?? []) {
      const email = raw.trim();
      if (!email || seen.has(email.toLowerCase())) continue;
      seen.add(email.toLowerCase());
      out.push(email);
    }
  }
  return out;
}

/**
 * Koho ešte treba prihlásiť: zo zaškrtnutých vynecháme tých, čo na akcii už sú.
 * Opakované odoslanie toho istého výberu tak nevytvorí duplicitné záznamy.
 */
export function membersToRegister<T extends { id: string }>(
  childIds: string[],
  children: T[],
  alreadyRegistered: Iterable<string | null>,
) {
  const taken = new Set(alreadyRegistered);
  return childIds
    .filter((id) => !taken.has(id))
    .map((id) => children.find((child) => child.id === id))
    .filter((child) => child !== undefined);
}

export type SkippedImportRow = { label: string; reasons: string[] };

/**
 * Riadky, ktoré import preskočil, v tvare na zobrazenie: kto to je a prečo.
 * Keď chýba meno, pomôže aspoň rodič; pri viacerých hárkoch pridáme aj hárok,
 * nech sa riadok dá v Exceli nájsť.
 */
export function describeSkipped(
  rows: { first_name: string; last_name: string; father_name: string; mother_name: string; errors: string[] }[],
  sheets: (string | undefined)[] = [],
): SkippedImportRow[] {
  return rows.flatMap((row, index) => {
    if (!row.errors.length) return [];
    const name = `${row.last_name} ${row.first_name}`.trim();
    const parent = row.father_name || row.mother_name;
    const who = name || (parent ? `(bez mena, rodič: ${parent})` : "(riadok bez mena)");
    const sheet = sheets[index];
    return [{ label: sheet ? `${who} · ${sheet}` : who, reasons: row.errors }];
  });
}

/**
 * Preskočené kusy výstroja v tvare na zobrazenie. Kus v CSV nájdeš podľa toho,
 * čo v riadku je: názov, pôvodné číslo zo súboru, veľkosť, značka a hárok.
 * Medzery v hárku (riadok len s poradovým číslom) sem nepatria — nie sú chyba.
 */
export function describeSkippedEquipment(
  rows: { name: string; sourceCode: string; size: string; brand: string; blank: boolean; errors: string[] }[],
  sheets: (string | undefined)[] = [],
): SkippedImportRow[] {
  return rows.flatMap((row, index) => {
    if (row.blank || !row.errors.length) return [];
    const parts = [
      row.name,
      row.sourceCode && `č. ${row.sourceCode}`,
      row.size && `veľ. ${row.size}`,
      row.brand,
      sheets[index],
    ].filter(Boolean);
    return [{ label: parts.join(" · ") || "(riadok bez názvu aj čísla)", reasons: row.errors }];
  });
}
