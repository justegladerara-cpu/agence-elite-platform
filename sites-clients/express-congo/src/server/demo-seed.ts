import { randomUUID, randomBytes } from "node:crypto";
import { db } from "./database";
import { isDemo } from "@/config";
import { volume } from "@/domain/measurements";

/**
 * Jeu de démonstration complet, entièrement fictif (noms, téléphones,
 * adresses électroniques en example.invalid, montants marqués « démo » quand
 * ils ne viennent pas de la grille). Les dates sont calculées à partir du
 * moment du chargement pour que l’historique paraisse vivant.
 *
 * Chargé automatiquement une seule fois par version (verrou dans `settings`),
 * ou à la demande par l’administrateur (« Réinitialiser la démonstration »).
 * Refusé hors démonstration. Ne touche ni aux comptes créés depuis la
 * plateforme, ni aux réglages (accès, paiements, WhatsApp).
 */
export const DATASET_VERSION = "2026-10-11.1";

export type DemoProfile = {
  id: string;
  name: string;
  phone: string;
  city: string;
  whatsapp: boolean;
};
/** Personnes fictives : équipe et clients. */
export const demoProfiles: DemoProfile[] = [
  {
    id: "admin-demo",
    name: "Gérante Express Congo",
    phone: "+33700000001",
    city: "Paris",
    whatsapp: true,
  },
  {
    id: "agent-paris",
    name: "Patrick Mavoungou",
    phone: "+33700000002",
    city: "Paris",
    whatsapp: true,
  },
  {
    id: "agent-brazzaville",
    name: "Grâce Ngoma",
    phone: "+242060000002",
    city: "Brazzaville",
    whatsapp: true,
  },
  {
    id: "agent-pointe-noire",
    name: "Rodrigue Tsiba",
    phone: "+242060000003",
    city: "Pointe-Noire",
    whatsapp: true,
  },
  {
    id: "finance-demo",
    name: "Sandrine Loubaki",
    phone: "+33700000004",
    city: "Paris",
    whatsapp: false,
  },
  {
    id: "client-demo-a",
    name: "Mireille Bouanga",
    phone: "+33700000010",
    city: "Montreuil",
    whatsapp: true,
  },
  {
    id: "client-demo-b",
    name: "Loango Distribution (société fictive)",
    phone: "+33700000011",
    city: "Saint-Denis",
    whatsapp: true,
  },
  {
    id: "client-demo-c",
    name: "Jean-Pierre Malonga",
    phone: "+33700000012",
    city: "Créteil",
    whatsapp: true,
  },
  {
    id: "client-demo-d",
    name: "Aïcha Mbemba",
    phone: "+33700000013",
    city: "Paris 19e",
    whatsapp: true,
  },
  {
    id: "client-demo-e",
    name: "Famille Ondongo",
    phone: "+33700000014",
    city: "Évry",
    whatsapp: false,
  },
  {
    id: "client-demo-f",
    name: "Christelle Ibara",
    phone: "+33700000015",
    city: "Bobigny",
    whatsapp: true,
  },
  {
    id: "client-demo-g",
    name: "Boutique Mwana Mode (fictive)",
    phone: "+33700000016",
    city: "Paris 18e",
    whatsapp: true,
  },
  {
    id: "client-demo-h",
    name: "Serge Nkodia",
    phone: "+33700000017",
    city: "Argenteuil",
    whatsapp: false,
  },
];
/** Clients sans connexion publique : ils portent seulement des dossiers. */
const extraClients = ["c", "d", "e", "f", "g", "h"].map((k) => ({
  id: "client-demo-" + k,
  email: `client-${k}@example.invalid`,
}));

const ENTITY_ACTIONS =
  "action LIKE 'quote.%' OR action LIKE 'shipment.%' OR action LIKE 'parcel.%' OR action LIKE 'event.%' OR action LIKE 'departure.%' OR action LIKE 'proposal.%' OR action LIKE 'payment.%' OR action LIKE 'ticket.%' OR action LIKE 'document.%' OR action LIKE 'message.%' OR action LIKE 'demo.%'";

