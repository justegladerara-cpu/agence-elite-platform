// Périodes communes aux rapports et au pilotage.
export const PERIODES = [['7', '7 derniers jours'], ['30', '30 derniers jours'], ['mois', 'Ce mois-ci'], ['mois-1', 'Mois dernier'], ['annee', 'Cette année'], ['libre', 'Dates choisies']];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function bornes(periode, du, au, auj = new Date()) {
  if (periode === '7' || periode === '30') return [iso(new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() - Number(periode) + 1)), iso(auj)];
  if (periode === 'mois') return [iso(new Date(auj.getFullYear(), auj.getMonth(), 1)), iso(auj)];
  if (periode === 'mois-1') return [iso(new Date(auj.getFullYear(), auj.getMonth() - 1, 1)), iso(new Date(auj.getFullYear(), auj.getMonth(), 0))];
  if (periode === 'annee') return [iso(new Date(auj.getFullYear(), 0, 1)), iso(auj)];
  return [du, au];
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Clé de prévision (« 2026-11 », « depassee », « sans_date ») → libellé lisible.
export function libellePrevision(cle) {
  if (cle === 'depassee') return 'Signature prévue dépassée';
  if (cle === 'sans_date') return 'Sans date de signature';
  const [a, m] = String(cle).split('-');
  return `${MOIS[Number(m) - 1] ?? m} ${a}`.replace(/^./, (c) => c.toUpperCase());
}

export const RAISONS_RISQUE = {
  impaye: 'Retard de paiement', fin_proche: 'Se termine bientôt', preavis_proche: 'Date limite de préavis proche',
  fin_depassee: 'Fin dépassée, toujours actif', suspendu: 'Suspendu',
};

// Totaux de la prévision : montant brut et pondéré, hors opportunités dont la signature prévue est dépassée.
export function totauxPrevision(lignes = []) {
  return lignes.reduce((t, l) => ({
    montant: t.montant + Number(l.montant),
    pondere: t.pondere + Number(l.pondere),
    a_venir: t.a_venir + (l.cle === 'depassee' || l.cle === 'sans_date' ? 0 : Number(l.pondere)),
  }), { montant: 0, pondere: 0, a_venir: 0 });
}
