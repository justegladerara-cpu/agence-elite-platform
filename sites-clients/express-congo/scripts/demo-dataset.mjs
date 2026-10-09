// Remplit la démonstration avec des dossiers fictifs, en passant par les
// mêmes API que l’interface : chaque dossier respecte les règles métier
// (transitions, mesures, permissions). Usage : serveur démo lancé, puis
//   npm run demo:dataset
import { request } from "@playwright/test";
const base = process.env.SITE_URL || "http://127.0.0.1:3000";
const headers = { Origin: base };

async function session(email) {
  const ctx = await request.newContext({ baseURL: base });
  const s = await (await ctx.get("/api/demo/session")).json();
  const r = await ctx.post("/api/demo/session", {
    headers,
    data: { email, password: "DemoExpress!2026", code: s.secondStep },
  });
  if (!r.ok()) throw new Error("Connexion impossible : " + email);
  return async (command, data) => {
    const res = await ctx.post("/api/demo/operations", {
      headers,
      data: { command, ...data },
    });
    if (res.status() !== 201)
      throw new Error(`${command} : ${res.status()} ${await res.text()}`);
    return res.json();
  };
}

const admin = await session("admin@example.invalid");
const day = (n) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 16);
const parcel = (l, w, h, kg, q, measured = {}) => ({
  length: String(l),
  width: String(w),
  height: String(h),
  weight: String(kg),
  quantity: String(q),
  controlledLength: String(measured.l ?? l),
  controlledWidth: String(measured.w ?? w),
  controlledHeight: String(measured.h ?? h),
  controlledWeight: String(measured.kg ?? kg),
});
const path = [
  "recu-en-agence",
  "controle",
  "en-attente-de-depart",
  "expedie",
  "arrive",
  "formalites-en-cours",
  "disponible-au-retrait",
  "remis",
];
const where = {
  "recu-en-agence": "Agence de départ",
  controle: "Agence de départ",
  "en-attente-de-depart": "Agence de départ",
  expedie: "En transit",
  arrive: "Agence d’arrivée",
  "formalites-en-cours": "Agence d’arrivée",
  "disponible-au-retrait": "Agence d’arrivée",
  remis: "Agence d’arrivée",
};

const departures = {
  aerien: await admin("newDeparture", {
    agency: "paris",
    mode: "aerien",
    scheduledAt: day(4),
  }),
  maritime: await admin("newDeparture", {
    agency: "paris",
    mode: "maritime",
    scheduledAt: day(11),
  }),
};
await admin("newDeparture", {
  agency: "paris",
  mode: "aerien",
  scheduledAt: day(18),
});
// Le premier vol est confirmé : sa date remplace la date prévisionnelle.
await admin("confirmDeparture", {
  departureId: departures.aerien.id,
  confirmedAt: day(4),
});

