# SOP 44 — Envoyer une notification

Les notifications apparaissent dans la cloche (barre du haut), rafraîchie chaque minute.

Dans une fonction RPC (security definer), après l'action :
```sql
-- à une personne précise
perform public.notifier(user_id, p_etablissement_id, 'module.evenement', 'Titre court', 'Texte', 'page-cible');
-- à toutes les personnes ayant un droit (sauf l'auteur de l'action)
perform public.notifier_permission(p_etablissement_id, 'facturation.gerer', 'facturation.echeance', 'Facture échue', libelle, 'factures');
```
- `lien` = identifiant de page du menu (`[a-z0-9_/-]`, ex. `employes/<id>`), jamais une URL externe.
- Pas de donnée confidentielle dans le titre ou le texte (salaire, motif médical).
- `notifier` et `notifier_permission` ne sont pas appelables depuis l'écran (droits retirés).
- Lecture : `mes_notifications(p_limite)` ; marquage : `marquer_notifications_lues(p_ids)` (toutes si vide).
