import Link from "next/link";
import { redirect } from "next/navigation";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { isDemoMode } from "@/lib/data";
import { requestPasswordReset } from "../actions";

export const dynamic = "force-dynamic";

export default async function ForgottenPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error } = await searchParams;
  if (isDemoMode()) redirect("/prehlad");

  return (
    <main className="signin">
      <div className="signin-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Logo Ski Club IS" className="signin-logo" />
        <p className="eyebrow">DEMO SKI CLUB</p>
        <h1>Zabudnuté heslo</h1>
        <p className="muted">Pošleme ti e-mail s odkazom, cez ktorý si nastavíš nové heslo.</p>

        <form action={requestPasswordReset} className="signin-form">
          <label>
            E-mail
            <input required name="email" type="email" autoComplete="email" />
          </label>
          <Notices success={success} error={error} />
          <SubmitButton label="Poslať odkaz" pendingLabel="Posielam…" />
        </form>

        <p className="signin-alt">
          <Link href="/prihlasenie">Späť na prihlásenie</Link>
        </p>
      </div>
    </main>
  );
}