/* Générateur pseudo-aléatoire déterministe : même jeu à chaque chargement. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Stmt = [string, unknown[]];
type Plan = {
  owner: string;
  service: "aerien" | "maritime" | "conteneur";
  dest: "Brazzaville" | "Pointe-Noire";
  goods: string;
  parcels: [number, number, number, number, number][]; // L, l, h, kg, quantité
  reach: string;
  departure?: string;
  live?: boolean;
  incident?: string;
  proposal?: "envoyee" | "acceptee" | "payee" | "partielle" | "aucune";
  remeasure?: boolean;
};

const PATH = [
  "recu-en-agence",
  "controle",
  "en-attente-de-depart",
  "expedie",
  "arrive",
  "formalites-en-cours",
  "disponible-au-retrait",
  "remis",
];
export function locationFor(status: string, service: string, dest: string) {
  const arrival = "Agence de " + dest;
  return (
    {
      cree: "Agence de Paris",
      "recu-en-agence": "Agence de Paris",
      controle: "Agence de Paris",
      "en-attente-de-depart": "Agence de Paris",
      expedie:
        service === "aerien"
          ? "En vol vers " + dest
          : "En mer vers Pointe-Noire",
      arrive: arrival,
      "formalites-en-cours": arrival,
      "disponible-au-retrait": arrival,
      remis: arrival,
      incident: "Agence de Paris",
    } as Record<string, string>
  )[status];
}
export const PUBLIC_PATH = PATH;

const H = 3600000,
  D = 24 * H;

/**
 * Regroupe les insertions identiques en insertions multi-lignes (100
 * paramètres au plus par requête, limite D1) : quelques dizaines de requêtes
 * au lieu de plusieurs centaines. L’ordre de première apparition est gardé.
 */
export function compact(statements: Stmt[]): Stmt[] {
  const groups = new Map<string, unknown[][]>();
  const order: (string | Stmt)[] = [];
  for (const st of statements) {
    const m =
      /^(INSERT (?:OR IGNORE )?INTO \w+(?:\([^)]*\))? VALUES)(\([^)]*\))(.*)$/.exec(
        st[0],
      );
    if (!m) {
      order.push(st);
      continue;
    }
    if (!groups.has(st[0])) {
      groups.set(st[0], []);
      order.push(st[0]);
    }
    groups.get(st[0])!.push(st[1]);
  }
  const result: Stmt[] = [];
  for (const item of order) {
    if (typeof item !== "string") {
      result.push(item);
      continue;
    }
    const m =
      /^(INSERT (?:OR IGNORE )?INTO \w+(?:\([^)]*\))? VALUES)(\([^)]*\))(.*)$/.exec(
        item,
      )!;
    const rows = groups.get(item)!;
    const per = Math.max(1, Math.floor(100 / Math.max(1, rows[0].length)));
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per);
      result.push([
        m[1] + " " + chunk.map(() => m[2]).join(",") + m[3],
        chunk.flat(),
      ]);
    }
  }
  return result;
}

export async function datasetLoaded() {
  const row = await (
    await db()
  ).get<{ value: string }>(
    "SELECT value FROM settings WHERE key='demo_dataset'",
  );
  return row?.value ?? null;
}

/** Charge le jeu si sa version n’est pas encore en base. */
export async function ensureDemoDataset() {
  if (!isDemo()) return false;
  const database = await db();
  const current = await datasetLoaded();
  if (current === DATASET_VERSION) return false;
  // Verrou : une seule requête gagne le droit de charger cette version.
  const lock = await database.run(
    "INSERT INTO settings(key,value,updated_at,updated_by) VALUES('demo_dataset',?,?,'systeme') ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE settings.value<>excluded.value",
    DATASET_VERSION,
    new Date().toISOString(),
  );
  if (!lock.changes) return false;
  try {
    await loadDataset("systeme");
  } catch (e) {
    // Échec : la version n’est pas marquée, le prochain passage réessaie.
    await database.run("DELETE FROM settings WHERE key='demo_dataset'");
    throw e;
  }
  return true;
}

