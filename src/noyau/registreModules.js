const modules = new Map();
export function enregistrerModule(manifeste) {
  if (!manifeste?.id || !Array.isArray(manifeste.permissions)) throw new Error('Manifeste de module invalide');
  modules.set(manifeste.id, Object.freeze({ ...manifeste }));
}
export function modulesActifs(ids) { return ids.map((id) => modules.get(id)).filter(Boolean); }
export function viderRegistre() { modules.clear(); }
