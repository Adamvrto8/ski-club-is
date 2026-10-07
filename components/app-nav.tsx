import Link from "next/link";
import { signOut } from "@/app/prihlasenie/actions";

type NavLink = { href: string; icon: string; label: string; adminOnly?: boolean };

const GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: "HLAVNÉ",
    links: [
      { href: "/prehlad", icon: "⌂", label: "Prehľad" },
      { href: "/clenovia", icon: "♟", label: "Členovia" },
      { href: "/kontakty", icon: "☏", label: "Kontakty" },
      { href: "/platby", icon: "▣", label: "Platby" },
      { href: "/potvrdenia", icon: "▤", label: "Potvrdenia", adminOnly: true },
    ],
  },
  {
    label: "KLUB",
    links: [
      { href: "/pozicovna", icon: "⚿", label: "Požičovňa" },
      { href: "/akcie", icon: "▧", label: "Akcie a výjazdy" },
      { href: "/dochadzka", icon: "▦", label: "Dochádzka" },
      { href: "/is-sportu", icon: "✓", label: "IS športu" },
      { href: "/nastavenia", icon: "⚙", label: "Nastavenia", adminOnly: true },
    ],
  },
  {
    label: "DÁTA",
    links: [
      { href: "/import", icon: "⇅", label: "Import z Excelu", adminOnly: true },
      { href: "/upomienky", icon: "✉", label: "Upomienky", adminOnly: true },
      { href: "/banka", icon: "⌁", label: "Bankové platby", adminOnly: true },
      { href: "/dve-percenta", icon: "%", label: "2 % dane", adminOnly: true },
      { href: "/sezony", icon: "◷", label: "Sezóny a archív" },
    ],
  },
  {
    label: "ÚČET",
    links: [{ href: "/ucet", icon: "☺", label: "Môj účet" }],
  },
];

/**
 * Vo vývojovom náhľade (`demo`) nie je žiadne prihlásenie, takže ani čo odhlásiť —
 * tlačidlo by poslalo na /prihlasenie a to hneď vráti späť na prehľad. Skryjeme ho.
 */
export function AppNav({ active, role, demo }: { active: string; role: "admin" | "coach"; demo: boolean }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Logo Ski Club IS" />
        <div>
          <strong>Demo Ski Club</strong>
          <small>{role === "admin" ? "Administrátor" : "Tréner"}</small>
        </div>
        {/*
          Na telefóne je odhlásenie tu, v hlavičke. Predtým sedelo pod navigáciou
          cez celú šírku a zaberalo najlepšie miesto na obrazovke hneď pod menu,
          hoci sa používa raz za čas. Na širokej obrazovke zostáva dole v paneli.
        */}
        {!demo && (
          <form action={signOut} className="brand-signout">
            <button type="submit" className="secondary" title="Odhlásiť sa">
              Odhlásiť
            </button>
          </form>
        )}
      </div>

      <nav aria-label="Hlavná navigácia">
        {GROUPS.map((group) => {
          const links = group.links.filter((link) => !link.adminOnly || role === "admin");
          if (!links.length) return null;
          return (
            <section className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {links.map((link) => (
                <Link key={link.href} href={link.href} className={link.href === active ? "active" : ""}>
                  <span aria-hidden="true">{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </section>
          );
        })}
      </nav>

      {!demo && (
        <form action={signOut} className="sidebar-footer">
          <button type="submit" className="secondary">Odhlásiť sa</button>
        </form>
      )}
    </aside>
  );
}
