"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* Barre d’onglets mobile, comme dans une application. Icônes dessinées ici. */
const icon = {
  home: "M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  tarifs: "M5 4h10l4 4v12H5zM9 11h6M9 15h6M9 7h3",
  suivi:
    "M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  devis: "M12 5v14M5 12h14",
  contact: "M5 5h14v10H9l-4 4z",
};
const TABS = [
  { href: "/", label: "Accueil", d: icon.home },
  { href: "/tarifs/", label: "Tarifs", d: icon.tarifs },
  { href: "/devis/", label: "Devis", d: icon.devis, main: true },
  { href: "/suivi/", label: "Suivi", d: icon.suivi },
  { href: "/contact/", label: "Contact", d: icon.contact },
];

export function TabBar() {
  const path = usePathname() || "/";
  return (
    <nav className="tabbar" aria-label="Navigation rapide">
      {TABS.map((t) => {
        const current =
          t.href === "/"
            ? path === "/"
            : path.startsWith(t.href.replace(/\/$/, ""));
        return (
          <Link
            key={t.href}
            href={t.href}
            className={t.main ? "tab-main" : undefined}
            aria-current={current ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path
                d={t.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={t.main ? 2.4 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
