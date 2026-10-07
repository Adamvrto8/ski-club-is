import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EquipmentBoard } from "@/components/equipment-board";
import { EquipmentImportMapper } from "@/components/equipment-import-mapper";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { getSession } from "@/lib/data";
import { formatMoney } from "@/lib/domain";
import {
  EQUIPMENT_PURPOSE_LABELS,
  EQUIPMENT_STATUS_LABELS,
  categoryPath,
  isEquipmentPurpose,
  isEquipmentStatus,
  matchesCategory,
  normalizeCategoryName,
  seasonPrice,
  type EquipmentPurpose,
} from "@/lib/equipment";
import { suggestEquipmentMapping } from "@/lib/equipment-import";
import { uploadEquipmentImport } from "./actions";

type Query = {
  q?: string;
  purpose?: string;
  category?: string;
  status?: string;
  size?: string;
  buckles?: string;
  color?: string;
  price_min?: string;
  price_max?: string;
  success?: string;
  error?: string;
};

export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const { repo, role, demo } = await getSession();

  const [equipment, categories, loans, children, draft] = await Promise.all([
    repo.listEquipment(),
    repo.listEquipmentCategories(),
    repo.listLoans(),
    repo.listChildren(),
    role === "admin" ? repo.pendingImport() : Promise.resolve(null),
  ]);
  // Rozpracovaný import členov (iný "kind") sem nepatrí — má vlastnú stránku.
  const pending = draft?.kind === "equipment" ? draft : null;

  const borrowerByItem = new Map<string, { id: string; label: string }>();
  for (const loan of loans.filter((entry) => !entry.returned)) {
    const child = children.find((entry) => entry.id === loan.child_id);
    if (child) borrowerByItem.set(loan.equipment_id, { id: child.id, label: `${child.last_name} ${child.first_name}` });
  }

  // Výber dieťaťa ide podľa mena — dvaja rovnako menovaní by sa pomýlili, preto im pridáme VS.
  const activeChildren = children.filter((child) => child.active);
  const nameCount = new Map<string, number>();
  for (const child of activeChildren) {
    const name = `${child.last_name} ${child.first_name}`;
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  const borrowerOptions = activeChildren
    .map((child) => {
      const name = `${child.last_name} ${child.first_name}`;
      return { id: child.id, label: (nameCount.get(name) ?? 0) > 1 ? `${name} · VS ${child.variable_symbol}` : name };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "sk"));

  /*
   * Inventár je rozdelený na Prenájom a Sklad. Staršie záznamy skupinu nemajú
   * a zrušený „predaj“ je tiež prenájom.
   */
  const purposeOf = (item: (typeof equipment)[number]): EquipmentPurpose => (item.purpose === "sklad" ? "sklad" : "prenajom");
  const purpose = params.purpose && isEquipmentPurpose(params.purpose) ? params.purpose : "prenajom";
  const purposeCounts = Object.fromEntries(
    Object.keys(EQUIPMENT_PURPOSE_LABELS).map((key) => [key, equipment.filter((item) => purposeOf(item) === key).length]),
  ) as Record<keyof typeof EQUIPMENT_PURPOSE_LABELS, number>;

  /** Hlavná kategória kusu (bez podkategórie) — podľa nej sa zoznam delí na bloky. */
  const groupOf = (categoryId: string | null) => {
    const category = categories.find((entry) => entry.id === categoryId);
    if (!category) return "Bez zaradenia";
    const parent = categories.find((entry) => entry.id === category.parent_id);
    return (parent ?? category).name;
  };

  /** Podkategória jedným slovom („Nové“, „Staré“) — hlavná kategória je už v nadpise bloku. */
  const subcategoryOf = (categoryId: string | null) => {
    const category = categories.find((entry) => entry.id === categoryId);
    return category?.parent_id ? category.name : "";
  };

  const search = params.q?.trim().toLocaleLowerCase("sk") ?? "";
  // Farby sú v hárkoch voľný text („cerv/cierne“) — hľadáme časť slova, bez diakritiky.
  const color = normalizeCategoryName(params.color ?? "");
  const parsePrice = (value: string | undefined) => {
    const number = Number((value ?? "").trim().replace(",", "."));
    return value?.trim() && Number.isFinite(number) ? number : null;
  };
  const priceMin = parsePrice(params.price_min);
  const priceMax = parsePrice(params.price_max);
  const activeFilters = [
    params.category,
    params.status,
    params.size,
    params.buckles,
    color,
    priceMin !== null || priceMax !== null ? "price" : "",
  ].filter(Boolean).length;

  const rows = equipment
    .filter((item) => {
      if (purposeOf(item) !== purpose) return false;
      if (
        search &&
        !`${item.inventory_code} ${item.name} ${item.brand} ${item.model} ${item.color}`
          .toLocaleLowerCase("sk")
          .includes(search)
      )
        return false;
      if (params.category && !matchesCategory(item, params.category, categories)) return false;
      if (params.status && isEquipmentStatus(params.status) && item.status !== params.status) return false;
      if (params.size && item.size.toLocaleLowerCase("sk") !== params.size.toLocaleLowerCase("sk")) return false;
      if (params.buckles && String(item.buckles ?? "") !== params.buckles) return false;
      if (color && !normalizeCategoryName(item.color).includes(color)) return false;
      if (priceMin !== null || priceMax !== null) {
        const price = seasonPrice(item, categories);
        if (priceMin !== null && price < priceMin) return false;
        if (priceMax !== null && price > priceMax) return false;
      }
      return true;
    })
    .map((item) => ({
      id: item.id,
      inventoryCode: item.inventory_code,
      name: item.name,
      category: categoryPath(item.category_id, categories),
      categoryId: item.category_id,
      group: groupOf(item.category_id),
      subcategory: subcategoryOf(item.category_id),
      size: item.size,
      brand: item.brand,
      model: item.model,
      color: item.color,
      buckles: item.buckles ?? null,
      quantity: item.quantity ?? null,
      purpose: purposeOf(item),
      price: seasonPrice(item, categories),
      condition: item.condition,
      status: item.status,
      note: item.note,
      borrower: borrowerByItem.get(item.id)?.label ?? null,
      borrowerId: borrowerByItem.get(item.id)?.id ?? null,
    }))
    .sort((a, b) => a.inventoryCode.localeCompare(b.inventoryCode, "sk", { numeric: true }));

  const inTab = equipment.filter((item) => purposeOf(item) === purpose);
  const counts = {
    total: inTab.length,
    available: inTab.filter((item) => item.status === "dostupne").length,
    borrowed: inTab.filter((item) => item.status === "pozicane").length,
    problem: inTab.filter((item) => ["v_oprave", "stratene"].includes(item.status)).length,
    pieces: inTab.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
  };

  const sizes = [...new Set(inTab.map((item) => item.size).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "sk", { numeric: true }),
  );
  // Klipsy majú len lyžiarky — filter sa ukáže, iba ak ich niektorý kus v skupine má.
  const buckleCounts = [...new Set(inTab.map((item) => item.buckles).filter((value): value is number => Boolean(value)))].sort(
    (a, b) => a - b,
  );

  return (
    <AppShell active="/pozicovna" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">KLUB · INVENTÁR</p>
          <h1>Požičovňa</h1>
        </div>
        {role === "admin" && (
          <div className="header-actions">
            <Link className="secondary-link" href="/pozicovna/kategorie">Kategórie a ceny</Link>
            <Link className="button-link" href="/pozicovna/vypozicky">Výpožičky</Link>
          </div>
        )}
      </header>

      <Notices success={params.success} error={params.error} />

      <nav className="purpose-tabs" aria-label="Skupina inventára">
        {(Object.entries(EQUIPMENT_PURPOSE_LABELS) as [keyof typeof EQUIPMENT_PURPOSE_LABELS, string][]).map(([key, label]) => (
          <Link
            key={key}
            href={`/pozicovna?purpose=${key}`}
            className={key === purpose ? "active" : undefined}
            aria-current={key === purpose ? "page" : undefined}
          >
            {label} <span>{purposeCounts[key]}</span>
          </Link>
        ))}
      </nav>

      {purpose === "sklad" ? (
        <section className="summary-grid" aria-label="Stav skladu">
          <article><span>Položiek</span><strong>{counts.total}</strong><small>druhov pomôcok</small></article>
          <article><span>Kusov spolu</span><strong>{counts.pieces}</strong><small>podľa poslednej inventúry</small></article>
          <article>
            <span>Stratené alebo poškodené</span>
            <strong className={counts.problem ? "overdue-text" : undefined}>{counts.problem}</strong>
            <small>{counts.problem ? "vyžaduje kontrolu" : "všetko v poriadku"}</small>
          </article>
        </section>
      ) : (
      <section className="summary-grid" aria-label="Stav inventára">
        <article><span>Dostupné</span><strong>{counts.available}</strong><small>z {counts.total} kusov</small></article>
        <article><span>Požičané</span><strong>{counts.borrowed}</strong><small>aktuálne u detí</small></article>
        <article>
          <span>V oprave alebo stratené</span>
          <strong className={counts.problem ? "overdue-text" : undefined}>{counts.problem}</strong>
          <small>{counts.problem ? "vyžaduje kontrolu" : "všetko v poriadku"}</small>
        </article>
      </section>
      )}

      {/*
        Filtrov je priveľa na jeden riadok, preto sú v okne, ktoré otvára „Filtrovať“.
        Natívny popover — bez JavaScriptu, zatvára sa klikom mimo alebo Esc.
      */}
      <form className="toolbar" action="/pozicovna">
        <input type="hidden" name="purpose" value={purpose} />
        {/* Enter v hľadaní odošle formulár aj so skrytými filtrami. */}
        <button type="submit" className="implicit-submit" tabIndex={-1} aria-hidden="true" />
        <input name="q" defaultValue={params.q} placeholder="Hľadať podľa čísla, názvu alebo značky" aria-label="Hľadať výstroj" />
        <button type="button" popoverTarget="equipment-filters">
          Filtrovať{activeFilters > 0 && ` (${activeFilters})`}
        </button>
        {(activeFilters > 0 || search) && (
          <Link className="text-link" href={`/pozicovna?purpose=${purpose}`}>Zrušiť filtre</Link>
        )}

        <div id="equipment-filters" popover="auto" className="filter-popover" role="dialog" aria-label="Filtre inventára">
          <h2>Filtre</h2>
          <div className="form-grid">
            <label className="wide">
              Kategória
              <select name="category" defaultValue={params.category ?? ""}>
                <option value="">Všetky kategórie</option>
                {categories.filter((c) => !c.parent_id).map((category) => (
                  <optgroup key={category.id} label={category.name}>
                    <option value={category.id}>{category.name} (všetko)</option>
                    {categories.filter((child) => child.parent_id === category.id).map((child) => (
                      <option key={child.id} value={child.id}>{child.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Stav
              <select name="status" defaultValue={params.status ?? ""}>
                <option value="">Všetky stavy</option>
                {Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            {sizes.length > 0 && (
              <label>
                Veľkosť
                <select name="size" defaultValue={params.size ?? ""}>
                  <option value="">Všetky veľkosti</option>
                  {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            )}
            {buckleCounts.length > 0 && (
              <label>
                Klipsy
                <select name="buckles" defaultValue={params.buckles ?? ""}>
                  <option value="">Všetky klipsy</option>
                  {buckleCounts.map((count) => (
                    <option key={count} value={String(count)}>{count} {count === 1 ? "klips" : count < 5 ? "klipsy" : "klipsov"}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Farba
              <input name="color" defaultValue={params.color} placeholder="napr. čierna" />
            </label>
            <fieldset className="date-range">
              <legend>Cena za sezónu (€)</legend>
              <label>Od<input name="price_min" inputMode="decimal" defaultValue={params.price_min} placeholder="0" /></label>
              <label>Do<input name="price_max" inputMode="decimal" defaultValue={params.price_max} placeholder="bez limitu" /></label>
            </fieldset>
          </div>
          <div className="form-actions">
            <Link className="text-link" href={`/pozicovna?purpose=${purpose}`}>Zrušiť filtre</Link>
            <button type="button" className="secondary" popoverTarget="equipment-filters" popoverTargetAction="hide">Zavrieť</button>
            <button type="submit" className="primary">Použiť filtre</button>
          </div>
        </div>
      </form>

      <div className="list-actions">
        <p className="muted">
          {purpose === "sklad" ? (
            <>Zobrazených: {rows.length} z {counts.total} položiek</>
          ) : (
            <>
              Zobrazených: {rows.length} z {counts.total} kusov · hodnota za sezónu{" "}
              {formatMoney(rows.reduce((sum, row) => sum + row.price, 0))}
            </>
          )}
        </p>
        <a className="text-link" href="/export/vystroj" download>Exportovať CSV</a>
      </div>

      <EquipmentBoard
        rows={rows}
        categories={categories.map((category) => ({ id: category.id, label: categoryPath(category.id, categories) }))}
        canEdit={role === "admin"}
        purpose={purpose}
        // Pri hľadaní alebo filtri chce človek vidieť výsledky hneď, nie zbalené bloky.
        expandAll={Boolean(search || activeFilters)}
        members={borrowerOptions}
      />

      {role === "admin" && !pending && (
        <section className="form-card">
          <h2>Import inventára z Excelu</h2>
          <p className="muted">
            Náhľad → mapovanie → potvrdenie → výsledok, rovnako ako pri importe členov. Duplicity riešime podľa{" "}
            <strong>inventárneho čísla</strong> — existujúci kus sa aktualizuje. Kategórie sa zakladajú len ak ešte
            neexistujú. Ak súbor nemá stĺpec „názov“ ani „kategória“ (bežné napr. pri kombinézach), zadáš ich
            v ďalšom kroku raz pre celý súbor.
          </p>
          <p className="muted">
            <strong>Nahrávaj jeden zoznam naraz</strong> — napr. len kombinézy nové. Každý zoznam má iné stĺpce a čísla
            v ňom začínajú od 1, takže spoločné mapovanie pre viac zoznamov nesedí. Zošit s viacerými hárkami nahraj
            celý, hárky sa v náhľade zaškrtávajú. Starý formát <strong>.xls</strong> treba v Exceli uložiť ako .xlsx.
          </p>
          <form action={uploadEquipmentImport}>
            <div className="form-grid">
              <label className="wide">
                Súbory s inventárom *
                <input type="file" name="files" accept=".xlsx,.csv,.txt" multiple required />
              </label>
            </div>
            <div className="form-actions">
              <SubmitButton label="Načítať náhľad" pendingLabel="Načítavam súbor…" />
            </div>
          </form>
        </section>
      )}

      {role === "admin" && pending && (
        <EquipmentImportMapper
          token={pending.token}
          fileName={pending.file_name}
          headers={pending.headers}
          rows={pending.rows}
          suggestion={suggestEquipmentMapping(pending.headers)}
        />
      )}
    </AppShell>
  );
}
