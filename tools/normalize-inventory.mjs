/**
 * Normalizácia klubových hárkov s inventárom do CSV, ktoré appka naimportuje 1:1.
 *
 *   node tools/normalize-inventory.mjs "../tabuky/inventar.xlsx"
 *   node tools/normalize-inventory.mjs "../tabuky/lyziarky.csv" -o vystup
 *
 * Prečo to nerobí priamo import v appke: mapovanie stĺpcov v UI predpokladá
 * jednu hlavičku na súbor. Reálne hárky klubu ju porušujú hneď trikrát —
 *
 *  1. jeden hárok obsahuje viac sekcií („Lyže staré“ aj „Lyže nové“), každú
 *     s vlastnou hlavičkou a s číslovaním od 1,
 *  2. hlavička býva posunutá oproti dátam (nad hodnotou „Lyžiarky“ je popiska
 *     „znacka“), takže podľa nej sa stĺpce určiť nedajú,
 *  3. vpravo pribúda stĺpec na sezónu („2022/2023“) s menom toho, kto si kus
 *     požičal — to nie je vlastnosť kusu, ale výpožička.
 *
 * Preto stĺpce rozpoznávame podľa obsahu, nie podľa hlavičky, a každú sekciu
 * uložíme ako samostatný súbor s kategóriou a predponou čísla v názve.
 *
 * Výstup v priečinku (predvolene ./normalizovane):
 *   <hárok>--<sekcia>.csv   kusy výstroja, hlavička presne ako polia importu
 *   _prehlad.csv            čo sa v ktorej sekcii rozpoznalo (na kontrolu)
 *   _vypozicky.csv          história sezónnych stĺpcov (kód, sezóna, kto)
 *   _preskocene.csv         riadky, ktoré sa nedali priradiť — nič sa nestráca
 *
 * Skript je zámerne bez závislostí a s vlastným čítaním .xlsx (kópia logiky
 * z lib/xlsx-read.ts), aby sa dal spustiť aj tam, kde nie je `pnpm install`.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { inflateRawSync } from "node:zlib";

/* ---------- čítanie .xlsx (ZIP + XML, bez knižníc) ---------- */

function zipEntries(buffer) {
  const entries = new Map();
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 66_000); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) return entries;

  const count = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pointer + 10);
    const compressed = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(dataStart, dataStart + compressed);
    try { entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw)); } catch { /* poškodenú položku preskočíme */ }
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const decodeXml = (value) =>
  value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (entity) =>
      ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[entity] ?? entity);

const textOf = (xml) =>
  (xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
    .map((part) => decodeXml(part.replace(/<t[^>]*>/, "").replace(/<\/t>$/, "")))
    .join("");

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function sheetGrid(xml, shared) {
  const grid = [];
  for (const rowXml of xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const row = [];
    let cursor = 0;
    for (const cellXml of rowXml.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const reference = cellXml.match(/\br="([A-Z]+\d+)"/)?.[1];
      const index = reference ? columnIndex(reference) : cursor;
      while (row.length < index) row.push("");
      let value = "";
      if (!cellXml.endsWith("/>")) {
        const type = cellXml.match(/\bt="([^"]+)"/)?.[1];
        const raw = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];
        value =
          type === "inlineStr" ? textOf(cellXml)
          : raw === undefined ? (type === "s" ? "" : textOf(cellXml))
          : type === "s" ? (shared[Number(decodeXml(raw))] ?? "")
          : decodeXml(raw);
      }
      row[index] = String(value).trim();
      cursor = index + 1;
    }
    grid.push(row);
  }
  return grid;
}

