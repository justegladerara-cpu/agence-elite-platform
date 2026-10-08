-- Modules complémentaires : un établissement garde sa solution (solution_id ne change jamais) mais peut recevoir,
-- par sa licence, des modules proposés par une autre solution (ex. un établissement « commerce » reçoit Salle et
-- Cuisine). Accordé uniquement par Agence Elite (Super Admin ou éditeur), avec motif tracé ; dépendances ajoutées
-- automatiquement ; retirer = désactiver (aucune donnée supprimée) ; la suspension de licence s'applique pareil
-- (module_couvert lit la même licence). Option payante : tarif réglable par module (options_modules).

-- 1. Tarifs des options (aucun montant en dur : saisis dans Offres et prix).
create table if not exists public.options_modules (
  module_id text primary key references public.modules(id) on delete restrict,
  prix_mise_en_service numeric(14, 2) not null default 0 check (prix_mise_en_service >= 0),
  prix_mensuel numeric(14, 2) not null default 0 check (prix_mensuel >= 0),
  prix_annuel numeric(14, 2) not null default 0 check (prix_annuel >= 0),
  devise text not null default 'XAF',
  actif boolean not null default true,
  modifie_le timestamptz not null default now(),
  modifie_par uuid
);
alter table public.options_modules enable row level security;
drop policy if exists catalogue_lecture on public.options_modules;
create policy catalogue_lecture on public.options_modules for select to authenticated using (true);
revoke insert, update, delete on public.options_modules from anon, authenticated;
drop trigger if exists options_modules_audit on public.options_modules;
create trigger options_modules_audit after insert or update or delete on public.options_modules
for each row execute function public.journaliser_modification();

