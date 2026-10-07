import webpush from "web-push";
import type { Repo } from "./data/types";

export type PushPayload = {
  title: string;
  body: string;
  /** Kam sa má appka otvoriť po kliknutí na notifikáciu. */
  url?: string;
  /** Rovnaký tag prepíše predchádzajúcu notifikáciu namiesto pridania ďalšej. */
  tag?: string;
};

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:klub@example.sk";

export function pushConfigured() {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

/**
 * Push služby prehliadačov: Chrome/Edge/Opera (Google), Firefox, Safari, staršie Edge (Windows).
 * Server posiela na adresu odberu požiadavku, preto prijímame len tieto — inak by
 * prihlásený používateľ mohol server poslať na ľubovoľnú adresu (SSRF).
 */
const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

let configured = false;
function ensureConfigured() {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

/**
 * Rozpošle notifikáciu na všetky uložené zariadenia.
 * Zariadenia, ktoré push služba označí za neplatné (404/410), rovno zmažeme —
 * inak by sa zoznam odberov postupne zaplnil mŕtvymi záznamami.
 */
export async function sendPush(repo: Repo, payload: PushPayload) {
  if (!ensureConfigured()) return { sent: 0, removed: 0, skipped: true as const };

  const subscriptions = (await repo.listPushSubscriptions()).filter((subscription) =>
    isAllowedPushEndpoint(subscription.endpoint),
  );
  const body = JSON.stringify(payload);

  let sent = 0;
  let removed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await repo.deletePushSubscription(subscription.endpoint);
          removed += 1;
        }
        // Ostatné chyby (výpadok push služby) ignorujeme — notifikácia nesmie
        // zhodiť akciu, ktorá ju vyvolala.
      }
    }),
  );

  return { sent, removed, skipped: false as const };
}

/** Notifikácia sa nikdy nesmie stať dôvodom, prečo zlyhá import alebo uloženie. */
export async function sendPushSafely(repo: Repo, payload: PushPayload) {
  try {
    return await sendPush(repo, payload);
  } catch {
    return { sent: 0, removed: 0, skipped: true as const };
  }
}
