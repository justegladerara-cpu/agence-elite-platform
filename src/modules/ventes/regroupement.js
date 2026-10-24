// Regroupe des ventes validées : par personne qui a encaissé (vendeur), par serveur (« servi par »), par heure ou
// par client. Fonction pure, testée dans tests/ventes_regroupement.test.js.
export function regrouper(ventes, axe, { nomPersonne = () => null, nomClient = () => null } = {}) {
  const groupes = new Map();
  for (const v of ventes ?? []) {
    let cle;
    let libelle;
    if (axe === 'serveur') {
      cle = v.servi_par?.trim() || null;
      libelle = cle ?? 'Sans serveur';
    } else if (axe === 'heure') {
      const h = new Date(v.cree_le).getHours();
      cle = String(h);
      libelle = `${h} h – ${(h + 1) % 24} h`;
    } else if (axe === 'client') {
      cle = v.contact_id ?? null;
      libelle = cle ? (nomClient(cle) ?? 'Client') : 'Clients de passage';
    } else {
      cle = v.vendeur ?? null;
      libelle = cle ? (nomPersonne(cle) ?? 'Une personne') : 'Personne inconnue';
    }
    const g = groupes.get(cle) ?? { cle, libelle, nombre: 0, total: 0 };
    g.nombre += 1;
    g.total += Number(v.total) || 0;
    groupes.set(cle, g);
  }
  const liste = [...groupes.values()];
  // Les heures se lisent dans l'ordre de la soirée (6 h en premier) ; le reste du plus gros au plus petit.
  if (axe === 'heure') return liste.sort((a, b) => ((Number(a.cle) + 18) % 24) - ((Number(b.cle) + 18) % 24));
  return liste.sort((a, b) => b.total - a.total || b.nombre - a.nombre);
}
