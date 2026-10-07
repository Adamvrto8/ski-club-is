import { createHash, timingSafeEqual } from "node:crypto";
import { isDemoMode, type Repo } from "@/lib/data";
import { LocalRepo } from "@/lib/data/local";
import { SupabaseRepo } from "@/lib/data/supabase";
import { formatMoney, paymentStatus } from "@/lib/domain";
import { pushConfigured, sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function tokensMatch(provided: string, secret: string) {
  // Hash zjednotí dĺžku — timingSafeEqual vyžaduje rovnako dlhé vstupy.
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(provided), hash(secret));
}

/**
 * Upozornenie na platby po splatnosti a na blížiace sa termíny.
 *
 * Endpoint je určený pre plánovač (napr. Vercel Cron) a chráni ho tajný token,
 * aby ho nemohol spustiť ktokoľvek. Volať napr. raz denne ráno:
 *   GET /api/notifikacie/splatnost?dni=3
 *   Authorization: Bearer <NOTIFICATION_CRON_SECRET>
 */
export async function GET(request: Request) {
  /*
   * Vercel Cron posiela hlavičku `Authorization: Bearer <CRON_SECRET>` a názov tej
   * premennej si určuje sám. Preto uznávame obe mená — vlastné aj Vercelovské —
   * aby sa ten istý tajný token nemusel duplikovať do dvoch premenných.
   */
  const secret = process.env.NOTIFICATION_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "NOTIFICATION_CRON_SECRET nie je nastavený." }, { status: 503 });
  }

  /*
   * Token len z hlavičky — v adrese (?token=) by skončil v logoch servera aj prehliadača.
   * Porovnanie v konštantnom čase, aby sa token nedal hádať podľa dĺžky odpovede.
   */
  const url = new URL(request.url);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!tokensMatch(provided, secret)) {
    return Response.json({ error: "Neplatný token." }, { status: 401 });
  }

  if (!pushConfigured()) {
    return Response.json({ error: "Chýbajú VAPID kľúče." }, { status: 503 });
  }

  /*
   * Cron beží bez prihláseného používateľa, takže tu nejde použiť getSession().
   * V ostrej prevádzke preto siahame po service-role klientovi, ktorý obchádza RLS.
   */
  let repo: Repo;
  if (isDemoMode()) {
    repo = new LocalRepo();
  } else {
    const admin = createAdminClient();
    if (!admin) {
      return Response.json(
        { error: "Chýba SUPABASE_SERVICE_ROLE_KEY — bez neho cron nevie čítať platby." },
        { status: 503 },
      );
    }
    repo = new SupabaseRepo(admin, true, "cron");
  }

  const [payments, children] = await Promise.all([repo.listPayments(), repo.listChildren()]);

  const overdue = payments.filter((payment) => paymentStatus(payment.paid, payment.due_date).style === "overdue");

  const days = Math.min(Math.max(Number(url.searchParams.get("dni")) || 3, 1), 30);
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  const limitIso = limit.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = payments.filter(
    (payment) => !payment.paid && payment.due_date >= today && payment.due_date <= limitIso,
  );

  if (!overdue.length && !upcoming.length) {
    return Response.json({ sent: 0, overdue: 0, upcoming: 0, note: "Niet na čo upozorniť." });
  }

  const amount = overdue.reduce((sum, payment) => sum + payment.amount, 0);
  const families = new Set(overdue.map((payment) => payment.child_id)).size;

  const parts: string[] = [];
  if (overdue.length) parts.push(`${overdue.length} platieb po splatnosti (${formatMoney(amount)}, ${families} detí)`);
  if (upcoming.length) parts.push(`${upcoming.length} so splatnosťou do ${days} dní`);

  const result = await sendPush(repo, {
    title: "Ski Club IS — pripomienka platieb",
    body: parts.join(" · "),
    url: "/upomienky",
    tag: "splatnost",
  });

  return Response.json({
    sent: result.sent,
    removedSubscriptions: result.removed,
    overdue: overdue.length,
    upcoming: upcoming.length,
    childrenAffected: children.length ? families : 0,
  });
}