const plan = [
  {
    owner: "client-demo-a",
    service: "aerien",
    dest: "Brazzaville",
    goods: "Vêtements et effets personnels",
    p: parcel(60, 40, 40, 12, 3),
    reach: "remis",
  },
  {
    owner: "client-demo-a",
    service: "maritime",
    dest: "Pointe-Noire",
    goods: "Électroménager emballé",
    p: parcel(80, 60, 90, 38, 2),
    reach: "disponible-au-retrait",
  },
  {
    owner: "client-demo-b",
    service: "aerien",
    dest: "Pointe-Noire",
    goods: "Pièces détachées",
    p: parcel(50, 40, 30, 15, 2),
    reach: "expedie",
  },
  {
    owner: "client-demo-b",
    service: "maritime",
    dest: "Brazzaville",
    goods: "Cartons de livres",
    p: parcel(45, 35, 35, 18, 6),
    reach: "en-attente-de-depart",
  },
  {
    owner: "client-demo-a",
    service: "maritime",
    dest: "Brazzaville",
    goods: "Mobilier démonté",
    p: parcel(120, 80, 60, 55, 1, { l: 125, kg: 61 }),
    reach: "controle",
  },
  {
    owner: "client-demo-b",
    service: "aerien",
    dest: "Brazzaville",
    goods: "Documents et courriers",
    p: parcel(35, 25, 10, 2, 1),
    reach: "recu-en-agence",
  },
  {
    owner: "client-demo-a",
    service: "aerien",
    dest: "Pointe-Noire",
    goods: "Matériel informatique",
    p: parcel(55, 45, 35, 14, 1),
    reach: "incident",
  },
  {
    owner: "client-demo-b",
    service: "conteneur",
    dest: "Pointe-Noire",
    goods: "Projet de conteneur complet",
    p: null,
    reach: "cree",
  },
];
const created = [];
for (const s of plan) {
  const shipment = await admin("newShipment", {
    owner: s.owner,
    agency: "paris",
    service: s.service,
    destination: s.dest,
  });
  created.push({ ...s, id: shipment.id });
  if (!s.p) continue;
  await admin("receiveParcel", {
    shipmentId: shipment.id,
    description: s.goods,
    reserves: "Aucune réserve",
    ...s.p,
    declared: {
      length: s.p.length,
      width: s.p.width,
      height: s.p.height,
      weight: s.p.weight,
      quantity: s.p.quantity,
      unit: "cm",
    },
    controlled: {
      length: s.p.controlledLength,
      width: s.p.controlledWidth,
      height: s.p.controlledHeight,
      weight: s.p.controlledWeight,
      quantity: s.p.quantity,
      unit: "cm",
    },
  });
  const steps =
    s.reach === "incident"
      ? ["recu-en-agence", "controle", "incident"]
      : path.slice(0, path.indexOf(s.reach) + 1);
  for (const status of steps) {
    if (status === "expedie" && departures[s.service])
      await admin("assignDeparture", {
        shipmentId: shipment.id,
        departureId: departures[s.service].id,
      });
    await admin("event", {
      shipmentId: shipment.id,
      status,
      location: where[status] || "Agence de Paris",
      reason:
        status === "incident"
          ? "Emballage endommagé, client à recontacter"
          : "Mise à jour agence",
      proof:
        status === "remis"
          ? "Pièce d’identité contrôlée au comptoir (démonstration)"
          : "Non applicable",
      entitlementConfirmed: status === "remis",
    });
  }
}
const valid = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
// Montants fictifs de démonstration : aucune grille tarifaire n’est validée.
const offers = [
  [
    0,
    "EUR",
    [
      ["Transport aérien (démonstration)", 1, "395"],
      ["Frais de dossier (démonstration)", 1, "90"],
    ],
  ],
  [
    1,
    "EUR",
    [
      ["Groupage maritime (démonstration)", 4, "255"],
      ["Emballage renforcé (démonstration)", 2, "50"],
    ],
  ],
  [2, "EUR", [["Transport aérien (démonstration)", 2, "130"]]],
  [
    3,
    "EUR",
    [
      ["Groupage maritime (démonstration)", 1, "305"],
      ["Frais de dossier (démonstration)", 1, "90"],
    ],
  ],
  [
    4,
    "XAF",
    [
      ["Conteneur complet (démonstration)", 1, "500000"],
      ["Manutention (démonstration)", 1, "40000"],
    ],
  ],
];
const proposals = [];
for (const [i, currency, lines] of offers)
  proposals.push(
    await admin("proposal", {
      shipmentId: created[i].id,
      currency,
      lines: JSON.stringify(
        lines.map(([label, quantity, unit]) => ({ label, quantity, unit })),
      ),
      exclusions:
        "Transport et frais de dossier ; droits et taxes à destination exclus (démonstration).",
      validUntil: valid,
    }),
  );
const clientA = await session("client-a@example.invalid");
await clientA("acceptProposal", { proposalId: proposals[0].id });
await clientA("acceptProposal", { proposalId: proposals[1].id });
await clientA("ticket", {
  subject: "Horaires de retrait à Pointe-Noire",
  body: "Bonjour, à quelle heure puis-je retirer mon colis ? (message fictif)",
});
const clientB = await session("client-b@example.invalid");
await clientB("acceptProposal", { proposalId: proposals[2].id });

