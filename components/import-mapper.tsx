"use client";

import { useMemo, useState } from "react";
import { cancelImport, confirmImport } from "@/app/import/actions";
import { SubmitButton } from "./submit-button";
import { IMPORT_FIELDS, mapImportRows, type ImportField, type ImportRow } from "@/lib/import-map";
import { TEAM_LABELS } from "@/lib/domain";

const REQUIRED: ImportField[] = ["first_name", "last_name", "birth_date", "team"];
const PREVIEW_LIMIT = 15;

/** Mapovanie stĺpcov + živý náhľad. Prepočet beží v prehliadači, takže je okamžitý. */
export function ImportMapper({
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
  suggestion: Record<ImportField, string>;
}) {
  const [mapping, setMapping] = useState(suggestion);

  const mapped = useMemo(() => mapImportRows(rows, mapping), [rows, mapping]);
  const valid = mapped.filter((row) => !row.errors.length);
  const invalid = mapped.filter((row) => row.errors.length);
  const missingRequired = REQUIRED.filter((field) => !mapping[field]);
  // Náhľad ukáže len prvých pár riadkov — problémové dáme hore, inak by zapadli pod limit.
  const preview = mapped
    .map((row, index) => ({ row, position: index + 1 }))
    .sort((a, b) => Number(b.row.errors.length > 0) - Number(a.row.errors.length > 0))
    .slice(0, PREVIEW_LIMIT);

  return (
    <>
      <section className="form-card">
        <div className="section-heading">
          <div>
            <h2>2. Namapuj stĺpce</h2>
            <p className="muted">Zdroj: <strong>{fileName}</strong> · spolu {rows.length} riadkov</p>
          </div>
          <form action={cancelImport}>
            <SubmitButton label="Zrušiť import" className="danger-button" pendingLabel="Ruším…" />
          </form>
        </div>

        <div className="form-grid">
          {(Object.entries(IMPORT_FIELDS) as [ImportField, string][]).map(([field, label]) => (
            <label key={field}>
              {label}{REQUIRED.includes(field) && " *"}
              <select
                value={mapping[field] ?? ""}
                onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
              >
                <option value="">— nemapovať —</option>
                {headers.map((header) => <option key={header} value={header}>{header}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="form-card">
        <h2>3. Náhľad a kontrola</h2>

        <div className="summary-grid">
          <article><span>Pripravené na import</span><strong>{valid.length}</strong><small>riadkov bez chyby</small></article>
          <article><span>Nespárované</span><strong className={invalid.length ? "overdue-text" : undefined}>{invalid.length}</strong><small>preskočia sa</small></article>
          <article><span>Celkom v súbore</span><strong>{rows.length}</strong><small>dátových riadkov</small></article>
        </div>

        {missingRequired.length > 0 && (
          <p className="notice error" role="alert">
            Chýba mapovanie povinných polí: {missingRequired.map((field) => IMPORT_FIELDS[field]).join(", ")}.
          </p>
        )}

        <div className="table-wrap">
          <table className="members">
            <thead>
              <tr><th>#</th><th>Priezvisko</th><th>Meno</th><th>Narodenie</th><th>Družstvo</th><th>Rodič</th><th>Kontakt</th><th>Problém</th></tr>
            </thead>
            <tbody>
              {preview.map(({ row, position }) => (
                <tr key={position} className={row.errors.length ? "invalid-row" : undefined}>
                  <td className="muted">{position}</td>
                  <td>{row.last_name || "—"}</td>
                  <td>{row.first_name || "—"}</td>
                  <td>{row.birth_date || "—"}</td>
                  <td>{row.team ? TEAM_LABELS[row.team] : "—"}</td>
                  <td>{[row.father_name, row.mother_name].filter(Boolean).join(" / ") || "—"}</td>
                  <td>{[row.emails.join(", "), row.father_phone || row.mother_phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={row.errors.length ? "no" : "ok"}>{row.errors.join(", ") || "v poriadku"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mapped.length > PREVIEW_LIMIT && (
          <p className="muted">Zobrazených {PREVIEW_LIMIT} riadkov z {mapped.length} — tie s problémom sú hore.</p>
        )}
      </section>

      <form action={confirmImport} className="form-card">
        <input type="hidden" name="token" value={token} />
        {(Object.keys(IMPORT_FIELDS) as ImportField[]).map((field) => (
          <input key={field} type="hidden" name={`map_${field}`} value={mapping[field] ?? ""} />
        ))}
        <h2>4. Potvrdenie</h2>
        <p className="muted">
          Vytvorí sa {valid.length} záznamov (existujúce deti sa doplnia). Potvrdenie sa dá spustiť len raz —
          opakované kliknutie ani obnovenie stránky nevytvorí duplikáty.
        </p>
        <div className="form-actions">
          <SubmitButton
            label={`Importovať ${valid.length} riadkov`}
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
