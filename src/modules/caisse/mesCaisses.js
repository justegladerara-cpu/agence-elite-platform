// Une caisse par personne (migration 20261011000128) : chacun ne voit et n'utilise que les caisses ouvertes avec son
// propre compte. Les caisses de rattrapage (ventes d'un jour passé) ne servent jamais à vendre.
export function mesCaisses(sessions, utilisateur) {
  return (sessions ?? []).filter((s) => !s.rattrapage && s.ouverte_par && s.ouverte_par === utilisateur?.id);
}
