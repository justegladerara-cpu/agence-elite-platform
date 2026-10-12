-- Caisse : « Tu es toujours là ? » au lieu de la déconnexion sans prévenir (2026-10-12, demande de Juste).
-- Après « verrouillage_inactivite » minutes sans activité, l'application demande à la personne qui a SA caisse ouverte
-- si elle est toujours là, avec un compte à rebours de « delai_reponse_presence » minutes. Sans réponse : déconnexion,
-- la caisse reste ouverte. Réglage lu par l'application seulement (aucune fonction ne change).
update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "delai_reponse_presence", "libelle": "Temps laissé pour répondre à « Tu es toujours là ? » avant la déconnexion, en minutes (0 = déconnexion directe ; la caisse reste ouverte)", "type": "nombre", "defaut": 5}
]'::jsonb
where id = 'cloture' and not parametres_schema @> '[{"cle": "delai_reponse_presence"}]'::jsonb;
