// Tables VIP : ce qui reste à consommer pour atteindre le minimum (arrondi à l'unité supérieure, comme la base).
export const REFERENCE_COMPLEMENT = 'COMPLEMENT-MINIMUM';

export function resteMinimum(minimum, consomme) {
  const m = Number(minimum ?? 0);
  if (!(m > 0)) return 0;
  return Math.max(0, Math.ceil(m - Number(consomme ?? 0)));
}

// Article technique « Complément minimum » : jamais proposé comme une tuile de plat ou de caisse.
export const estArticleTechnique = (article) => article?.reference === REFERENCE_COMPLEMENT;
