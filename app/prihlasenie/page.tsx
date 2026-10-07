import Link from "next/link";
import { redirect } from "next/navigation";
import { Notices } from "@/components/notices";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { isDemoMode } from "@/lib/data";
import { signIn, signInWithGoogle } from "./actions";

/**
 * Tlačidlo Google ukážeme, len keď Supabase naozaj presmeruje na Google.
 * Samotný prepínač „Google zapnutý“ nestačí — bez Client ID a Secret z Google
 * Cloud vráti Supabase chybu „missing OAuth secret“ a tlačidlo by viedlo na ňu.
 * Overuje sa raz za päť minút.
 */
async function googleEnabled() {
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/authorize?provider=google`, {
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "" },
      redirect: "manual",
      next: { revalidate: 300 },
    });
    const target = response.headers.get("location") ?? "";
    return response.status >= 300 && response.status < 400 && target.startsWith("https://accounts.google.com/");
  } catch {
    return false;
  }
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  // Vo vývojovom náhľade nie je čo overovať — appka beží nad lokálnym súborom.
  if (isDemoMode()) redirect("/prehlad");
  const google = await googleEnabled();

  return (
    <main className="signin">
      <div className="signin-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Logo Ski Club IS" className="signin-logo" />
        <p className="eyebrow">DEMO SKI CLUB</p>
        <h1>Prihlásenie</h1>
        <p className="muted">Prístup pre administrátorov a trénerov klubu.</p>

        <form action={signIn} className="signin-form">
          <label>
            E-mail
            <input required name="email" type="email" autoComplete="email" />
          </label>
          <PasswordField label="Heslo" name="password" autoComplete="current-password" />
          <Notices error={error} />
          <SubmitButton label="Prihlásiť sa" pendingLabel="Prihlasujem…" />
        </form>

        {google && (
          <>
            <p className="signin-divider">alebo</p>
            <form action={signInWithGoogle}>
              <SubmitButton label="Prihlásiť sa cez Google" pendingLabel="Presmerúvam na Google…" className="secondary google-button" />
            </form>
          </>
        )}

        <p className="signin-alt">
          <Link href="/prihlasenie/zabudnute-heslo">Zabudnuté heslo?</Link>
        </p>
      </div>
    </main>
  );
}
