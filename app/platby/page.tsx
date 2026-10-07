import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { PaymentsBoard } from "@/components/payments-board";
import { PrescriptionForm } from "@/components/prescription-form";
import { getSession } from "@/lib/data";
import { formatMoney, sortByName } from "@/lib/domain";
import { buildPaymentRows } from "@/lib/payment-rows";

type Query = { q?: string; team?: string; status?: string; category?: string; success?: string; error?: string };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const { repo, role, demo } = await getSession();

  const [children, payments, categories, season] = await Promise.all([
    repo.listChildren(),
    repo.listPayments(),
    repo.listCategories(),
    repo.currentSeason(),
  ]);

  const rows = buildPaymentRows(payments, children, categories, params);

  const outstanding = rows.filter((row) => !row.paid).reduce((sum, row) => sum + row.amount, 0);
  const overdueCount = rows.filter((row) => row.status === "overdue").length;
  const paidCount = rows.filter((row) => row.paid).length;

  const exportQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "success" && key !== "error") exportQuery.set(key, value);
  }

  return (
    <AppShell active="/platby" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">SKI CLUB IS · {season.name.toUpperCase()}</p>
          <h1>Platby</h1>
        </div>
        {role === "admin" && (
          <div className="header-actions">
            <Link className="secondary-link" href="/upomienky">Upomienky</Link>
            <Link className="secondary-link" href="/nastavenia">Kategórie platieb</Link>
          </div>
        )}
      </header>

      <Notices success={params.success} error={params.error} />

      <section className="summary-grid" aria-label="Súhrn platieb">
        <article>
          <span>Zaplatené</span>
          <strong>{paidCount}</strong>
          <small>z {rows.length} zobrazených platieb</small>
        </article>
        <article>
          <span>Po splatnosti</span>
          <strong className={overdueCount ? "overdue-text" : undefined}>{overdueCount}</strong>
          <small>{overdueCount ? "vyžaduje kontrolu" : "všetko v termíne"}</small>
        </article>
        <article>
          <span>Neuhradené spolu</span>
          <strong>{formatMoney(outstanding)}</strong>
          <small>vrátane platieb po splatnosti</small>
        </article>
      </section>

      {role === "admin" && (
        <PrescriptionForm categories={categories} members={sortByName(children.filter((child) => child.active))} />
      )}

      <form className="toolbar" action="/platby">
        <input name="q" defaultValue={params.q} placeholder="Hľadať podľa mena alebo VS" aria-label="Hľadať platby" />
        <select name="status" defaultValue={params.status ?? ""} aria-label="Filtrovať podľa stavu">
          <option value="">Všetky stavy</option>
          <option value="paid">Zaplatené</option>
          <option value="unpaid">Nezaplatené</option>
          <option value="overdue">Po splatnosti</option>
        </select>
        <select name="category" defaultValue={params.category ?? ""} aria-label="Filtrovať podľa kategórie">
          <option value="">Všetky kategórie</option>
          {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
        </select>
        <button type="submit">Filtrovať</button>
        <Link className="text-link" href="/platby">Zrušiť filtre</Link>
      </form>

      <div className="list-actions">
        <p className="muted">Zobrazených: {rows.length} z {payments.length} platieb</p>
        <span className="inline-links">
          <a className="text-link" href={`/export/platby?${exportQuery}`}>Exportovať CSV</a>
          <a className="text-link" href={`/platby/tlac?${exportQuery}`} target="_blank" rel="noreferrer">Zoznam pre rodičov (PDF)</a>
        </span>
      </div>

      <PaymentsBoard rows={rows} canEdit={role === "admin"} />
    </AppShell>
  );
}