function readSheets(path) {
  const buffer = readFileSync(path);

  if (/\.(csv|txt)$/i.test(path)) {
    // Excel na Windows ukladá CSV v kódovaní Windows-1250 — v UTF-8 by z „Lyžiarky“ bolo „Ly�iarky“.
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      text = new TextDecoder("windows-1250").decode(buffer);
    }
    text = text.replace(/^﻿/, "");
    const delimiter = (text.split("\n")[0].match(/;/g) ?? []).length >= (text.split("\n")[0].match(/,/g) ?? []).length ? ";" : ",";
    const grid = text.split(/\r?\n/).map((line) => line.split(delimiter).map((cell) => cell.trim()));
    return [{ name: basename(path).replace(/\.[^.]+$/, ""), grid }];
  }

  if (buffer.length > 8 && buffer.readUInt32BE(0) === 0xd0cf11e0) {
    throw new Error(`${basename(path)} je starý .xls — otvor ho v Exceli a ulož ako .xlsx.`);
  }

  const entries = zipEntries(buffer);
  const shared = (entries.get("xl/sharedStrings.xml")?.toString("utf8").match(/<si>[\s\S]*?<\/si>/g) ?? []).map(textOf);
  const workbook = entries.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";

  return (workbook.match(/<sheet\b[^>]*\/?>/g) ?? []).flatMap((tag) => {
    const name = decodeXml(tag.match(/\bname="([^"]*)"/)?.[1] ?? "");
    const relationId = tag.match(/r:id="([^"]+)"/)?.[1];
    const target = rels.match(new RegExp(`<Relationship[^>]*Id="${relationId}"[^>]*>`))?.[0]?.match(/Target="([^"]+)"/)?.[1];
    if (!target) return [];
    const file = entries.get(target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
    return file ? [{ name, grid: sheetGrid(file.toString("utf8"), shared) }] : [];
  });
}

/* ---------- slovník klubu: podľa neho spoznávame stĺpce z obsahu ---------- */

const norm = (value) => String(value ?? "").trim().toLocaleLowerCase("sk").normalize("NFD").replace(/[̀-ͯ]/g, "");

const CATEGORIES = {
  lyze: "Lyže", lyziarky: "Lyžiarky", palice: "Palice", palica: "Palice",
  prilba: "Prilba", prilby: "Prilba", kombineza: "Kombinéza", kombinezy: "Kombinéza",
  chranic: "Chránič", chranice: "Chránič", vesta: "Vesta", bunda: "Bunda",
  nohavice: "Nohavice", okuliare: "Okuliare", tricko: "Tričko",
  // Názvy hárkov z Inventura-final sú veľkými písmenami a bez diakritiky.
  pomocky: "Pomôcky", tricka: "Tričko", vaky: "Vak", vak: "Vak", tyce: "Tyče", vesty: "Vesta",
  prilby: "Prilba", lyziarky: "Lyžiarky", kombinezy: "Kombinéza",
};

const BRANDS = [
  "atomic", "rossignol", "ross", "head", "salomon", "volkl", "völkl", "dynastar", "fischer", "elan",
  "tecnica", "technika", "techno", "lange", "nordica", "blizzard", "munari", "gipron", "alpina",
  "briko", "brickl", "uvex", "leki", "kerma", "b-o", "sweety", "dinnaster",
];

/** Skratky a preklepy značiek z hárkov → jeden zápis v appke. */
const BRAND_NAMES = { ross: "Rossignol", technika: "Tecnica", dinnaster: "Dynastar", volkl: "Völkl" };

const COLORS = [
  "cervene", "cervena", "cerv", "modre", "modra", "biele", "biela", "zlte", "zlta", "cierne", "cierna",
  "oranzove", "oranzova", "orange", "zelene", "zelena", "seda", "sediva", "siva", "ruzove", "ruzova",
  "solar", "solar-c", "fialove", "strieborne", "tyrkysove",
];

const STATUSES = { vyradene: "vyradene", vyradena: "vyradene", sklad: "dostupne", strate: "stratene", oprava: "v_oprave" };

/** Slová, ktoré sa v hárkoch objavujú v sezónnych stĺpcoch — nie sú to modely. */
const SEASON_WORDS = [
  "sklad", "vratil", "vratila", "vratili", "vratene", "vratená", "nevratil", "vyradene", "vyradena",
  "nie", "ano", "odkupene", "kupa", "inventura", "predane", "strate", "stratene", "pozicane",
];
const isSeasonWord = (value) => SEASON_WORDS.some((word) => norm(value).startsWith(word));

const isNumeric = (value) => /^\d+([.,]\d+)?$/.test(String(value).trim());
const isSize = (value) => {
  const text = String(value).trim();
  if (/^(xxs|xs|s|m|l|xl|xxl)$/i.test(text)) return true;
  if (/^\d+\/\d+$/.test(text)) return true;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) && number >= 15 && number <= 300;
};
const matches = (value, list) => list.some((word) => norm(value).split(/[\s/,-]+/).includes(word) || norm(value) === word);

