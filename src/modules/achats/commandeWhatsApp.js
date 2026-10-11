// « Je dois commander » : regrouper les suggestions par fournisseur et préparer un message WhatsApp poli.
// Rien ne part tout seul : le lien wa.me ouvre WhatsApp avec le texte, la personne vérifie et envoie.
import { formatQuantite } from '../../noyau/format.js';

// Quantité proposée : remonter au double du stock minimum, moins le stock et ce qui est déjà en commande (1 au moins).
export const quantiteSuggeree = (s) => Math.max(1, Number(s.minimum) * 2 - Number(s.stock) - Number(s.en_commande ?? 0));

// Dernier fournisseur de chaque article, d'après les commandes passées (hors demandes et commandes annulées).
export function derniersFournisseurs(lignesAchat, commandes) {
  const parId = Object.fromEntries(commandes.map((c) => [c.id, c]));
  const resultat = {};
  for (const l of lignesAchat) {
    const c = parId[l.commande_id];
    if (!c?.fournisseur_id || ['demande', 'annulee'].includes(c.statut)) continue;
    const actuel = resultat[l.article_id];
    const cle = `${c.date_commande ?? ''}|${c.cree_le ?? ''}`;
    if (!actuel || cle > actuel.cle) resultat[l.article_id] = { fournisseur_id: c.fournisseur_id, cle };
  }
  return Object.fromEntries(Object.entries(resultat).map(([a, v]) => [a, v.fournisseur_id]));
}

// Suggestions d'un Hub regroupées par fournisseur (null : pas encore commandé chez un fournisseur connu, en dernier).
export function grouperParFournisseur(suggestions, fournisseurDe) {
  const groupes = new Map();
  for (const s of suggestions) {
    const f = fournisseurDe[s.article_id] ?? null;
    if (!groupes.has(f)) groupes.set(f, []);
    groupes.get(f).push(s);
  }
  return [...groupes.entries()].sort(([a], [b]) => (a === null) - (b === null)).map(([fournisseur_id, liste]) => ({ fournisseur_id, liste }));
}

// Texte de la commande : bonjour, la liste des articles et quantités, merci, signature.
export function texteCommandeWhatsApp({ fournisseur, etablissement, hub, lignes }) {
  const bonjour = fournisseur ? `Bonjour ${fournisseur},` : 'Bonjour,';
  const liste = lignes.map((l) => `- ${l.nom}${l.reference ? ` (${l.reference})` : ''} : ${formatQuantite(l.quantite, l.unite)}`);
  return [
    bonjour,
    '',
    `Nous souhaitons vous commander${hub ? ` pour ${hub}` : ''} :`,
    ...liste,
    '',
    'Merci de nous confirmer la disponibilité, le prix et la date de livraison.',
    'Bonne journée,',
    etablissement || '',
  ].join('\n').trim();
}

// Lien WhatsApp : chiffres du numéro (« 00 » devant = indicatif international). Sans numéro : WhatsApp demande à qui l'envoyer.
export function lienCommandeWhatsApp(telephone, texte) {
  const brut = String(telephone ?? '').trim();
  let chiffres = brut.replace(/\D/g, '');
  if (!brut.startsWith('+') && chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  return `https://wa.me/${chiffres}?text=${encodeURIComponent(texte)}`;
}
