// « Servi par » (migration 20261011000129) : nom facultatif du serveur, choisi à l'encaissement.
// Propositions = réglage caisse « serveurs » (séparés par des virgules) + derniers noms utilisés sur cet appareil.
const cle = (etab) => `servi-par:${etab}`;

export function nomsServeurs(reglage, recents = []) {
  const depuisReglage = String(reglage ?? '').split(/[,;\n]/).map((n) => n.trim()).filter(Boolean);
  const vus = new Set();
  return [...depuisReglage, ...recents].filter((n) => {
    const k = n.toLocaleLowerCase('fr');
    if (!n || vus.has(k)) return false;
    vus.add(k);
    return true;
  }).slice(0, 30);
}

export function lireRecents(etab) {
  try {
    const v = JSON.parse(window.localStorage.getItem(cle(etab)) ?? '[]');
    return Array.isArray(v) ? v.filter((n) => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

export function retenirServeur(etab, nom) {
  const n = String(nom ?? '').trim().slice(0, 60);
  if (!n) return;
  try {
    const liste = [n, ...lireRecents(etab).filter((x) => x.toLocaleLowerCase('fr') !== n.toLocaleLowerCase('fr'))].slice(0, 15);
    window.localStorage.setItem(cle(etab), JSON.stringify(liste));
  } catch {
    /* stockage indisponible : pas de suggestion, rien de grave */
  }
}
