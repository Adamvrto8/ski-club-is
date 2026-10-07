import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireAdmin } from "@/lib/data";
import { formatDateDotted, formatMoney } from "@/lib/domain";

/**
 * Tlačová podoba potvrdenia — presne podľa reálnej predlohy klubu (nie vlastný návrh):
 * rodné číslo a adresa dieťaťa sa na dokument, ktorý ide mimo klubu, netlačia,
 * mesačný režim má rozpis súm po mesiacoch, žiadateľom je jeden konkrétny
 * zákonný zástupca, nie oba mená spojené.
 */
export default async function ConfirmationPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo } = await requireAdmin("/potvrdenia");

  const [confirmations, club] = await Promise.all([repo.listConfirmations(), repo.clubSettings()]);
  const confirmation = confirmations.find((item) => item.id === id);
  if (!confirmation) notFound();

  const child = await repo.getChild(confirmation.child_id);
  if (!child) notFound();

  const monthly = confirmation.mode === "monthly" && (confirmation.monthly_breakdown?.length ?? 0) > 0;
  const contactLine = [club.address, club.ico && `IČO: ${club.ico}`, club.phone && `tel: ${club.phone}`].filter(Boolean).join(", ");
  // „Športový klub X, občianske združenie“ → „patrí Občianskemu združeniu Športový klub X“, ako v predlohe.
  const ownerDative = club.official_name.replace(/^(.+?),\s*občianske združenie$/i, "Občianskemu združeniu $1");
  // Štatutár je v nastaveniach „Meno, funkcia“ — v predlohe je meno pod čiarou a funkcia pod ním.
  const signatureSplit = club.statutory_representative.lastIndexOf(",");
  const signerName = signatureSplit > 0 ? club.statutory_representative.slice(0, signatureSplit).trim() : club.statutory_representative;
  const signerRole = signatureSplit > 0 ? club.statutory_representative.slice(signatureSplit + 1).trim() : "";

  const amountRow = (
    <tr><th>{monthly ? "Suma uhradených výdavkov spolu:" : "Suma uhradených výdavkov:"}</th><td>{formatMoney(confirmation.amount)}</td></tr>
  );

  return (
    <main className="print-page confirmation">
      {/*
        Bez okraja strany prehliadač netlačí svoju hlavičku a pätu (dátum, názov stránky, URL,
        číslo strany) — na úradnom potvrdení nemajú čo robiť. Okraj nahrádza padding.
        Len pre túto stránku, zoznamy na viac strán si okraj strany nechávajú.
      */}
      <style>{"@media print { @page { margin: 0; } .print-page.confirmation { padding: 20mm 22mm; } }"}</style>
      <PrintButton />

      <header className="confirmation-header">
        <h1>{club.official_name}</h1>
        {contactLine && <p>{contactLine}</p>}
      </header>

      <h2 className="confirmation-title">Potvrdenie o úhrade oprávnených výdavkoch na športovú činnosť dieťaťa</h2>

      {/* Poradie riadkov je podľa predlohy klubu — pri jednorazovej platbe je suma hneď za druhom výdavkov. */}
      <table className={`confirmation-fields${monthly ? "" : " roomy"}`}>
        <tbody>
          <tr><th>Meno a priezvisko dieťaťa:</th><td>{child.first_name} {child.last_name}</td></tr>
          <tr><th>Obdobie na ktoré boli uhradené oprávnené výdavky:</th><td>{confirmation.period}</td></tr>
          <tr><th>Druh oprávnených výdavkov:</th><td>{confirmation.expense_type}</td></tr>
          {!monthly && amountRow}
          <tr><th>Príslušnosť dieťaťa ku klubu od:</th><td>{formatDateDotted(child.membership_date)}</td></tr>
          <tr><th>Doklad sa vystavuje na žiadosť zákonného zástupcu dieťaťa:</th><td>{confirmation.requested_by}</td></tr>
          {monthly && amountRow}
        </tbody>
      </table>

      {monthly && (
        <table className="confirmation-months">
          <thead>
            <tr><th>Uhradené prostriedky za obdobie</th><th>€</th></tr>
          </thead>
          <tbody>
            {confirmation.monthly_breakdown!.map((row) => (
              <tr key={row.month}><td>{row.month}</td><td>{formatAmount(row.amount)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>Suma uhradených výdavkov:</td><td>{formatAmount(confirmation.amount)}</td></tr>
          </tfoot>
        </table>
      )}

      {club.registry_note && <p className="confirmation-note">{club.registry_note}</p>}

      {club.iban && (
        <p className="confirmation-note">
          Účet {club.iban}
          {club.account_holder_name && ` s názvom ${club.account_holder_name}`}, na ktorý bola platba uhradená, patrí {ownerDative}.
        </p>
      )}

      <footer className="confirmation-footer">
        <p>V Demo City dňa: {formatDateDotted(confirmation.created_at)}</p>
        <div className="confirmation-signature">
          <p>Potvrdenie vystavil:</p>
          <div>
            <span className="signature-line" />
            <p>{signerName}</p>
            {signerRole && <p>{signerRole}</p>}
          </div>
        </div>
      </footer>
    </main>
  );
}

/** Sumy v mesačnej tabuľke bez „€“ — mena je v hlavičke stĺpca. Celé eurá bez desatín, ako v predlohe. */
function formatAmount(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(".", ",");
}