create or replace function public.enregistrer_option_module(p_module_id text, p_option jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  if not exists (select 1 from public.modules where id = p_module_id and nature <> 'socle') then
    raise exception 'Module inconnu ou inclus d''office (socle)';
  end if;
  insert into public.options_modules (module_id, prix_mise_en_service, prix_mensuel, prix_annuel, devise, actif, modifie_le, modifie_par)
  values (p_module_id, coalesce((p_option ->> 'prix_mise_en_service')::numeric, 0), coalesce((p_option ->> 'prix_mensuel')::numeric, 0),
          coalesce((p_option ->> 'prix_annuel')::numeric, 0), coalesce(nullif(p_option ->> 'devise', ''), 'XAF'),
          coalesce((p_option ->> 'actif')::boolean, true), now(), auth.uid())
  on conflict (module_id) do update set
    prix_mise_en_service = excluded.prix_mise_en_service, prix_mensuel = excluded.prix_mensuel, prix_annuel = excluded.prix_annuel,
    devise = excluded.devise, actif = excluded.actif, modifie_le = now(), modifie_par = auth.uid();
end
$$;

-- 2. Un module peut-il être accordé en complément à cet établissement ?
--    Module disponible (actif ou bêta), hors socle, absent de la solution, proposé par au moins une solution.
create or replace function public.module_complementaire_possible(p_etablissement_id uuid, p_module_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.modules m
    join public.etablissements e on e.id = p_etablissement_id
    where m.id = p_module_id and m.nature <> 'socle' and m.statut in ('actif', 'beta')
      and not exists (select 1 from public.solution_modules sm where sm.solution_id = e.solution_id and sm.module_id = m.id)
      and exists (select 1 from public.solution_modules sm where sm.module_id = m.id)
  )
$$;

-- Fermeture des dépendances (hors socle, déjà inclus partout) d'un ensemble de modules.
create or replace function public.modules_avec_dependances(p_modules text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ferme(id) as (
    select unnest(p_modules)
    union
    select d.depend_de from public.module_dependances d join ferme f on d.module_id = f.id
  )
  select coalesce(array_agg(f.id order by f.id), '{}')
  from ferme f join public.modules m on m.id = f.id
  where m.nature <> 'socle'
$$;

-- Niveaux de dépendance d'un ensemble quelconque de modules (plus le niveau est haut, plus d'autres en dépendent).
create or replace function public.niveaux_modules_ensemble(p_modules text[])
returns table (module_id text, niveau integer)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive profondeur(module_id, niveau) as (
    select unnest(p_modules), 0
    union all
    select d.depend_de, p.niveau + 1
    from profondeur p
    join public.module_dependances d on d.module_id = p.module_id
    where p.niveau < 20
  )
  select module_id, max(niveau)::integer from profondeur group by module_id
$$;

-- 3. Un module actif doit être proposé par la solution OU accordé en complément par la licence en cours.
--    Désactiver reste toujours possible (masquer, jamais supprimer).
create or replace function public.verifier_module_propose()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.actif then
    return new;
  end if;
  if exists (
    select 1 from etablissements e join solution_modules sm on sm.solution_id = e.solution_id
    where e.id = new.etablissement_id and sm.module_id = new.module_id
  ) then
    return new;
  end if;
  if exists (
    select 1 from licences l
    where l.etablissement_id = new.etablissement_id and l.statut <> 'terminee'
      and new.module_id = any (l.modules_supplementaires)
  ) then
    return new;
  end if;
  raise exception 'Le module n''est pas proposé par la solution de l''établissement ni accordé en complément';
end
$$;

-- 4. Accorder ou retirer un module : ceux de la solution comme avant ; ceux d'une autre solution en complément
--    (motif obligatoire, dépendances ajoutées, montant de l'option tracé).
create or replace function public.accorder_module(p_etablissement_id uuid, p_module_id text, p_accorde boolean, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  licence public.licences%rowtype;
  offre public.offres%rowtype;
  etab public.etablissements%rowtype;
  dans_solution boolean;
  ajoutes text[];
  montant numeric := 0;
begin
  perform public.exiger_editeur();
  select * into etab from public.etablissements where id = p_etablissement_id;
  if etab.id is null then
    raise exception 'Établissement introuvable';
  end if;
  select * into licence from public.licences where etablissement_id = p_etablissement_id and statut <> 'terminee' for update;
  if licence.id is null then
    raise exception 'Cet établissement n''a pas de licence en cours';
  end if;
  select * into offre from public.offres where id = licence.offre_id;
  dans_solution := exists (select 1 from public.solution_modules sm where sm.solution_id = etab.solution_id and sm.module_id = p_module_id);
  if not dans_solution and not (p_module_id = any (licence.modules_supplementaires))
     and not public.module_complementaire_possible(p_etablissement_id, p_module_id) then
    raise exception 'Le module % ne peut pas être accordé à cet établissement', p_module_id;
  end if;
  if not dans_solution and nullif(btrim(coalesce(p_motif, '')), '') is null then
    raise exception 'Un motif est obligatoire pour accorder ou retirer un module complémentaire';
  end if;

  if p_accorde then
    if p_module_id = any (offre.modules || licence.modules_supplementaires) then
      return;
    end if;
    if dans_solution then
      perform public.verifier_modules_offre(offre.solution_id, array(
        select m from unnest(offre.modules || licence.modules_supplementaires || p_module_id) m
        where exists (select 1 from public.solution_modules sm where sm.solution_id = etab.solution_id and sm.module_id = m)
      ));
      ajoutes := array[p_module_id];
    else
      if exists (select 1 from public.modules where id = p_module_id and statut not in ('actif', 'beta')) then
        raise exception 'Le module % n''est pas encore disponible', p_module_id;
      end if;
      -- Le module et toutes ses dépendances absentes de la licence.
      ajoutes := array(
        select m from unnest(public.modules_avec_dependances(array[p_module_id])) m
        where not m = any (offre.modules || licence.modules_supplementaires)
      );
      if exists (select 1 from public.modules m where m.id = any (ajoutes) and m.statut not in ('actif', 'beta')) then
        raise exception 'Une dépendance du module % n''est pas disponible', p_module_id;
      end if;
      select coalesce(sum(case licence.formule when 'annuel' then o.prix_annuel when 'mensuel' then o.prix_mensuel else 0 end
                          + o.prix_mise_en_service), 0)
      into montant
      from public.options_modules o where o.module_id = any (ajoutes) and o.actif;
    end if;
    update public.licences set modules_supplementaires = modules_supplementaires || ajoutes where id = licence.id;
  else
    if p_module_id = any (offre.modules) then
      raise exception 'Ce module est inclus dans l''offre « % » : changez d''offre pour le retirer', offre.nom;
    end if;
    if exists (
      select 1 from public.module_dependances d
      where d.depend_de = p_module_id and d.module_id = any (offre.modules || licence.modules_supplementaires)
    ) then
      raise exception 'Un autre module accordé dépend de celui-ci';
    end if;
    update public.licences set modules_supplementaires = array_remove(modules_supplementaires, p_module_id) where id = licence.id;
    ajoutes := array[p_module_id];
  end if;
  insert into public.licence_evenements (licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, motif, acteur)
  values (licence.id, p_etablissement_id, 'attribution', licence.echeance, licence.echeance, montant,
          case when p_accorde then 'Module accordé : ' else 'Module retiré : ' end || array_to_string(ajoutes, ', ')
            || case when dans_solution then '' else ' [complémentaire]' end
            || coalesce(' (' || nullif(btrim(p_motif), '') || ')', ''), auth.uid());
  perform public.synchroniser_modules_licence(p_etablissement_id);
end
$$;

-- 5. Synchronisation : couvre aussi les modules complémentaires (activés dès qu'ils sont accordés, désactivés sans
--    perte de données quand ils ne sont plus couverts).
create or replace function public.synchroniser_modules_licence(p_etablissement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  solution text;
  complementaires text[];
  ensemble text[];
  ligne record;
begin
  select solution_id into solution from public.etablissements where id = p_etablissement_id;
  select coalesce(array(
    select m from public.licences l, unnest(l.modules_supplementaires) m
    where l.etablissement_id = p_etablissement_id and l.statut <> 'terminee'
      and not exists (select 1 from public.solution_modules sm where sm.solution_id = solution and sm.module_id = m)
  ), '{}') into complementaires;
  ensemble := array(select sm.module_id from public.solution_modules sm where sm.solution_id = solution) || complementaires
           || array(select em.module_id from public.etablissement_modules em where em.etablissement_id = p_etablissement_id);
  for ligne in
    select em.module_id from public.etablissement_modules em
    join public.niveaux_modules_ensemble(ensemble) n on n.module_id = em.module_id
    where em.etablissement_id = p_etablissement_id and em.actif
      and not public.module_couvert(p_etablissement_id, em.module_id)
    order by n.niveau asc
  loop
    update public.etablissement_modules set actif = false, source = 'licence'
    where etablissement_id = p_etablissement_id and module_id = ligne.module_id;
  end loop;
  for ligne in
    select a.module_id from (
      select sm.module_id from public.solution_modules sm where sm.solution_id = solution and sm.par_defaut
      union
      select unnest(complementaires)
    ) a
    join public.niveaux_modules_ensemble(ensemble) n on n.module_id = a.module_id
    where public.module_couvert(p_etablissement_id, a.module_id)
      and not exists (
        select 1 from public.etablissement_modules em
        where em.etablissement_id = p_etablissement_id and em.module_id = a.module_id and em.actif
      )
    order by n.niveau desc
  loop
    insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par, source)
    values (p_etablissement_id, ligne.module_id, true, now(), auth.uid(), 'licence')
    on conflict (etablissement_id, module_id) do update
    set actif = true, active_le = now(), active_par = auth.uid(), source = 'licence';
  end loop;
end
$$;

-- 6. Vue Super Admin : modules complémentaires d'un établissement (possibles ou accordés), dépendances, tarif, historique.
create or replace function public.modules_complementaires_etablissement(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  etab public.etablissements%rowtype;
  supp text[];
begin
  perform public.exiger_editeur();
  select * into etab from public.etablissements where id = p_etablissement_id;
  select coalesce(l.modules_supplementaires, '{}') into supp
  from public.licences l where l.etablissement_id = p_etablissement_id and l.statut <> 'terminee';
  return jsonb_build_object(
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'nom', m.nom, 'nature', m.nature, 'statut', m.statut,
        'accorde', m.id = any (coalesce(supp, '{}')),
        'actif', coalesce((select em.actif from public.etablissement_modules em where em.etablissement_id = etab.id and em.module_id = m.id), false),
        'solutions', coalesce((select jsonb_agg(sm.solution_id order by sm.solution_id) from public.solution_modules sm where sm.module_id = m.id), '[]'::jsonb),
        'depend_de', coalesce((select jsonb_agg(d.depend_de order by d.depend_de) from public.module_dependances d where d.module_id = m.id), '[]'::jsonb),
        'option', (select jsonb_build_object('prix_mise_en_service', o.prix_mise_en_service, 'prix_mensuel', o.prix_mensuel,
                                             'prix_annuel', o.prix_annuel, 'devise', o.devise, 'actif', o.actif)
                   from public.options_modules o where o.module_id = m.id)
      ) order by m.nom)
      from public.modules m
      where m.nature <> 'socle'
        and not exists (select 1 from public.solution_modules sm where sm.solution_id = etab.solution_id and sm.module_id = m.id)
        and (m.id = any (coalesce(supp, '{}')) or public.module_complementaire_possible(etab.id, m.id))
    ), '[]'::jsonb),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object('cree_le', ev.cree_le, 'motif', ev.motif, 'montant', ev.montant) order by ev.cree_le desc)
      from public.licence_evenements ev
      where ev.etablissement_id = p_etablissement_id and ev.motif like '%[complémentaire]%'
    ), '[]'::jsonb)
  );
