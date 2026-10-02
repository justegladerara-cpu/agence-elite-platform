-- Mise à jour « Hubs » (2026-10-02), partie 4 : centre des modules et tableau de bord Agence Elite.
-- Six niveaux distincts, jamais confondus :
--   1. le module existe (modules) ;            2. une solution le propose (solution_modules) ;
--   3. une offre l'inclut (offres.modules) ;   4. il est accordé à un établissement (licence) ;
--   5. il est activé (etablissement_modules) ; 6. un utilisateur a une permission (rôles).
-- Aucun code n'est créé ici : un module se programme dans le dépôt (docs/SOP/CREER_UN_MODULE.md).

alter table public.modules add column categorie text;
alter table public.modules add column version text not null default '1.0';
alter table public.modules add column ordre integer not null default 0;
alter table public.modules add column modifie_le timestamptz not null default now();
create trigger modules_modifie_le before update on public.modules
for each row execute function public.fixer_modifie_le();
create trigger modules_audit after insert or update or delete on public.modules
for each row execute function public.journaliser_modification();
create trigger modules_sans_suppression before delete on public.modules
for each row execute function public.refuser_suppression();
create trigger solution_modules_audit after insert or update or delete on public.solution_modules
for each row execute function public.journaliser_modification();

update public.modules set categorie = case
  when nature = 'socle' then 'Socle'
  when id in ('caisse', 'ventes', 'paiements', 'recus', 'cloture') then 'Vente'
  when id in ('articles', 'stock') then 'Catalogue et stock'
  else 'Gestion' end
where categorie is null;
update public.modules set ordre = case id
  when 'etablissement' then 1 when 'membres' then 2 when 'tableau_de_bord' then 3
  when 'articles' then 10 when 'stock' then 11 when 'caisse' then 20 when 'ventes' then 21
  when 'paiements' then 22 when 'recus' then 23 when 'cloture' then 24 when 'contacts' then 30
  when 'depenses' then 31 else 99 end;

