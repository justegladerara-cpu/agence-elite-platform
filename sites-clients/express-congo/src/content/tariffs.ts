/**
 * Grille tarifaire officielle d’Express Congo, transcrite du PDF publié sur
 * expresscongo.fr (wp-content/uploads/2026/09/grille-tarifaire.pdf) et
 * transmis par le client le 9 octobre 2026. Prix en euros TTC.
 * Une seule source : la page Tarifs, l’estimateur et les propositions la lisent.
 */
export const tariffSource = {
  label: "Grille tarifaire Express Congo",
  receivedAt: "2026-10-09",
  pdf: "/documents/grille-tarifaire-express-congo.pdf",
  sha256: "c403eba4f015f45f99dc4567d3cb780ed63de7ee9c72141b729b92c5e3c4c9f7",
};

export type TariffLine = {
  key: string;
  label: string;
  /** Prix en centimes d’euro TTC ; null = sur devis. */
  priceMinor: number | null;
  unit: "unite" | "kg" | "m3" | "dossier";
};
export type TariffGroup = {
  title: string;
  unitLabel: string;
  lines: TariffLine[];
  note?: string;
};
export type TariffSection = {
  service: "aerien" | "maritime" | "conteneur";
  title: string;
  subtitle: string;
  groups: TariffGroup[];
};

export const tariffs: TariffSection[] = [
  {
    service: "aerien",
    title: "Fret aérien",
    subtitle: "Fret avec douane",
    groups: [
      {
        title: "Messagerie et colis en express",
        unitLabel: "Prix € / unité TTC",
        lines: [
          {
            key: "air-courrier",
            label: "Courrier",
            priceMinor: 1000,
            unit: "unite",
          },
          {
            key: "air-telephone",
            label: "Téléphone",
            priceMinor: 1000,
            unit: "unite",
          },
        ],
      },
      {
        title: "Carton ou palette",
        unitLabel: "Prix € / kg TTC",
        lines: [
          {
            key: "air-effets",
            label: "Effets personnels",
            priceMinor: 1300,
            unit: "kg",
          },
          {
            key: "air-electronique",
            label: "Électronique et électroménager",
            priceMinor: 1300,
            unit: "kg",
          },
          {
            key: "air-marchandise",
            label: "Marchandise",
            priceMinor: 1300,
            unit: "kg",
          },
          {
            key: "air-pieces",
            label: "Pièces détachées",
            priceMinor: 1300,
            unit: "kg",
          },
        ],
      },
      {
        title: "Fret sans douane de 20 kg et plus, à dédouaner à l’aéroport",
        unitLabel: "Prix € / kg",
        lines: [
          {
            key: "air-sd-20",
            label: "De 20 à 99 kg",
            priceMinor: null,
            unit: "kg",
          },
          {
            key: "air-sd-100",
            label: "De 100 à 199 kg",
            priceMinor: null,
            unit: "kg",
          },
          {
            key: "air-sd-200",
            label: "200 kg et plus",
            priceMinor: null,
            unit: "kg",
          },
          {
            key: "air-sd-dossier",
            label: "Frais de dossier",
            priceMinor: 9000,
            unit: "dossier",
          },
        ],
      },
    ],
  },
  {
    service: "maritime",
    title: "Fret maritime",
    subtitle: "Fret avec douane",
    groups: [
      {
        title: "Groupage",
        unitLabel: "Prix €",
        lines: [
          { key: "mer-1m3", label: "1 m³", priceMinor: 80000, unit: "m3" },
          {
            key: "mer-plus",
            label: "Plus de 1 m³",
            priceMinor: null,
            unit: "m3",
          },
        ],
        // La grille titre la colonne « Prix € / Kg » mais la ligne porte sur un volume.
        note: "La grille indique 800 € pour un volume de 1 m³.",
      },
    ],
  },
  {
    service: "conteneur",
    title: "Conteneurs complets",
    subtitle: "Projets de chargement et fret sans douane",
    groups: [
      {
        title: "Sur devis",
        unitLabel: "",
        lines: [
          {
            key: "conteneur",
            label: "Conteneur complet",
            priceMinor: null,
            unit: "unite",
          },
          {
            key: "mer-sans-douane",
            label: "Fret sans douane",
            priceMinor: null,
            unit: "unite",
          },
        ],
      },
    ],
  },
];

const per: Record<TariffLine["unit"], string> = {
  unite: "l’unité",
  kg: "le kg",
  m3: "le m³",
  dossier: "le dossier",
};
/** Lignes chiffrées, utilisables comme modèles dans une proposition. */
export const pricedLines = tariffs.flatMap((s) =>
  s.groups.flatMap((g) =>
    g.lines
      .filter((l) => l.priceMinor !== null)
      .map((l) => ({
        key: l.key,
        unit: l.unit,
        priceMinor: l.priceMinor as number,
        label: `${s.title} — ${l.label}`,
        hint: `${euros(l.priceMinor as number)} ${per[l.unit]}`,
      })),
  ),
);

/** Affichage « à partir de » sur les cartes de service. */
export const fromPrice: Record<string, string> = {
  aerien: "Dès 10 € TTC",
  maritime: "800 € le m³",
  conteneur: "Sur devis",
};

export function euros(minor: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: minor % 100 ? 2 : 0,
  }).format(minor / 100);
}
