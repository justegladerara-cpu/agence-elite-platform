// Pages d'analyse ouvertes depuis une carte du Tableau de bord (Juste, 2026-10-24) : calculs purs, sans réseau,
// testés dans tests/zoom_tableau_de_bord.test.js.

// Carte du tableau de bord → page d'analyse. Les autres cartes gardent leur lien d'avant.
export const ZOOM_PAR_KPI = {
  chiffre_affaires: 'chiffre',
  encaisse: 'encaisse',
  tickets: 'ventes',
  panier_moyen: 'paniers',
  caisses_ouvertes: 'caisses',
};
export const ZOOM_PAR_ALERTE = { ruptures: 'ruptures', stock_bas: 'stock-bas', caisses_anciennes: 'caisses' };

export function routeZoom(type, du, au) {
  const q = du ? `?du=${du}&au=${au ?? du}` : '';
  return `tableau-de-bord/zoom/${type}${q}`;
}

// Remplace le lien d'une carte (indicateur ou alerte) par sa page d'analyse quand elle existe.
export function avecZoom(element, du, au, table = ZOOM_PAR_KPI) {
  const type = table[element.cle];
  return type ? { ...element, route: routeZoom(type, du, au) } : element;
}

const n = (x) => Number(x) || 0;

// Tranches de dépense par client : combien de paniers dans chaque tranche.
export const TRANCHES = [
  [0, 2000, 'Moins de 2 000'],
  [2000, 5000, '2 000 à 5 000'],
  [5000, 10000, '5 000 à 10 000'],
  [10000, 20000, '10 000 à 20 000'],
  [20000, 50000, '20 000 à 50 000'],
  [50000, Infinity, '50 000 et plus'],
];

export function tranchesPaniers(ventes) {
  const liste = TRANCHES.map(([de, a, libelle]) => ({ libelle, de, a, nombre: 0, total: 0 }));
  for (const v of ventes ?? []) {
    const t = liste.find((x) => n(v.total) >= x.de && n(v.total) < x.a);
    if (t) {
      t.nombre += 1;
      t.total += n(v.total);
    }
  }
  return liste;
}

// La tranche où se trouvent le plus de paniers (pour une phrase simple).
export function trancheFrequente(tranches) {
  return (tranches ?? []).reduce((m, t) => (t.nombre > (m?.nombre ?? 0) ? t : m), null);
}

// Clients connus qui sont venus plusieurs fois sur la période, du plus fidèle au moins fidèle.
export function clientsQuiReviennent(ventes, nomClient = () => null) {
  const parClient = new Map();
  for (const v of ventes ?? []) {
    if (!v.contact_id) continue;
    const c = parClient.get(v.contact_id) ?? { id: v.contact_id, nom: nomClient(v.contact_id) ?? 'Client', visites: 0, total: 0, jours: new Set() };
    c.visites += 1;
    c.total += n(v.total);
    c.jours.add(String(v.cree_le).slice(0, 10));
    parClient.set(v.contact_id, c);
  }
  return [...parClient.values()].filter((c) => c.visites > 1)
    .map((c) => ({ ...c, jours: c.jours.size }))
    .sort((a, b) => b.visites - a.visites || b.total - a.total);
}

// Ce que contient un panier, en une ligne courte : « 2 × Primus, 1 × Brochettes… ».
export function contenuPanier(lignes, max = 3) {
  const liste = (lignes ?? []).map((l) => `${n(l.quantite) % 1 === 0 ? n(l.quantite) : n(l.quantite).toFixed(1)} × ${l.libelle}`);
  if (liste.length <= max) return liste.join(', ');
  return `${liste.slice(0, max).join(', ')} et ${liste.length - max} autre(s)`;
}

// Écart entre ce qui a été vendu et ce qui est vraiment entré en caisse, expliqué.
export function partsArgent({ vendu, encaisse, attente, maison }) {
  const v = n(vendu);
  const parts = [
    { cle: 'encaisse', libelle: 'Argent reçu', valeur: n(encaisse) },
    { cle: 'attente', libelle: 'Pas encore payé', valeur: n(attente) },
    { cle: 'maison', libelle: 'Compte de la maison', valeur: n(maison) },
  ];
  return parts.map((p) => ({ ...p, part: v > 0 ? Math.round((100 * p.valeur) / v) : 0 }));
}

// Minutes écoulées depuis une date ISO (null si inconnue).
export const minutesDepuis = (iso, maintenant = Date.now()) => (iso ? Math.max(0, Math.floor((maintenant - new Date(iso).getTime()) / 60000)) : null);

export function dureeEnMots(minutes) {
  if (minutes == null) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export const heureCourte = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
};

// Articles suivis en stock, avec leur quantité totale (tous les lieux visibles) : épuisés ou sous le minimum.
export function articlesAStock(articles, stock, etat) {
  const quantites = new Map();
  for (const s of stock ?? []) quantites.set(s.article_id, (quantites.get(s.article_id) ?? 0) + n(s.quantite));
  return (articles ?? [])
    .filter((a) => a.actif !== false && a.suivi_stock)
    .map((a) => ({ ...a, quantite: quantites.get(a.id) ?? 0, minimum: n(a.stock_minimum) }))
    .filter((a) => (etat === 'ruptures' ? a.quantite <= 0 : a.quantite > 0 && a.quantite <= a.minimum))
    .sort((a, b) => a.quantite - b.quantite || a.nom.localeCompare(b.nom, 'fr'));
}
