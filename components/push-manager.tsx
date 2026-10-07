"use client";

import { useEffect, useState } from "react";
import {
  registerPushSubscription,
  removePushSubscription,
  sendTestNotification,
} from "@/app/notifikacie/actions";

/** VAPID kľúč treba push službe podať ako bajty, nie ako base64url text. */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

type State = "checking" | "unsupported" | "insecure" | "needs-install" | "denied" | "off" | "on";

export function PushManager({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function detect() {
      // Service worker aj push fungujú len na HTTPS (localhost je výnimka).
      if (!window.isSecureContext) return setState("insecure");
      if (!("serviceWorker" in navigator)) return setState("unsupported");

      if (!("PushManager" in window)) {
        // iPhone podporuje push až po pridaní na plochu.
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        return setState(isIos ? "needs-install" : "unsupported");
      }

      if (Notification.permission === "denied") return setState("denied");

      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setState(subscription ? "on" : "off");
    }
    detect().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        setMessage("Notifikácie neboli povolené.");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const result = await registerPushSubscription({
        endpoint: json.endpoint ?? "",
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        userAgent: navigator.userAgent,
      });

      setMessage(result.message);
      setState(result.ok ? "on" : "off");
    } catch (error) {
      setMessage(`Nepodarilo sa zapnúť notifikácie: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
      setMessage("Notifikácie sú pre toto zariadenie vypnuté.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const result = await sendTestNotification();
    setMessage(result.message);
    setBusy(false);
  }

  if (!vapidPublicKey) {
    return (
      <p className="muted">
        Push notifikácie nie sú nastavené — v prostredí chýba <code>VAPID_PUBLIC_KEY</code>.
      </p>
    );
  }

  return (
    <div className="push-panel">
      {state === "checking" && <p className="muted">Zisťujem podporu notifikácií…</p>}

      {state === "insecure" && (
        <p className="notice error" role="alert">
          Notifikácie potrebujú zabezpečené pripojenie (HTTPS). Cez adresu typu <code>http://192.168…</code> ich
          prehliadač nedovolí. Funguje to po nasadení na server s HTTPS.
        </p>
      )}

      {state === "unsupported" && <p className="muted">Tento prehliadač push notifikácie nepodporuje.</p>}

      {state === "needs-install" && (
        <p className="notice">
          Na iPhone fungujú notifikácie až vtedy, keď appku pridáš na plochu: v Safari ťukni na <strong>Zdieľať</strong>,
          potom <strong>Pridať na plochu</strong>. Otvor ju odtiaľ a vráť sa sem.
        </p>
      )}

      {state === "denied" && (
        <p className="notice error" role="alert">
          Notifikácie sú zablokované v nastaveniach prehliadača. Povoľ ich pre túto stránku a načítaj ju znova.
        </p>
      )}

      {(state === "off" || state === "on") && (
        <div className="push-actions">
          <p className="muted">
            Stav: <strong>{state === "on" ? "zapnuté na tomto zariadení" : "vypnuté"}</strong>
          </p>
          {state === "off" ? (
            <button type="button" onClick={enable} disabled={busy}>
              {busy ? "Zapínam…" : "Zapnúť notifikácie"}
            </button>
          ) : (
            <>
              <button type="button" className="secondary" onClick={test} disabled={busy}>
                Poslať skúšobnú
              </button>
              <button type="button" className="danger-button" onClick={disable} disabled={busy}>
                Vypnúť
              </button>
            </>
          )}
        </div>
      )}

      {message && <p className="notice">{message}</p>}
    </div>
  );
}
