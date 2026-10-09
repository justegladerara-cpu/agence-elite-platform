-- Assistant (module M10, Bêta) : une seule liste « à regarder aujourd'hui » pour le gérant.
-- Pas d'IA générative : chaque alerte est un calcul de la base sur des données réelles de l'établissement.
--   1. reprend les alertes « À surveiller » de chaque tableau de bord que l'utilisateur a le droit de voir
--      (cockpit_domaines → cockpit_<domaine>) ;
--   2. ajoute deux contrôles propres : annulations répétées par une même personne, remises fortes.
-- Lecture seule, « security invoker » : la RLS de chaque table s'applique (établissement, Hub, rôle, licence).
-- Rien n'est écrit, aucun client existant ne reçoit le module automatiquement (par_defaut = false).

insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('assistant', 'Assistant', 'Les points à regarder aujourd’hui : alertes de tous vos tableaux de bord, annulations répétées, remises fortes.',
   'transversal', 'beta', 'reporting', 'alerte', 6, '0.1', 'docs/ASSISTANT.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "periode_jours", "libelle": "Nombre de jours analysés", "type": "nombre", "defaut": 7},
  {"cle": "seuil_annulations", "libelle": "Annulations par une même personne avant alerte", "type": "nombre", "defaut": 3},
  {"cle": "seuil_remise", "libelle": "Remise (en %) jugée forte", "type": "nombre", "defaut": 30}
]'::jsonb where id = 'assistant';
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'assistant', false from public.solutions s
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('assistant.lire', 'assistant', 'Voir les alertes de l''assistant')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'assistant.lire' from unnest(array['gerant', 'responsable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- Réglage numérique de l'assistant, lisible seulement par qui a le droit de voir l'assistant.
create function public.assistant_reglage(p_etablissement_id uuid, p_cle text, p_defaut numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v numeric;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'assistant.lire') then return p_defaut; end if;
  begin
    v := (public.parametre_module(p_etablissement_id, 'assistant', p_cle) #>> '{}')::numeric;
  exception when others then
    v := null;
  end;
  return coalesce(v, p_defaut);
end
$$;
revoke all on function public.assistant_reglage(uuid, text, numeric) from public, anon;
grant execute on function public.assistant_reglage(uuid, text, numeric) to authenticated;

create function public.assistant_alertes(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_jours integer;
  v_seuil_annul integer;
  v_seuil_remise numeric;
  v_au date;
  v_du date;
  v_alertes jsonb := '[]'::jsonb;
  v_ignores jsonb := '[]'::jsonb;
  d jsonb;
  r jsonb;
  a record;
  v_nb integer;
begin
  if p_etablissement_id is null or not public.lecture_autorisee(p_etablissement_id, 'assistant.lire') then
    raise exception 'Accès refusé à l''assistant';
  end if;
  v_jours := greatest(1, least(90, public.assistant_reglage(p_etablissement_id, 'periode_jours', 7)::integer));
  v_seuil_annul := greatest(1, public.assistant_reglage(p_etablissement_id, 'seuil_annulations', 3)::integer);
  v_seuil_remise := least(100, greatest(1, public.assistant_reglage(p_etablissement_id, 'seuil_remise', 30)));
  select (now() at time zone coalesce(nullif(e.fuseau, ''), 'UTC'))::date into v_au
  from public.etablissements e where e.id = p_etablissement_id;
  v_au := coalesce(v_au, current_date);
  v_du := v_au - (v_jours - 1);

  -- 1. Alertes des tableaux de bord visibles par l'utilisateur.
  for d in select * from jsonb_array_elements(public.cockpit_domaines(p_etablissement_id)) loop
    if to_regprocedure(format('public.cockpit_%s(uuid, date, date, jsonb)', d ->> 'id')) is null then continue; end if;
    begin
      execute format('select public.%I($1, $2, $3, $4)', 'cockpit_' || (d ->> 'id'))
        into r using p_etablissement_id, v_du, v_au, '{}'::jsonb;
      select v_alertes || coalesce(jsonb_agg(x || jsonb_build_object('domaine', d ->> 'id', 'domaine_titre', d ->> 'titre')), '[]'::jsonb)
        into v_alertes
      from jsonb_array_elements(coalesce(r -> 'attention', '[]'::jsonb)) x;
    exception when others then
      v_ignores := v_ignores || to_jsonb(d ->> 'titre');
    end;
  end loop;

  -- 2. Contrôles propres à l'assistant (ventes lisibles seulement).
  if public.lecture_autorisee(p_etablissement_id, 'ventes.lire') then
    for a in
      select v.annulee_par, count(*) as nb
      from public.ventes v
      where v.etablissement_id = p_etablissement_id and v.statut = 'annulee'
        and v.annulee_le >= v_du::timestamptz and v.annulee_par is not null
      group by v.annulee_par
      having count(*) >= v_seuil_annul
      order by count(*) desc
      limit 5
    loop
      v_alertes := v_alertes || jsonb_build_object(
        'cle', 'annulations_' || a.annulee_par, 'niveau', 'alerte', 'domaine', 'assistant', 'domaine_titre', 'Contrôles',
        'titre', 'Annulations répétées par une même personne',
        'detail', format('%s : %s vente(s) annulée(s) en %s jour(s)', coalesce(public.cockpit_nom_utilisateur(a.annulee_par), 'Utilisateur'), a.nb, v_jours),
        'nombre', a.nb, 'route', 'ventes?statut=annulee');
    end loop;

    select count(*) into v_nb
    from public.ventes v
    where v.etablissement_id = p_etablissement_id and v.statut = 'validee' and v.cree_le >= v_du::timestamptz
      and v.sous_total > 0
      and (v.remise + coalesce((select sum(l.remise) from public.lignes_vente l where l.vente_id = v.id), 0)) * 100
          >= v_seuil_remise * (v.sous_total + coalesce((select sum(l.remise) from public.lignes_vente l where l.vente_id = v.id), 0));
    if v_nb > 0 then
      v_alertes := v_alertes || jsonb_build_object(
        'cle', 'remises_fortes', 'niveau', 'info', 'domaine', 'assistant', 'domaine_titre', 'Contrôles',
        'titre', format('Ventes avec une remise d’au moins %s %%', v_seuil_remise),
        'detail', format('Sur les %s dernier(s) jour(s)', v_jours), 'nombre', v_nb, 'route', 'ventes');
    end if;
  end if;

  return jsonb_build_object(
    'du', v_du, 'au', v_au, 'jours', v_jours, 'ignores', v_ignores,
    'alertes', coalesce((
      select jsonb_agg(x order by case x ->> 'niveau' when 'critique' then 0 when 'alerte' then 1 else 2 end, (x ->> 'nombre')::numeric desc nulls last)
      from jsonb_array_elements(v_alertes) x), '[]'::jsonb)
  );
end
$$;
revoke all on function public.assistant_alertes(uuid) from public, anon;
grant execute on function public.assistant_alertes(uuid) to authenticated;

notify pgrst, 'reload schema';
