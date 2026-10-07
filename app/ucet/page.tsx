import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { getSession } from "@/lib/data";
import { MIN_PASSWORD } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";
import { changePassword } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { role, demo } = await getSession();

  let email = "";
  if (!demo) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? "";
  }

  return (
    <AppShell active="/ucet" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ÚČET</p>
          <h1>Môj účet</h1>
          <p className="muted">
            {demo ? "Vývojový náhľad — bez prihlásenia a bez hesla." : `Prihlásený ako ${email}`} ·{" "}
            {role === "admin" ? "Administrátor" : "Tréner"}
          </p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      {!demo && (
        <form action={changePassword} className="form-card">
          <h2>Zmeniť heslo</h2>
          <div className="form-grid">
            <PasswordField label="Súčasné heslo" name="current_password" autoComplete="current-password" />
            <PasswordField label="Nové heslo" name="password" autoComplete="new-password" minLength={MIN_PASSWORD} />
            <PasswordField
              label="Zopakuj nové heslo"
              name="password_repeat"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
            />
          </div>
          <p className="muted small">
            Aspoň {MIN_PASSWORD} znakov. V systéme sú rodné čísla a adresy detí — zvoľ heslo, ktoré nepoužívaš inde.
            Ak súčasné heslo nepoznáš, odhlás sa a použi „Zabudnuté heslo“ na prihlasovacej obrazovke.
          </p>
          <div className="form-actions">
            <SubmitButton label="Zmeniť heslo" pendingLabel="Mením…" />
          </div>
        </form>
      )}
    </AppShell>
  );
}
