import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EventParticipants } from "@/components/event-participants";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { getSession } from "@/lib/data";
import { formatDate, formatMoney, sortByName } from "@/lib/domain";
import { deleteEvent, importParticipants, saveEvent } from "../actions";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { repo, role, demo } = await getSession();

  const [events, participants, children] = await Promise.all([
    repo.listEvents(),
    repo.listParticipants(),
    repo.listChildren(),
  ]);

  const event = events.find((entry) => entry.id === id);
  if (!event) notFound();

  const rows = participants.filter((entry) => entry.event_id === id);
  const childrenCount = rows.reduce((sum, row) => sum + row.children_count, 0);
  const adultsCount = rows.reduce((sum, row) => sum + row.adults_count, 0);
  const deposits = rows.reduce((sum, row) => sum + row.deposit, 0);
  const depositsPaid = rows.filter((row) => row.deposit_paid).reduce((sum, row) => sum + row.deposit, 0);
  const balances = rows.reduce((sum, row) => sum + row.balance, 0);
  const balancesPaid = rows.filter((row) => row.balance_paid).reduce((sum, row) => sum + row.balance, 0);
  const outstanding = deposits - depositsPaid + (balances - balancesPaid);

  return (
    <AppShell active="/akcie" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">AKCIA · VS {event.variable_symbol || "—"}</p>
          <h1>{event.name}</h1>
          <p className="muted">
            {formatDate(event.starts_on)} – {formatDate(event.ends_on)}
            {event.place && ` · ${event.place}`}
            {event.event_type && ` · ${event.event_type}`}
          </p>
        </div>
        <Link className="text-link" href="/akcie">← Späť na akcie</Link>
      </header>

      <Notices success={query.success} error={query.error} />

      <section className="summary-grid" aria-label="Súhrn akcie">
        <article>
          <span>Prihlásených osôb</span>
          <strong>{childrenCount + adultsCount}</strong>
          <small>{childrenCount} detí · {adultsCount} dospelých · {rows.length} rodín</small>
        </article>
        <article>
          <span>Zálohy</span>
          <strong>{formatMoney(depositsPaid)}</strong>
          <small>z {formatMoney(deposits)} predpísaných</small>
        </article>
        <article>
          <span>Neuhradené spolu</span>
          <strong className={outstanding ? "overdue-text" : undefined}>{formatMoney(outstanding)}</strong>
          <small>zálohy aj doplatky</small>
        </article>
      </section>

      <EventParticipants
        eventId={event.id}
        rows={rows.map((row) => ({
          id: row.id,
          familyName: row.family_name,
          childId: row.child_id,
          childrenCount: row.children_count,
          adultsCount: row.adults_count,
          deposit: row.deposit,
          depositPaid: row.deposit_paid,
          balance: row.balance,
          balancePaid: row.balance_paid,
          note: row.note,
        }))}
        members={sortByName(children.filter((child) => child.active)).map((child) => ({
          id: child.id,
          label: `${child.last_name} ${child.first_name} · VS ${child.variable_symbol}`,
          team: child.team,
        }))}
        canEdit={role === "admin"}
      />

      {role === "admin" && (
        <>
          <section className="form-card">
            <h2>Import prihlášok z Google Forms</h2>
            <p className="muted">
              Exportuj odpovede ako .xlsx alebo .csv. Rozpoznáme stĺpce meno rodiny, mená detí, mená dospelých a
              poznámku. Počty osôb spočítame z mien. Rodina, ktorá už v akcii je, sa preskočí.
            </p>
            <form action={importParticipants}>
              <input type="hidden" name="event_id" value={event.id} />
              <div className="form-grid">
                <label className="wide">
                  Súbor s prihláškami *
                  <input type="file" name="files" accept=".xlsx,.csv,.txt" multiple required />
                </label>
              </div>
              <div className="form-actions">
                <SubmitButton label="Importovať prihlášky" pendingLabel="Importujem…" />
              </div>
            </form>
          </section>

          <section className="form-card">
            <h2>Upraviť akciu</h2>
            <form action={saveEvent} className="form-grid">
              <input type="hidden" name="id" value={event.id} />
              <label>Názov *<input name="name" required defaultValue={event.name} /></label>
              <label>Miesto<input name="place" defaultValue={event.place} /></label>
              <label>Dátum od *<input type="date" name="starts_on" required defaultValue={event.starts_on} /></label>
              <label>Dátum do *<input type="date" name="ends_on" required defaultValue={event.ends_on} /></label>
              <label>Typ<input name="event_type" defaultValue={event.event_type} /></label>
              <label>Variabilný symbol<input name="variable_symbol" defaultValue={event.variable_symbol} /></label>
              <label className="wide">Poznámka<input name="note" defaultValue={event.note} /></label>
              <div className="form-actions wide">
                <SubmitButton label="Uložiť zmeny" pendingLabel="Ukladám…" />
              </div>
            </form>

            <form action={deleteEvent} className="danger-zone">
              <input type="hidden" name="id" value={event.id} />
              <button type="submit" className="danger-button">Vymazať akciu aj s účastníkmi</button>
            </form>
          </section>
        </>
      )}
    </AppShell>
  );
}