-- Métadonnées d'un module existant (super administrateur uniquement).
create function public.enregistrer_module(p_module_id text, p_module jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut text := coalesce(nullif(p_module ->> 'statut', ''), 'actif');
begin
  perform public.exiger_super_admin();
  if not exists (select 1 from public.modules where id = p_module_id) then
    raise exception 'Module inconnu : un module se crée dans le code (voir docs/SOP/CREER_UN_MODULE.md)';
  end if;
  if v_statut not in ('actif', 'en_preparation', 'futur', 'retire') then
    raise exception 'Statut de module inconnu : %', v_statut;
  end if;
  if v_statut = 'retire' and exists (select 1 from public.etablissement_modules where module_id = p_module_id and actif) then
    raise exception 'Ce module est encore actif dans un établissement';
  end if;
  if coalesce(btrim(p_module ->> 'nom'), '') = '' then
    raise exception 'Le nom du module est obligatoire';
  end if;
  update public.modules set
    nom = btrim(p_module ->> 'nom'),
    description = nullif(btrim(p_module ->> 'description'), ''),
    categorie = nullif(btrim(p_module ->> 'categorie'), ''),
    version = coalesce(nullif(btrim(p_module ->> 'version'), ''), version),
    ordre = coalesce((p_module ->> 'ordre')::integer, ordre),
    statut = v_statut
  where id = p_module_id;
end
$$;

-- Proposition d'un module par une solution (et activation par défaut à la création).
create function public.definir_proposition_module(p_solution_id text, p_module_id text, p_propose boolean, p_par_defaut boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  if not exists (select 1 from public.solutions where id = p_solution_id) or not exists (select 1 from public.modules where id = p_module_id) then
    raise exception 'Solution ou module inconnu';
  end if;
  if p_propose then
    insert into public.solution_modules (solution_id, module_id, par_defaut) values (p_solution_id, p_module_id, coalesce(p_par_defaut, false))
    on conflict (solution_id, module_id) do update set par_defaut = excluded.par_defaut;
    return;
  end if;
  if exists (select 1 from public.etablissement_modules em join public.etablissements e on e.id = em.etablissement_id
             where e.solution_id = p_solution_id and em.module_id = p_module_id)
     or exists (select 1 from public.offres where solution_id = p_solution_id and p_module_id = any (modules)) then
    raise exception 'Ce module est utilisé par une offre ou un établissement : retirez-le d''abord de ceux-ci';
  end if;
  delete from public.solution_modules where solution_id = p_solution_id and module_id = p_module_id;
end
$$;

-- Accorder ou retirer un module à un établissement (en plus de son offre), avec trace.
create function public.accorder_module(p_etablissement_id uuid, p_module_id text, p_accorde boolean, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  licence public.licences%rowtype;
  offre public.offres%rowtype;
begin
  perform public.exiger_editeur();
  select * into licence from public.licences where etablissement_id = p_etablissement_id and statut <> 'terminee' for update;
  if licence.id is null then
    raise exception 'Cet établissement n''a pas de licence en cours';
  end if;
  select * into offre from public.offres where id = licence.offre_id;
  if not exists (
    select 1 from public.etablissements e join public.solution_modules sm on sm.solution_id = e.solution_id
    where e.id = p_etablissement_id and sm.module_id = p_module_id
  ) then
    raise exception 'Le module n''est pas proposé par la solution de l''établissement';
  end if;
  if p_accorde then
    if p_module_id = any (offre.modules || licence.modules_supplementaires) then
      return;
    end if;
    perform public.verifier_modules_offre(offre.solution_id, offre.modules || licence.modules_supplementaires || p_module_id);
    update public.licences set modules_supplementaires = modules_supplementaires || p_module_id where id = licence.id;
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
  end if;
  insert into public.licence_evenements (licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, motif, acteur)
  values (licence.id, p_etablissement_id, 'attribution', licence.echeance, licence.echeance, 0,
          case when p_accorde then 'Module accordé : ' else 'Module retiré : ' end || p_module_id
            || coalesce(' (' || nullif(btrim(p_motif), '') || ')', ''), auth.uid());
  perform public.synchroniser_modules_licence(p_etablissement_id);
end
$$;

-- Vue du catalogue pour le centre des modules.
create function public.editeur_modules()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'nom', m.nom, 'description', m.description, 'nature', m.nature, 'statut', m.statut,
      'categorie', m.categorie, 'version', m.version, 'ordre', m.ordre, 'modifie_le', m.modifie_le,
      'depend_de', coalesce((select jsonb_agg(d.depend_de order by d.depend_de) from public.module_dependances d where d.module_id = m.id), '[]'::jsonb),
      'requis_par', coalesce((select jsonb_agg(d.module_id order by d.module_id) from public.module_dependances d where d.depend_de = m.id), '[]'::jsonb),
      'solutions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.nom, 'par_defaut', sm.par_defaut) order by s.nom)
                             from public.solution_modules sm join public.solutions s on s.id = sm.solution_id where sm.module_id = m.id), '[]'::jsonb),
      'offres', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom) order by o.ordre)
                          from public.offres o where m.id = any (o.modules)), '[]'::jsonb),
      'etablissements_accordes', (select count(*) from public.etablissements e where e.statut <> 'archive' and m.nature <> 'socle'
                                  and public.module_couvert(e.id, m.id)),
      'etablissements_actifs', (select count(*) from public.etablissement_modules em where em.module_id = m.id and em.actif),
      'permissions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'description', p.description,
                                 'roles', coalesce((select jsonb_agg(rp.role_id order by rp.role_id) from public.role_permissions rp where rp.permission_id = p.id), '[]'::jsonb)
                               ) order by p.id)
                               from public.permissions p where p.module_id = m.id), '[]'::jsonb),
      'utilisateurs', (select count(distinct em.user_id) from public.etablissement_membres em
                       join public.role_permissions rp on rp.role_id = em.role_id
                       join public.permissions p on p.id = rp.permission_id
                       where em.actif and p.module_id = m.id
                         and public.module_actif(em.etablissement_id, m.id))
    ) order by m.ordre, m.nom)
    from public.modules m
  ), '[]'::jsonb);
