import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { getSession } from "@/lib/data";
import { formatDate, formatMoney, today } from "@/lib/domain";
import { saveEvent } from "./actions";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { repo, role, demo } = await getSession();

  const [events, participants, season] = await Promise.all([
    repo.listEvents(),
    repo.listParticipants(),
    repo.currentSeason(),
  ]);

  const stats = events.map((event) => {
    const rows = participants.filter((entry) => entry.event_id === event.id);
    const children = rows.reduce((sum, row) => sum + row.children_count, 0);
    const adults = rows.reduce((sum, row) => sum + row.adults_count, 0);
    const outstanding = rows.reduce(
      (sum, row) => sum + (row.deposit_paid ? 0 : row.deposit) + (row.balance_paid ? 0 : row.balance),
      0,
    );
    return { event, families: rows.length, children, adults, outstanding };
  });

  return (
    <AppShell active="/akcie" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">KLUB · {season.name.toUpperCase()}</p>
          <h1>Sústredenia a akcie</h1>
          <p className="muted">Každá akcia má vlastný variabilný symbol, zálohy a doplatky.</p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      <div className="table-wrap">
        <table className="members">
          <thead>
            <tr>
              <th>Akcia</th><th>Termín</th><th>Miesto</th><th>VS</th>
              <th>Rodiny</th><th>Deti</th><th>Dospelí</th><th>Spolu osôb</th><th>Neuhradené</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(({ event, families, children, adults, outstanding }) => (
              <tr key={event.id}>
                <td>
                  <Link className="text-link" href={`/akcie/${event.id}`}>{event.name}</Link>
                  {event.event_type && <small className="muted"> · {event.event_type}</small>}
                </td>
                <td>{formatDate(event.starts_on)} – {formatDate(event.ends_on)}</td>
                <td>{event.place || "—"}</td>
                <td>{event.variable_symbol || "—"}</td>
                <td>{families}</td>
                <td>{children}</td>
                <td>{adults}</td>
                <td><strong>{children + adults}</strong></td>
                <td className={outstanding ? "overdue-text" : undefined}>{formatMoney(outstanding)}</td>
              </tr>
            ))}
            {!events.length && (
              <tr><td className="empty-cell" colSpan={9}>Zatiaľ žiadna akcia. Vytvor prvú nižšie.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {role === "admin" && (
        <section className="form-card">
          <h2>Nová akcia</h2>
          <form action={saveEvent} className="form-grid">
            <label>Názov *<input name="name" required placeholder="napr. Jesenné sústredenie Jasná" /></label>
            <label>Miesto<input name="place" placeholder="napr. Jasná" /></label>
            <label>Dátum od *<input type="date" name="starts_on" required defaultValue={today()} /></label>
            <label>Dátum do *<input type="date" name="ends_on" required defaultValue={today()} /></label>
            <label>Typ<input name="event_type" placeholder="napr. sústredenie, preteky" /></label>
            <label>
              Variabilný symbol <span className="field-help">Prázdne = doplní sa automaticky</span>
              <input name="variable_symbol" placeholder="napr. 2026001" />
            </label>
            <label className="wide">Poznámka<input name="note" /></label>
            <div className="form-actions wide">
              <SubmitButton label="Vytvoriť akciu" pendingLabel="Vytváram…" />
            </div>
          </form>
        </section>
      )}
    </AppShell>
  );
}
