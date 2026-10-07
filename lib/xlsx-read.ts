/**
 * Minimálne čítanie .xlsx bez externých závislostí.
 *
 * .xlsx je ZIP archív s XML súbormi. Rozbalenie robíme cez vstavaný modul `zlib`
 * (raw deflate), takže projekt nepotrebuje knižnicu `xlsx`. Čítame len to, čo
 * import naozaj potrebuje: prvý hárok ako mriežku textových buniek.
 */
import { inflateRawSync } from "zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

function findEndOfCentralDirectory(buffer: Buffer) {
  // EOCD má premenlivý komentár na konci, preto hľadáme podpis od konca.
  const minOffset = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return entries;

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== CENTRAL_SIGNATURE) break;

    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);

    // Lokálna hlavička má vlastné dĺžky mena a extra poľa — nesmú sa brať z centrálnej.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    try {
      entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    } catch {
      // Poškodenú položku preskočíme, zvyšok súboru sa dá stále prečítať.
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(value: string) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity);
}

/** Zoberie text zo všetkých <t> prvkov — pokryje aj rich-text bunky rozdelené na <r> behy. */
function textOf(xml: string) {
  const parts = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g);
  if (!parts) return "";
  return parts.map((part) => decodeXml(part.replace(/<t[^>]*>/, "").replace(/<\/t>$/, ""))).join("");
}

function readSharedStrings(entries: Map<string, Buffer>) {
  const file = entries.get("xl/sharedStrings.xml");
  if (!file) return [];
  const xml = file.toString("utf8");
  const items = xml.match(/<si>[\s\S]*?<\/si>/g) ?? [];
  return items.map(textOf);
}

/**
 * Všetky hárky v poradí zo workbook.xml, s fallbackom na sheetN.xml.
 *
 * Zošit „Inventúra a platby“ má 15 hárkov (Lyžiarky, Lyže, Kombinézy, …).
 * Čítať len prvý znamenalo potichu zahodiť zvyšok, preto vraciame všetky
 * aj s názvom hárku.
 */
function sheetXmls(entries: Map<string, Buffer>): { name: string; xml: string }[] {
  const workbook = entries.get("xl/workbook.xml")?.toString("utf8");
  const rels = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  const sheets: { name: string; xml: string }[] = [];

  if (workbook && rels) {
    for (const tag of workbook.match(/<sheet\b[^>]*\/?>/g) ?? []) {
      const name = decodeXml(tag.match(/\bname="([^"]*)"/)?.[1] ?? "");
      const relationId = tag.match(/r:id="([^"]+)"/)?.[1];
      if (!relationId) continue;
      const relationship = rels.match(new RegExp(`<Relationship[^>]*Id="${relationId}"[^>]*>`))?.[0];
      const target = relationship?.match(/Target="([^"]+)"/)?.[1];
      if (!target) continue;
      const path = target.startsWith("/")
        ? target.slice(1)
        : `xl/${target.replace(/^\.\//, "").replace(/^\/+/, "")}`;
      const sheet = entries.get(path);
      if (sheet) sheets.push({ name, xml: sheet.toString("utf8") });
    }
  }

  if (sheets.length) return sheets;

  for (const [name, data] of entries) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      sheets.push({ name: name.replace("xl/worksheets/", "").replace(".xml", ""), xml: data.toString("utf8") });
    }
  }
  return sheets;
}

/** "BC12" -> 54 (nula-based index stĺpca) */
function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function cellValue(cellXml: string, sharedStrings: string[]) {
  const type = cellXml.match(/\bt="([^"]+)"/)?.[1];

  if (type === "inlineStr") return textOf(cellXml);

  const value = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (value === undefined) return type === "s" ? "" : textOf(cellXml);

  const decoded = decodeXml(value);
  if (type === "s") return sharedStrings[Number(decoded)] ?? "";
  if (type === "b") return decoded === "1" ? "true" : "false";
  return decoded;
}

/**
 * Starý formát .xls (Excel 97–2003) nie je ZIP, ale OLE2 — spoznáme ho podľa
 * magickej hlavičky, aby sme používateľovi vedeli povedať, že ho má uložiť
 * ako .xlsx, namiesto hlášky „nenašla sa hlavička“.
 */
export function isLegacyXls(buffer: Buffer) {
  return buffer.length > 8 && buffer.readUInt32BE(0) === 0xd0cf11e0;
}

export type XlsxSheet = { name: string; grid: string[][] };

/** Všetky hárky zošita ako mriežky textov; prázdne bunky sú "". */
export function readXlsxSheets(buffer: Buffer): XlsxSheet[] {
  const entries = readZipEntries(buffer);
  const sharedStrings = readSharedStrings(entries);
  return sheetXmls(entries).map((sheet) => ({ name: sheet.name, grid: sheetGrid(sheet.xml, sharedStrings) }));
}

/** Prvý hárok ako mriežka textov — pre importy, ktoré viac hárkov neriešia. */
export function readXlsxGrid(buffer: Buffer): string[][] {
  return readXlsxSheets(buffer)[0]?.grid ?? [];
}

function sheetGrid(sheetXml: string, sharedStrings: string[]): string[][] {
  const grid: string[][] = [];

  for (const rowXml of sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const row: string[] = [];
    let cursor = 0;

    for (const cellXml of rowXml.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const reference = cellXml.match(/\br="([A-Z]+\d+)"/)?.[1];
      const index = reference ? columnIndex(reference) : cursor;
      while (row.length < index) row.push("");
      row[index] = cellXml.endsWith("/>") ? "" : cellValue(cellXml, sharedStrings).trim();
      cursor = index + 1;
    }

    grid.push(row);
  }

  return grid;
}
