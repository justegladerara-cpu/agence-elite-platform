// Mots simples pour les « Hubs » (Juste, 2026-10-24) : le client ne comprend pas « Hub principal ».
// Le nom enregistré en base ne change pas ; seul l'affichage dit « Lieu principal ».
export const nomLieu = (nom) => {
  if (!nom) return nom ?? null;
  return String(nom).replace(/^Hub principal$/i, 'Lieu principal');
};
