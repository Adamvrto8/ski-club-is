import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/data";
import { TEAM_LABELS, formatDate, formatMoney, paymentStatus, type Team } from "@/lib/domain";

// Prehľad číta živé počty; bez tohto by ho Next vo vývojovom náhľade predgeneroval staticky.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { repo, role, demo } = await getSession();

  const [children, payments, categories, season] = await Promise.all([
    repo.listChildren(),
    repo.listPayments(),
    repo.listCategories(),
    repo.currentSeason(),
  ]);

  const active = children.filter((child) => child.active);
  const registered = active.filter((child) => child.is_sport_registered).length;
  const unpaid = payments.filter((payment) => !payment.paid);
  const overdue = unpaid.filter((payment) => paymentStatus(payment.paid, payment.due_date).style === "overdue");
  const outstanding = unpaid.reduce((sum, payment) => sum + payment.amount, 0);

  const byTeam = (Object.keys(TEAM_LABELS) as Team[]).map((team) => ({
    team,
    count: active.filter((child) => child.team === team).length,
  }));

  const childById = new Map(children.map((child) => [child.id, child]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const upcoming = [...overdue]
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 8);

  const empty = !children.length;

  return (
    <AppShell active="/prehlad" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">SKI CLUB IS · {season.name.toUpperCase()}</p>
          <h1>Prehľad</h1>
        </div>
        {role === "admin" && (
          <div className="header-actions">
            <Link className="secondary-link" href="/import">Import z Excelu</Link>
            <Link className="button-link" href="/clenovia/novy">+ Nový člen</Link>
          </div>
        )}
      </header>

      {empty ? (
        <section className="empty-panel">
          <h2>Systém je pripravený na tvoje dáta</h2>
          <p>
            Začni importom členov z Excelu — appka rozpozná stĺpce, ukáže náhľad a až potom uloží. Potom si vytvor
            kategórie platieb a môžeš predpisovať platby.
          </p>
          <Link className="button-link" href="/import">Spustiť import</Link>
        </section>
      ) : (
        <>
          <section className="summary-grid" aria-label="Kľúčové čísla">
            <article>
              <span>Aktívni členovia</span>
              <strong>{active.length}</strong>
              <small>v archíve {children.length - active.length}</small>
            </article>
            <article>
              <span>Neuhradené platby</span>
              <strong className={outstanding ? "overdue-text" : undefined}>{formatMoney(outstanding)}</strong>
              <small>{unpaid.length} platieb, z toho {overdue.length} po splatnosti</small>
            </article>
            <article>
              <span>Registrovaní v IS športu</span>
              <strong>{registered}</strong>
              <small>chýba {active.length - registered} detí</small>
            </article>
          </section>

          <section className="panel-grid">
            <article className="form-card">
              <h2>Družstvá</h2>
              <ul className="stat-list">
                {byTeam.map(({ team, count }) => (
                  <li key={team}>
                    <span className={`team team-${team}`}>{TEAM_LABELS[team]}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
              <Link className="text-link" href="/clenovia">Otvoriť členov →</Link>
            </article>

            <article className="form-card">
              <h2>Po splatnosti</h2>
              {upcoming.length ? (
                <>
                  <ul className="stat-list">
                    {upcoming.map((payment) => {
                      const child = childById.get(payment.child_id);
                      return (
                        <li key={payment.id}>
                          <span>
                            {child ? `${child.last_name} ${child.first_name}` : "Neznámy člen"}
                            <small className="muted"> · {categoryById.get(payment.category_id)?.name ?? "—"} · {formatDate(payment.due_date)}</small>
                          </span>
                          <strong className="overdue-text">{formatMoney(payment.amount)}</strong>
                        </li>
                      );
                    })}
                  </ul>
                  {role === "admin" && <Link className="text-link" href="/upomienky">Pripraviť upomienky →</Link>}
                </>
              ) : (
                <p className="muted">Žiadna platba nie je po splatnosti.</p>
              )}
            </article>
          </section>
        </>
      )}
    </AppShell>
  );
}