/** Podiel neprázdnych buniek stĺpca, ktoré vyhoveli testu. */
function share(rows, index, test) {
  const values = rows.map((row) => (row[index] ?? "").trim()).filter(Boolean);
  if (!values.length) return 0;
  return values.filter(test).length / values.length;
}

/**
 * Podiel vážený tým, koľko riadkov stĺpec vôbec má.
 *
 * Bez toho vyhrá stĺpec s dvomi vyplnenými bunkami („ROSSIGNOL“, „Rossignol“
 * v sekcii Lyže staré) nad skutočným stĺpcom značiek, ktorý má 25 hodnôt
 * a jednu preklep navyše.
 */
function weightedShare(rows, index, test) {
  const filled = rows.filter((row) => (row[index] ?? "").trim()).length;
  if (!filled) return 0;
  return share(rows, index, test) * (0.5 + (0.5 * filled) / rows.length);
}

/**
 * Určí význam stĺpcov z ich obsahu.
 *
 * Podľa hlavičky to nejde: v hárku Lyžiarky je nad hodnotami „Lyžiarky“
 * popiska „znacka“ a nad farbou popiska „2018/2019“, lebo stĺpec s kategóriou
 * hlavičku nemá a všetko vpravo od neho je o jedno posunuté. Hlavičku preto
 * používame až na konci, na pomenovanie sezónnych stĺpcov.
 *
 * Poradie je dôležité: najprv isté stĺpce (číslo, kategória, veľkosť, značka,
 * farba), potom model hneď vpravo od nich, a všetko ostatné napravo je už
 * história sezón — nie vlastnosť kusu.
 */