end
$$;

CREATE OR REPLACE FUNCTION public.editeur_etablissement(p_etablissement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  etab public.etablissements%rowtype;
begin
  perform public.exiger_editeur();
  select * into etab from public.etablissements where id = p_etablissement_id;
  if etab.id is null then
    raise exception 'Établissement introuvable';
  end if;
  return jsonb_build_object(
    'etablissement', to_jsonb(etab),
    'client', (select jsonb_build_object('id', c.id, 'nom', c.nom, 'statut', c.statut) from public.clients c where c.id = etab.client_id),
    'licence', public.resume_licence(etab.id),
    'ecriture', public.etablissement_autorise_ecriture(etab.id),
    'historique_licences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', ev.type, 'cree_le', ev.cree_le, 'ancienne_echeance', ev.ancienne_echeance,
        'nouvelle_echeance', ev.nouvelle_echeance, 'montant', ev.montant, 'reference', ev.reference,
        'motif', ev.motif, 'offre', o.nom, 'formule', l.formule
      ) order by ev.cree_le desc)
      from public.licence_evenements ev
      join public.licences l on l.id = ev.licence_id
      join public.offres o on o.id = l.offre_id
      where ev.etablissement_id = etab.id
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'nom', m.nom, 'nature', m.nature,
        'actif', coalesce(em.actif, false),
        'couvert', public.module_couvert(etab.id, m.id),
        'depend_de', coalesce((select jsonb_agg(d.depend_de) from public.module_dependances d where d.module_id = m.id), '[]'::jsonb)
      ) order by n.niveau desc, m.nom)
      from public.solution_modules sm
      join public.modules m on m.id = sm.module_id
      join public.niveaux_modules(etab.solution_id) n on n.module_id = m.id
      left join public.etablissement_modules em on em.etablissement_id = etab.id and em.module_id = m.id
      where sm.solution_id = etab.solution_id
    ), '[]'::jsonb),
    'modules_complementaires', public.modules_complementaires_etablissement(etab.id),
    'equipe', public.equipe_etablissement(etab.id),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'nom', h.nom, 'code', h.code, 'type', h.type, 'principal', h.principal, 'actif', h.actif,
        'capacite_vente', h.capacite_vente, 'capacite_stock', h.capacite_stock, 'capacite_caisse', h.capacite_caisse,
        'capacite_transfert', h.capacite_transfert, 'adresse', h.adresse, 'telephone', h.telephone,
        'caisses', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'actif', p.actif) order by p.nom)
                             from public.points_de_vente p where p.hub_id = h.id), '[]'::jsonb)
      ) order by h.principal desc, h.nom)
      from public.hubs h where h.etablissement_id = etab.id
    ), '[]'::jsonb),
    'mise_en_service', public.etat_mise_en_service(etab.id),
    'sessions_support', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'motif', s.motif, 'ouverte_le', s.ouverte_le, 'fermee_le', s.fermee_le,
        'active', s.fermee_le is null and s.ouverte_le > now() - interval '8 hours'
      ) order by s.ouverte_le desc)
      from (select * from public.sessions_support where etablissement_id = etab.id and admin_id = auth.uid() order by ouverte_le desc limit 10) s
    ), '[]'::jsonb)
  );
