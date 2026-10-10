// Libellés et calculs partagés par les écrans de facturation (la base recalcule tout de son côté).
export const TYPES_DOCUMENT = { devis: 'Devis', facture: 'Facture', avoir: 'Avoir' };
export const STATUTS_DOCUMENT = {
  brouillon: ['Brouillon', 'neutre'], envoye: ['Envoyé', 'bleu'], accepte: ['Accepté', 'vert'], refuse: ['Refusé', 'alerte'],
  converti: ['Facturé', 'vert'], emise: ['Émise', 'bleu'], annule: ['Annulé', 'neutre'],
};

// État lisible d'un document : pour une facture émise, selon ses paiements et son échéance.
export function etatDocument(doc, vente, aujourdhui) {
  if (doc.type === 'avoir') return ['Avoir', 'neutre'];
  if (doc.type === 'devis' && ['envoye', 'brouillon'].includes(doc.statut) && doc.echeance && doc.echeance < aujourdhui) return ['Expiré', 'orange'];
  if (doc.type !== 'facture' || doc.statut !== 'emise' || !vente) return STATUTS_DOCUMENT[doc.statut] ?? [doc.statut, 'neutre'];
  if (vente.statut_paiement === 'payee') return ['Payée', 'vert'];
  if (doc.echeance && doc.echeance < aujourdhui) return ['En retard', 'rouge'];
  if (vente.statut_paiement === 'partielle') return ['Partiellement payée', 'orange'];
  return ['À payer', 'attention'];
}

export function calculerLigne(l) {
  const quantite = Number(l.quantite) || 0;
  const prix = Number(l.prix_unitaire) || 0;
  const remise = Number(l.remise) || 0;
  const taux = Number(l.taux_tva) || 0;
  const ht = Math.round((quantite * prix - remise) * 100) / 100;
  const tva = Math.round(ht * taux) / 100;
  return { ht, tva, ttc: Math.round((ht + tva) * 100) / 100 };
}

// Une ligne en option (devis) ne compte dans le total que si le client la retient.
export const vrai = (x) => x === true || x === 'true';
export const ligneComptee = (l) => !vrai(l.optionnelle) || vrai(l.retenue);

export function totaux(lignes) {
  return lignes.filter(ligneComptee).reduce((t, l) => {
    const c = calculerLigne(l);
    return { ht: t.ht + c.ht, tva: t.tva + c.tva, ttc: t.ttc + c.ttc };
  }, { ht: 0, tva: 0, ttc: 0 });
}

// Balance âgée : factures émises non soldées, réparties selon les jours de retard (échéance, sinon date de la facture).
export const TRANCHES_RETARD = [['a_echoir', 'À échoir'], ['j30', '1 à 30 j'], ['j60', '31 à 60 j'], ['j90', '61 à 90 j'], ['plus90', 'Plus de 90 j']];

