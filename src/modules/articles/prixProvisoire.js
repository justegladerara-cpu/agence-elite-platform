// Proposition tarifaire temporaire The Dream.
// Les prix sont des valeurs de vente courantes, jamais une réécriture des ventes historiques.
// Les articles sans aucune base chiffrée restent en attente.
export function proposerPrixProvisoire(prixActuel, prixMenu, { pas = 500 } = {}) {
  const a = prixActuel === null || prixActuel === undefined || prixActuel === '' ? null : Number(prixActuel);
  const b = prixMenu === null || prixMenu === undefined || prixMenu === '' ? null : Number(prixMenu);
  const valide = x => x !== null && Number.isFinite(x) && x > 0;
  if (!valide(a) && !valide(b)) return { prix: null, statut: 'a_confirmer', methode: 'aucun_prix_fiable' };
  if (!valide(a)) return { prix: b, statut: 'provisoire', methode: 'prix_menu_seul' };
  if (!valide(b)) return { prix: a, statut: 'provisoire', methode: 'prix_actuel_seul' };
  if (a === b) return { prix: a, statut: 'confirme_par_concordance', methode: 'identique' };
  return { prix: Math.round(((a + b) / 2) / pas) * pas, statut: 'provisoire', methode: 'moyenne_arrondie', prix_actuel: a, prix_menu: b };
}
