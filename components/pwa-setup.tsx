"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Registruje service worker a ponúka inštaláciu na plochu.
 * Bez service workera Android neponúkne „Inštalovať appku“ a nefungujú notifikácie.
 */
export function PwaSetup() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registrácia zlyhá napr. na nezabezpečenom pripojení — appka musí bežať ďalej.
    });

    function onPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
      // Ponuku nezobrazujeme, ak ju používateľ už raz odmietol.
      try {
        setHidden(localStorage.getItem("install-dismissed") === "1");
      } catch {
        setHidden(false);
      }
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!installEvent || hidden) return null;

  return (
    <div className="install-banner">
      <span>Pridaj si Ski Club IS na plochu telefónu — otvára sa potom ako bežná appka.</span>
      <button
        type="button"
        onClick={async () => {
          await installEvent.prompt();
          await installEvent.userChoice;
          setInstallEvent(null);
        }}
      >
        Inštalovať
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem("install-dismissed", "1");
          } catch {
            // Súkromné okno bez úložiska — ponuka sa objaví nabudúce, nič sa nerozbije.
          }
        }}
      >
        Teraz nie
      </button>
    </div>
  );
}