export function joursDeRetard(echeance, aujourdhui) {
  const ms = Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${echeance}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function trancheRetard(jours) {
  if (jours <= 0) return 'a_echoir';
  if (jours <= 30) return 'j30';
  if (jours <= 60) return 'j60';
  if (jours <= 90) return 'j90';
  return 'plus90';
}

// contestees : ids des factures dont la contestation est ouverte (toujours dues, mais exclues des relances).
export function balanceAgee(documents, ventes, aujourdhui, contestees = new Set()) {
  const parContact = new Map();
  for (const d of documents) {
    if (d.type !== 'facture' || d.statut !== 'emise') continue;
    const v = ventes[d.vente_id];
    if (!v || v.statut !== 'validee') continue;
    const reste = Math.round((Number(v.total) - Number(v.montant_paye)) * 100) / 100;
    if (reste <= 0) continue;
    const jours = joursDeRetard(d.echeance ?? d.date_document, aujourdhui);
    const tranche = trancheRetard(jours);
    const ligne = parContact.get(d.contact_id) ?? {
      contact_id: d.contact_id, total: 0, retard_max: 0, factures: [],
      tranches: Object.fromEntries(TRANCHES_RETARD.map(([k]) => [k, 0])),
    };
    ligne.tranches[tranche] = Math.round((ligne.tranches[tranche] + reste) * 100) / 100;
    ligne.total = Math.round((ligne.total + reste) * 100) / 100;
    ligne.retard_max = Math.max(ligne.retard_max, jours);
    ligne.factures.push({ id: d.id, numero: d.numero, echeance: d.echeance ?? d.date_document, reste, jours, contestee: contestees.has(d.id) });
    parContact.set(d.contact_id, ligne);
  }
  return [...parContact.values()].sort((a, b) => b.retard_max - a.retard_max || b.total - a.total);
}

// Message de relance prêt à copier (WhatsApp, SMS, e-mail). Le ton monte avec le retard le plus ancien.
export function messageRelance({ nom, factures, montant, emetteur }) {
  const retard = Math.max(...factures.map((f) => f.jours));
  const ouverture = retard > 60
    ? `Bonjour ${nom}, malgré nos précédents rappels, les factures suivantes restent impayées :`
    : retard > 0
      ? `Bonjour ${nom}, sauf erreur de notre part, les factures suivantes sont arrivées à échéance :`
      : `Bonjour ${nom}, pour rappel, les factures suivantes arrivent à échéance :`;
  const lignes = factures.map((f) => `- ${f.numero} : ${montant(f.reste)}${f.jours > 0 ? ` (en retard de ${f.jours} j)` : ''}`);
  const total = factures.reduce((s, f) => s + f.reste, 0);
  const fin = retard > 60
    ? 'Merci de régler ce montant sans délai ou de nous contacter pour convenir d’un échéancier.'
    : 'Merci de procéder au règlement ou de nous indiquer la date prévue.';
  return [ouverture, ...lignes, `Total : ${montant(total)}.`, fin, emetteur ? `Cordialement, ${emetteur}` : 'Cordialement.'].join('\n');
}

// Remise globale en % du montant avant remise (lignes comptées), comme la base.
export function tauxRemise(lignes) {
  const comptees = lignes.filter(ligneComptee);
  const brut = comptees.reduce((s, l) => s + Math.round(Number(l.quantite) * Number(l.prix_unitaire) * 100) / 100, 0);
  const remise = comptees.reduce((s, l) => s + (Number(l.remise) || 0), 0);
  return brut > 0 ? Math.round((10000 * remise) / brut) / 100 : 0;
}

// Échéancier : état de chaque échéance d'une facture émise selon le cumul payé (le plus ancien d'abord).
export function etatEcheances(echeances, payeTotal, aujourdhui) {
  let restePaye = Number(payeTotal) || 0;
  return echeances.map((e) => {
    const montant = Number(e.montant);
    const couvert = Math.min(montant, Math.max(0, restePaye));
    restePaye -= couvert;
    const etat = couvert >= montant ? ['Payée', 'vert'] : e.date_echeance < aujourdhui ? ['En retard', 'rouge'] : couvert > 0 ? ['Payée en partie', 'orange'] : ['À venir', 'neutre'];
    return { ...e, couvert, etat };
  });
}

// Répartit un total en n échéances mensuelles (la dernière absorbe l'arrondi).
export function repartirEcheances(total, n, premiere) {
  const t = Math.round(Number(total) * 100);
  const part = Math.floor(t / n);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${premiere}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    return { date_echeance: d.toISOString().slice(0, 10), montant: String((i === n - 1 ? t - part * (n - 1) : part) / 100), libelle: i === 0 && n > 1 ? 'Acompte' : i === n - 1 && n > 1 ? 'Solde' : '' };
  });
}

// Contre-valeur d'un montant dans la devise du client : le taux est le prix d'une unité de cette devise dans la devise
// de l'établissement (figé sur le document). La comptabilité reste dans la devise de l'établissement.
export function contreValeur(montant, taux) {
  const t = Number(taux);
  if (!(t > 0)) return null;
  return Math.round((Number(montant ?? 0) / t) * 100) / 100;
}
