import assert from "node:assert/strict";
import { test } from "node:test";
import { importLeafCategory, parseEquipmentPurpose } from "./equipment.ts";
import { archiveWarning, deleteWarning, describeSkipped, describeSkippedEquipment, membersToRegister, uniqueEmails } from "./domain.ts";

const jano = { id: "1", first_name: "Ján", last_name: "Novák" };
const eva = { id: "2", first_name: "Eva", last_name: "Kováčová" };

test("bez nevyriešených vecí sa pýta len na potvrdenie", () => {
  const text = deleteWarning(["1"], [jano], {});
  assert.equal(text, "Naozaj vymazať 1 členov aj s ich platbami a kontaktmi?");
});

test("vypíše dôvody len za vybraných členov", () => {
  const text = deleteWarning(["1"], [jano, eva], { "1": ["nevrátená výstroj: 2 ks"], "2": ["neuhradená platba"] });
  assert.match(text, /Novák Ján — nevrátená výstroj: 2 ks/);
  assert.doesNotMatch(text, /Kováčová/);
  assert.match(text, /archivovať/);
});

test("archivácia vypíše nevyriešené veci, bez rady o archivácii", () => {
  const text = archiveWarning(["1"], [jano], { "1": ["neuhradená platba"] });
  assert.match(text, /Novák Ján — neuhradená platba/);
  assert.match(text, /Presunúť 1 členov do archívu\?/);
  assert.doesNotMatch(text, /Namiesto vymazania/);
});

test("dlhý zoznam skráti na desať a dopíše zvyšok", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i), first_name: "A", last_name: "B" }));
  const blockers = Object.fromEntries(many.map((m) => [m.id, ["neuhradená platba"]]));
  const text = deleteWarning(many.map((m) => m.id), many, blockers);
  assert.equal(text.split("\n").filter((line) => line.startsWith("• ")).length, 11);
  assert.match(text, /…a ďalší: 2/);
});

test("e-maily zlúči, odstráni duplicity a prázdne", () => {
  const emails = uniqueEmails([
    ["  mama@klub.sk ", "otec@klub.sk"],
    ["MAMA@klub.sk"], // súrodenec — tí istí rodičia
    undefined,
    ["", "   "],
  ]);
  assert.deepEqual(emails, ["mama@klub.sk", "otec@klub.sk"]);
});

test("na akciu prihlási len tých, čo tam ešte nie sú", () => {
  const children = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const toAdd = membersToRegister(["a", "b", "c"], children, ["b", null]);
  assert.deepEqual(toAdd, [{ id: "a" }, { id: "c" }]);
});

test("neznáme id ticho vynechá, nezhodí prihlasovanie", () => {
  assert.deepEqual(membersToRegister(["x"], [{ id: "a" }], []), []);
});

test("preskočené riadky: meno, inak rodič, a hárok pri viacerých zdrojoch", () => {
  const row = (first_name: string, last_name: string, errors: string[], father_name = "") => ({
    first_name, last_name, father_name, mother_name: "", errors,
  });
  const skipped = describeSkipped(
    [
      row("Ján", "Novák", []), // v poriadku — do zoznamu nepatrí
      row("Eva", "Kováčová", ["Neznáme družstvo"]),
      row("", "", ["Chýba meno", "Chýba priezvisko"], "Peter Horák"),
      row("", "", ["Chýba meno"]),
    ],
    [undefined, "Pretekári", undefined, undefined],
  );
  assert.deepEqual(skipped, [
    { label: "Kováčová Eva · Pretekári", reasons: ["Neznáme družstvo"] },
    { label: "(bez mena, rodič: Peter Horák)", reasons: ["Chýba meno", "Chýba priezvisko"] },
    { label: "(riadok bez mena)", reasons: ["Chýba meno"] },
  ]);
});

test("preskočená výstroj: čím kus v CSV nájsť, medzery v hárku vynechá", () => {
  const row = (over: Partial<{ name: string; sourceCode: string; size: string; brand: string; blank: boolean; errors: string[] }>) => ({
    name: "", sourceCode: "", size: "", brand: "", blank: false, errors: [], ...over,
  });
  const skipped = describeSkippedEquipment(
    [
      row({ name: "Lyže", sourceCode: "12", errors: [] }), // v poriadku
      row({ blank: true, errors: [] }), // medzera v hárku
      row({ name: "Lyže", size: "140", brand: "Atomic", errors: ["chýba inventárne číslo"] }),
      row({ sourceCode: "7", size: "M", errors: ["chýba názov"] }),
      row({ errors: ["chýba inventárne číslo", "chýba názov"] }),
    ],
    [undefined, undefined, "Lyže staré", undefined, undefined],
  );
  assert.deepEqual(skipped, [
    { label: "Lyže · veľ. 140 · Atomic · Lyže staré", reasons: ["chýba inventárne číslo"] },
    { label: "č. 7 · veľ. M", reasons: ["chýba názov"] },
    { label: "(riadok bez názvu aj čísla)", reasons: ["chýba inventárne číslo", "chýba názov"] },
  ]);
});

test("import zaradí kombinézu podľa opotrebenia do Nová/Stará a ručné zaradenie nezmaže", () => {
  const cat = (id: string, name: string, parent_id: string | null) => ({ id, name, parent_id, season_price: null });
  const categories = [cat("k", "Kombinéza", null), cat("n", "Nová", "k"), cat("s", "Stará", "k"), cat("l", "Lyže", null), cat("x", "Slalom", "l")];
  assert.equal(importLeafCategory("k", "nove", null, categories), "n");
  assert.equal(importLeafCategory("k", "stare", "n", categories), "s");
  assert.equal(importLeafCategory("l", "nove", "x", categories), "x"); // lyže Nová/Stará nemajú → ostane ručné zaradenie
  assert.equal(importLeafCategory("l", null, "n", categories), "l"); // podkategória inej kategórie sa nedrží
});

test("zrušený predaj sa importuje ako prenájom, pomôcky ako sklad", () => {
  assert.equal(parseEquipmentPurpose("PREDAJ"), "prenajom");
  assert.equal(parseEquipmentPurpose("Prenájom"), "prenajom");
  assert.equal(parseEquipmentPurpose("pomôcky"), "sklad");
});