end
$$;

-- Tableau de bord Agence Elite : uniquement des agrégats (rapide même avec des centaines de clients).
create function public.editeur_tableau_de_bord()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  aujourd_hui date := current_date;
begin
  perform public.exiger_editeur();
  return jsonb_build_object(
    'genere_le', now(),
    'indicateurs', jsonb_build_object(
      'clients_actifs', (select count(*) from public.clients where statut = 'actif'),
      'clients_total', (select count(*) from public.clients),
      'clients_suspendus', (select count(*) from public.clients where statut = 'suspendu'),
      'etablissements_total', (select count(*) from public.etablissements where statut <> 'archive'),
      'etablissements_en_service', (select count(*) from public.etablissements where statut = 'actif' and mis_en_service_le is not null),
      'etablissements_a_mettre_en_service', (select count(*) from public.etablissements where statut = 'actif' and mis_en_service_le is null),
      'etablissements_suspendus', (select count(*) from public.etablissements where statut = 'suspendu'),
      'hubs_actifs', (select count(*) from public.hubs h join public.etablissements e on e.id = h.etablissement_id where h.actif and e.statut <> 'archive'),
      'licences_actives', (select count(*) from public.licences where statut = 'active' and formule <> 'essai'),
      'essais_en_cours', (select count(*) from public.licences where statut = 'active' and formule = 'essai' and echeance >= aujourd_hui),
      'licences_suspendues', (select count(*) from public.licences where statut = 'suspendue'),
      'renouvellements_30_jours', (select count(*) from public.licences where statut = 'active' and formule in ('mensuel', 'annuel')
                                   and echeance between aujourd_hui and aujourd_hui + 30),
      'licences_echues', (select count(*) from public.licences where statut = 'active' and echeance < aujourd_hui),
      'utilisateurs', (select count(distinct user_id) from public.etablissement_membres where actif)
    ),
    -- Montants contractuels enregistrés sur les licences : ce n'est PAS de l'argent encaissé.
    'contractuel', jsonb_build_object(
      'total_12_mois', (select coalesce(sum(montant), 0) from public.licence_evenements
                        where type in ('attribution', 'renouvellement') and cree_le >= aujourd_hui - interval '12 months'),
      'mensuel_recurrent', (select coalesce(sum(case when l.formule = 'mensuel' then o.prix_mensuel when l.formule = 'annuel' then round(o.prix_annuel / 12, 2) else 0 end), 0)
                            from public.licences l join public.offres o on o.id = l.offre_id where l.statut = 'active'),
      'par_mois', coalesce((
        select jsonb_agg(jsonb_build_object('mois', to_char(m, 'YYYY-MM'), 'montant', coalesce((
          select sum(ev.montant) from public.licence_evenements ev
          where ev.type in ('attribution', 'renouvellement') and date_trunc('month', ev.cree_le) = m
        ), 0)) order by m)
        from generate_series(date_trunc('month', aujourd_hui::timestamp) - interval '5 months', date_trunc('month', aujourd_hui::timestamp), interval '1 month') m
      ), '[]'::jsonb),
      'devise', 'XAF'
    ),
    'repartition_licences', coalesce((
      select jsonb_agg(jsonb_build_object('formule', formule, 'statut', statut, 'nombre', nombre) order by formule, statut)
      from (select formule, statut, count(*) nombre from public.licences where statut <> 'terminee' group by formule, statut) t
    ), '[]'::jsonb),
    'clients_par_mois', coalesce((
      select jsonb_agg(jsonb_build_object('mois', to_char(m, 'YYYY-MM'), 'nombre',
        (select count(*) from public.clients c where date_trunc('month', c.cree_le) = m)) order by m)
      from generate_series(date_trunc('month', aujourd_hui::timestamp) - interval '5 months', date_trunc('month', aujourd_hui::timestamp), interval '1 month') m
    ), '[]'::jsonb),
    'echeances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'etablissement_id', e.id, 'etablissement', e.nom, 'client', c.nom, 'client_id', c.id,
        'formule', l.formule, 'echeance', l.echeance, 'jours_restants', l.echeance - aujourd_hui, 'statut', l.statut
      ) order by l.echeance)
      from public.licences l
      join public.etablissements e on e.id = l.etablissement_id
      join public.clients c on c.id = e.client_id
      where l.statut = 'active' and l.echeance is not null and l.echeance <= aujourd_hui + 30 and e.statut <> 'archive'
    ), '[]'::jsonb),
    'a_surveiller', coalesce((
      select jsonb_agg(a order by a ->> 'gravite', a ->> 'libelle') from (
        select jsonb_build_object('gravite', '1', 'type', 'licence_echue', 'etablissement_id', e.id,
          'libelle', e.nom || ' : licence échue le ' || to_char(l.echeance, 'DD/MM/YYYY')) a
        from public.licences l join public.etablissements e on e.id = l.etablissement_id
        where l.statut = 'active' and l.echeance < aujourd_hui and e.statut <> 'archive'
        union all
        select jsonb_build_object('gravite', '1', 'type', 'licence_suspendue', 'etablissement_id', e.id,
          'libelle', e.nom || ' : licence suspendue')
        from public.licences l join public.etablissements e on e.id = l.etablissement_id
        where l.statut = 'suspendue' and e.statut <> 'archive'
        union all
        select jsonb_build_object('gravite', '2', 'type', 'sans_responsable', 'etablissement_id', e.id,
          'libelle', e.nom || ' : aucun responsable actif')
        from public.etablissements e
        where e.statut = 'actif' and not exists (
          select 1 from public.etablissement_membres m where m.etablissement_id = e.id and m.actif and m.role_id = 'gerant')
        union all
        select jsonb_build_object('gravite', '2', 'type', 'mise_en_service', 'etablissement_id', e.id,
          'libelle', e.nom || ' : pas encore mis en service (créé le ' || to_char(e.cree_le, 'DD/MM/YYYY') || ')')
        from public.etablissements e
        where e.statut = 'actif' and e.mis_en_service_le is null and e.cree_le < now() - interval '7 days'
        union all
        select jsonb_build_object('gravite', '3', 'type', 'mot_de_passe_expire', 'user_id', c.user_id,
          'libelle', coalesce(c.identifiant, 'Un compte') || ' : mot de passe temporaire expiré')
        from public.comptes_connexion c
        where c.doit_changer_mot_de_passe and c.temporaire_expire_le < now()
        union all
        select jsonb_build_object('gravite', '3', 'type', 'support_ouvert', 'etablissement_id', s.etablissement_id,
          'libelle', 'Session support ouverte : ' || e.nom)
        from public.sessions_support s join public.etablissements e on e.id = s.etablissement_id
        where s.fermee_le is null and s.ouverte_le > now() - interval '8 hours'
      ) t
    ), '[]'::jsonb),
    'activite_recente', coalesce((
      select jsonb_agg(jsonb_build_object(
        'quand', j.cree_le, 'table', j.table_nom, 'operation', j.operation, 'etablissement_id', j.etablissement_id,
        'etablissement', (select e.nom from public.etablissements e where e.id = j.etablissement_id),
        'acteur', coalesce((select p.nom_complet from public.profils p where p.id = j.acteur), (select u.email from auth.users u where u.id = j.acteur)),
        'libelle', coalesce(j.apres ->> 'nom', j.avant ->> 'nom', j.apres ->> 'numero', j.apres ->> 'identifiant', j.apres ->> 'formule', j.apres ->> 'role')
      ) order by j.cree_le desc)
      from (
        select * from public.journal_audit
        where table_nom in ('clients', 'etablissements', 'licences', 'hubs', 'plateforme_admins', 'comptes_connexion',
                            'etablissement_modules', 'etablissement_membres', 'offres', 'modules')
        order by cree_le desc limit 12
      ) j
    ), '[]'::jsonb)
  );
