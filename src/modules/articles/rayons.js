// Articles rangés par rayon (catégorie), les plus vendus d'abord (Juste, 2026-10-24). Fonction pure, testée dans
// tests/articles_rayons.test.js.
// ventes : { [article_id]: { quantite, chiffre } } sur les 30 derniers jours (vide si inconnu).
export const SANS_RAYON = '__sans';

export function rangerParRayon(articles, categories, ventes = {}) {
  const n = (x) => Number(x) || 0;
  const rayons = [...(categories ?? []).filter((c) => !c.archivee_le).map((c) => ({ id: c.id, nom: c.nom })), { id: SANS_RAYON, nom: 'Sans rayon' }]
    .map((r) => ({ ...r, articles: [], chiffre: 0 }));
  const parId = Object.fromEntries(rayons.map((r) => [r.id, r]));
  for (const a of articles ?? []) {
    const r = parId[a.categorie_id] ?? parId[SANS_RAYON];
    const v = ventes[a.id];
    r.articles.push({ ...a, vendu: n(v?.quantite), chiffre: n(v?.chiffre) });
    r.chiffre += n(v?.chiffre);
  }
  for (const r of rayons) {
    r.articles.sort((x, y) => y.vendu - x.vendu || x.nom.localeCompare(y.nom, 'fr'));
    // Les 3 meilleures ventes du rayon (seulement celles qui se sont vendues).
    r.meilleurs = r.articles.filter((x) => x.vendu > 0).slice(0, 3).map((x) => x.id);
  }
  // Le rayon « Sans rayon » vide n'est pas montré ; les rayons vides restent (on peut y glisser des articles).
  return rayons.filter((r) => r.id !== SANS_RAYON || r.articles.length > 0);
}
