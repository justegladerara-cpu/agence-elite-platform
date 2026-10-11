# SOP 76 — Fermeture automatique de la caisse chaque jour

**Qui :** gérant, responsable. **Où :** Paramètres › Réglages des modules › Clôture, et Clôture de caisse.

## Le principe
- Chaque jour, à l'heure de fin de journée, la caisse encore ouverte est **fermée automatiquement** avec un ticket Z.
  **Depuis le 2026-10-11 (migration `20261011000129`) : désactivée par défaut** — chaque personne ferme sa caisse
  avec son ticket Z, même après minuit ; les établissements restés sur l'ancien défaut 00:00 sont passés à « jamais ».
  On peut toujours choisir une heure (ex. 04:00). À la place, la caisse se verrouille après 15 min sans activité (SOP 29).
- Après cette heure, la caisse de la veille n'accepte plus rien (vente, paiement, dépense, retour). Le caissier ouvre
  la caisse du jour ; le panier en cours reste à l'écran.
- La machine ne peut pas compter les espèces : le ticket Z porte « Fermée automatiquement : espèces à compter ».

## Régler l'heure (droit `etablissement.modifier`)
1. Paramètres › **Réglages des modules** › Clôture › « Fermeture automatique de la caisse chaque jour ».
2. Format HH:MM. Exemple : **04:00** pour un bar ou un restaurant de nuit (la soirée reste sur une seule journée).
3. Laisser vide : jamais de fermeture automatique (clôture manuelle uniquement, comme avant).

## Compter les espèces après une fermeture automatique (droit `cloture.cloturer`)
1. Clôture de caisse › tickets Z › ligne marquée **Espèces à compter**.
2. Saisir les espèces comptées › **Enregistrer le comptage**. L'écart est calculé. Une seule fois : ensuite le ticket Z
   est définitif comme les autres.

## Ce qu'il ne faut pas faire
- Mettre l'heure pendant le service : la caisse ouverte avant cette heure serait fermée tout de suite.
- Compter les espèces « au jugé » : compter le tiroir réel.

Fonctions : `fin_journee_caisse`, `fermer_caisses_du_jour`, `compter_cloture`
(`supabase/migrations/20261010000124_fermeture_caisse_quotidienne.sql`). En production, une tâche planifiée (pg_cron)
passe toutes les 5 minutes ; la caisse et l'écran Clôture font aussi la fermeture à l'ouverture.
