import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/data";
import { formatDate, formatMoney, today } from "@/lib/domain";
import { importBankStatement, matchManually } from "./actions";

export const dynamic = "force-dynamic";

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { repo, role, demo } = await requireAdmin("/prehlad");

  const [transactions, payments, children, club] = await Promise.all([
    repo.listBankTransactions(),
    repo.listPayments(),
    repo.listChildren(),
    repo.clubSettings(),
  ]);

  const childByVs = new Map(children.map((child) => [String(child.variable_symbol), child]));
  const openPayments = payments.filter((payment) => !payment.paid);

  const rows = transactions.slice(0, 60).map((transaction) => {
    const child = childByVs.get(transaction.variable_symbol);
    return {
      ...transaction,
      childName: child ? `${child.last_name} ${child.first_name}` : null,
    };
  });

  const unknownVs = rows.filter((row) => !row.childName).length;
  const outstanding = openPayments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <AppShell active="/banka" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">DÁTA</p>
          <h1>Bankové platby</h1>
          <p className="muted">
            Nahraj výpis z účtu{club.iban && ` ${club.iban}`}. Platby spárujeme podľa variabilného symbolu a sumy.
          </p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      <section className="summary-grid" aria-label="Stav párovania">
        <article>
          <span>Načítané pohyby</span>
          <strong>{transactions.length}</strong>
          <small>príjmy z výpisov</small>
        </article>
        <article>
          <span>Neznámy VS</span>
          <strong className={unknownVs ? "overdue-text" : undefined}>{unknownVs}</strong>
          <small>{unknownVs ? "treba priradiť ručne" : "všetky VS sedia"}</small>
        </article>
        <article>
          <span>Stále neuhradené</span>
          <strong>{formatMoney(outstanding)}</strong>
          <small>{openPayments.length} predpísaných platieb</small>
        </article>
      </section>

      <section className="form-card">
        <h2>Import výpisu</h2>
        <p className="muted">
          Podporujeme .xlsx aj .csv export z internetbankingu. Rozpoznáme dátum, sumu, variabilný symbol a
          protistranu. Odchádzajúce platby ignorujeme. Rovnaký pohyb sa nezapočíta dvakrát ani pri opakovanom
          nahratí toho istého súboru.
        </p>
        <form action={importBankStatement}>
          <div className="form-grid">
            <label className="wide">
              Výpis z účtu *
              <input type="file" name="files" accept=".xlsx,.csv,.txt" multiple required />
            </label>
          </div>
          <div className="form-actions">
            <SubmitButton label="Importovať a spárovať" pendingLabel="Párujem platby…" />
          </div>
        </form>
      </section>

      {openPayments.length > 0 && (
        <section className="form-card">
          <h2>Ručné priradenie</h2>
          <p className="muted">Keď platba prišla bez správneho variabilného symbolu, označ ju ručne.</p>
          <form action={matchManually} className="form-grid">
            <label className="wide">
              Neuhradená platba *
              <select name="payment_id" required defaultValue="">
                <option disabled value="">Vyberte platbu</option>
                {openPayments.map((payment) => {
                  const child = children.find((entry) => entry.id === payment.child_id);
                  return (
                    <option key={payment.id} value={payment.id}>
                      {child ? `${child.last_name} ${child.first_name} · VS ${child.variable_symbol}` : "Neznámy člen"}
                      {" · "}{formatMoney(payment.amount)} · splatnosť {payment.due_date}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>Dátum úhrady<input type="date" name="paid_on" defaultValue={today()} /></label>
            <div className="form-actions wide">
              <SubmitButton label="Označiť ako zaplatenú" pendingLabel="Ukladám…" />
            </div>
          </form>
        </section>
      )}

      <section className="table-section">
        <h2>Posledné pohyby</h2>
        <div className="table-wrap">
          <table className="members payments">
            <thead>
              <tr><th>Dátum</th><th>Suma</th><th>VS</th><th>Dieťa</th><th>Protistrana</th><th>Poznámka</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.childName ? undefined : "invalid-row"}>
                  <td>{formatDate(row.booked_on)}</td>
                  <td><strong>{formatMoney(row.amount)}</strong></td>
                  <td>{row.variable_symbol || "—"}</td>
                  <td>{row.childName ?? <span className="muted">neznámy VS</span>}</td>
                  <td>{row.counterparty || "—"}</td>
                  <td className="note-cell">{row.note || "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td className="empty-cell" colSpan={6}>Zatiaľ nebol nahratý žiadny výpis.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {transactions.length > rows.length && (
          <p className="muted">Zobrazených posledných {rows.length} z {transactions.length} pohybov.</p>
        )}
      </section>
    </AppShell>
  );
}
