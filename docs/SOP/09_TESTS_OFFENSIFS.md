# SOP 09 · Tests offensifs

À chaque nouvelle RPC ou table, essayer de la casser (`tests/audit_offensif.test.js`, `tests/hubs.test.js`) :

1. Appel sans être connecté (`anon`) → refus.
2. Appel sur l'établissement d'un autre client → refus.
3. Appel sur un Hub non accordé → refus.
4. Permission retirée, module retiré, licence suspendue ou expirée → refus d'écriture, lecture conservée.
5. Valeurs absurdes : quantité négative ou nulle, montant négatif, transfert vers le même Hub,
   stock insuffisant, motif vide.
6. Écriture directe dans la table (`insert`/`update`/`delete` via l'API) → refusée par RLS.
7. Tentative de supprimer une vente, un paiement, un mouvement → refusée.
8. Comptes : identifiant inconnu et mauvais mot de passe donnent le **même** message ;
   blocage après 5 échecs ; ancien mot de passe refusé après changement.