end
$function$;

revoke execute on function public.enregistrer_option_module(text, jsonb) from public, anon;
revoke execute on function public.module_complementaire_possible(uuid, text) from public, anon, authenticated;
revoke execute on function public.modules_avec_dependances(text[]) from public, anon, authenticated;
revoke execute on function public.niveaux_modules_ensemble(text[]) from public, anon, authenticated;
revoke execute on function public.modules_complementaires_etablissement(uuid) from public, anon;
revoke execute on function public.synchroniser_modules_licence(uuid) from public, anon, authenticated;
revoke execute on function public.accorder_module(uuid, text, boolean, text) from public, anon;
revoke execute on function public.editeur_etablissement(uuid) from public, anon;
grant execute on function public.enregistrer_option_module(text, jsonb) to authenticated;
grant execute on function public.modules_complementaires_etablissement(uuid) to authenticated;
grant execute on function public.accorder_module(uuid, text, boolean, text) to authenticated;
grant execute on function public.editeur_etablissement(uuid) to authenticated;

-- 7. Articles : modifications groupées en une seule opération (tout ou rien), tracées.
--    Clés acceptées : suivi_stock, disponible, epuise, actif (archiver / remettre en vente), poste_preparation
--    (aucun | cuisine | bar), stock_minimum. Les quantités en stock ne sont jamais modifiées ici (inventaire).
create or replace function public.modifier_articles_lot(p_etablissement_id uuid, p_article_ids uuid[], p_changements jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  nb integer;
  cle text;
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.gerer');
  if p_article_ids is null or cardinality(p_article_ids) = 0 then
    raise exception 'Aucun article sélectionné';
  end if;
  if cardinality(p_article_ids) > 2000 then
    raise exception 'Trop d''articles en une fois (2 000)';
  end if;
  if p_changements is null or jsonb_typeof(p_changements) <> 'object' or p_changements = '{}'::jsonb then
    raise exception 'Aucune modification demandée';
  end if;
  for cle in select jsonb_object_keys(p_changements) loop
    if cle not in ('suivi_stock', 'disponible', 'epuise', 'actif', 'poste_preparation', 'stock_minimum') then
      raise exception 'Modification non autorisée en lot : %', cle;
    end if;
    if cle in ('suivi_stock', 'disponible', 'epuise', 'actif') and jsonb_typeof(p_changements -> cle) <> 'boolean' then
      raise exception 'Valeur oui / non attendue pour %', cle;
    end if;
  end loop;
  if p_changements ? 'poste_preparation' and coalesce(p_changements ->> 'poste_preparation', '') not in ('aucun', 'cuisine', 'bar') then
    raise exception 'Poste de préparation inconnu (aucun, cuisine ou bar)';
  end if;
  if p_changements ? 'stock_minimum' and (jsonb_typeof(p_changements -> 'stock_minimum') <> 'number' or (p_changements ->> 'stock_minimum')::numeric < 0) then
    raise exception 'Stock minimum invalide';
  end if;
  if exists (select 1 from unnest(p_article_ids) x where not exists (
      select 1 from public.articles a where a.id = x and a.etablissement_id = p_etablissement_id)) then
    raise exception 'Article inconnu dans cet établissement';
  end if;
  update public.articles a set
    suivi_stock = case when p_changements ? 'suivi_stock' then (p_changements ->> 'suivi_stock')::boolean else a.suivi_stock end,
    disponible = case when p_changements ? 'disponible' then (p_changements ->> 'disponible')::boolean else a.disponible end,
    epuise = case when p_changements ? 'epuise' then (p_changements ->> 'epuise')::boolean else a.epuise end,
    actif = case when p_changements ? 'actif' then (p_changements ->> 'actif')::boolean else a.actif end,
    poste_preparation = case when p_changements ? 'poste_preparation' then p_changements ->> 'poste_preparation' else a.poste_preparation end,
    stock_minimum = case when p_changements ? 'stock_minimum' then (p_changements ->> 'stock_minimum')::numeric else a.stock_minimum end
  where a.etablissement_id = p_etablissement_id and a.id = any (p_article_ids);
  get diagnostics nb = row_count;
  insert into public.evenements (etablissement_id, client_id, type, acteur, donnees)
  select e.id, e.client_id, 'articles.modification_lot', auth.uid(), jsonb_build_object('changements', p_changements, 'articles', nb)
  from public.etablissements e where e.id = p_etablissement_id;
  return nb;
end
$$;
revoke execute on function public.modifier_articles_lot(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.modifier_articles_lot(uuid, uuid[], jsonb) to authenticated;

notify pgrst, 'reload schema';