/** Remplace toutes les données métier de démonstration par le jeu complet. */
export async function loadDataset(actorId: string) {
  if (!isDemo()) throw new Error("DEMO_DISABLED");
  const database = await db();
  const now = Date.now();
  const iso = (t: number) => new Date(Math.min(t, now - 60000)).toISOString();
  const r = rng(20261011);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const code = (n = 4) =>
    Array.from({ length: n }, () => CODE[Math.floor(r() * CODE.length)]).join(
      "",
    );
  const yymm = (t: number) =>
    new Date(t).toISOString().slice(2, 7).replace("-", "");

  const out: Stmt[] = [];
  const audit = (
    actor: string,
    action: string,
    id: string,
    at: number,
    detail: unknown = {},
  ) =>
    out.push([
      "INSERT INTO audit(actor,action,object_id,detail,created_at) VALUES(?,?,?,?,?)",
      [actor, action, id, JSON.stringify(detail), iso(at)],
    ]);
  const entity = (
    kind: string,
    owner: string,
    agency: string,
    payload: Record<string, unknown>,
    at: number,
    actor = "agent-paris",
  ) => {
    const id = randomUUID();
    out.push([
      "INSERT INTO entities VALUES(?,?,?,?,1,?,?)",
      [id, kind, owner, agency, JSON.stringify(payload), iso(at)],
    ]);
    audit(actor, kind + ".created", id, at, { kind });
    return id;
  };

  /* ----- Comptes et profils (les comptes existants sont conservés) ----- */
  // Empreinte aléatoire qu’aucun mot de passe ne reproduit : ces clients
  // portent des dossiers mais ne se connectent pas.
  const accounts: Stmt[] = extraClients.map((c) => [
    "INSERT OR IGNORE INTO demo_users VALUES(?,?,?,?,'client','paris',NULL,1)",
    [c.id, c.email, randomBytes(64).toString("hex"), "ec-demo-" + c.id],
  ]);
  const profiles: Stmt[] = demoProfiles.map((p) => [
    "INSERT INTO profiles(user_id,name,phone,city,whatsapp) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,phone=excluded.phone,city=excluded.city,whatsapp=excluded.whatsapp",
    [p.id, p.name, p.phone, p.city, p.whatsapp ? 1 : 0],
  ]);

  /* ----- Départs ----- */
  const deps: Record<
    string,
    {
      id: string;
      at: number;
      mode: string;
      confirmed: boolean;
      shipments: string[];
    }
  > = {};
  const departure = (
    key: string,
    mode: string,
    offset: number,
    confirmed: boolean,
  ) => {
    const at = now + offset;
    deps[key] = { id: randomUUID(), at, mode, confirmed, shipments: [] };
  };
  departure("AIR-1", "aerien", -24 * D, true);
  departure("AIR-2", "aerien", -11 * D, true);
  departure("AIR-3", "aerien", -7 * H, true);
  departure("AIR-4", "aerien", 3 * D + 5 * H, true);
  departure("AIR-5", "aerien", 10 * D + 5 * H, false);
  departure("SEA-1", "maritime", -46 * D, true);
  departure("SEA-2", "maritime", -16 * D, true);
  departure("SEA-3", "maritime", 8 * D, false);

  /* ----- Dossiers ----- */
  const A = "client-demo-a",
    B = "client-demo-b",
    C = "client-demo-c",
    Dd = "client-demo-d",
    E = "client-demo-e",
    F = "client-demo-f",
    G = "client-demo-g",
    Hh = "client-demo-h";
  const plan: Plan[] = [
    // Mireille Bouanga : la cliente de démonstration, un dossier à chaque étape.
    {
      owner: A,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Vêtements et chaussures pour la famille",
      parcels: [[60, 40, 40, 18, 2]],
      reach: "remis",
      departure: "AIR-1",
      proposal: "payee",
    },
    {
      owner: A,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Téléphone et accessoires",
      parcels: [[30, 20, 15, 3, 1]],
      reach: "expedie",
      departure: "AIR-3",
      proposal: "payee",
      live: true,
    },
    {
      owner: A,
      service: "maritime",
      dest: "Pointe-Noire",
      goods: "Électroménager emballé (micro-ondes, mixeur)",
      parcels: [
        [80, 60, 60, 34, 1],
        [50, 40, 40, 12, 2],
      ],
      reach: "disponible-au-retrait",
      departure: "SEA-1",
      proposal: "partielle",
    },
    {
      owner: A,
      service: "aerien",
      dest: "Pointe-Noire",
      goods: "Matériel informatique",
      parcels: [[55, 45, 35, 14, 1]],
      reach: "incident",
      incident:
        "Emballage abîmé à la réception : photos envoyées, accord du client attendu pour reconditionner.",
      proposal: "acceptee",
    },
    {
      owner: A,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Produits d’épicerie fine (non périssables)",
      parcels: [[50, 40, 30, 21, 1]],
      reach: "en-attente-de-depart",
      departure: "AIR-4",
      proposal: "envoyee",
    },
    {
      owner: A,
      service: "maritime",
      dest: "Pointe-Noire",
      goods: "Mobilier démonté",
      parcels: [[120, 80, 60, 55, 1]],
      reach: "controle",
      proposal: "aucune",
      remeasure: true,
    },
    // Loango Distribution : client professionnel régulier.
    {
      owner: B,
      service: "maritime",
      dest: "Pointe-Noire",
      goods: "Palettes de fournitures de bureau",
      parcels: [[120, 80, 100, 180, 2]],
      reach: "remis",
      departure: "SEA-1",
      proposal: "payee",
    },
    {
      owner: B,
      service: "maritime",
      dest: "Pointe-Noire",
      goods: "Cartons de marchandise textile",
      parcels: [[60, 40, 40, 16, 6]],
      reach: "expedie",
      departure: "SEA-2",
      proposal: "payee",
    },
    {
      owner: B,
      service: "aerien",
      dest: "Pointe-Noire",
      goods: "Pièces détachées automobiles",
      parcels: [[50, 40, 30, 24, 2]],
      reach: "formalites-en-cours",
      departure: "AIR-2",
      proposal: "payee",
    },
    {
      owner: B,
      service: "conteneur",
      dest: "Pointe-Noire",
      goods: "Projet de conteneur complet : matériel de boutique",
      parcels: [],
      reach: "cree",
      proposal: "envoyee",
    },
    {
      owner: B,
      service: "maritime",
      dest: "Pointe-Noire",
      goods: "Cartons de vaisselle",
      parcels: [[50, 50, 50, 22, 4]],
      reach: "en-attente-de-depart",
      departure: "SEA-3",
      proposal: "acceptee",
    },
    // Autres clients.
    {
      owner: C,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Documents et courriers",
      parcels: [[35, 25, 5, 1, 1]],
      reach: "remis",
      departure: "AIR-2",
      proposal: "payee",
    },
    {
      owner: C,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Cadeaux de mariage",
      parcels: [[60, 40, 40, 19, 1]],
      reach: "arrive",
      departure: "AIR-2",
      proposal: "payee",
    },
    {
      owner: Dd,
      service: "aerien",
      dest: "Pointe-Noire",
      goods: "Cosmétiques et produits d’hygiène",
      parcels: [[45, 35, 35, 13, 2]],
      reach: "expedie",
      departure: "AIR-3",
      proposal: "payee",
    },
    {
      owner: Dd,
      service: "maritime",
      dest: "Pointe-Noire",
      goods: "Cartons de livres scolaires",
      parcels: [[45, 35, 35, 18, 5]],
      reach: "expedie",
      departure: "SEA-2",
      proposal: "partielle",
    },
    {
      owner: E,
      service: "maritime",
      dest: "Pointe-Noire",
      goods: "Effets personnels de déménagement",
      parcels: [[100, 60, 80, 60, 3]],
      reach: "disponible-au-retrait",
      departure: "SEA-1",
      proposal: "payee",
    },
    {
      owner: E,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Médicaments sur ordonnance (liste fournie)",
      parcels: [[30, 30, 20, 4, 1]],
      reach: "recu-en-agence",
      proposal: "envoyee",
    },
    {
      owner: F,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Tissus et pagnes",
      parcels: [[60, 40, 30, 15, 2]],
      reach: "remis",
      departure: "AIR-1",
      proposal: "payee",
    },
    {
      owner: F,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Ordinateur portable",
      parcels: [[45, 35, 12, 4, 1]],
      reach: "en-attente-de-depart",
      departure: "AIR-4",
      proposal: "payee",
    },
    {
      owner: G,
      service: "aerien",
      dest: "Pointe-Noire",
      goods: "Prêt-à-porter pour la boutique",
      parcels: [[60, 40, 40, 20, 4]],
      reach: "disponible-au-retrait",
      departure: "AIR-2",
      proposal: "payee",
    },
    {
      owner: G,
      service: "aerien",
      dest: "Pointe-Noire",
      goods: "Chaussures et accessoires de mode",
      parcels: [[60, 40, 40, 17, 3]],
      reach: "expedie",
      departure: "AIR-3",
      proposal: "payee",
    },
    {
      owner: G,
      service: "maritime",
      dest: "Pointe-Noire",
      goods: "Présentoirs et mannequins",
      parcels: [[120, 80, 120, 70, 1]],
      reach: "recu-en-agence",
      proposal: "aucune",
    },
    {
      owner: Hh,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Pièces de groupe électrogène",
      parcels: [[60, 50, 40, 28, 1]],
      reach: "remis",
      departure: "AIR-1",
      proposal: "payee",
    },
    {
      owner: Hh,
      service: "maritime",
      dest: "Pointe-Noire",
      goods: "Outillage de chantier",
      parcels: [[80, 60, 50, 45, 2]],
      reach: "en-attente-de-depart",
      departure: "SEA-3",
      proposal: "envoyee",
    },
    {
      owner: C,
      service: "conteneur",
      dest: "Pointe-Noire",
      goods: "Projet de conteneur : véhicule et effets personnels",
      parcels: [],
      reach: "cree",
      proposal: "aucune",
    },
    {
      owner: F,
      service: "aerien",
      dest: "Brazzaville",
      goods: "Courrier administratif",
      parcels: [[35, 25, 4, 1, 1]],
      reach: "cree",
      proposal: "aucune",
    },
  ];

  const shipments: {
    id: string;
    plan: Plan;
    reference: string;
    status: string;
    created: number;
  }[] = [];
  const parcelsOf = new Map<
    string,
    { id: string; kg: number; volume: number }[]
  >();
  const staffAt = (dest: string, status: string) =>
    [
      "arrive",
      "formalites-en-cours",
      "disponible-au-retrait",
      "remis",
    ].includes(status)
      ? dest === "Brazzaville"
        ? "agent-brazzaville"
        : "agent-pointe-noire"
      : "agent-paris";

  for (const p of plan) {
    const dep = p.departure ? deps[p.departure] : null;
    // Dates : l’ouverture précède le dépôt, le dépôt précède le départ.
    const stage = PATH.indexOf(p.reach);
    const created = dep
      ? dep.at - (3 + r() * 6) * D
      : now - (p.reach === "cree" ? 1 + r() * 3 : 2 + r() * 5) * D;
    const times: Record<string, number> = {};
    let t = created + (6 + r() * 30) * H;
    const transit = p.service === "aerien" ? 9 * H : 24 * D;
    for (const s of PATH) {
      if (s === "expedie" && dep) t = dep.at;
      else if (s === "arrive") t = (dep?.at ?? t) + transit + r() * 6 * H;
      else if (s === "controle") t += (2 + r() * 20) * H;
      else if (s === "en-attente-de-depart") t += (2 + r() * 10) * H;
      else if (s === "formalites-en-cours") t += (8 + r() * 30) * H;
      else if (s === "disponible-au-retrait") t += (12 + r() * 60) * H;
      else if (s === "remis") t += (10 + r() * 70) * H;
      times[s] = t;
    }
    const steps =
      p.reach === "incident"
        ? ["recu-en-agence", "controle", "incident"]
        : p.reach === "cree"
          ? []
          : PATH.slice(0, stage + 1);
    if (p.reach === "incident") {
      times.incident = times.controle + 3 * H;
    }
    const reference = `EC-${yymm(created)}-${code()}`;
    const agency = "paris";
    const sid = randomUUID();
    shipments.push({ id: sid, plan: p, reference, status: p.reach, created });
    const shipment = {
      service: p.service,
      route: "FR-CG",
      destination: p.dest,
      status: p.reach,
      reference,
      departure:
        dep && stage >= PATH.indexOf("en-attente-de-depart") ? dep.id : null,
      description: p.goods,
      ...(p.live ? { demoLive: true } : {}),
    };
    if (shipment.departure) dep!.shipments.push(sid);
    out.push([
      "INSERT INTO entities VALUES(?,?,?,?,1,?,?)",
      [
        sid,
        "shipment",
        p.owner,
        agency,
        JSON.stringify(shipment),
        iso(created),
      ],
    ]);
    audit("agent-paris", "shipment.created", sid, created, {
      kind: "shipment",
    });

    // Colis : déclarés puis mesurés au comptoir.
    const list: { id: string; kg: number; volume: number }[] = [];
    if (steps.length)
      for (const [L, l, h, kg, q] of p.parcels) {
        const declared = {
          length: String(L),
          width: String(l),
          height: String(h),
          weight: String(kg),
          quantity: String(q),
          unit: "cm" as const,
        };
        const controlled = p.remeasure
          ? { ...declared, length: String(L + 5), weight: String(kg + 6) }
          : declared;
        const pid = randomUUID();
        out.push([
          "INSERT INTO entities VALUES(?,?,?,?,1,?,?)",
          [
            pid,
            "parcel",
            p.owner,
            agency,
            JSON.stringify({
              reference: `COL-${yymm(created)}-${code(5)}`,
              shipmentId: sid,
              description: p.goods,
              declared,
              controlled,
              reserves:
                p.reach === "incident"
                  ? "Carton enfoncé sur un angle"
                  : "Aucune réserve",
              priceReviewRequired: !!p.remeasure,
              priceReviewApproved: false,
            }),
            iso(times["recu-en-agence"]),
          ],
        ]);
        out.push(["INSERT OR IGNORE INTO assignments VALUES(?,?)", [pid, sid]]);
        audit("agent-paris", "parcel.created", pid, times["recu-en-agence"], {
          kind: "parcel",
        });
        const c = p.remeasure ? controlled : declared;
        list.push({
          id: pid,
          kg: Number(c.weight) * q,
          volume: Number(volume([{ ...c }]) || 0),
        });
      }
    parcelsOf.set(sid, list);

    // Événements publics de suivi.
    for (const s of steps) {
      const at = times[s];
      entity(
        "event",
        p.owner,
        [
          "arrive",
          "formalites-en-cours",
          "disponible-au-retrait",
          "remis",
        ].includes(s)
          ? agency
          : agency,
        {
          shipmentId: sid,
          status: s,
          location: locationFor(s, p.service, p.dest),
          occurredAt: iso(at),
          author: staffAt(p.dest, s),
          source: "manual-demo",
          public: true,
          reason: s === "incident" ? p.incident : "",
          corrects: null,
        },
        at,
        staffAt(p.dest, s),
      );
      if (s === "remis")
        entity(
          "document",
          p.owner,
          agency,
          {
            shipmentId: sid,
            type: "proof-of-handover",
            body: "Pièce d’identité contrôlée au comptoir, signature du destinataire (démonstration).",
            public: false,
          },
          at,
          staffAt(p.dest, s),
        );
    }
  }

  // Départs enregistrés avec la liste de leurs dossiers.
  for (const [key, d] of Object.entries(deps))
    out.push([
      "INSERT INTO entities VALUES(?,?,?,?,1,?,?)",
      [
        d.id,
        "departure",
        "",
        "paris",
        JSON.stringify({
          mode: d.mode,
          scheduledAt: new Date(d.at).toISOString(),
          confirmedAt: d.confirmed ? new Date(d.at).toISOString() : null,
          status: d.confirmed ? "confirme" : "previsionnel",
          shipments: d.shipments,
          label: key,
          ...(d.confirmed ? { confirmedBy: "admin-demo" } : {}),
        }),
        iso(Math.min(d.at - 20 * D, now - 2 * D)),
      ],
    ]);

  /* ----- Propositions et encaissements ----- */
  let n = 1;
  const proposals: {
    id: string;
    owner: string;
    number: string;
    total: number;
    status: string;
  }[] = [];
  for (const s of shipments) {
    const p = s.plan;
    if (!p.proposal || p.proposal === "aucune") continue;
    const parcels = parcelsOf.get(s.id) || [];
    const kg = parcels.reduce((a, x) => a + x.kg, 0);
    const m3 = parcels.reduce((a, x) => a + x.volume, 0);
    const lines: {
      label: string;
      quantity: number;
      unitMinor: string;
      totalMinor: string;
    }[] = [];
    const line = (label: string, quantity: number, unitMinor: number) =>
      lines.push({
        label,
        quantity,
        unitMinor: String(unitMinor),
        totalMinor: String(Math.round(quantity * unitMinor)),
      });
    if (p.service === "aerien") {
      if (/courrier|documents/i.test(p.goods))
        line(
          "Courrier (grille Express Congo)",
          Math.max(1, parcels.length),
          1000,
        );
      else
        line(
          "Fret aérien avec douane, au kilo (grille Express Congo)",
          Math.max(1, Math.round(kg)),
          1300,
        );
    } else if (p.service === "maritime") {
      if (m3 <= 1)
        line(
          "Groupage maritime, volume jusqu’à 1 m³ (grille Express Congo)",
          1,
          80000,
        );
      else
        line(
          `Groupage maritime ${m3.toFixed(2).replace(".", ",")} m³ (tarif sur devis, montant de démonstration)`,
          Math.round(m3 * 100) / 100,
          72000,
        );
    } else
      line(
        "Conteneur complet 20 pieds (tarif sur devis, montant de démonstration)",
        1,
        390000,
      );
    if (/mobilier|électroménager/i.test(p.goods))
      line("Emballage renforcé (montant de démonstration)", 1, 3500);
    const total = lines.reduce((a, l) => a + Number(l.totalMinor), 0);
    const at = s.created + 4 * H;
    const number = `DEV-${yymm(s.created)}-${String(n++).padStart(4, "0")}`;
    const status =
      p.proposal === "envoyee" ? "proposition-envoyee" : "acceptee";
    const id = entity(
      "proposal",
      p.owner,
      "paris",
      {
        shipmentId: s.id,
        version: 1,
        number,
        totalMinor: String(total),
        currency: "EUR",
        lines,
        exclusions:
          p.service === "aerien"
            ? "Prix de la grille « fret avec douane ». Montant définitif après pesée en agence."
            : "Droits et taxes selon la nature des marchandises ; montant définitif après mesure en agence.",
        status,
        validUntil: new Date(now + 21 * D).toISOString().slice(0, 10),
        tariffSnapshot: {
          source: "Grille tarifaire Express Congo",
          receivedAt: "2026-10-09",
        },
        ...(status === "acceptee" ? { acceptedAt: iso(at + 5 * H) } : {}),
      },
      at,
      "admin-demo",
    );
    proposals.push({ id, owner: p.owner, number, total, status });
    if (status === "acceptee")
      audit(p.owner, "proposal.accepted", id, at + 5 * H);
    const pay = (amount: number, method: string, ref: string, when: number) =>
      entity(
        "payment",
        p.owner,
        "paris",
        {
          proposalId: id,
          proposalNumber: number,
          amountMinor: String(amount),
          currency: "EUR",
          method,
          reference: ref,
          receivedAt: iso(when).slice(0, 10),
          recordedBy: "finance-demo",
        },
        when,
        "finance-demo",
      );
    const method = pick(["transfer", "transfer", "mtn", "cash", "airtel"]);
    if (p.proposal === "payee")
      pay(
        total,
        method,
        `${method === "transfer" ? "VIR" : method === "cash" ? "CAISSE" : "MOMO"}-${code(6)}`,
        at + 20 * H,
      );
    if (p.proposal === "partielle")
      pay(Math.round(total / 2), "transfer", `VIR-${code(6)}`, at + 20 * H);
  }

  /* ----- Assistance ----- */
  const ticket = (
    owner: string,
    subject: string,
    body: string,
    replies: [string, string, number][],
    status: string,
    at: number,
  ) =>
    entity(
      "ticket",
      owner,
      "paris",
      {
        subject,
        body,
        status,
        replies: replies.map(([actor, text, t]) => ({
          body: text,
          actor,
          at: iso(t),
        })),
      },
      at,
      owner,
    );
  ticket(
    A,
    "Horaires de retrait à Pointe-Noire",
    "Bonjour, mon colis est disponible : puis-je le retirer samedi matin ?",
    [
      [
        "agent-pointe-noire",
        "Bonjour Madame, oui : l’agence est ouverte du lundi au samedi de 9 h à 17 h. Munissez-vous de votre pièce d’identité.",
        now - 20 * H,
      ],
    ],
    "repondu",
    now - 26 * H,
  );
  ticket(
    A,
    "Colis abîmé : que faire ?",
    "J’ai reçu vos photos. Vous pouvez reconditionner le carton, merci de me dire le coût.",
    [],
    "nouveau",
    now - 3 * H,
  );
  ticket(
    B,
    "Facture pour notre comptabilité",
    "Pouvez-vous nous transmettre la facture du groupage de septembre ?",
    [
      [
        "finance-demo",
        "Bonjour, la facture est disponible dans votre espace, rubrique Documents.",
        now - 4 * D,
      ],
    ],
    "repondu",
    now - 5 * D,
  );
  ticket(
    Dd,
    "Délai pour les livres scolaires",
    "Les cartons arriveront-ils avant la rentrée ?",
    [
      [
        "agent-paris",
        "Le navire est parti, l’arrivée est estimée dans environ une semaine. Nous vous prévenons dès l’arrivée.",
        now - 2 * D,
      ],
    ],
    "repondu",
    now - 2.5 * D,
  );
  ticket(
    G,
    "Retrait par un tiers",
    "Mon frère peut-il retirer les cartons de la boutique à ma place ?",
    [],
    "nouveau",
    now - 5 * H,
  );

  /* ----- Messages WhatsApp (simulés) ----- */
  const message = (
    owner: string,
    direction: "in" | "out",
    body: string,
    at: number,
    extra: Record<string, unknown> = {},
  ) =>
    entity(
      "message",
      owner,
      "paris",
      {
        channel: "whatsapp",
        direction,
        phone: demoProfiles.find((x) => x.id === owner)?.phone ?? "",
        body,
        status: direction === "in" ? "recu" : "simule",
        at: iso(at),
        ...extra,
      },
      at,
      direction === "in" ? owner : "agent-paris",
    );
  const live = shipments.find((s) => s.plan.live)!;
  message(
    A,
    "in",
    "Bonjour, je voudrais envoyer un téléphone à ma sœur à Brazzaville. C’est combien ?",
    live.created - 2 * H,
  );
  message(
    A,
    "out",
    "Bonjour Madame Bouanga, le courrier et le téléphone sont à 10 € l’unité en aérien. Vous pouvez le déposer à l’agence de Belleville.",
    live.created - 90 * 60000,
  );
  message(
    A,
    "out",
    `Votre envoi ${live.reference} est parti. Suivez-le en direct avec votre code de suivi.`,
    deps["AIR-3"].at + 10 * 60000,
    { shipmentId: live.id, template: "suivi_etape" },
  );
  message(
    A,
    "in",
    "Merci beaucoup, ma sœur attend avec impatience 🙏",
    deps["AIR-3"].at + 40 * 60000,
  );
  message(G, "in", "Les cartons de la boutique sont arrivés ?", now - 6 * H);
  message(
    G,
    "out",
    "Oui, ils sont disponibles à l’agence de Pointe-Noire depuis hier.",
    now - 5.5 * H,
  );
  message(Dd, "in", "Bonjour, à quelle heure atterrit l’avion ?", now - 2 * H);
  message(C, "in", "Je confirme le retrait demain matin.", now - 26 * H);

  /* ----- Demandes de devis du site ----- */
  const quotes: [string, string, string, string, string, number, number][] = [
    [
      "Mireille Démo",
      "aerien",
      "Brazzaville",
      "Colis de vêtements pour la famille",
      "nouveau",
      3,
      2,
    ],
    [
      "Patrice Kimbembé",
      "maritime",
      "Pointe-Noire",
      "Réfrigérateur et cartons de cuisine",
      "nouveau",
      2,
      5,
    ],
    [
      "Association Solidarité Niari (fictive)",
      "maritime",
      "Pointe-Noire",
      "Matériel scolaire pour une école",
      "en-etude",
      8,
      22,
    ],
    [
      "Clarisse Moukouyou",
      "aerien",
      "Pointe-Noire",
      "Produits de beauté",
      "a-completer",
      2,
      30,
    ],
    [
      "Société Fictive SARL",
      "conteneur",
      "Pointe-Noire",
      "Conteneur 40 pieds de matériaux de construction",
      "en-etude",
      1,
      48,
    ],
    [
      "Didier Okemba",
      "aerien",
      "Brazzaville",
      "Pièces de moto",
      "proposition-envoyee",
      1,
      70,
    ],
    [
      "Ornella Batchi",
      "aerien",
      "Brazzaville",
      "Robe de mariée et accessoires",
      "acceptee",
      1,
      96,
    ],
    [
      "Jean Exemple",
      "conseil",
      "Pointe-Noire",
      "Je ne sais pas quel mode choisir pour un frigo",
      "nouveau",
      1,
      1,
    ],
    [
      "Awa Test",
      "maritime",
      "Pointe-Noire",
      "Cartons de vaisselle",
      "refusee",
      5,
      140,
    ],
    [
      "Rachel Mabiala",
      "aerien",
      "Brazzaville",
      "Ordinateur et imprimante",
      "nouveau",
      2,
      0.5,
    ],
  ];
  const quoteRows: Stmt[] = quotes.map(
    ([name, service, destination, description, status, qty, hoursAgo], k) => {
      const at = iso(now - hoursAgo * H);
      const parcels = [
        {
          length: "60",
          width: "40",
          height: "40",
          weight: String(10 + k),
          quantity: String(qty),
          unit: "cm" as const,
        },
      ];
      const payload = {
        kind: /SARL|Association/.test(name) ? "professionnel" : "particulier",
        service,
        destination,
        description,
        parcels,
        customs: "À préciser",
        desiredDate: "",
        agency: "paris",
        city: "Ville fictive",
        name,
        email: `demande${k + 1}@example.invalid`,
        phone: "+33 7 00 00 01 " + String(10 + k),
        channel: k % 2 ? "telephone" : "email",
        comment: "Demande de démonstration",
        frequency: "",
        constraints: "",
        privacy: true,
        marketing: false,
      };
      audit("public", "quote.created", "demo-quote-" + k, now - hoursAgo * H);
      return [
        "INSERT INTO quotes(id,reference,idempotency,fingerprint,payload,volume,status,agency,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [
          randomUUID(),
          `EC-${yymm(now)}-D${String(k + 1).padStart(3, "0")}`,
          randomUUID(),
          "demo-" + k,
          JSON.stringify(payload),
          volume(parcels),
          status,
          "paris",
          at,
          at,
        ],
      ];
    },
  );

  // Hub de paiement prérempli seulement s’il n’a jamais été réglé.
  const paymentDefaults: Stmt = [
    "INSERT INTO settings(key,value,updated_at,updated_by) VALUES('payments',?,?,'admin-demo') ON CONFLICT(key) DO NOTHING",
    [
      JSON.stringify({
        transfer: {
          enabled: true,
          holder: "Express Congo (démonstration)",
          iban: "FR7630006000011234567890189",
          bic: "AGRIFRPP",
          bank: "Banque fictive",
        },
        mtn: {
          enabled: true,
          number: "+242060000000",
          name: "EXPRESS CONGO DEMO",
        },
        airtel: {
          enabled: true,
          number: "+242050000000",
          name: "EXPRESS CONGO DEMO",
        },
        cash: {
          enabled: true,
          agencies: ["paris", "brazzaville", "pointe-noire"],
        },
        instructions:
          "Indiquez le numéro de proposition dans le libellé du paiement (démonstration).",
      }),
      new Date(now).toISOString(),
    ],
  ];

  // Remplacement d’un seul bloc : rien n’est effacé si l’écriture échoue.
  await database.batch(
    compact([
      ["DELETE FROM assignments", []],
      ["DELETE FROM documents", []],
      ["DELETE FROM entities", []],
      ["DELETE FROM quotes", []],
      [`DELETE FROM audit WHERE ${ENTITY_ACTIONS}`, []],
      ...accounts,
      ...profiles,
      ...out,
      ...quoteRows,
      paymentDefaults,
      [
        "INSERT INTO audit(actor,action,object_id,detail,created_at) VALUES(?,?,?,?,?)",
        [
          actorId,
          "demo.dataset",
          DATASET_VERSION,
          JSON.stringify({
            shipments: shipments.length,
            proposals: proposals.length,
          }),
          new Date().toISOString(),
        ],
      ],
    ]),
  );
  return {
    shipments: shipments.length,
    proposals: proposals.length,
    quotes: quotes.length,
  };
}
