# SOP 77 — Saisir les ventes d'un jour passé (après coup)

**Qui :** gérant, responsable (droit `caisse.rattraper`). **Où :** Clôture de caisse › **Ventes d'un jour passé**.
**Quand :** des ventes ont été faites sans la caisse (coupure d'électricité ou d'internet, oubli). Les caissiers ne
peuvent pas le faire.

## Étapes
1. Clôture de caisse › **Ventes d'un jour passé**.
2. Choisir la caisse (s'il y en a plusieurs), le **jour** (hier au plus tard, 31 jours en arrière au plus) et la
   **raison** (obligatoire, ex. « coupure d'électricité »).
3. Pour chaque vente : les articles et quantités, le mode de paiement (ou « À crédit » avec le client qui doit),
   l'heure si on la connaît (sinon 12:00). **Ajouter une vente** pour la suivante.
4. Espèces comptées ce jour-là : si on les connaît. Sinon laisser vide : le ticket Z portera « espèces à compter » et se
   compte ensuite (SOP 76).
5. **Enregistrer et fermer la caisse de ce jour** : le ticket Z du jour s'affiche, prêt à imprimer.

## Ce que fait la plateforme
- Une caisse datée de ce jour est ouverte puis fermée aussitôt ; la caisse d'aujourd'hui n'est pas touchée.
- Mêmes contrôles qu'en caisse : prix actuel des articles, stock, crédit avec un client. Une seule vente fausse :
  **rien** n'est enregistré, le message donne le numéro de la vente.
- Ventes, paiements et sorties de stock sont datés du jour choisi. Chaque vente porte « Saisie après coup : raison »,
  le ticket Z aussi. Le journal d'audit garde la vraie date de saisie et la personne.
- Les numéros de vente continuent la suite habituelle (ils ne sont pas réinsérés dans l'ordre des dates).

## Attention
- Si le stock a été **compté depuis** ce jour-là, les sorties de stock de ces ventes le baisseront une seconde fois :
  refaire un comptage après la saisie (Stock › Je compte mon stock).

Fonction : `saisir_ventes_passees` (`supabase/migrations/20261010000125_ventes_saisies_apres_coup.sql`).
