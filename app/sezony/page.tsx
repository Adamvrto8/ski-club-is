import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { getSession } from "@/lib/data";
import { formatDate, formatMoney, paymentStatus } from "@/lib/domain";
import { saveSeason, switchSeason } from "./actions";

export const dynamic = "force-dynamic";

export default async function SeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { repo, role, demo } = await getSession();

  const [seasons, payments, attendance, loans, events, children] = await Promise.all([
    repo.listSeasons(),
    repo.listPayments(),
    repo.listAttendance(),
    repo.listLoans(),
    repo.listEvents(),
    repo.listChildren(),
  ]);

  const stats = seasons.map((season) => {
    const seasonPayments = payments.filter((payment) => payment.season_id === season.id);
    return {
      season,
      payments: seasonPayments.length,
      collected: seasonPayments.filter((p) => p.paid).reduce((sum, p) => sum + p.amount, 0),
      outstanding: seasonPayments
        .filter((p) => paymentStatus(p.paid, p.due_date).style !== "paid")
        .reduce((sum, p) => sum + p.amount, 0),
      attendance: attendance.filter((entry) => entry.season_id === season.id).length,
      loans: loans.filter((loan) => loan.season_id === season.id).length,
      events: events.filter((event) => event.season_id === season.id).length,
    };
  });

  const nextYear = new Date().getMonth() >= 7 ? new Date().getFullYear() + 1 : new Date().getFullYear();

  return (
    <AppShell active="/sezony" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">KLUB</p>
          <h1>Sezóny a archív</h1>
          <p className="muted">
            Členovia a inventár prechádzajú medzi sezónami. Platby, dochádzka, výpožičky a akcie zostávajú viazané
            na sezónu, v ktorej vznikli, takže staršie sezóny ostávajú prezerateľné.
          </p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      <div className="table-wrap">
        <table className="members">
          <thead>
            <tr>
              <th>Sezóna</th><th>Obdobie</th><th>Platby</th><th>Vybrané</th>
              <th>Neuhradené</th><th>Dochádzka</th><th>Výpožičky</th><th>Akcie</th><th aria-label="Akcie" />
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.season.id} className={row.season.is_current ? undefined : "inactive-row"}>
                <td>
                  <strong>{row.season.name}</strong>
                  {row.season.is_current && <span className="chip">aktuálna</span>}
                </td>
                <td>{formatDate(row.season.starts_on)} – {formatDate(row.season.ends_on)}</td>
                <td>{row.payments}</td>
                <td>{formatMoney(row.collected)}</td>
                <td className={row.outstanding ? "overdue-text" : undefined}>{formatMoney(row.outstanding)}</td>
                <td>{row.attendance}</td>
                <td>{row.loans}</td>
                <td>{row.events}</td>
                <td>
                  {role === "admin" && !row.season.is_current && (
                    <form action={switchSeason}>
                      <input type="hidden" name="id" value={row.season.id} />
                      <button type="submit" className="secondary">Nastaviť ako aktuálnu</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {!seasons.length && <tr><td className="empty-cell" colSpan={9}>Zatiaľ žiadna sezóna.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="muted">Evidovaných členov spolu: {children.length} — tí zostávajú vo všetkých sezónach.</p>

      {role === "admin" && (
        <section className="form-card">
          <h2>Nová sezóna</h2>
          <p className="muted">
            Po založení ju nastav ako aktuálnu. Deti, ktoré už nechodia, označ ako neaktívne v zozname členov —
            zostanú v archíve aj s históriou.
          </p>
          <form action={saveSeason} className="form-grid">
            <label>Názov *<input name="name" required defaultValue={`Sezóna ${nextYear}/${nextYear + 1}`} /></label>
            <label>Začiatok *<input type="date" name="starts_on" required defaultValue={`${nextYear}-09-01`} /></label>
            <label>Koniec *<input type="date" name="ends_on" required defaultValue={`${nextYear + 1}-08-31`} /></label>
            <div className="form-actions wide">
              <SubmitButton label="Vytvoriť sezónu" pendingLabel="Vytváram…" />
            </div>
          </form>
        </section>
      )}
    </AppShell>
  );
}
