"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/*
 * Recherche rapide façon application : Ctrl+K, ⌘K ou « / » ouvre une liste
 * filtrable des pages et des actions. Flèches, Entrée, Échap.
 */
type Item = {
  label: string;
  hint: string;
  href: string;
  group: string;
  words?: string;
};
const ITEMS: Item[] = [
  {
    group: "Envoyer",
    label: "Demander un devis",
    hint: "En 5 étapes, sans compte",
    href: "/devis/",
  },
  {
    group: "Envoyer",
    label: "Fret aérien",
    hint: "Courriers, colis, 13 € le kilo",
    href: "/services/fret-aerien/",
    words: "avion",
  },
  {
    group: "Envoyer",
    label: "Fret maritime",
    hint: "Groupage, 800 € pour 1 m³",
    href: "/services/fret-maritime/",
    words: "bateau mer",
  },
  {
    group: "Envoyer",
    label: "Conteneur complet",
    hint: "Projet de chargement",
    href: "/services/conteneurs-complets/",
  },
  {
    group: "Envoyer",
    label: "Tarifs",
    hint: "Grille et estimation",
    href: "/tarifs/",
    words: "prix grille",
  },
  {
    group: "Préparer",
    label: "Calculer le volume",
    hint: "Dimensions des cartons",
    href: "/prendre-les-mesures/",
    words: "mesure m3",
  },
  {
    group: "Préparer",
    label: "Emballage et documents",
    hint: "Avant le dépôt",
    href: "/emballage-et-documents/",
  },
  {
    group: "Préparer",
    label: "Marchandises réglementées",
    hint: "Ce qui est accepté",
    href: "/marchandises-reglementees/",
  },
  {
    group: "Suivre",
    label: "Suivre un envoi",
    hint: "Référence et code de suivi",
    href: "/suivi/",
    words: "tracking colis",
  },
  {
    group: "Suivre",
    label: "Espace client",
    hint: "Propositions et paiements",
    href: "/demo/",
    words: "compte connexion",
  },
  {
    group: "Contact",
    label: "Agence de Paris",
    hint: "67 bd de Belleville",
    href: "/agences/paris/",
  },
  {
    group: "Contact",
    label: "Agence de Brazzaville",
    hint: "Moungali",
    href: "/agences/brazzaville/",
  },
  {
    group: "Contact",
    label: "Agence de Pointe-Noire",
    hint: "Route de la Base, KM4",
    href: "/agences/pointe-noire/",
  },
  {
    group: "Contact",
    label: "Appeler Paris",
    hint: "+33 1 48 05 22 20",
    href: "tel:+33148052220",
    words: "telephone",
  },
  {
    group: "Contact",
    label: "Écrire sur WhatsApp",
    hint: "+33 6 21 93 32 98",
    href: "https://wa.me/33621933298",
    words: "message",
  },
  {
    group: "Aide",
    label: "Questions fréquentes",
    hint: "Douane, dates, suivi",
    href: "/faq/",
  },
  {
    group: "Aide",
    label: "Conditions générales",
    hint: "Responsabilité, paiement",
    href: "/cgv/",
  },
];
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.(
        "input, textarea, select, [contenteditable]",
      );
      if (
        (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
        (e.key === "/" && !typing)
      ) {
        e.preventDefault();
        opener.current = document.activeElement;
        setOpen(true);
      }
    };
    const fromButton = () => {
      opener.current = document.activeElement;
      setOpen(true);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("ec:recherche", fromButton);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("ec:recherche", fromButton);
    };
  }, []);
  useEffect(() => {
    if (open) {
      input.current?.focus();
      document.documentElement.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  const results = useMemo(() => {
    const t = fold(q.trim());
    const list = t
      ? ITEMS.filter((i) =>
          fold(`${i.label} ${i.hint} ${i.words ?? ""} ${i.group}`).includes(t),
        )
      : ITEMS;
    // Une référence d’expédition tapée directement : proposer de la suivre.
    const looksLikeRef = /^[A-Z0-9-]{8,}$/i.test(q.trim());
    return looksLikeRef
      ? [
          {
            group: "Suivre",
            label: `Suivre ${q.trim().toUpperCase()}`,
            hint: "Ouvrir le suivi avec cette référence",
            href: `/suivi/?ref=${encodeURIComponent(q.trim())}`,
          },
          ...list,
        ]
      : list;
  }, [q]);

  const go = (item: Item) => {
    setOpen(false);
    setQ("");
    if (item.href.startsWith("http") || item.href.startsWith("tel:"))
      window.location.href = item.href;
    else router.push(item.href);
  };

  if (!open) return null;
  return (
    <div
      className="cp-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        className="cp"
        role="dialog"
        aria-modal="true"
        aria-label="Recherche rapide"
      >
        <div className="cp-search">
          <svg viewBox="0 0 24 24" aria-hidden width="20" height="20">
            <circle
              cx="11"
              cy="11"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M20 20l-4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && results[index]) go(results[index]);
            }}
            placeholder="Chercher une page, une agence, une référence…"
            aria-label="Rechercher"
            aria-controls="cp-list"
            aria-activedescendant={results[index] ? `cp-${index}` : undefined}
            role="combobox"
            aria-expanded="true"
          />
          <kbd>Échap</kbd>
        </div>
        <ul className="cp-list" id="cp-list" role="listbox">
          {results.length ? (
            results.map((r, i) => (
              <li
                key={r.href + r.label}
                id={`cp-${i}`}
                role="option"
                aria-selected={i === index}
                className={i === index ? "on" : ""}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(r)}
              >
                <span className="cp-group">{r.group}</span>
                <strong>{r.label}</strong>
                <span className="cp-hint">{r.hint}</span>
              </li>
            ))
          ) : (
            <li className="cp-empty">
              Aucun résultat. Essayez « devis », « tarifs » ou le nom d’une
              ville.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

/** Bouton d’ouverture (en-tête) : envoie un évènement capté par la palette. */
export function SearchButton() {
  return (
    <button
      type="button"
      className="cp-open"
      onClick={() => window.dispatchEvent(new Event("ec:recherche"))}
      aria-label="Recherche rapide (Ctrl+K)"
    >
      <svg viewBox="0 0 24 24" aria-hidden width="18" height="18">
        <circle
          cx="11"
          cy="11"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M20 20l-4-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span>Rechercher</span>
      <kbd>Ctrl K</kbd>
    </button>
  );
}
