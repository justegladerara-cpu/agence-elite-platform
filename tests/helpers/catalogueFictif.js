// Données inventées : aucun catalogue client n'est lu ou copié.
// 218 articles actifs, 20 variantes neutres, 10 entrées à confirmer,
// 29 catégories et 114 articles préparés au bar : cas de charge reproductible.
const echapper = (valeur) => `"${String(valeur).replaceAll('"', '""')}"`;
export function catalogueFictifCsv() {
  const entetes = ['nom', 'prix_vente', 'categorie', 'reference', 'variante', 'actif', 'suivi_stock', 'poste_preparation', 'motif_attente'];
  const lignes = [];
  for (let i = 0; i < 228; i += 1) {
    const actif = i < 218;
    // Dix paires partagent le nom, avec deux tarifs distincts et references uniques.
    const nom = i < 20 ? `Article fictif variante ${Math.floor(i / 2) + 1}`
      : i === 20 ? 'Article fictif, « épicé »; grand "format"' : `Article fictif ${i + 1}`;
    const categorie = `Catégorie fictive ${String(i % 29 + 1).padStart(2, '0')}`;
    lignes.push([nom, actif ? 700 + i * 25 : '', categorie, `FICTIF-${String(i + 1).padStart(3, '0')}`,
      i < 20 ? (i % 2 === 0 ? 'Tarif 1' : 'Tarif 2') : '', actif ? 'oui' : 'non', 'non', i < 114 ? 'bar' : 'cuisine',
      actif ? '' : 'Prix fictif à confirmer']);
  }
  return [entetes.join(';'), ...lignes.map((l) => l.map(echapper).join(';'))].join('\n');
}
