import { AppShell } from "@/components/app-shell";
import { RemindersBoard } from "@/components/reminders-board";
import { requireAdmin } from "@/lib/data";
import { buildPaymentRows } from "@/lib/payment-rows";

type Query = { status?: string };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const { repo, role, demo } = await requireAdmin("/clenovia");

  const [children, payments, categories, contacts, club] = await Promise.all([
    repo.listChildren(),
    repo.listPayments(),
    repo.listCategories(),
    repo.listContacts(),
    repo.clubSettings(),
  ]);

  const status = params.status === "overdue" ? "overdue" : params.status === "unpaid" ? "unpaid" : "";
  const contactByChild = new Map(contacts.map((contact) => [contact.child_id, contact]));

  const rows = buildPaymentRows(payments, children, categories, { status })
    .filter((row) => !row.paid)
    .map((row) => ({
      id: row.id,
      childName: row.childName,
      variableSymbol: row.variableSymbol,
      category: row.category,
      period: row.period,
      amount: row.amount,
      dueDate: row.dueDate,
      overdue: row.status === "overdue",
      contact: [
        contactByChild.get(row.childId)?.father_phone ?? contactByChild.get(row.childId)?.mother_phone,
        contactByChild.get(row.childId)?.emails[0],
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  return (
    <AppShell active="/upomienky" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">DÁTA</p>
          <h1>Upomienky</h1>
          <p className="muted">
            Appka správy neodosiela. Označ rodičov, skopíruj text a pošli ho cez Viber alebo e-mail.
          </p>
        </div>
      </header>

      <form className="toolbar" action="/upomienky">
        <select name="status" defaultValue={status} aria-label="Filtrovať podľa stavu">
          <option value="">Všetky neuhradené</option>
          <option value="overdue">Len po splatnosti</option>
          <option value="unpaid">Len v termíne</option>
        </select>
        <button type="submit">Filtrovať</button>
      </form>

      <RemindersBoard rows={rows} iban={club.iban} />
    </AppShell>
  );
}
