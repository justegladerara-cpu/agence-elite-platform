-- Caisse : plus de fermeture automatique à minuit, verrouillage sans activité, « Servi par » (2026-10-11, demande de
-- Juste : « parfois la caissière travaille jusqu'au jour d'après… laisse le compte actif jusqu'à ce qu'elle se
-- déconnecte elle-même… si la caisse n'est pas utilisée pendant un certain délai, tu bloques la caisse, tu déconnectes
-- le compte » ; « on peut mentionner le nom du serveur qui a servi »).
--
-- 1. Fermeture automatique (migration 124) : désormais « jamais » par défaut. La caissière ferme elle-même sa caisse
--    avec son ticket Z, à l'heure qu'elle veut. Les établissements restés sur l'ancien défaut 00:00 passent à « jamais » ;
--    une autre heure choisie exprès (ex. 04:00) est gardée.
-- 2. Nouveau réglage « verrouillage_inactivite » (minutes, 15 par défaut, 0 = jamais) : lu par l'application, qui
--    déconnecte la personne ayant une caisse ouverte quand l'écran n'est plus touché. La caisse reste ouverte.
-- 3. Ventes : colonne facultative « servi_par » (nom du serveur, texte libre) et fonction indiquer_serveur_vente.
--    Réglage caisse « serveurs » : noms proposés à la caisse, séparés par des virgules.

-- ---------------------------------------------------------------------------
-- 1. Fermeture automatique : « jamais » par défaut
-- ---------------------------------------------------------------------------
update public.modules m
set parametres_schema = (
  select jsonb_agg(
    case when d ->> 'cle' = 'fermeture_automatique'
      then d || '{"defaut": "", "libelle": "Fermeture automatique de la caisse chaque jour, heure locale HH:MM (vide = jamais, conseillé : chaque personne ferme sa caisse avec son ticket Z)"}'::jsonb
      else d end
    order by n)
  from jsonb_array_elements(m.parametres_schema) with ordinality as t(d, n)
)
where m.id = 'cloture' and m.parametres_schema @> '[{"cle": "fermeture_automatique"}]'::jsonb;

update public.etablissement_parametres
set data = jsonb_set(data, '{fermeture_automatique}', '""'::jsonb)
where module_id = 'cloture' and data ->> 'fermeture_automatique' = '00:00';

-- ---------------------------------------------------------------------------
-- 2. Verrouillage sans activité
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "verrouillage_inactivite", "libelle": "Verrouiller la caisse et déconnecter le compte après N minutes sans activité (0 = jamais ; la caisse reste ouverte)", "type": "nombre", "defaut": 15}
]'::jsonb
where id = 'cloture' and not parametres_schema @> '[{"cle": "verrouillage_inactivite"}]'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Servi par
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "serveurs", "libelle": "Serveurs proposés dans « Servi par » à l''encaissement, séparés par des virgules (facultatif)", "type": "texte", "defaut": ""}
]'::jsonb
where id = 'caisse' and not parametres_schema @> '[{"cle": "serveurs"}]'::jsonb;

alter table public.ventes add column servi_par text check (servi_par is null or length(btrim(servi_par)) between 1 and 60);

-- Après la vente (ou pour corriger) : la personne qui a vendu, ou un responsable. Une vente annulée ne change plus.
create function public.indiquer_serveur_vente(p_vente_id uuid, p_nom text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  nom text := nullif(left(btrim(coalesce(p_nom, '')), 60), '');
begin
  select * into v from public.ventes where id = p_vente_id for update;
  if not found then
    raise exception 'Vente introuvable';
  end if;
  if not ((v.vendeur = auth.uid() and public.a_permission(v.etablissement_id, 'caisse.utiliser'))
          or public.a_permission(v.etablissement_id, 'cloture.cloturer')) then
    raise exception 'Permission refusée';
  end if;
  if v.statut <> 'validee' then
    raise exception 'Une vente annulée est définitive';
  end if;
  update public.ventes set servi_par = nom where id = v.id;
end
$$;
revoke execute on function public.indiquer_serveur_vente(uuid, text) from public, anon;
grant execute on function public.indiquer_serveur_vente(uuid, text) to authenticated;
