import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ImportMapper } from "@/components/import-mapper";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin, type ImportLog } from "@/lib/data";
import { formatDate } from "@/lib/domain";
import { suggestMapping } from "@/lib/import-map";
import { uploadImport } from "./actions";

const LOG_TEXT: Record<ImportLog["kind"], { title: string; column: string; hint: React.ReactNode }> = {
  members: {
    title: "Členovia",
    column: "Kto",
    hint: (
      <>
        Oprav riadky v Exceli a nahraj súbor znova — už naimportované deti sa len doplnia, nezdvoja sa. Alebo ich dopíš
        ručne cez <Link href="/clenovia/novy">+ Nový člen</Link>.
      </>
    ),
  },
  equipment: {
    title: "Výstroj",
    column: "Kus",
    hint: (
      <>
        Oprav riadky v CSV a nahraj ho znova v <Link href="/pozicovna">Požičovni</Link> — kusy sa párujú podľa
        inventárneho čísla, takže už naimportované sa len aktualizujú.
      </>
    ),
  },
};

/** Čo posledný import daného druhu preskočil. Zostáva tu, kým ho neprepíše ďalší import. */
function SkippedLog({ log }: { log: ImportLog }) {
  const text = LOG_TEXT[log.kind];
  return (
    <section className="form-card">
      <div className="section-heading">
        <div>
          <h2>{text.title}: nenaimportované riadky ({log.skipped.length})</h2>
          <p className="muted">
            Import {formatDate(log.created_at)}
            {log.file_name && <> · {log.file_name}</>}
          </p>
        </div>
      </div>
      <p className="muted">{text.hint}</p>
      <div className="table-wrap">
        <table className="members">
          <thead>
            <tr><th>{text.column}</th><th>Problém</th></tr>
          </thead>
          <tbody>
            {log.skipped.map((row, index) => (
              <tr key={index} className="invalid-row">
                <td>{row.label}</td>
                <td className="no">{row.reasons.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const params = await searchParams;
  const { repo, role, demo } = await requireAdmin("/clenovia");
  // Rozpracovaný import inventára (iný "kind") sem nepatrí — má vlastnú stránku.
  const [draft, logs] = await Promise.all([repo.pendingImport(), repo.importLogs()]);
  const pending = draft?.kind === "members" ? draft : null;
  // Členovia prví, výstroj za nimi; import, ktorý prešiel celý, tu nič nezaberá.
  const withProblems = (["members", "equipment"] as const)
    .map((kind) => logs.find((log) => log.kind === kind))
    .filter((log): log is ImportLog => Boolean(log?.skipped.length));

  return (
    <AppShell active="/import" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">DÁTA</p>
          <h1>Import z Excelu</h1>
          <p className="muted">Náhľad → mapovanie → potvrdenie → výsledok. Nič sa neuloží bez tvojho potvrdenia.</p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      {!pending ? (
        <form action={uploadImport} className="form-card">
          <h2>1. Vyber súbory</h2>
          <p className="muted">
            Podporujeme .xlsx a .csv. Naraz môžeš vybrať aj <strong>viac súborov</strong> (napr. jeden na družstvo) —
            spoja sa do jedného náhľadu. Duplicity rozpoznávame podľa kombinácie <strong>meno + priezvisko + dátum
            narodenia</strong>, takže existujúce deti sa doplnia a nevytvoria sa nanovo, ani keď sú vo viacerých súboroch.
          </p>
          <div className="form-grid">
            <label className="wide">
              Súbory *
              <input type="file" name="files" accept=".xlsx,.csv,.txt" multiple required />
              <span className="field-help">Viac súborov vyber cez Ctrl (Windows) alebo Cmd (Mac). Spolu max. 10 MB.</span>
            </label>
          </div>
          <div className="form-actions">
            <SubmitButton label="Načítať náhľad" pendingLabel="Načítavam súbor…" />
          </div>
        </form>
      ) : (
        <ImportMapper
          token={pending.token}
          fileName={pending.file_name}
          headers={pending.headers}
          rows={pending.rows}
          suggestion={suggestMapping(pending.headers)}
        />
      )}

      {withProblems.map((log) => <SkippedLog key={log.kind} log={log} />)}
    </AppShell>
  );
}
