import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { requireAdmin } from "@/lib/data";
import { sortByName } from "@/lib/domain";
import { saveContact } from "../actions";

export default async function EditContactPage({ searchParams }: { searchParams: Promise<{ child?: string; error?: string }> }) {
  const params = await searchParams;
  const { repo, role, demo } = await requireAdmin("/kontakty");

  const [children, contacts] = await Promise.all([repo.listChildren(), repo.listContacts()]);
  const selected = params.child ?? "";
  const contact = contacts.find((item) => item.child_id === selected);

  return (
    <AppShell active="/kontakty" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ČLENOVIA A RODIČIA</p>
          <h1>Kontakt člena</h1>
        </div>
        <Link className="text-link" href="/kontakty">← Späť na kontakty</Link>
      </header>

      <Notices error={params.error} />

      {!children.length ? (
        <section className="form-card">
          <h2>Najprv potrebujeme člena</h2>
          <p className="muted">Kontakt musí byť naviazaný na existujúce dieťa.</p>
          <Link className="button-link" href="/clenovia/novy">Pridať člena</Link>
        </section>
      ) : (
        <form action={saveContact} className="detail-form">
          <section className="form-card">
            <h2>Priradenie kontaktu</h2>
            <div className="form-grid">
              <label className="wide">
                Člen *
                <select name="child_id" required defaultValue={selected}>
                  <option value="">Vyberte člena</option>
                  {sortByName(children.filter((child) => child.active)).map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.last_name} {child.first_name} · VS {child.variable_symbol}
                    </option>
                  ))}
                </select>
              </label>
              <label>Otec - meno<input name="father_name" defaultValue={contact?.father_name ?? ""} /></label>
              <label>Telefón otec<input name="father_phone" type="tel" defaultValue={contact?.father_phone ?? ""} /></label>
              <label>Mama - meno<input name="mother_name" defaultValue={contact?.mother_name ?? ""} /></label>
              <label>Telefón mama<input name="mother_phone" type="tel" defaultValue={contact?.mother_phone ?? ""} /></label>
              <label className="wide">Adresa<input name="address" defaultValue={contact?.address ?? ""} /></label>
              <label className="wide">
                E-mail na oznamy <span className="field-help">Viac adries oddeľ čiarkou</span>
                <input name="emails" defaultValue={contact?.emails.join(", ") ?? ""} />
              </label>
            </div>
            <div className="form-actions">
              <Link className="text-link" href="/kontakty">Zrušiť</Link>
              <button type="submit">Uložiť kontakt</button>
            </div>
          </section>
        </form>
      )}
    </AppShell>
  );
}
