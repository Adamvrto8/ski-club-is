import { AppShell } from "@/components/app-shell";
import { DonationsBoard } from "@/components/donations-board";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/data";
import { formatMoney, sortByName } from "@/lib/domain";
import { importDonations } from "./actions";

export const dynamic = "force-dynamic";

export default async function TaxDonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { repo, role, demo } = await requireAdmin("/prehlad");

  const [donations, children] = await Promise.all([repo.listDonations(), repo.listChildren()]);
  const childById = new Map(children.map((child) => [child.id, child]));

  const total = donations.reduce((sum, donation) => sum + donation.amount, 0);
  const assigned = donations.filter((donation) => donation.child_id);
  const assignedTotal = assigned.reduce((sum, donation) => sum + donation.amount, 0);

  // Súčet na dieťa; pri predpise sa odpočíta polovica.
  const perChild = new Map<string, number>();
  for (const donation of assigned) {
    perChild.set(donation.child_id!, (perChild.get(donation.child_id!) ?? 0) + donation.amount);
  }

  const summary = [...perChild.entries()]
    .map(([childId, amount]) => {
      const child = childById.get(childId);
      return {
        childId,
        name: child ? `${child.last_name} ${child.first_name}` : "Neznáme dieťa",
        amount,
        discount: Math.round(amount * 50) / 100,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return (
    <AppShell active="/dve-percenta" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">DÁTA</p>
          <h1>2 % dane</h1>
          <p className="muted">
            Z členského príspevku sa dieťaťu odpočíta <strong>50 % z priradenej sumy</strong>. Odpočet zapneš pri
            vytváraní predpisu platieb.
          </p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      <section className="summary-grid" aria-label="Súhrn darov">
        <article><span>Darované spolu</span><strong>{formatMoney(total)}</strong><small>{donations.length} darov</small></article>
        <article>
          <span>Priradené deťom</span>
          <strong>{formatMoney(assignedTotal)}</strong>
          <small>{summary.length} detí</small>
        </article>
        <article>
          <span>Zľava na členskom</span>
          <strong>{formatMoney(Math.round(assignedTotal * 50) / 100)}</strong>
          <small>50 % z priradených darov</small>
        </article>
      </section>

      <section className="form-card">
        <h2>Import darov z Google Forms</h2>
        <p className="muted">
          Rozpoznáme stĺpce s menom dieťaťa a darovanou sumou, prípadne meno darcu. Jedno dieťa môže mať viac darov —
          spočítajú sa. Mená, ktoré sa nepodarí spárovať, priradíš ručne nižšie.
        </p>
        <form action={importDonations}>
          <div className="form-grid">
            <label className="wide">
              Súbor s darmi *
              <input type="file" name="files" accept=".xlsx,.csv,.txt" multiple required />
            </label>
          </div>
          <div className="form-actions">
            <SubmitButton label="Importovať dary" pendingLabel="Importujem…" />
          </div>
        </form>
      </section>

      {summary.length > 0 && (
        <section className="table-section">
          <h2>Súčet na dieťa</h2>
          <div className="table-wrap">
            <table className="members">
              <thead>
                <tr><th>Dieťa</th><th>Darované spolu</th><th>Zľava na členskom (50 %)</th></tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.childId}>
                    <td><strong>{row.name}</strong></td>
                    <td>{formatMoney(row.amount)}</td>
                    <td className="ok">−{formatMoney(row.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <DonationsBoard
        rows={donations.map((donation) => ({
          id: donation.id,
          childId: donation.child_id,
          childName: donation.child_id ? (childById.get(donation.child_id)
            ? `${childById.get(donation.child_id)!.last_name} ${childById.get(donation.child_id)!.first_name}`
            : "Neznáme dieťa") : null,
          donorName: donation.donor_name,
          amount: donation.amount,
          note: donation.note,
        }))}
        members={sortByName(children).map((child) => ({
          id: child.id,
          label: `${child.last_name} ${child.first_name} · VS ${child.variable_symbol}`,
        }))}
      />
    </AppShell>
  );
}
