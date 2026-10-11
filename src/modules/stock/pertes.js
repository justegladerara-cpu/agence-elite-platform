// Pertes et dates de péremption : petites règles d'affichage, sans appel à la base (testées à part).

// Raisons proposées d'un clic pour « Retirer du stock » ; la raison reste modifiable à la main.
export const RAISONS_RETRAIT = ['Cassé', 'Périmé', 'Perdu', 'Volé', 'Consommé'];

// Liens profonds de l'écran Stock : ?vue=inventaire|reception|perte|peremptions (la page d'accueil y renvoie).
export const VUES_STOCK = ['niveaux', 'mouvements', 'inventaires', 'peremptions'];
export function lireVueStock(vue) {
  if (vue === 'inventaire') return { onglet: 'inventaires', action: 'comptage' };
  if (vue === 'reception') return { onglet: 'niveaux', action: 'reception' };
  if (vue === 'perte') return { onglet: 'niveaux', action: 'choix_perte' };
  return { onglet: VUES_STOCK.includes(vue) ? vue : 'niveaux', action: null };
}

// Badge d'une date de péremption : jours restants (négatif = déjà périmé).
export function etatPeremption(jours) {
  const n = Number(jours);
  if (n < 0) return { libelle: 'Périmé', ton: 'rouge' };
  if (n === 0) return { libelle: 'Périme aujourd’hui', ton: 'rouge' };
  if (n === 1) return { libelle: 'Demain', ton: 'orange' };
  return { libelle: `Dans ${n} jours`, ton: n <= 3 ? 'orange' : 'bleu' };
}

// Valeur d'une perte au prix d'achat ; null si le coût d'achat n'est pas connu.
export function valeurPerte(quantite, coutAchat) {
  if (coutAchat === null || coutAchat === undefined || coutAchat === '') return null;
  const cout = Number(coutAchat);
  const q = Number(quantite);
  if (!Number.isFinite(cout) || !Number.isFinite(q) || cout <= 0 || q <= 0) return null;
  return Math.round(q * cout * 100) / 100;
}
