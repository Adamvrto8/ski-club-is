import { getSession } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/domain";
import { buildPaymentRows, type PaymentQuery } from "@/lib/payment-rows";
import { PrintButton } from "@/components/print-button";

/**
 * Zoznam pre rodičov — zámerne len 4 stĺpce (meno, VS, suma, splatnosť),
 * bez IBAN-u a bez názvu kategórie. Tlačí sa cez prehliadač do PDF.
 */
export default async function PaymentPrintPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const params = await searchParams;
  const { repo } = await getSession();

  const [children, payments, categories, season, club] = await Promise.all([
    repo.listChildren(),
    repo.listPayments(),
    repo.listCategories(),
    repo.currentSeason(),
    repo.clubSettings(),
  ]);

  const rows = buildPaymentRows(payments, children, categories, params).filter((row) => !row.paid);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <main className="print-page">
      <PrintButton />
      <header className="print-header">
        <h1>{club.official_name}</h1>
        <p>Predpis platieb · {season.name}</p>
      </header>

      <table className="print-table">
        <thead>
          <tr><th>Meno</th><th>VS</th><th>Suma</th><th>Splatnosť</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.childName}</td>
              <td>{row.variableSymbol}</td>
              <td>{formatMoney(row.amount)}</td>
              <td>{formatDate(row.dueDate)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={4}>Žiadne neuhradené platby.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr><td colSpan={2}>Spolu ({rows.length} platieb)</td><td colSpan={2}>{formatMoney(total)}</td></tr>
          </tfoot>
        )}
      </table>
    </main>
  );
}