function classify(header, rows, width) {
  const roles = {};
  const taken = new Set();
  const claim = (role, index) => {
    if (index === undefined || index < 0 || taken.has(index)) return;
    roles[role] = index;
    taken.add(index);
  };

  const best = (test, floor, { from = 0, to = width } = {}, accept = () => true) => {
    let winner = -1;
    let score = floor;
    for (let index = Math.max(0, from); index < Math.min(width, to); index += 1) {
      if (taken.has(index) || !accept(index)) continue;
      const value = weightedShare(rows, index, test);
      if (value > score) { score = value; winner = index; }
    }
    return winner;
  };

  /*
   * Kód: prvý stĺpec, ktorý je prevažne celé číslo. Hranica je zámerne nízka —
   * pod tabuľkou býva doveta („chrániče 12 vratene“) a pri prísnejšej hranici
   * kvôli nej vypadla celá sekcia. Každý riadok sa aj tak kontroluje zvlášť
   * a ten bez čísla ide do _preskocene.csv.
   */
  for (let index = 0; index < width; index += 1) {
    if (share(rows, index, (value) => /^\d+\.?$/.test(value)) > 0.6) { claim("code", index); break; }
  }

  // Kategória, značka a farba sa poznajú podľa slovníka — tie sú isté.
  claim("category", best((value) => Boolean(CATEGORIES[norm(value)]), 0.6));
  claim("brand", best((value) => matches(value, BRANDS), 0.4));
  claim("color", best((value) => matches(value, COLORS), 0.35));

  /*
   * Veľkosť hľadáme len v ľavej časti — medzi číslom a slovníkovými stĺpcami.
   * Vpravo sú ceny (50, 100) a tie vyzerajú ako veľkosť rovnako dobre; v hárku
   * Lyže nové by potom import dostal do veľkosti cenu za sezónu.
   */
  const vocab = Math.max(roles.category ?? -1, roles.brand ?? -1, roles.color ?? -1, roles.code ?? -1);
  claim("size", best(isSize, 0.6, { from: (roles.code ?? -1) + 1, to: vocab + 2 }));

  /*
   * Popisky „druh“ a „model“ berieme vážne, ak pod nimi naozaj nie sú sezónne
   * hodnoty. V hárkoch Chrániče, Korytnačky a Vaky je názov veci v stĺpci
   * „druh“ a skutočný model až za značkou — obsahovo sa od seba nelíšia.
   */
  const byLabel = (pattern, role) => {
    for (let index = 0; index < width; index += 1) {
      if (taken.has(index) || roles[role] !== undefined) continue;
      if (!pattern.test(norm(header[index] ?? ""))) continue;
      if (share(rows, index, isSeasonWord) > 0.3) continue;
      if (!share(rows, index, () => true)) continue;
      claim(role, index);
    }
  };
  // Klipsy na lyžiarkach — podľa nich sa určuje cena požičania.
  byLabel(/^(klipsy|pocet klipsov|klipsov|pracky)$/, "buckles");
  byLabel(/^(druh|nazov)$/, "name");
  byLabel(/^model$/, "model");

  /*
   * Ak model z popisky nevyšiel, je to prvý nenárokovaný textový stĺpec hneď
   * vpravo od slovníkových stĺpcov. Nesmie to byť sezónny stĺpec — ten je plný
   * slov „sklad“ a priezvisk a textovým testom by prešiel rovnako dobre.
   */
  claim(
    "model",
    best(
      (value) => !isNumeric(value) && value.length > 1,
      0.5,
      { from: (roles.code ?? -1) + 1, to: Math.max(vocab, roles.size ?? -1) + 3 },
      (index) => share(rows, index, isSeasonWord) < 0.3,
    ),
  );

  // Cena: popiska „cena“ / „požičanie“, a to len ak sú pod ňou naozaj čísla.
  for (let index = 0; index < width; index += 1) {
    if (taken.has(index)) continue;
    if (!/^(cena|pozicanie)$/.test(norm(header[index] ?? "").replace(/\s/g, ""))) continue;
    if (share(rows, index, isNumeric) > 0.5) { claim("price", index); break; }
  }

  /*
   * Zvyšok vpravo je história: stĺpec na sezónu s „sklad“ alebo priezviskom.
   * Popisku berieme z hlavičky na tom istom indexe, a ak tam rok nie je (kvôli
   * posunu), z najbližšej popisky vľavo — presnejšie sa to z týchto hárkov
   * vyčítať nedá, preto je v _vypozicky.csv aj číslo stĺpca na kontrolu.
   */
  const hasYear = (label) => /\d{4}/.test(label ?? "");
  const rightmost = Math.max(...Object.values(roles), -1);
  const seasons = [];
  for (let index = rightmost + 1; index < width; index += 1) {
    if (taken.has(index)) continue;
    if (!share(rows, index, () => true)) continue;
    // Popiska ako „0.9565217…“ je v hárku rozbitý vzorec — nie názov sezóny.
    let label = isNumeric((header[index] ?? "").trim()) ? "" : (header[index] ?? "").trim();
    if (!hasYear(label)) {
      for (let back = index - 1; back >= Math.max(0, index - 2); back -= 1) {
        if (hasYear(header[back])) { label = `${header[back].trim()} (?)`; break; }
      }
    }
    seasons.push({ index, label: label || `stĺpec ${index + 1}` });
  }

  return { roles, seasons };
}

/* ---------- rozdelenie hárku na sekcie ---------- */

const isHeaderRow = (row) => row.some((cell) => /^(cislo|c\.|p\.c\.|por\. cislo)$/.test(norm(cell).replace(/\s/g, "")));
const filledCount = (row) => row.filter((cell) => String(cell ?? "").trim()).length;

/**
 * Sekcia = hlavička s „čislo“ + riadky pod ňou, pomenovaná podľa nadpisu
 * nad hlavičkou („Lyže staré“). Nová hlavička začína novú sekciu.
 */