end
$$;

-- Liste des Hubs de toute la plateforme (vue globale Agence Elite).
create function public.editeur_hubs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', h.id, 'nom', h.nom, 'code', h.code, 'type', h.type, 'principal', h.principal, 'actif', h.actif,
      'capacite_vente', h.capacite_vente, 'capacite_stock', h.capacite_stock, 'capacite_caisse', h.capacite_caisse,
      'capacite_transfert', h.capacite_transfert, 'adresse', h.adresse, 'telephone', h.telephone, 'cree_le', h.cree_le,
      'etablissement_id', e.id, 'etablissement', e.nom, 'client_id', c.id, 'client', c.nom,
      'caisses', (select count(*) from public.points_de_vente p where p.hub_id = h.id and p.actif),
      'caisses_ouvertes', (select count(*) from public.sessions_caisse s where s.hub_id = h.id and s.statut = 'ouverte'),
      'membres_restreints', (select count(*) from public.membre_hubs r where r.hub_id = h.id)
    ) order by c.nom, e.nom, h.principal desc, h.nom)
    from public.hubs h
    join public.etablissements e on e.id = h.etablissement_id
    join public.clients c on c.id = e.client_id
  ), '[]'::jsonb);
end
$$;

-- Vues éditeur enrichies des Hubs.
CREATE OR REPLACE FUNCTION public.editeur_vue()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exiger_editeur();
  return jsonb_build_object(
    'solutions', (select jsonb_agg(to_jsonb(s) order by s.nom) from public.solutions s),
    'offres', coalesce((select jsonb_agg(to_jsonb(o) order by o.solution_id, o.ordre) from public.offres o), '[]'::jsonb),
    'roles', (select jsonb_agg(jsonb_build_object('id', r.id, 'nom', r.nom, 'ordre', r.ordre) order by r.ordre) from public.roles r),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nom', c.nom,
        'pays', c.pays,
        'statut', c.statut,
        'devise_facturation', c.devise_facturation,
        'contact', c.contact,
        'cree_le', c.cree_le,
        'dirigeants', coalesce((
          select jsonb_agg(jsonb_build_object('email', u.email, 'nom', p.nom_complet, 'actif', cm.actif))
          from public.client_membres cm
          join auth.users u on u.id = cm.user_id
          left join public.profils p on p.id = cm.user_id
          where cm.client_id = c.id
        ), '[]'::jsonb),
        'invitations', coalesce((
          select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'expire_le', i.expire_le))
          from public.invitations i
          where i.client_id = c.id and i.acceptee_le is null and i.annulee_le is null and i.expire_le > now()
        ), '[]'::jsonb),
        'etablissements', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'nom', e.nom,
            'ville', e.ville,
            'pays', e.pays,
            'devise', e.devise,
            'statut', e.statut,
            'solution_id', e.solution_id,
            'cree_le', e.cree_le,
            'mis_en_service_le', e.mis_en_service_le,
            'ecriture', public.etablissement_autorise_ecriture(e.id),
            'licence', public.resume_licence(e.id),
            'membres_actifs', (select count(*) from public.etablissement_membres m where m.etablissement_id = e.id and m.actif),
            'hubs', (select count(*) from public.hubs h where h.etablissement_id = e.id and h.actif),
            'gerants', coalesce((
              select jsonb_agg(u.email)
              from public.etablissement_membres m join auth.users u on u.id = m.user_id
              where m.etablissement_id = e.id and m.actif and m.role_id = 'gerant'
            ), '[]'::jsonb),
            'invitations_en_attente', (
              select count(*) from public.invitations i
              where i.etablissement_id = e.id and i.acceptee_le is null and i.annulee_le is null and i.expire_le > now()
            )
          ) order by e.nom)
          from public.etablissements e where e.client_id = c.id
        ), '[]'::jsonb)
      ) order by c.nom)
      from public.clients c
    ), '[]'::jsonb)
  );
end
$function$;

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
