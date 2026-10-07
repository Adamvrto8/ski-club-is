import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { MembersBoard } from "@/components/members-board";
import { getSession } from "@/lib/data";
import { TEAM_LABELS, formatMoney, isTeam, paymentStatus } from "@/lib/domain";

type Query = {
  q?: string;
  team?: string;
  archiv?: string;
  is_sport?: string;
  payment?: string;
  sort?: string;
  error?: string;
  success?: string;
};

export default async function MembersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const { repo, role, demo } = await getSession();

  const [allMembers, payments, loans] = await Promise.all([
    repo.listChildren(),
    repo.listPayments(),
    repo.listLoans(),
  ]);

  const unpaidChildIds = new Set(
    payments.filter((payment) => paymentStatus(payment.paid, payment.due_date).style !== "paid").map((p) => p.child_id),
  );

  // Čo treba doriešiť predtým, než člen zmizne — vymazanie berie so sebou aj jeho platby a kontakty.
  const blockers: Record<string, string[]> = {};
  for (const child of allMembers) {
    const childLoans = loans.filter((loan) => loan.child_id === child.id);
    const unreturned = childLoans.filter((loan) => !loan.returned).length;
    const owed = childLoans.filter((loan) => !loan.paid).reduce((sum, loan) => sum + loan.price, 0);
    const reasons = [
      unreturned ? `nevrátená výstroj: ${unreturned} ks` : "",
      owed > 0 ? `nezaplatené požičovné: ${formatMoney(owed)}` : "",
      unpaidChildIds.has(child.id) ? "neuhradená platba" : "",
    ].filter(Boolean);
    if (reasons.length) blockers[child.id] = reasons;
  }

  // Archív = neaktívni členovia. Predvolene ich nevidno, ukážu sa len pod filtrom „Archív“.
  const archive = params.archiv === "1";
  const pool = allMembers.filter((child) => child.active !== archive);

  const search = params.q?.trim().toLocaleLowerCase("sk") ?? "";
  let members = pool.filter((child) => {
    if (search && !`${child.first_name} ${child.last_name}`.toLocaleLowerCase("sk").includes(search)) return false;
    if (params.team && isTeam(params.team) && child.team !== params.team) return false;
    if (params.is_sport === "true" && !child.is_sport_registered) return false;
    if (params.is_sport === "false" && child.is_sport_registered) return false;
    if (params.payment === "unpaid" && !unpaidChildIds.has(child.id)) return false;
    return true;
  });

  const sort = params.sort ?? "last_name";
  members = [...members].sort((a, b) => {
    if (sort === "first_name") return a.first_name.localeCompare(b.first_name, "sk");
    if (sort === "birth_date") return a.birth_date.localeCompare(b.birth_date);
    if (sort === "variable_symbol") return a.variable_symbol - b.variable_symbol;
    return a.last_name.localeCompare(b.last_name, "sk") || a.first_name.localeCompare(b.first_name, "sk");
  });

  return (
    <AppShell active="/clenovia" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ŠPORTOVÝ KLUB · SPRÁVA ČLENOV</p>
          <h1>Členovia</h1>
        </div>
        {role === "admin" && (
          <div className="header-actions">
            <Link className="secondary-link" href="/import">Import z Excelu</Link>
            <Link className="button-link" href="/clenovia/novy">+ Nový člen</Link>
          </div>
        )}
      </header>

      <form className="toolbar" action="/clenovia">
        <input name="q" defaultValue={params.q} placeholder="Hľadať podľa mena alebo priezviska" aria-label="Hľadať členov" />
        <select name="team" defaultValue={params.team ?? ""} aria-label="Filtrovať podľa družstva">
          <option value="">Všetky družstvá</option>
          {Object.entries(TEAM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select name="archiv" defaultValue={params.archiv ?? ""} aria-label="Aktuálni členovia alebo archív">
          <option value="">Aktuálni členovia</option>
          <option value="1">Archív</option>
        </select>
        <select name="is_sport" defaultValue={params.is_sport ?? ""} aria-label="Filtrovať IS šport">
          <option value="">IS šport: všetci</option>
          <option value="true">Registrovaní v IS športu</option>
          <option value="false">Neregistrovaní v IS športu</option>
        </select>
        <select name="payment" defaultValue={params.payment ?? ""} aria-label="Filtrovať platby">
          <option value="">Platby: všetky</option>
          <option value="unpaid">Majú neuhradenú platbu</option>
        </select>
        <select name="sort" defaultValue={sort} aria-label="Triedenie">
          <option value="last_name">A → Z (priezvisko)</option>
          <option value="first_name">A → Z (meno)</option>
          <option value="birth_date">Dátum narodenia</option>
          <option value="variable_symbol">Variabilný symbol</option>
        </select>
        <button type="submit">Filtrovať</button>
        <Link className="text-link" href="/clenovia">Zrušiť filtre</Link>
      </form>

      <Notices success={params.success} error={params.error} />

      <div className="list-actions">
        <p className="muted">Zobrazených: {members.length} z {pool.length} {archive ? "v archíve" : "členov"}</p>
        {/* Stiahnutie súboru z route handlera — <Link> by spustil klientskú navigáciu a súbor by sa nestiahol. */}
        <a className="text-link" href="/export/clenovia" download>Exportovať všetkých členov (CSV)</a>
      </div>

      <MembersBoard
        members={members}
        archive={archive}
        canEdit={role === "admin"}
        unpaidChildIds={[...unpaidChildIds]}
        blockers={blockers}
      />
    </AppShell>
  );
}
