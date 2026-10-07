import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/data";
import { formatMoney } from "@/lib/domain";
import { deleteEquipmentCategory, saveEquipmentCategory, seedCategories } from "../actions";

export const dynamic = "force-dynamic";

export default async function EquipmentCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { repo, role, demo } = await requireAdmin("/pozicovna");

  const [categories, equipment] = await Promise.all([repo.listEquipmentCategories(), repo.listEquipment()]);
  const roots = categories.filter((category) => !category.parent_id);
  const countFor = (id: string) => equipment.filter((item) => item.category_id === id).length;

  return (
    <AppShell active="/pozicovna" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">POŽIČOVŇA</p>
          <h1>Kategórie a ceny</h1>
          <p className="muted">
            Podkategórie majú vlastnú cenu za sezónu, napr. „Lyže nové“ a „Lyže staré“. Kus výstroja si môže cenu
            prepísať vlastnou.
          </p>
        </div>
        <Link className="text-link" href="/pozicovna">← Späť na inventár</Link>
      </header>

      <Notices success={params.success} error={params.error} />

      {!categories.length && (
        <section className="form-card">
          <h2>Začni štandardnými kategóriami</h2>
          <p className="muted">
            Založíme lyže, lyžiarky, palice, prilbu, chránič, bundu, nohavice, kombinézu a iné. Ceny a podkategórie
            doplníš potom.
          </p>
          <form action={seedCategories}>
            <div className="form-actions">
              <SubmitButton label="Vytvoriť štandardné kategórie" pendingLabel="Zakladám…" />
            </div>
          </form>
        </section>
      )}

      {roots.map((root) => {
        const children = categories.filter((category) => category.parent_id === root.id);
        return (
          <section className="form-card" key={root.id}>
            <div className="category-row">
              <form action={saveEquipmentCategory} className="category-fields">
                <input type="hidden" name="id" value={root.id} />
                <input type="hidden" name="parent_id" value="" />
                <label>Kategória<input name="name" defaultValue={root.name} required /></label>
                <label>
                  Cena za sezónu
                  <input name="season_price" inputMode="decimal" defaultValue={root.season_price ?? ""} placeholder="nepovinné" />
                </label>
                <button type="submit" className="secondary">Uložiť</button>
              </form>
              <form action={deleteEquipmentCategory}>
                <input type="hidden" name="id" value={root.id} />
                <button type="submit" className="icon-button" aria-label={`Vymazať ${root.name}`}>✕</button>
              </form>
            </div>

            <div className="subcategory-list">
              {children.map((child) => (
                <div className="category-row" key={child.id}>
                  <form action={saveEquipmentCategory} className="category-fields">
                    <input type="hidden" name="id" value={child.id} />
                    <input type="hidden" name="parent_id" value={root.id} />
                    <label>Podkategória<input name="name" defaultValue={child.name} required /></label>
                    <label>
                      Cena za sezónu
                      <input name="season_price" inputMode="decimal" defaultValue={child.season_price ?? ""} />
                    </label>
                    <span className="muted">{countFor(child.id)} ks</span>
                    <button type="submit" className="secondary">Uložiť</button>
                  </form>
                  <form action={deleteEquipmentCategory}>
                    <input type="hidden" name="id" value={child.id} />
                    <button type="submit" className="icon-button" aria-label={`Vymazať ${child.name}`}>✕</button>
                  </form>
                </div>
              ))}

              <form action={saveEquipmentCategory} className="category-fields new-subcategory">
                <input type="hidden" name="parent_id" value={root.id} />
                <label>
                  Nová podkategória
                  <input name="name" required placeholder={`napr. ${root.name} nové`} />
                </label>
                <label>Cena za sezónu<input name="season_price" inputMode="decimal" placeholder="napr. 60" /></label>
                <button type="submit" className="secondary">Pridať</button>
              </form>
            </div>
          </section>
        );
      })}

      <section className="form-card">
        <h2>Nová hlavná kategória</h2>
        <form action={saveEquipmentCategory} className="form-grid">
          <input type="hidden" name="parent_id" value="" />
          <label>Názov *<input name="name" required placeholder="napr. Snowboard" /></label>
          <label>Cena za sezónu<input name="season_price" inputMode="decimal" placeholder="nepovinné" /></label>
          <div className="form-actions wide">
            <SubmitButton label="Pridať kategóriu" pendingLabel="Pridávam…" />
          </div>
        </form>
      </section>

      {categories.length > 0 && (
        <p className="muted">
          Spolu {roots.length} kategórií a {categories.length - roots.length} podkategórií · najdrahšia sezónna cena{" "}
          {formatMoney(Math.max(0, ...categories.map((category) => category.season_price ?? 0)))}
        </p>
      )}
    </AppShell>
  );
}
