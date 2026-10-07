import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MemberForm } from "@/components/member-form";
import { Notices } from "@/components/notices";
import { requireAdmin } from "@/lib/data";
import { today } from "@/lib/domain";
import { addMember } from "../actions";

export default async function NewMemberPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { role, demo } = await requireAdmin("/clenovia");

  return (
    <AppShell active="/clenovia" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ČLENOVIA</p>
          <h1>Nový člen</h1>
          <p className="muted">Variabilný symbol sa pridelí automaticky od 1001 a zostáva členovi natrvalo.</p>
        </div>
        <Link className="text-link" href="/clenovia">← Späť na členov</Link>
      </header>

      <Notices error={error} />

      <MemberForm
        action={addMember}
        submitLabel="Uložiť člena"
        cancelHref="/clenovia"
        values={{ active: true, membership_date: today() }}
      />
    </AppShell>
  );
}
