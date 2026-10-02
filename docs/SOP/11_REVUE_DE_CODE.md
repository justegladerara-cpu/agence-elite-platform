# SOP 11 · Relire du code

Liste à cocher :
- [ ] Les écritures passent par une RPC qui vérifie identité, permission, module, licence, Hub.
- [ ] Nouvelle table : RLS active, politique de lecture testée.
- [ ] Aucune migration déjà appliquée modifiée.
- [ ] Aucune suppression physique de donnée financière ou de stock.
- [ ] Aucun secret, mot de passe ou donnée réelle dans le diff.
- [ ] Tests : cas autorisé + cas refusé ; isolation.
- [ ] Écran : composants du design system, mobile OK, vocabulaire simple, pas de Hub en mono-Hub.
- [ ] Docs : DECISIONS / SOP mises à jour si le fonctionnement change.
