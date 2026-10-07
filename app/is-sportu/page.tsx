import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { getSession } from "@/lib/data";
import { TEAM_LABELS, formatDate, sortByName } from "@/lib/domain";
import { importSportRegistry } from "./actions";

export const dynamic = "force-dynamic";

export default async function SportRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { repo, role, demo } = await getSession();

  const children = (await repo.listChildren()).filter((child) => child.active); // bez archívu
  const registered = children.filter((child) => child.is_sport_registered);
  const missing = children.filter((child) => !child.is_sport_registered);

  const showing = params.filter === "missing" ? missing : params.filter === "registered" ? registered : children;

  return (
    <AppShell active="/is-sportu" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">KLUB</p>
          <h1>Informačný systém športu</h1>
          <p className="muted">
            Registrácia sa používa na potvrdeniach o športovej činnosti. Zelená fajka znamená registrovaný,
            ružový krížik neregistrovaný.
          </p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      <section className="summary-grid" aria-label="Stav registrácie">
        <article><span>Registrovaní</span><strong className="ok">{registered.length}</strong><small>z {children.length} členov</small></article>
        <article>
          <span>Chýba registrácia</span>
          <strong className={missing.length ? "overdue-text" : undefined}>{missing.length}</strong>
          <small>{missing.length ? "treba doregistrovať" : "všetci sú registrovaní"}</small>
        </article>
        <article>
          <span>S identifikátorom</span>
          <strong>{children.filter((child) => child.sport_identifier).length}</strong>
          <small>majú ID z IS športu</small>
        </article>
      </section>

      {role === "admin" && (
        <section className="form-card">
          <h2>Import z IS športu</h2>
          <p className="muted">
            Nahraj export z Informačného systému športu. Spárujeme podľa mena, priezviska a dátumu narodenia.
            <strong> Nové deti sa nikdy nevytvoria</strong> — doplní sa len identifikátor, dátum platnosti a
            prípadne chýbajúce rodné číslo. Nespárované riadky ti vypíšeme.
          </p>
          <form action={importSportRegistry}>
            <div className="form-grid">
              <label className="wide">
                Export z IS športu *
                <input type="file" name="files" accept=".xlsx,.csv,.txt" multiple required />
              </label>
            </div>
            <div className="form-actions">
              <SubmitButton label="Importovať registrácie" pendingLabel="Spracúvam…" />
            </div>
          </form>
        </section>
      )}

      <form className="toolbar" action="/is-sportu">
        <select name="filter" defaultValue={params.filter ?? ""} aria-label="Filtrovať">
          <option value="">Všetci členovia</option>
          <option value="registered">Len registrovaní</option>
          <option value="missing">Len bez registrácie</option>
        </select>
        <button type="submit">Filtrovať</button>
        <Link className="text-link" href="/is-sportu">Zrušiť filtre</Link>
      </form>

      <p className="muted">Zobrazených: {showing.length} z {children.length} členov</p>

      <div className="table-wrap">
        <table className="members">
          <thead>
            <tr>
              <th>#</th><th>Člen</th><th>Družstvo</th><th>Dátum narodenia</th>
              <th>IS šport</th><th>Registrovaný od</th><th>Identifikátor</th>
            </tr>
          </thead>
          <tbody>
            {sortByName(showing).map((child, index) => (
              <tr key={child.id}>
                <td className="muted">{index + 1}</td>
                <td><strong>{child.last_name}</strong> {child.first_name}</td>
                <td><span className={`team team-${child.team}`}>{TEAM_LABELS[child.team]}</span></td>
                <td>{formatDate(child.birth_date)}</td>
                <td className={child.is_sport_registered ? "ok" : "no"}>{child.is_sport_registered ? "✓" : "✕"}</td>
                <td>{formatDate(child.sport_registered_at)}</td>
                <td>{child.sport_identifier || "—"}</td>
              </tr>
            ))}
            {!showing.length && <tr><td className="empty-cell" colSpan={7}>Žiadni členovia.</td></tr>}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
