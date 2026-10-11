// Factures en cours (table ventes_en_attente) : depuis combien de temps elles attendent, et leur couleur.
// Vert moins d'1 h, orange à partir d'1 h, rouge à partir de 3 h.
export const ORANGE_APRES_MIN = 60;
export const ROUGE_APRES_MIN = 180;

export function attenteFacture(creeLe, maintenant = Date.now()) {
  const minutes = Math.max(0, Math.floor((maintenant - new Date(creeLe).getTime()) / 60000));
  const heures = Math.floor(minutes / 60);
  const texte = minutes < 1 ? 'à l’instant' : heures ? `${heures} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
  const ton = minutes >= ROUGE_APRES_MIN ? 'rouge' : minutes >= ORANGE_APRES_MIN ? 'orange' : 'vert';
  return { minutes, texte, ton };
}

export const totalFactures = (factures) => factures.reduce((s, f) => s + Number(f.total_estime || 0), 0);
