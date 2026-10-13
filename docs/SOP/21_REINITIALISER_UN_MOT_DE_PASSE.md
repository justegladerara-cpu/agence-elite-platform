# SOP 21 · Réinitialiser un mot de passe

Agence Elite → **Comptes** → la personne → **Nouveau mot de passe temporaire**.

1. Saisir un mot de passe temporaire et sa durée de validité (jours).
2. Le transmettre de vive voix ou par un canal privé.
3. La personne se connecte et doit le remplacer immédiatement. Le temporaire ne fonctionne plus ensuite.

Compte bloqué après 5 erreurs : la réinitialisation le débloque.
Avec e-mail et SMTP configuré : la personne peut aussi utiliser « Mot de passe oublié ».
Personne n'est jamais capable de lire un mot de passe : Supabase Auth ne garde que l'empreinte.

## Par le responsable de l'établissement (2026-10-13, migration `20261013000133`)
Équipe → la personne → **Nouveau mot de passe** (droit « gérer l'équipe », gérant par défaut ; aussi dans la fiche
établissement côté Agence Elite).
1. Saisir un mot de passe provisoire (4 caractères au moins), valable 7 jours.
2. Copier le message proposé et l'envoyer à la personne (WhatsApp ou de vive voix).
3. Elle se connecte et choisit son propre mot de passe : le responsable ne connaît jamais le vrai.

Règles (vérifiées par la base, `reinitialiser_mot_de_passe_membre`) :
- seulement un rôle en dessous du sien (un gérant ne change pas celui d'un autre gérant) ;
- jamais un compte Agence Elite, jamais son propre compte (profil) ;
- une personne qui travaille aussi pour un autre client : refusé, c'est Agence Elite qui le fait ;
- ses sessions ouvertes sont fermées ; ses caisses restent ouvertes ;
- noté dans les événements de l'établissement (`mot_de_passe_reinitialise`, sans le mot de passe).
Le super admin peut le faire pour tout membre.
