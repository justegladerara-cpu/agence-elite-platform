// Le contrat de lecture accepte une colonne et, facultativement, son sens.
// Un format invalide doit échouer plutôt que produire un tri incomplet.
export function verifierOrdre(ordre) {
  if (ordre == null) return null;
  if (!Array.isArray(ordre) || ordre.length < 1 || ordre.length > 2
    || !/^[a-z_][a-z0-9_]*$/.test(ordre[0])
    || (ordre.length === 2 && !['asc', 'desc'].includes(ordre[1]))) {
    throw new Error('Ordre invalide : utilisez [colonne] ou [colonne, asc/desc]');
  }
  return [ordre[0], ordre[1] ?? 'asc'];
}

// Départage pour l'affichage des listes entièrement chargées, sans changer le contrat SQL.
export function trierLignes(lignes, colonnes) {
  const comparer = (a, b) => {
    if (a == null || b == null) return a == b ? 0 : a == null ? 1 : -1;
    return typeof a === 'number' && typeof b === 'number'
      ? a - b : String(a).localeCompare(String(b), 'fr');
  };
  return [...lignes].sort((a, b) => {
    for (const colonne of colonnes) {
      const comparaison = comparer(a[colonne], b[colonne]);
      if (comparaison) return comparaison;
    }
    return 0;
  });
}
