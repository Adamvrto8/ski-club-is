import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LoansBoard } from "@/components/loans-board";
import { Notices } from "@/components/notices";
import { getSession } from "@/lib/data";
import { formatMoney, sortByName, today } from "@/lib/domain";
import { categoryPath, seasonPrice } from "@/lib/equipment";

type Query = { status?: string; q?: string; success?: string; error?: string };

export const dynamic = "force-dynamic";

export default async function LoansPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const { repo, role, demo } = await getSession();

  const [equipment, categories, loans, children, season] = await Promise.all([
    repo.listEquipment(),
    repo.listEquipmentCategories(),
    repo.listLoans(),
    repo.listChildren(),
    repo.currentSeason(),
  ]);

  const itemById = new Map(equipment.map((item) => [item.id, item]));
  const childById = new Map(children.map((child) => [child.id, child]));
  const search = params.q?.trim().toLocaleLowerCase("sk") ?? "";

  const rows = loans
    .map((loan) => {
      const item = itemById.get(loan.equipment_id);
      const child = childById.get(loan.child_id);
      return {
        id: loan.id,
        itemLabel: item ? `${item.inventory_code} · ${item.name}` : "Neznámy kus",
        category: item ? categoryPath(item.category_id, categories) : "—",
        childName: child ? `${child.last_name} ${child.first_name}` : "Neznáme dieťa",
        borrowedOn: loan.borrowed_on,
        returnedOn: loan.returned_on,
        price: loan.price,
        paid: loan.paid,
        returned: loan.returned,
        note: loan.note,
      };
    })
    .filter((row) => {
      if (search && !`${row.itemLabel} ${row.childName}`.toLocaleLowerCase("sk").includes(search)) return false;
      if (params.status === "active") return !row.returned;
      if (params.status === "returned") return row.returned;
      if (params.status === "unpaid") return !row.paid;
      return true;
    })
    .sort((a, b) => Number(a.returned) - Number(b.returned) || b.borrowedOn.localeCompare(a.borrowedOn));

  const outstanding = rows.filter((row) => !row.paid).reduce((sum, row) => sum + row.price, 0);
  const active = loans.filter((loan) => !loan.returned).length;

  // Požičať sa dá len to, čo nie je práve vonku a nie je vyradené alebo stratené.
  const borrowedIds = new Set(loans.filter((loan) => !loan.returned).map((loan) => loan.equipment_id));
  const availableItems = equipment
    .filter((item) => !borrowedIds.has(item.id) && !["stratene", "vyradene"].includes(item.status))
    .map((item) => ({
      id: item.id,
      label: `${item.inventory_code} · ${item.name}${item.size ? ` (${item.size})` : ""}`,
      price: seasonPrice(item, categories),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "sk", { numeric: true }));

  return (
    <AppShell active="/pozicovna" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">POŽIČOVŇA · {season.name.toUpperCase()}</p>
          <h1>Výpožičky</h1>
          <p className="muted">
            {active} kusov je aktuálne u detí
            {outstanding > 0 && <> · neuhradené <strong className="overdue-text">{formatMoney(outstanding)}</strong></>}
          </p>
        </div>
        <Link className="text-link" href="/pozicovna">← Späť na inventár</Link>
      </header>

      <Notices success={params.success} error={params.error} />

      <form className="toolbar" action="/pozicovna/vypozicky">
        <input name="q" defaultValue={params.q} placeholder="Hľadať podľa kusu alebo dieťaťa" aria-label="Hľadať výpožičky" />
        <select name="status" defaultValue={params.status ?? ""} aria-label="Stav výpožičky">
          <option value="">Všetky výpožičky</option>
          <option value="active">Nevrátené</option>
          <option value="returned">Vrátené</option>
          <option value="unpaid">Nezaplatené</option>
        </select>
        <button type="submit">Filtrovať</button>
        <Link className="text-link" href="/pozicovna/vypozicky">Zrušiť filtre</Link>
      </form>

      <LoansBoard
        rows={rows}
        canEdit={role === "admin"}
        availableItems={availableItems}
        members={sortByName(children.filter((child) => child.active)).map((child) => ({
          id: child.id,
          label: `${child.last_name} ${child.first_name} · VS ${child.variable_symbol}`,
        }))}
        defaultDate={today()}
      />
    </AppShell>
  );
}
