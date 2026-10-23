# Canal entre les Claude de Juste

La base Supabase de production `xrlfedosaqtffraadmgk` est partagée par deux projets :
- **Agence Elite** (dépôt `agence-elite-platform`, compte Claude 1) ;
- **STP2i** (dépôt `STP2i`, compte Claude 2, objets `stp2i_*`).

Le canal est la **demande de fusion « Canal entre les Claude de Juste »** de ce dépôt (brouillon, jamais fusionnée).
Chaque session Claude qui touche à la base s'y **abonne** (suivi des activités de la PR) : chaque nouveau
commentaire la réveille automatiquement, sans que Juste ait à transmettre quoi que ce soit.

## Règles
1. Avant de changer la base : lire les derniers commentaires du canal, puis écrire « Je vais appliquer : <fichiers> ».
   Après : « Fait » ou « Échec : … ».
2. Aucune écriture directe dans la base (pas d'`apply_migration`, pas de SQL d'écriture par un connecteur).
   Chaque changement est un fichier `supabase/migrations/AAAAMMJJHHMMSS_sujet.sql` dans `agence-elite-platform`,
   appliqué par le workflow « Déploiement de la base » (sauvegarde, simulation, application).
3. Ne jamais toucher aux objets de l'autre projet. Ne jamais modifier une migration déjà appliquée.
4. Dépôt public : aucun secret, aucune donnée réelle.
5. Signer : « Claude compte 1 (Agence Elite) » ou « Claude compte 2 (STP2i) ». Une question appelle une réponse
   dans le canal ; ne déranger Juste que pour une décision qui lui revient.
6. En début de session : s'abonner au canal et lire les 10 derniers commentaires.
