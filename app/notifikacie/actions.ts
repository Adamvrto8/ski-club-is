"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/data";
import { isAllowedPushEndpoint, sendPushSafely } from "@/lib/push";

export type SubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
};

/** Uloží odber tohto zariadenia. Volá sa z prehliadača po povolení notifikácií. */
export async function registerPushSubscription(subscription: SubscriptionPayload) {
  const { repo, userId } = await getSession();

  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { ok: false, message: "Prehliadač neposlal platný odber." };
  }
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    return { ok: false, message: "Tento prehliadač používa neznámu push službu." };
  }

  try {
    await repo.savePushSubscription({
      owner_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: (subscription.userAgent ?? "").slice(0, 200),
    });
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }

  revalidatePath("/nastavenia");
  return { ok: true, message: "Notifikácie sú zapnuté pre toto zariadenie." };
}

export async function removePushSubscription(endpoint: string) {
  const { repo } = await getSession();
  try {
    await repo.deletePushSubscription(endpoint);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  revalidatePath("/nastavenia");
  return { ok: true, message: "Notifikácie sú pre toto zariadenie vypnuté." };
}

/** Skúšobná notifikácia, aby sa dalo overiť, že celé nastavenie funguje. */
export async function sendTestNotification() {
  const { repo } = await getSession();
  const result = await sendPushSafely(repo, {
    title: "Ski Club IS — skúšobná notifikácia",
    body: "Ak toto vidíš, push notifikácie fungujú.",
    url: "/prehlad",
    tag: "test",
  });

  if (result.skipped) {
    return { ok: false, message: "Push nie je nastavený — chýbajú VAPID kľúče v prostredí." };
  }
  return {
    ok: result.sent > 0,
    message: result.sent
      ? `Odoslané na ${result.sent} zariadení.`
      : "Žiadne zariadenie nemá zapnuté notifikácie.",
  };
}
