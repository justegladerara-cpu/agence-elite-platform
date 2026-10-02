# SOP 17 · Gérer un secret

- Secrets GitHub (Settings → Secrets → Actions) : `SUPABASE_DB_URL`, `SAUVEGARDE_PHRASE`. Rien d'autre.
- `.env.production` ne contient que l'URL Supabase et la clé **publishable** (publique par nature).
- La clé `service_role` n'est utilisée nulle part. Ne pas l'ajouter.
- Jamais de secret dans : code, commit, journal de workflow (`::add-mask::`), documentation, capture, message.
- Rotation : changer le mot de passe de la base dans Supabase → mettre à jour `SUPABASE_DB_URL` →
  relancer « Déploiement de la base » en simulation pour vérifier la connexion.
- `SAUVEGARDE_PHRASE` : à garder aussi hors de GitHub (sans elle, les sauvegardes sont illisibles).
- Mot de passe temporaire de démo (`1234`) : passé en entrée masquée du workflow, jamais stocké en clair
  (Supabase Auth le hache) et refusé comme mot de passe définitif.
