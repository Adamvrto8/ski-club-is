import Link from "next/link";
import { SubmitButton } from "./submit-button";
import { TEAM_LABELS, type Team } from "@/lib/domain";

export type MemberFormValues = {
  id?: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  membership_date?: string;
  team?: Team | "";
  active?: boolean;
  is_sport_registered?: boolean;
  sport_registered_at?: string | null;
  sport_identifier?: string | null;
  national_id?: string | null;
  permanent_address?: string | null;
  father_name?: string | null;
  father_phone?: string | null;
  mother_name?: string | null;
  mother_phone?: string | null;
  emails?: string[];
  contact_address?: string | null;
};

export function MemberForm({
  action,
  values,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: MemberFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="detail-form">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <section className="form-card">
        <h2>Základné údaje</h2>
        <div className="form-grid">
          <label>Meno *<input name="first_name" required defaultValue={values?.first_name} /></label>
          <label>Priezvisko *<input name="last_name" required defaultValue={values?.last_name} /></label>
          <label>Dátum narodenia *<input name="birth_date" type="date" required defaultValue={values?.birth_date} /></label>
          <label>Dátum vstupu do klubu *<input name="membership_date" type="date" required defaultValue={values?.membership_date} /></label>
          <label>
            Družstvo *
            <select name="team" required defaultValue={values?.team ?? ""}>
              <option disabled value="">Vyberte družstvo</option>
              {Object.entries(TEAM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="check">
            <input name="active" type="checkbox" defaultChecked={values?.active ?? true} />
            Aktívny člen <span className="field-help">nezaškrtnuté = v archíve</span>
          </label>
        </div>
      </section>

      <section className="form-card">
        <h2>Informačný systém športu</h2>
        <div className="form-grid">
          <label className="check">
            <input name="is_sport_registered" type="checkbox" defaultChecked={values?.is_sport_registered} />
            Registrovaný v IS športu
          </label>
          <label>Dátum registrácie<input name="sport_registered_at" type="date" defaultValue={values?.sport_registered_at ?? ""} /></label>
          <label className="wide">Identifikátor z IS športu<input name="sport_identifier" defaultValue={values?.sport_identifier ?? ""} /></label>
        </div>
      </section>

      <section className="form-card">
        <h2>Kontakt na zákonného zástupcu</h2>
        <div className="form-grid">
          <label>Otec - meno<input name="father_name" defaultValue={values?.father_name ?? ""} /></label>
          <label>Telefón otec<input name="father_phone" type="tel" defaultValue={values?.father_phone ?? ""} /></label>
          <label>Mama - meno<input name="mother_name" defaultValue={values?.mother_name ?? ""} /></label>
          <label>Telefón mama<input name="mother_phone" type="tel" defaultValue={values?.mother_phone ?? ""} /></label>
          <label className="wide">Adresa<input name="contact_address" defaultValue={values?.contact_address ?? ""} /></label>
          <label className="wide">
            E-mail na oznamy <span className="field-help">Viac adries oddeľ čiarkou</span>
            <input name="emails" defaultValue={values?.emails?.join(", ") ?? ""} />
          </label>
        </div>
      </section>

      <section className="form-card sensitive">
        <h2>Citlivé údaje</h2>
        <p className="muted">Uložené oddelene. V produkcii ich číta iba admin, tréner ich nevidí.</p>
        <div className="form-grid">
          <label>Rodné číslo<input name="national_id" defaultValue={values?.national_id ?? ""} /></label>
          <label>Trvalé bydlisko<input name="permanent_address" defaultValue={values?.permanent_address ?? ""} /></label>
        </div>
      </section>

      <div className="form-actions">
        <Link className="text-link" href={cancelHref}>Zrušiť</Link>
        <SubmitButton label={submitLabel} pendingLabel="Ukladám…" />
      </div>
    </form>
  );
}
