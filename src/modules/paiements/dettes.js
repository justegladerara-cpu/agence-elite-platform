// « Qui me doit ? » : regroupe par client ce qui reste à encaisser (ventes à crédit, payées en partie, factures émises
// non soldées — une facture est aussi une vente, d'origine « facture » : rien n'est compté deux fois).
// Calcul d'affichage seulement : la base recalcule tout de son côté à chaque encaissement.

const arrondi = (n) => Math.round(Number(n) * 100) / 100;

// Jour (AAAA-MM-JJ) d'une date de la base : texte (Supabase) ou Date (moteur local).
export function jourDe(x) {
  if (!x) return null;
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  return String(x).slice(0, 10);
}

export function joursEntre(du, au) {
  return Math.round((Date.parse(`${au}T00:00:00Z`) - Date.parse(`${du}T00:00:00Z`)) / 86400000);
}

// ventes : lignes de la table ventes ; factures : { [vente_id]: { id, numero, echeance } } (documents émis).
// Ancienneté : depuis l'échéance pour une facture qui en a une, sinon depuis le jour de la vente.
export function regrouperCreances(ventes, factures = {}, aujourdhui) {
  const parClient = new Map();
  for (const v of ventes) {
    if (v.statut !== 'validee') continue;
    const reste = arrondi(Number(v.total) - Number(v.montant_paye));
    if (reste <= 0) continue;
    const date = jourDe(v.cree_le);
    const facture = factures[v.id] ?? null;
    const reference = jourDe(facture?.echeance) ?? date;
    const jours = Math.max(0, joursEntre(reference, aujourdhui));
    const cle = v.contact_id ?? null;
    const groupe = parClient.get(cle) ?? { contact_id: cle, total: 0, plus_ancienne: date, jours: 0, lignes: [] };
    groupe.total = arrondi(groupe.total + reste);
    if (date < groupe.plus_ancienne) groupe.plus_ancienne = date;
    groupe.jours = Math.max(groupe.jours, jours);
    groupe.lignes.push({ vente_id: v.id, numero: facture?.numero ?? v.numero, reste, date, jours, document_id: facture?.id ?? null, echeance: jourDe(facture?.echeance) });
    parClient.set(cle, groupe);
  }
  for (const g of parClient.values()) g.lignes.sort((a, b) => a.date.localeCompare(b.date));
  // Les clients connus d'abord, la dette la plus ancienne en tête ; les ventes sans nom de client à la fin.
  return [...parClient.values()].sort((a, b) => (a.contact_id === null) - (b.contact_id === null)
    || a.plus_ancienne.localeCompare(b.plus_ancienne) || b.total - a.total);
}
