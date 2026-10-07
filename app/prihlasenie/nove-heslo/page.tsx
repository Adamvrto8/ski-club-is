import { redirect } from "next/navigation";
import { Notices } from "@/components/notices";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { isDemoMode } from "@/lib/data";
import { MIN_PASSWORD } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (isDemoMode()) redirect("/prehlad");

  /*
   * Na túto stránku sa dá dostať len s reláciou, ktorú vytvoril odkaz z e-mailu.
   * Bez nej by formulár nemal čie heslo meniť, tak rovno posielame na prihlásenie.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      "/prihlasenie?error=" + encodeURIComponent("Odkaz na zmenu hesla je neplatný alebo vypršal."),
    );
  }

  return (
    <main className="signin">
      <div className="signin-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Logo Ski Club IS" className="signin-logo" />
        <p className="eyebrow">DEMO SKI CLUB</p>
        <h1>Nové heslo</h1>
        <p className="muted">Nastavuješ heslo pre {user.email}.</p>

        <form action={updatePassword} className="signin-form">
          <PasswordField label="Nové heslo" name="password" autoComplete="new-password" minLength={MIN_PASSWORD} />
          <PasswordField
            label="Zopakuj heslo"
            name="password_repeat"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
          />
          <p className="muted small">
            Aspoň {MIN_PASSWORD} znakov. V systéme sú rodné čísla a adresy detí — zvoľ heslo, ktoré nepoužívaš inde.
          </p>
          <Notices error={error} />
          <SubmitButton label="Uložiť heslo" pendingLabel="Ukladám…" />
        </form>
      </div>
    </main>
  );
}