function splitSections(sheetName, grid) {
  const sections = [];
  for (let index = 0; index < grid.length; index += 1) {
    if (!isHeaderRow(grid[index] ?? [])) continue;

    let title = "";
    for (let above = index - 1; above >= 0 && above >= index - 3; above -= 1) {
      const row = grid[above] ?? [];
      if (filledCount(row) !== 1) continue;
      const value = row.find((cell) => cell?.trim()) ?? "";
      if (isNumeric(value)) continue;
      // „PRENAJOM“ / „PREDAJ“ / „SKLAD“ je skupina inventára, nie názov sekcie.
      if (/^(prenajom|predaj|sklad|skald|inventura)$/.test(norm(value))) continue;
      title = value;
      break;
    }

    const rows = [];
    const titles = [];
    let cursor = index + 1;
    let emptyRun = 0;
    for (; cursor < grid.length; cursor += 1) {
      const row = grid[cursor] ?? [];
      if (isHeaderRow(row)) break;
      if (!filledCount(row)) { emptyRun += 1; if (emptyRun >= 3) break; continue; }
      emptyRun = 0;
      /*
       * Riadok s jedinou vyplnenou bunkou je nadpis ďalšieho bloku („PREDAJ“,
       * „Korytnačky“) alebo poznámka pod tabuľkou. Medzi dáta nepatrí: pokazil
       * by rozpoznávanie stĺpcov — v hárku Chrániče stačili dva také riadky na
       * to, aby stĺpec s číslom klesol pod hranicu a celá sekcia vypadla.
       */
      if (filledCount(row) === 1) {
        const only = row.find((cell) => cell?.trim()) ?? "";
        // Samotné poradové číslo je voľné miesto v číslovaní, nie poznámka.
        if (!isNumeric(only)) titles.push(only);
        continue;
      }
      rows.push(row);
    }

    if (rows.length) sections.push({ sheet: sheetName, title: title || sheetName, header: grid[index], rows, titles });
    index = cursor - 1;
  }
  return sections;
}

/* ---------- výstup ---------- */

const FIELDS = [
  "Inventárne číslo", "Názov", "Kategória", "Podkategória", "Veľkosť",
  "Farba", "Značka", "Model", "Počet klipsov", "Cena za sezónu", "Určenie", "Stav", "Poznámka",
];

/**
 * Skupina inventára — v Inventura-final je napísaná v prvom riadku hárku.
 * „SKALD“ je preklep za „SKLAD“ a berieme ho tiež, nech to netreba opravovať
 * v Exceli len kvôli importu.
 */
function sheetPurpose(grid) {
  for (const row of grid.slice(0, 3)) {
    for (const cell of row ?? []) {
      const text = norm(cell);
      if (!text) continue;
      if (text.startsWith("predaj")) return "predaj";
      if (text.startsWith("prenajom") || text.startsWith("pozicanie")) return "prenajom";
      if (text.startsWith("sklad") || text.startsWith("skald") || text.startsWith("pomock")) return "sklad";
    }
  }
  return "";
}

/**
 * Hárok, do ktorého sa CSV vložilo bez rozdelenia na stĺpce — celý riadok
 * „LYZE-N-1;J2;Lyže;…“ sedí v jednej bunke. Excel to spraví pri obyčajnom
 * prilepení textu, takže to rozdelíme sami namiesto toho, aby to používateľ
 * musel v Exceli robiť znova.
 */
function splitPastedCsv(grid) {
  const looksPasted = grid.some((row) => {
    const filled = (row ?? []).filter((cell) => String(cell ?? "").trim());
    return filled.length === 1 && filled[0].split(";").length >= 5;
  });
  if (!looksPasted) return grid;

  return grid.map((row) => {
    const filled = (row ?? []).filter((cell) => String(cell ?? "").trim());
    if (filled.length !== 1 || filled[0].split(";").length < 5) return row;
    return filled[0].split(";").map((cell) => cell.trim());
  });
}