// Hub de paiement : coordonnées FICTIVES (IBAN d’exemple ISO, numéro +242 de test).
{
  const ctx = await request.newContext({ baseURL: base });
  const st = await (await ctx.get("/api/demo/session")).json();
  await ctx.post("/api/demo/session", {
    headers,
    data: {
      email: "admin@example.invalid",
      password: "DemoExpress!2026",
      code: st.secondStep,
    },
  });
  const r = await ctx.post("/api/demo/payments", {
    headers,
    data: {
      transfer: {
        enabled: true,
        holder: "Express Congo (démonstration)",
        iban: "FR76 3000 6000 0112 3456 7890 189",
        bic: "AGRIFRPP",
        bank: "Banque fictive",
      },
      mtn: {
        enabled: true,
        number: "+242060000000",
        name: "EXPRESS CONGO DEMO",
      },
      airtel: { enabled: false, number: "", name: "" },
      cash: {
        enabled: true,
        agencies: ["paris", "brazzaville", "pointe-noire"],
      },
      instructions:
        "Indiquez le numéro de proposition dans le libellé du paiement (démonstration).",
    },
  });
  if (!r.ok()) throw new Error("Hub de paiement : " + (await r.text()));
}
// Un encaissement complet et un partiel, comme le ferait la finance.
const toEur = (minor) => String(minor / 100).replace(".", ",");
await admin("recordPayment", {
  proposalId: proposals[0].id,
  amount: toEur(Number(proposals[0].payload.totalMinor)),
  method: "transfer",
  reference: "VIR-DEMO-001",
  receivedAt: new Date().toISOString().slice(0, 10),
});
await admin("recordPayment", {
  proposalId: proposals[1].id,
  amount: "500",
  method: "mtn",
  reference: "MOMO-DEMO-002",
  receivedAt: new Date().toISOString().slice(0, 10),
});

// Demandes web envoyées par le formulaire public.
const web = await request.newContext({ baseURL: base });
const quotes = [
  [
    "Mireille Démo",
    "aerien",
    "Brazzaville",
    "Colis de vêtements pour la famille",
    3,
  ],
  [
    "Société Fictive SARL",
    "maritime",
    "Pointe-Noire",
    "Palettes de matériel de bureau",
    4,
  ],
  [
    "Jean Exemple",
    "conseil",
    "Pointe-Noire",
    "Je ne sais pas quel mode choisir pour un frigo",
    1,
  ],
  ["Awa Test", "maritime", "Brazzaville", "Cartons de vaisselle", 5],
];
for (const [
  k,
  [name, service, destination, description, qty],
] of quotes.entries()) {
  const form = {
    payload: JSON.stringify({
      kind: name.includes("SARL") ? "professionnel" : "particulier",
      service,
      destination,
      description,
      parcels: [
        {
          length: "60",
          width: "40",
          height: "40",
          weight: "12",
          quantity: String(qty),
          unit: "cm",
        },
      ],
      customs: "À préciser",
      desiredDate: "",
      agency: "paris",
      city: "Ville fictive",
      name,
      email: `demande${k + 1}@example.invalid`,
      phone: "+33 1 00 00 00 0" + k,
      channel: k % 2 ? "telephone" : "email",
      comment: "Demande de démonstration",
      frequency: "",
      constraints: "",
      privacy: true,
      marketing: false,
    }),
  };
  const r = await web.post("/api/devis", {
    headers: {
      ...headers,
      "Idempotency-Key": "demo-dataset-quote-" + k + "-" + Date.now(),
    },
    multipart: form,
  });
  if (!r.ok())
    throw new Error("Devis : " + r.status() + " " + (await r.text()));
}
console.log(
  `Jeu de démonstration chargé : ${created.length} expéditions, ${offers.length} propositions, ${quotes.length} demandes web.`,
);
