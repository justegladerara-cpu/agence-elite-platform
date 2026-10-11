// Verrouillage de la caisse sans activité (réglage Clôture « verrouillage_inactivite », migration 20261011000129) :
// au bout de N minutes sans toucher l'écran, la personne qui a une caisse ouverte est déconnectée. Sa caisse reste
// ouverte : elle la retrouve en se reconnectant, et seule elle (ou un responsable) peut la fermer avec son ticket Z.
export const DELAI_PAR_DEFAUT_MIN = 15;
export const PREAVIS_MS = 60000;

// Minutes avant verrouillage ; 0 = jamais.
export function delaiVerrouillage(parametresCloture) {
  const brut = parametresCloture?.verrouillage_inactivite;
  if (brut === undefined || brut === null || brut === '') return DELAI_PAR_DEFAUT_MIN;
  const n = Number(brut);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// 'actif', 'preavis' (dernière minute : on prévient) ou 'verrouiller'.
export function etatVerrou(derniereActivite, maintenant, delaiMin) {
  if (!delaiMin) return 'actif';
  const reste = derniereActivite + delaiMin * 60000 - maintenant;
  if (reste <= 0) return 'verrouiller';
  return reste <= PREAVIS_MS ? 'preavis' : 'actif';
}
