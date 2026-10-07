import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { getSession } from "@/lib/data";
import { CopyEmails } from "@/components/copy-emails";
import { TEAM_LABELS, formatDate, isTeam, sortByName, uniqueEmails } from "@/lib/domain";

type Query = { q?: string; team?: string; success?: string; error?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const { repo, role, demo } = await getSession();

  const [allChildren, contacts] = await Promise.all([repo.listChildren(), repo.listContacts()]);
  const children = allChildren.filter((child) => child.active); // archivovaní sem nepatria
  const contactByChild = new Map(contacts.map((contact) => [contact.child_id, contact]));

  const search = params.q?.trim().toLocaleLowerCase("sk") ?? "";
  const rows = sortByName(children)
    .map((child) => ({ child, contact: contactByChild.get(child.id) }))
    .filter(({ child, contact }) => {
      if (params.team && isTeam(params.team) && child.team !== params.team) return false;
      if (!search) return true;
      const haystack = [
        child.first_name,
        child.last_name,
        contact?.father_name,
        contact?.mother_name,
        contact?.emails.join(" "),
        contact?.father_phone,
        contact?.mother_phone,
        contact?.address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("sk");
      return haystack.includes(search);
    });

  // Presne to, čo je vidieť po filtri — kopíruje sa teda vybrané družstvo, nie celý klub.
  const filteredEmails = uniqueEmails(rows.map(({ contact }) => contact?.emails));

  const missing = rows.filter(
    ({ contact }) => !contact?.emails.length && !contact?.father_phone && !contact?.mother_phone,
  ).length;

  return (
    <AppShell active="/kontakty" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ČLENOVIA A RODIČIA</p>
          <h1>Kontakty</h1>
          <p className="muted">Každý kontakt je naviazaný na jedného člena.</p>
        </div>
        {role === "admin" && <Link className="button-link" href="/kontakty/novy">+ Doplniť kontakt</Link>}
      </header>

      <form className="toolbar" action="/kontakty">
        <input name="q" defaultValue={params.q} placeholder="Hľadať podľa dieťaťa, rodiča, e-mailu alebo telefónu" aria-label="Hľadať kontakty" />
        <select name="team" defaultValue={params.team ?? ""} aria-label="Filtrovať podľa družstva">
          <option value="">Všetky družstvá</option>
          {Object.entries(TEAM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="submit">Hľadať</button>
        <Link className="text-link" href="/kontakty">Zrušiť filtre</Link>
      </form>

      <Notices success={params.success} error={params.error} />

      <div className="list-actions">
        <p className="muted">
          Zobrazených: {rows.length} z {children.length} členov
          {missing > 0 && <> · bez e-mailu aj telefónu: <strong>{missing}</strong></>}
        </p>
        <div className="header-actions">
          <CopyEmails emails={filteredEmails} />
          {/* Stiahnutie súboru z route handlera — <Link> by spustil klientskú navigáciu a súbor by sa nestiahol. */}
          <a className="text-link" href="/export/kontakty" download>Exportovať CSV</a>
        </div>
      </div>

      {!children.length ? (
        <section className="empty-panel">
          <h2>Zatiaľ žiadne kontakty</h2>
          <p>Najprv pridaj člena alebo spusti import z Excelu. Kontakty sa naviažu automaticky.</p>
          <Link className="button-link" href="/import">Spustiť import</Link>
        </section>
      ) : (
        <div className="table-wrap">
          <table className="members">
            {/* Poradie stĺpcov kopíruje kontaktný hárok klubu. */}
            <thead>
              <tr>
                <th>p.č.</th><th>Meno</th><th>Družstvo</th><th>Narodený</th>
                <th>Otec - meno</th><th>telefón</th>
                <th>Mama - meno</th><th>telefón</th>
                <th>Adresa</th><th>e-mail na oznamy</th>
                {role === "admin" && <th aria-label="Akcie" />}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ child, contact }, index) => (
                <tr key={child.id}>
                  <td className="muted">{index + 1}.</td>
                  <td><strong>{child.last_name}</strong> {child.first_name}</td>
                  <td>
                    <Link className={`team team-${child.team}`} href={`/kontakty?team=${child.team}`}>{TEAM_LABELS[child.team]}</Link>
                  </td>
                  <td>{formatDate(child.birth_date)}</td>
                  <td>{contact?.father_name || "—"}</td>
                  <td>{contact?.father_phone || "—"}</td>
                  <td>{contact?.mother_name || "—"}</td>
                  <td>{contact?.mother_phone || "—"}</td>
                  <td>{contact?.address || "—"}</td>
                  <td>{contact?.emails.length ? contact.emails.join(", ") : "—"}</td>
                  {role === "admin" && (
                    <td>
                      <Link className="icon-button" href={`/kontakty/novy?child=${child.id}`} aria-label={`Upraviť kontakt ${child.last_name}`}>✎</Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
