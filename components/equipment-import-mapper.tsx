"use client";

import { useMemo, useState } from "react";
import { cancelEquipmentImport, confirmEquipmentImport } from "@/app/pozicovna/actions";
import { SubmitButton } from "./submit-button";
import {
  EQUIPMENT_IMPORT_FIELDS,
  mapEquipmentRows,
  suggestEquipmentMapping,
  type EquipmentImportField,
} from "@/lib/equipment-import";
import { EQUIPMENT_PURPOSE_LABELS, type EquipmentPurpose } from "@/lib/equipment";
import type { ImportRow } from "@/lib/import-map";
import { SOURCE_COLUMN } from "@/lib/parse-spreadsheet";

const REQUIRED: EquipmentImportField[] = ["code"];
const PREVIEW_LIMIT = 15;

/**
 * Mapovanie stĺpcov pre inventár. Na rozdiel od členov tu skladové zoznamy
 * klubu bežne nemajú stĺpec „názov“ ani „kategória“ vôbec — jeden zošit je
 * napr. celý „kombinézy nové“. Preto sa dajú kategória, podkategória a
 * predpona inventárneho čísla zadať raz pre celý súbor.
 */
export function EquipmentImportMapper({
  token,
  fileName,
  headers,
  rows,
  suggestion,
}: {
  token: string;
  fileName: string;
  headers: string[];
  rows: ImportRow[];
  suggestion: Record<EquipmentImportField, string>;
}) {
  const [mapping, setMapping] = useState(suggestion);
  // Kým mapovanie nikto neprepísal ručne, prispôsobuje sa výberu hárkov.
  const [touched, setTouched] = useState(false);
  const [codePrefix, setCodePrefix] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [purpose, setPurpose] = useState<EquipmentPurpose | "">("");

  // Zošit s viacerými hárkami (napr. Inventúra: Lyžiarky, Lyže, Kombinézy…)
  // — importovať chceme spravidla jeden hárok, nie všetky naraz.
  const sources = useMemo(() => {
    if (!headers.includes(SOURCE_COLUMN)) return [];
    return [...new Set(rows.map((row) => row[SOURCE_COLUMN] ?? "").filter(Boolean))];
  }, [headers, rows]);
  const [selected, setSelected] = useState<string[]>(sources);

  const picked = useMemo(
    () => (sources.length ? rows.filter((row) => selected.includes(row[SOURCE_COLUMN] ?? "")) : rows),
    [rows, sources, selected],
  );

  /*
   * Zošit má spoločný zoznam stĺpcov za všetky hárky. Do mapovania ponúkame
   * najprv tie, ktoré vo vybratých hárkoch naozaj majú dáta — inak by sa
   * automatika trafila do stĺpca z úplne iného hárku.
   */
  const activeHeaders = useMemo(
    () => headers.filter((header) => header !== SOURCE_COLUMN && picked.some((row) => (row[header] ?? "").trim())),
    [headers, picked],
  );
  const otherHeaders = headers.filter((header) => !activeHeaders.includes(header));
  const active = useMemo(
    () => (touched ? mapping : suggestEquipmentMapping(activeHeaders)),
    [touched, mapping, activeHeaders],
  );

  const mapped = useMemo(
    () => mapEquipmentRows(picked, active, { codePrefix, category, subcategory, purpose }),
    [picked, active, codePrefix, category, subcategory, purpose],
  );
  const valid = mapped.filter((row) => !row.blank && !row.errors.length);
  const invalid = mapped.filter((row) => !row.blank && row.errors.length);
  const blank = mapped.filter((row) => row.blank);
  const renamed = valid.filter((row) => row.code !== row.sourceCode).length;
  const missingRequired = REQUIRED.filter((field) => !active[field]);
  const nameDerived = !active.name && (active.model || active.category || category || subcategory);

  const toggleSource = (name: string) =>
    setSelected((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));

  return (
    <>
      <section className="form-card">
        <div className="section-heading">
          <div>
            <h2>2. Namapuj stĺpce</h2>
            <p className="muted">Zdroj: <strong>{fileName}</strong> · spolu {rows.length} riadkov</p>
          </div>
          <form action={cancelEquipmentImport}>
            <SubmitButton label="Zrušiť import" className="danger-button" pendingLabel="Ruším…" />
          </form>
        </div>

        {sources.length > 0 && (
          <fieldset className="member-picker">
            <legend>Hárky na import</legend>
            <p className="muted">
              Zošit má viac hárkov. Zaškrtni len tie s výstrojom — každý hárok importuj radšej zvlášť, kategórie
              a čísla sa v nich opakujú.
            </p>
            <div className="picker-actions">
              <button type="button" className="secondary" onClick={() => setSelected(sources)}>Označiť všetky</button>
              <button type="button" className="secondary" onClick={() => setSelected([])}>Zrušiť výber</button>
            </div>
            <div className="picker-list">
              {sources.map((name) => (
                <label key={name} className="check">
                  <input type="checkbox" checked={selected.includes(name)} onChange={() => toggleSource(name)} />
                  {name} ({rows.filter((row) => row[SOURCE_COLUMN] === name).length})
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {nameDerived && (
          <p className="notice">
            Súbor nemá stĺpec „Názov“ — použije sa {mapping.model ? "model" : "kategória"}, ak sa nezmapuje inak.
          </p>
        )}

        <div className="form-grid">
          {(Object.entries(EQUIPMENT_IMPORT_FIELDS) as [EquipmentImportField, string][]).map(([field, label]) => (
            <label key={field}>
              {label}{REQUIRED.includes(field) && " *"}
              <select
                value={active[field] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setMapping((current) => ({ ...(touched ? current : active), [field]: value }));
                  setTouched(true);
                }}
              >
                <option value="">— nemapovať —</option>
                {activeHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                {otherHeaders.length > 0 && (
                  <optgroup label="Stĺpce z ostatných hárkov">
                    {otherHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="form-card">
        <h2>3. Doplň, čo v súbore nie je</h2>
        <p className="muted">
          Skladové zoznamy majú kategóriu v názve súboru a čísla začínajú v každom zozname od 1. Tieto tri polia sa
          použijú na všetky riadky, ktoré vlastnú hodnotu nemajú.
        </p>
        <div className="form-grid">
          <label>
            Kategória pre celý súbor
            <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="napr. Kombinéza" />
          </label>
          <label>
            Podkategória pre celý súbor
            <input value={subcategory} onChange={(event) => setSubcategory(event.target.value)} placeholder="napr. Kombinézy nové" />
          </label>
          <label>
            Predpona inventárneho čísla
            <input value={codePrefix} onChange={(event) => setCodePrefix(event.target.value)} placeholder="napr. KOMB-N" />
            <span className="field-help">KOMB-N → KOMB-N-1, KOMB-N-2 … Odlíši kus č. 1 z tohto zoznamu od kusa č. 1 v inom.</span>
          </label>
          <label>
            Určenie pre celý súbor
            <select value={purpose} onChange={(event) => setPurpose(event.target.value as EquipmentPurpose | "")}>
              <option value="">— podľa stĺpca, inak prenájom —</option>
              {Object.entries(EQUIPMENT_PURPOSE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <span className="field-help">Pomôcky na tréningy importuj ako sklad, všetko ostatné je prenájom.</span>
          </label>
        </div>
      </section>

      <section className="form-card">
        <h2>4. Náhľad a kontrola</h2>

        <div className="summary-grid">
          <article><span>Pripravené na import</span><strong>{valid.length}</strong><small>riadkov bez chyby</small></article>
          <article><span>Nespárované</span><strong className={invalid.length ? "overdue-text" : undefined}>{invalid.length}</strong><small>preskočia sa</small></article>
          <article><span>Prázdne riadky</span><strong>{blank.length}</strong><small>len číslo, bez údajov</small></article>
          <article><span>Celkom vybraté</span><strong>{picked.length}</strong><small>dátových riadkov</small></article>
        </div>

        {missingRequired.length > 0 && (
          <p className="notice error" role="alert">
            Chýba mapovanie povinných polí: {missingRequired.map((field) => EQUIPMENT_IMPORT_FIELDS[field]).join(", ")}.
          </p>
        )}

        {renamed > 0 && (
          <p className="notice">
            Inventárne čísla sa v súbore opakujú alebo majú predponu — {renamed} kusom sme kód doplnili tak, aby bol
            každý kus samostatný záznam. Výsledný kód vidíš v stĺpci „Kód“.
          </p>
        )}

        <div className="table-wrap">
          <table className="members">
            <thead>
              <tr><th>#</th><th>Kód</th><th>Názov</th><th>Kategória</th><th>Veľkosť</th><th>Farba</th><th>Značka / model</th><th>Problém</th></tr>
            </thead>
            <tbody>
              {mapped.slice(0, PREVIEW_LIMIT).map((row, index) => (
                <tr key={index} className={row.errors.length ? "invalid-row" : undefined}>
                  <td className="muted">{index + 1}</td>
                  <td>{row.code || "—"}</td>
                  <td>{row.name || "—"}</td>
                  <td>{[row.category, row.subcategory].filter(Boolean).join(" → ") || "—"}</td>
                  <td>{row.size || "—"}</td>
                  <td>{row.color || "—"}</td>
                  <td>{[row.brand, row.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className={row.errors.length ? "no" : "ok"}>
                    {row.blank ? "prázdny riadok — preskočí sa" : row.errors.join(", ") || "v poriadku"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mapped.length > PREVIEW_LIMIT && (
          <p className="muted">Zobrazených prvých {PREVIEW_LIMIT} riadkov z {mapped.length}.</p>
        )}
      </section>

      <form action={confirmEquipmentImport} className="form-card">
        <input type="hidden" name="token" value={token} />
        {(Object.keys(EQUIPMENT_IMPORT_FIELDS) as EquipmentImportField[]).map((field) => (
          <input key={field} type="hidden" name={`map_${field}`} value={active[field] ?? ""} />
        ))}
        <input type="hidden" name="code_prefix" value={codePrefix} />
        <input type="hidden" name="default_category" value={category} />
        <input type="hidden" name="default_subcategory" value={subcategory} />
        <input type="hidden" name="default_purpose" value={purpose} />
        <input type="hidden" name="sources" value={JSON.stringify(sources.length ? selected : [])} />
        <h2>5. Potvrdenie</h2>
        <p className="muted">
          Vytvorí sa {valid.length} kusov (existujúce sa doplnia podľa inventárneho čísla). Potvrdenie sa dá spustiť
          len raz — opakované kliknutie ani obnovenie stránky nevytvorí duplikáty.
        </p>
        <div className="form-actions">
          <SubmitButton
            label={`Importovať ${valid.length} kusov`}
            pendingLabel="Importujem…"
            onClick={(event) => {
              if (missingRequired.length) {
                event.preventDefault();
                alert("Najprv namapuj všetky povinné polia.");
              }
            }}
          />
        </div>
      </form>
    </>
  );
}
