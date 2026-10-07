import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ConfirmationForm } from "@/components/confirmation-form";
import { Notices } from "@/components/notices";
import { requireAdmin } from "@/lib/data";
import { formatDate, formatMoney, sortByName } from "@/lib/domain";
import { deleteConfirmation } from "./actions";

export default async function ConfirmationsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const params = await searchParams;
  const { repo, role, demo } = await requireAdmin("/clenovia");

  const [children, confirmations, categories, club] = await Promise.all([
    repo.listChildren(),
    repo.listConfirmations(),
    repo.listCategories(),
    repo.clubSettings(),
  ]);

  const childById = new Map(children.map((child) => [child.id, child]));
  const eligible = categories.filter((category) => category.eligible_for_confirmation);
  const settingsIncomplete = !club.ico || !club.statutory_representative;

  return (
    <AppShell active="/potvrdenia" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">SKI CLUB IS</p>
          <h1>Potvrdenia o športovej činnosti</h1>
          <p className="muted">Doklad pre rodičov. Vygeneruje sa v appke a vytlačí cez prehliadač do PDF.</p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      {settingsIncomplete && (
        <p className="notice error" role="alert">
          V <Link className="text-link" href="/nastavenia">Nastaveniach</Link> chýba IČO alebo štatutár — potvrdenie by
          bolo neúplné.
        </p>
      )}

      <ConfirmationForm members={sortByName(children)} expenseTypes={eligible.map((category) => category.name)} />

      <section className="table-section">
        <div className="section-heading">
          <div>
            <h2>Vystavené potvrdenia</h2>
            <p className="muted">{confirmations.length} záznamov</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="members">
            <thead>
              <tr><th>Dieťa</th><th>Režim</th><th>Obdobie</th><th>Druh výdavku</th><th>Suma</th><th>Vytvorené</th><th aria-label="Akcie" /></tr>
            </thead>
            <tbody>
              {confirmations.map((confirmation) => {
                const child = childById.get(confirmation.child_id);
                return (
                  <tr key={confirmation.id}>
                    <td>{child ? `${child.last_name} ${child.first_name}` : "Neznáme dieťa"}</td>
                    <td>{confirmation.mode === "monthly" ? "Mesačné platby" : "Jednorazová platba"}</td>
                    <td>{confirmation.period}</td>
                    <td>{confirmation.expense_type}</td>
                    <td>{formatMoney(confirmation.amount)}</td>
                    <td>{formatDate(confirmation.created_at.slice(0, 10))}</td>
                    <td className="row-actions">
                      <a className="text-link" href={`/potvrdenia/${confirmation.id}`} target="_blank" rel="noreferrer">Otvoriť PDF</a>
                      <form action={deleteConfirmation}>
                        <input type="hidden" name="id" value={confirmation.id} />
                        <button type="submit" className="icon-button" aria-label="Vymazať potvrdenie">✕</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {!confirmations.length && (
                <tr><td className="empty-cell" colSpan={7}>Zatiaľ nebolo vystavené žiadne potvrdenie.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