/** Hárok už má hlavičku v tvare, aký appka importuje — netreba nič hádať. */
function canonicalHeaderIndex(grid) {
  return grid.findIndex((row) => norm((row ?? [])[0] ?? "").startsWith("inventarne cislo"));
}

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (headers, rows) => `﻿${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;

/** KOMB-N z „Kombinézy nové“ — krátka, čitateľná predpona inventárneho čísla. */
function prefixOf(title) {
  const words = norm(title).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "INV";
  const head = words[0].slice(0, 4).toUpperCase();
  return words.length > 1 ? `${head}-${words[1][0].toUpperCase()}` : head;
}

const safeName = (value) => norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sekcia";

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.findIndex((arg) => arg === "-o" || arg === "--out");
  const outDir = outIndex >= 0 ? args[outIndex + 1] : "normalizovane";
  const inputs = args.filter((arg, index) => !arg.startsWith("-") && index !== outIndex + 1);

  if (!inputs.length) {
    console.error("Použitie: node tools/normalize-inventory.mjs <súbor.xlsx|csv> [-o priečinok]");
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const overview = [];
  const loans = [];
  const skipped = [];
  let written = 0;

  for (const input of inputs) {
    for (const raw of readSheets(input)) {
      const sheet = { name: raw.name, grid: splitPastedCsv(raw.grid) };
      const purpose = sheetPurpose(raw.grid);

      /*
       * Hárok, ktorý už raz cez tento skript prešiel (Inventura-final má také),
       * netreba rozoberať znova — len doplníme skupinu z prvého riadku hárku
       * a prepíšeme ho do aktuálneho tvaru stĺpcov.
       */
      const canonical = canonicalHeaderIndex(sheet.grid);
      if (canonical >= 0) {
        const header = sheet.grid[canonical].map((cell) => norm(cell));
        const column = (name) => header.indexOf(norm(name));
        const rows = sheet.grid
          .slice(canonical + 1)
          .filter((row) => (row[column("Inventárne číslo")] ?? "").trim());

        const out = rows.map((row) => {
          const pick = (name) => (column(name) < 0 ? "" : String(row[column(name)] ?? "").trim());
          return [
            pick("Inventárne číslo"), pick("Názov"), pick("Kategória"), pick("Podkategória"), pick("Veľkosť"),
            pick("Farba"), pick("Značka"), pick("Model"), pick("Počet klipsov"), pick("Cena za sezónu"),
            pick("Určenie") || purpose, pick("Stav"), pick("Poznámka"),
          ];
        });

        if (!out.length) continue;
        const file = join(outDir, `${safeName(sheet.name)}.csv`);
        writeFileSync(file, toCsv(FIELDS, out), "utf8");
        written += 1;
        overview.push([
          basename(input), sheet.name, "(už normalizovaný hárok)", out.length, "", out[0][2],
          "prevzaté zo stĺpcov súboru", purpose || "neurčené", file,
        ]);
        console.log(`${file}  →  ${out.length} kusov  (${out[0][2] || sheet.name}, ${purpose || "bez skupiny"})`);
        continue;
      }

      for (const section of splitSections(sheet.name, sheet.grid)) {
        const width = Math.max(section.header.length, ...section.rows.map((row) => row.length));
        const { roles, seasons } = classify(section.header, section.rows, width);

        for (const line of section.titles) {
          skipped.push([basename(input), sheet.name, section.title, `nadpis alebo poznámka mimo tabuľky: ${line}`, 1]);
        }

        if (roles.code === undefined) {
          skipped.push([basename(input), sheet.name, section.title, "nenašiel sa stĺpec s číslom", section.rows.length]);
          continue;
        }

        const category = (() => {
          const fromRows = roles.category !== undefined
            ? CATEGORIES[norm(section.rows.find((row) => CATEGORIES[norm(row[roles.category])])?.[roles.category] ?? "")]
            : undefined;
          return fromRows ?? CATEGORIES[norm(section.title.split(/\s+/)[0])] ?? CATEGORIES[norm(sheet.name)] ?? section.title;
        })();

        const prefix = prefixOf(section.title);
        const at = (row, role) => (roles[role] === undefined ? "" : String(row[roles[role]] ?? "").trim());
        const out = [];
        const usedCodes = new Set();

        for (const row of section.rows) {
          const rawCode = at(row, "code").replace(/\.$/, "");
          const size = at(row, "size");
          const brand = at(row, "brand");

          /*
           * V starších sekciách je v stĺpci s modelom niekedy stav („vyradené“,
           * „sklad“) — patrí do stavu kusu, nie do názvu.
           */
          let model = at(row, "model");
          let statusFromModel = "";
          if (model && isSeasonWord(model)) {
            statusFromModel = Object.entries(STATUSES).find(([word]) => norm(model).startsWith(word))?.[1] ?? "";
            model = "";
          }

          if (!rawCode || !/^\d+$/.test(rawCode)) {
            skipped.push([basename(input), sheet.name, section.title, `riadok bez čísla: ${row.filter(Boolean).join(" | ").slice(0, 80)}`, 1]);
            continue;
          }
          // Riadky, ktoré majú len poradové číslo, sú v hárkoch vynechané miesto.
          if (!size && !model && !brand && !at(row, "color") && !at(row, "name") && !at(row, "buckles")) continue;

          let code = `${prefix}-${rawCode}`;
          if (usedCodes.has(code) && size) code = `${prefix}-${rawCode}-${size}`;
          for (let index = 2; usedCodes.has(code); index += 1) code = `${prefix}-${rawCode}-${index}`;
          usedCodes.add(code);

          // Sezónne stĺpce: „sklad“ = na sklade, čokoľvek iné je priezvisko toho, kto má kus doma.
          /*
           * Bez sezónnych stĺpcov stav nechávame prázdny — import potom kusu, ktorý
           * už v appke je, ponechá jeho stav (požičaný zostane požičaný). Nový kus
           * dostane „dostupné“ v importe.
           */
          let status = statusFromModel;
          const history = [];
          for (const season of seasons) {
            const value = String(row[season.index] ?? "").trim();
            if (!value) continue;
            const known = Object.entries(STATUSES).find(([word]) => norm(value).startsWith(word));
            if (known) { status = known[1]; continue; }
            // Čísla (ceny), otázniky a „vrátil“ nie sú meno toho, kto má kus doma.
            if (/^\d+([.,]\d+)?$/.test(value) || value.length < 2 || norm(value).startsWith("vratil")) continue;
            history.push({ season: season.label, holder: value });
            loans.push([code, season.label, value, category, section.title]);
          }
          const last = history.at(-1);
          if (last && (!status || status === "dostupne") && !statusFromModel) status = "pozicane";

          const price = at(row, "price").replace(",", ".");
          // „ROSSIGNOL“ aj „Rossignol“ je tá istá značka — v appke ju chceme mať raz.
          const brandLabel = BRAND_NAMES[norm(brand)]
            ?? (brand ? brand[0].toLocaleUpperCase("sk") + brand.slice(1).toLocaleLowerCase("sk") : "");
          out.push([
            code,
            // Model sa v appke zobrazuje vedľa názvu, preto ho do názvu nedávame.
            at(row, "name") || (brandLabel ? `${category} - ${brandLabel}` : category),
            category,
            // Samostatný súbor „lyžiarky.csv“ má sekciu pomenovanú podľa súboru — to nie je podkategória.
            norm(section.title) !== norm(category) ? section.title : "",
            size.replace(",", "."),
            at(row, "color"),
            brandLabel,
            model,
            /^[1-9]$/.test(at(row, "buckles")) ? at(row, "buckles") : "",
            /^\d+(\.\d+)?$/.test(price) ? price : "",
            purpose,
            status,
            last ? `naposledy ${last.season}: ${last.holder}` : "",
          ]);
        }

        if (!out.length) continue;
        const file = join(outDir, `${safeName(sheet.name)}--${safeName(section.title)}.csv`);
        writeFileSync(file, toCsv(FIELDS, out), "utf8");
        written += 1;
        overview.push([
          basename(input), sheet.name, section.title, out.length, prefix, category,
          Object.entries(roles).map(([role, index]) => `${role}=${index}`).join(" "),
          seasons.map((season) => season.label).join(" | "),
          file,
        ]);
        console.log(`${file}  →  ${out.length} kusov  (${category}, predpona ${prefix})`);
      }
    }
  }

  writeFileSync(
    join(outDir, "_prehlad.csv"),
    toCsv(["Súbor", "Hárok", "Sekcia", "Kusov", "Predpona", "Kategória", "Rozpoznané stĺpce", "Sezónne stĺpce", "Výstup"], overview),
    "utf8",
  );
  writeFileSync(join(outDir, "_vypozicky.csv"), toCsv(["Inventárne číslo", "Sezóna", "Kto", "Kategória", "Sekcia"], loans), "utf8");
  writeFileSync(join(outDir, "_preskocene.csv"), toCsv(["Súbor", "Hárok", "Sekcia", "Dôvod", "Riadkov"], skipped), "utf8");

  console.log(`\nHotovo: ${written} súborov s kusmi, ${loans.length} záznamov o výpožičkách, ${skipped.length} preskočených riadkov.`);
  console.log(`Skontroluj ${join(outDir, "_prehlad.csv")} a potom súbory nahraj v appke cez Požičovňa → Import inventára.`);
}

main();
