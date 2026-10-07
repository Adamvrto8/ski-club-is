import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MemberForm } from "@/components/member-form";
import { Notices } from "@/components/notices";
import { getSession } from "@/lib/data";
import { formatDate, formatMoney, paymentStatus } from "@/lib/domain";
import { equipmentExtra } from "@/lib/equipment";
import { updateMember } from "../actions";

export default async function EditMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { repo, role, demo } = await getSession();

  const child = await repo.getChild(id);
  if (!child) notFound();

  const [contacts, payments, categories, loans, equipment] = await Promise.all([
    repo.listContacts(),
    repo.listPayments(),
    repo.listCategories(),
    repo.listLoans(),
    repo.listEquipment(),
  ]);

  const contact = contacts.find((item) => item.child_id === child.id);
  const childPayments = payments
    .filter((payment) => payment.child_id === child.id)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));
  const categoryName = (categoryId: string) => categories.find((item) => item.id === categoryId)?.name ?? "—";
  const outstanding = childPayments.filter((p) => !p.paid).reduce((sum, p) => sum + p.amount, 0);

  // Len to, čo má dieťa požičané práve teraz — vrátené kusy sem nepatria.
  const openLoans = loans
    .filter((loan) => loan.child_id === child.id && !loan.returned)
    .map((loan) => ({ loan, item: equipment.find((piece) => piece.id === loan.equipment_id) }))
    .sort((a, b) => a.loan.borrowed_on.localeCompare(b.loan.borrowed_on));

  return (
    <AppShell active="/clenovia" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ČLENOVIA · VS {child.variable_symbol}</p>
          <h1>{child.last_name} {child.first_name}</h1>
          <p className="muted">
            V klube od {formatDate(child.membership_date)}
            {outstanding > 0 && <> · neuhradené: <strong className="overdue-text">{formatMoney(outstanding)}</strong></>}
          </p>
        </div>
        <Link className="text-link" href="/clenovia">← Späť na členov</Link>
      </header>

      <Notices error={error} />

      {role === "admin" ? (
        <MemberForm
          action={updateMember}
          submitLabel="Uložiť zmeny"
          cancelHref="/clenovia"
          values={{
            ...child,
            father_name: contact?.father_name,
            father_phone: contact?.father_phone,
            mother_name: contact?.mother_name,
            mother_phone: contact?.mother_phone,
            emails: contact?.emails,
            contact_address: contact?.address,
          }}
        />
      ) : (
        <p className="notice">Ako tréner máš prístup len na čítanie.</p>
      )}

      <section className="table-section">
        <div className="section-heading">
          <div>
            <h2>Požičaná výstroj</h2>
            <p className="muted">
              {openLoans.length
                ? `Práve má požičané: ${openLoans.length}`
                : "Momentálne nemá nič požičané."}
            </p>
          </div>
          {role === "admin" && <Link className="text-link" href="/pozicovna">Spravovať požičovňu</Link>}
        </div>
        {openLoans.length > 0 && (
          <div className="table-wrap">
            <table className="members">
              <thead>
                <tr><th>Kus</th><th>Inventárne číslo</th><th>Veľkosť</th><th>Požičané</th><th>Cena/sezóna</th></tr>
              </thead>
              <tbody>
                {openLoans.map(({ loan, item }) => {
                  const extra = item ? equipmentExtra(item) : "";
                  return (
                    <tr key={loan.id}>
                      <td>
                        {item?.name ?? "Neznámy kus"}
                        {extra && <small className="muted"> · {extra}</small>}
                      </td>
                      <td>{item?.inventory_code ?? "—"}</td>
                      <td>{item?.size || "—"}</td>
                      <td>{formatDate(loan.borrowed_on)}</td>
                      <td>{formatMoney(loan.price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="table-section">
        <div className="section-heading">
          <div>
            <h2>Platby člena</h2>
            <p className="muted">{childPayments.length} záznamov v aktuálnej sezóne</p>
          </div>
          {role === "admin" && <Link className="text-link" href={`/platby?q=${child.variable_symbol}`}>Spravovať platby</Link>}
        </div>
        <div className="table-wrap">
          <table className="members payments">
            <thead>
              <tr><th>Kategória</th><th>Obdobie</th><th>Suma</th><th>Splatnosť</th><th>Stav</th></tr>
            </thead>
            <tbody>
              {childPayments.map((payment) => {
                const status = paymentStatus(payment.paid, payment.due_date);
                return (
                  <tr key={payment.id}>
                    <td>{categoryName(payment.category_id)}</td>
                    <td>{payment.period || "—"}</td>
                    <td>{formatMoney(payment.amount)}</td>
                    <td>{formatDate(payment.due_date)}</td>
                    <td><span className={`payment-status ${status.style}`}>{status.label}</span></td>
                  </tr>
                );
              })}
              {!childPayments.length && <tr><td className="empty-cell" colSpan={5}>Zatiaľ žiadne platby.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
