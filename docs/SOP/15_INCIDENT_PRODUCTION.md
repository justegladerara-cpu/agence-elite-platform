# SOP 15 · Réagir à un incident

1. **Constater** : qui est touché (un client, tous ?), depuis quand, quel écran, quel message.
2. **Protéger** : si des données risquent d'être abîmées, suspendre l'écriture de l'établissement
   (licence suspendue = lecture seule, rien n'est supprimé) plutôt que toucher à la base.
3. **Sauvegarder** tout de suite ([SOP 13](13_SAUVEGARDER_ET_RESTAURER.md)).
4. **Diagnostiquer** : Supabase → Logs (API, Auth, Postgres) ; Cloudflare → Deployments ; GitHub → Actions ;
   `journal_audit` pour savoir qui a fait quoi.
5. **Corriger** : [SOP 10](10_CORRIGER_UN_BUG.md), ou retour arrière du site ([SOP 16](16_RETOUR_ARRIERE.md)).
6. **Informer** le client en français simple : ce qui s'est passé, ce qui est réglé, ce qui reste.
7. **Noter** la cause et la parade dans `docs/DECISIONS.md`.
