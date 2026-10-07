import { type ReactNode } from "react";
import { AppNav } from "./app-nav";
import { PwaSetup } from "./pwa-setup";

export function AppShell({
  active,
  role,
  demo,
  children,
}: {
  active: string;
  role: "admin" | "coach";
  demo: boolean;
  children: ReactNode;
}) {
  return (
    <div className="app-layout">
      <AppNav active={active} role={role} demo={demo} />
      <main className="app-content">
        <PwaSetup />
        {demo && (
          <p className="demo-banner">
            Vývojový náhľad — dáta sa ukladajú lokálne do súboru <code>data/local-store.json</code>. Pred ostrým
            nasadením vypni <code>DEMO_MODE</code>.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
