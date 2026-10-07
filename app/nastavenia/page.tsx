import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { PushManager } from "@/components/push-manager";
import { requireAdmin } from "@/lib/data";
import { formatMoney } from "@/lib/domain";
import { deleteCategory, saveCategory } from "../platby/actions";
import { saveClubSettings } from "./actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const params = await searchParams;
  const { repo, role, demo } = await requireAdmin("/clenovia");

  const [club, categories, season] = await Promise.all([
    repo.clubSettings(),
    repo.listCategories(),
    repo.currentSeason(),
  ]);

  return (
    <AppShell active="/nastavenia" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">KLUB · {season.name.toUpperCase()}</p>
          <h1>Nastavenia</h1>
          <p className="muted">Údaje klubu sa používajú na potvrdeniach o športovej činnosti.</p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      <form action={saveClubSettings} className="form-card">
        <h2>Údaje klubu</h2>
        <div className="form-grid">
          <label className="wide">Oficiálny názov *<input name="official_name" required defaultValue={club.official_name} /></label>
          <label className="wide">Adresa<input name="address" defaultValue={club.address} /></label>
          <label>IČO<input name="ico" defaultValue={club.ico} /></label>
          <label>Telefón<input name="phone" defaultValue={club.phone} placeholder="0900 000 000" /></label>
          <label>IBAN<input name="iban" defaultValue={club.iban} placeholder="SK00 0000 0000 0000 0000 0000" /></label>
          <label>
            Názov účtu <span className="field-help">ak sa líši od oficiálneho názvu</span>
            <input name="account_holder_name" defaultValue={club.account_holder_name} placeholder="napr. Demo Ski Club" />
          </label>
          <label className="wide">
            Štatutár
            <input name="statutory_representative" defaultValue={club.statutory_representative} placeholder="Meno, funkcia" />
          </label>
          <label className="wide">
            Registrácia (tlačí sa na potvrdeniach)
            <input
              name="registry_note"
              defaultValue={club.registry_note}
              placeholder="Občianske združenie ... je zapísaná v registri právnických osôb podľa zákona č. 440/2015 Z.z. o športe – IDPO: ..."
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">Uložiť údaje klubu</button>
        </div>
      </form>

      <section className="form-card">
        <h2>Push notifikácie</h2>
        <p className="muted">
          Upozornenia chodia prihláseným používateľom appky, nie rodičom. Posielame ich po dokončení importu,
          po hromadnom vygenerovaní potvrdení a pri platbách po splatnosti.
        </p>
        {/* Kľúč číta server a posiela ho ako prop — preto nepotrebuje prefix NEXT_PUBLIC_. */}
        <PushManager vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? ""} />
      </section>

      <section className="form-card">
        <h2>Kategórie platieb</h2>
        <p className="muted">
          Kategórie si vytváraš sama. Označ tie, ktoré sa smú uviesť na potvrdení o športovej činnosti.
        </p>

        <div className="category-list">
          {categories.map((category) => (
            <div className="category-row" key={category.id}>
              <form action={saveCategory} className="category-fields">
                <input type="hidden" name="id" value={category.id} />
                <label>
                  Názov
                  <input name="name" defaultValue={category.name} required />
                </label>
                <label>
                  Základná suma
                  <input name="base_amount" defaultValue={String(category.base_amount)} inputMode="decimal" required />
                </label>
                <label className="check">
                  <input type="checkbox" name="eligible_for_confirmation" defaultChecked={category.eligible_for_confirmation} />
                  Na potvrdenie
                </label>
                <button type="submit" className="secondary">Uložiť</button>
              </form>
              <form action={deleteCategory}>
                <input type="hidden" name="id" value={category.id} />
                <button type="submit" className="icon-button" aria-label={`Vymazať kategóriu ${category.name}`}>✕</button>
              </form>
            </div>
          ))}
          {!categories.length && <p className="muted">Zatiaľ žiadna kategória. Pridaj prvú nižšie.</p>}
        </div>

        <form action={saveCategory} className="form-grid new-category">
          <label>Nová kategória<input name="name" required placeholder="napr. Mesačný členský príspevok" /></label>
          <label>Základná suma<input name="base_amount" required inputMode="decimal" placeholder="45,00" /></label>
          <label className="check">
            <input type="checkbox" name="eligible_for_confirmation" />
            Oprávnená na potvrdenie o športovej činnosti
          </label>
          <div className="form-actions wide">
            <button type="submit">Pridať kategóriu</button>
          </div>
        </form>

        {categories.length > 0 && (
          <p className="muted">
            Spolu {categories.length} kategórií · najvyššia základná suma{" "}
            {formatMoney(Math.max(...categories.map((category) => category.base_amount)))}
          </p>
        )}
      </section>
    </AppShell>
  );
}
