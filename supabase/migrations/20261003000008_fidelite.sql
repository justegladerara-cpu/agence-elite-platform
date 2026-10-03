-- Fidélité : points gagnés automatiquement sur les ventes validées d'un client identifié, retirés si la vente est annulée,
-- utilisés contre une récompense (remise ou cadeau accordé en caisse) ; ajustements motivés. Mouvements définitifs.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('fidelite', 'Fidélité', 'Points gagnés sur les achats des clients, récompenses, soldes et historique.', 'transversal', 'actif',
   'marketing', 'etoile', 295, '1.0', 'docs/FIDELITE.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "tranche", "libelle": "Montant d''achat donnant des points (ex. 1000 = par tranche de 1 000)", "type": "nombre", "defaut": 1000},
  {"cle": "points_par_tranche", "libelle": "Points gagnés par tranche", "type": "nombre", "defaut": 1},
  {"cle": "valeur_point", "libelle": "Valeur d''un point en récompense (montant)", "type": "nombre", "defaut": 10},
  {"cle": "minimum_utilisation", "libelle": "Points minimum pour une récompense", "type": "nombre", "defaut": 100}
]'::jsonb where id = 'fidelite';
insert into public.module_dependances (module_id, depend_de) values ('fidelite', 'contacts'), ('fidelite', 'ventes')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'fidelite', false from public.solutions s where s.id in ('commerce', 'restaurant', 'hotel', 'ecommerce', 'services')
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('fidelite.lire', 'fidelite', 'Voir les soldes de points et l''historique'),
  ('fidelite.utiliser', 'fidelite', 'Utiliser les points d''un client contre une récompense'),
  ('fidelite.gerer', 'fidelite', 'Ajuster les points (geste commercial, correction)')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['fidelite.lire', 'fidelite.utiliser', 'fidelite.gerer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['responsable_hub', 'employe', 'commercial', 'receptionniste']) r
cross join unnest(array['fidelite.lire', 'fidelite.utiliser']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values ('lecteur', 'fidelite.lire'), ('comptable', 'fidelite.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------
create table public.fidelite_mouvements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  vente_id uuid references public.ventes(id) on delete restrict,
  type text not null check (type in ('gain', 'annulation', 'utilisation', 'ajustement')),
  points integer not null check (points <> 0),
  motif text check (motif is null or length(motif) <= 300),
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  check ((type in ('gain', 'annulation')) = (vente_id is not null)),
  check (type <> 'utilisation' or points < 0),
  check (type not in ('utilisation', 'ajustement') or btrim(coalesce(motif, '')) <> '')
);
create index fidelite_mouvements_contact_idx on public.fidelite_mouvements(etablissement_id, contact_id, cree_le desc);
create index fidelite_mouvements_vente_idx on public.fidelite_mouvements(vente_id) where vente_id is not null;

create trigger fidelite_mouvements_definitifs before update on public.fidelite_mouvements for each row execute function public.refuser_modification();
create trigger fidelite_mouvements_sans_suppression before delete on public.fidelite_mouvements for each row execute function public.refuser_suppression();
create trigger fidelite_mouvements_audit after insert or update or delete on public.fidelite_mouvements for each row execute function public.journaliser_modification();
alter table public.fidelite_mouvements enable row level security;
create policy lecture on public.fidelite_mouvements for select to authenticated using (public.lecture_autorisee(etablissement_id, 'fidelite.lire'));

-- ---------------------------------------------------------------------------
-- 3. Gain automatique (en fin de transaction, sur l'état final de la vente)
-- ---------------------------------------------------------------------------
-- Points attendus pour la vente (0 si annulée, sans client ou module inactif) moins points déjà inscrits : seul l'écart
-- est inscrit, donc rejouer le calcul ne double jamais rien. Un client changé sur la vente est traité aussi.
create function public.points_vente_fidelite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  tranche numeric;
  par_tranche numeric;
  attendu integer;
  ligne record;
begin
  select * into v from public.ventes where id = new.id;
  if v.id is null or not exists (select 1 from public.fidelite_mouvements where vente_id = v.id)
     and not (v.statut = 'validee' and v.contact_id is not null and public.module_actif(v.etablissement_id, 'fidelite')) then
    return null;
  end if;
  tranche := coalesce((public.parametre_module(v.etablissement_id, 'fidelite', 'tranche') #>> '{}')::numeric, 1000);
  par_tranche := coalesce((public.parametre_module(v.etablissement_id, 'fidelite', 'points_par_tranche') #>> '{}')::numeric, 1);
  -- Retirer les points inscrits pour un autre client que celui de la vente.
  for ligne in
    select contact_id, sum(points)::integer total from public.fidelite_mouvements
    where vente_id = v.id and contact_id is distinct from v.contact_id group by contact_id having sum(points) <> 0
  loop
    insert into public.fidelite_mouvements (etablissement_id, contact_id, vente_id, type, points, motif)
    values (v.etablissement_id, ligne.contact_id, v.id, 'annulation', -ligne.total, 'Client modifié sur la vente ' || v.numero);
  end loop;
  if v.contact_id is null then
    return null;
  end if;
  attendu := case when v.statut = 'validee' and tranche > 0 and par_tranche > 0
    then floor(floor(v.total / tranche) * par_tranche)::integer else 0 end;
  -- Une vente déjà comptée garde ses points si le module est désactivé ensuite ; seule l'annulation les retire.
  if v.statut = 'validee' and not public.module_actif(v.etablissement_id, 'fidelite') then
    return null;
  end if;
  attendu := attendu - coalesce((select sum(points) from public.fidelite_mouvements where vente_id = v.id and contact_id = v.contact_id), 0);
  if attendu <> 0 then
    insert into public.fidelite_mouvements (etablissement_id, contact_id, vente_id, type, points, motif)
    values (v.etablissement_id, v.contact_id, v.id, case when attendu > 0 then 'gain' else 'annulation' end, attendu,
      case when attendu > 0 then 'Achat ' || v.numero else 'Vente ' || v.numero || ' annulée ou corrigée' end);
  end if;
  return null;
end
$$;
create constraint trigger ventes_fidelite after insert or update of statut, total, contact_id on public.ventes
deferrable initially deferred for each row execute function public.points_vente_fidelite();

-- ---------------------------------------------------------------------------
-- 4. Fonctions
-- ---------------------------------------------------------------------------
create function public.solde_fidelite(p_etablissement_id uuid, p_contact_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(points), 0)::integer from public.fidelite_mouvements
  where etablissement_id = p_etablissement_id and contact_id = p_contact_id
$$;

-- Utiliser des points contre une récompense (remise accordée en caisse, cadeau…). Le solde ne devient jamais négatif.
create function public.utiliser_points_fidelite(p_etablissement_id uuid, p_contact_id uuid, p_points integer, p_motif text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  solde integer;
  minimum integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'fidelite.utiliser');
  if not exists (select 1 from public.contacts where id = p_contact_id and etablissement_id = p_etablissement_id) then
    raise exception 'Client introuvable';
  end if;
  if coalesce(p_points, 0) <= 0 then
    raise exception 'Nombre de points invalide';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez la récompense accordée';
  end if;
  -- Verrou par client : deux caisses ne dépensent pas les mêmes points.
  perform pg_advisory_xact_lock(hashtextextended('fidelite:' || p_contact_id::text, 0));
  solde := public.solde_fidelite(p_etablissement_id, p_contact_id);
  minimum := coalesce((public.parametre_module(p_etablissement_id, 'fidelite', 'minimum_utilisation') #>> '{}')::numeric, 0)::integer;
  if p_points < minimum then
    raise exception 'Il faut utiliser au moins % points', minimum;
  end if;
  if p_points > solde then
    raise exception 'Solde insuffisant : % points disponibles', solde;
  end if;
  insert into public.fidelite_mouvements (etablissement_id, contact_id, type, points, motif, cree_par)
  values (p_etablissement_id, p_contact_id, 'utilisation', -p_points, left(btrim(p_motif), 300), auth.uid());
  return solde - p_points;
end
$$;

-- Ajustement motivé (geste commercial, correction, reprise d'un ancien programme). Le solde ne devient jamais négatif.
create function public.ajuster_points_fidelite(p_etablissement_id uuid, p_contact_id uuid, p_points integer, p_motif text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  solde integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'fidelite.gerer');
  if not exists (select 1 from public.contacts where id = p_contact_id and etablissement_id = p_etablissement_id) then
    raise exception 'Client introuvable';
  end if;
  if coalesce(p_points, 0) = 0 or abs(p_points) > 1000000 then
    raise exception 'Nombre de points invalide';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fidelite:' || p_contact_id::text, 0));
  solde := public.solde_fidelite(p_etablissement_id, p_contact_id);
  if solde + p_points < 0 then
    raise exception 'Le solde ne peut pas devenir négatif (% points disponibles)', solde;
  end if;
  insert into public.fidelite_mouvements (etablissement_id, contact_id, type, points, motif, cree_par)
  values (p_etablissement_id, p_contact_id, 'ajustement', p_points, left(btrim(p_motif), 300), auth.uid());
  return solde + p_points;
end
$$;

-- Soldes des clients ayant des points (ou un historique).
create function public.soldes_fidelite(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'fidelite.lire') then
    raise exception 'Permission refusée : fidelite.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('contact_id', c.id, 'nom', c.nom, 'telephone', c.telephone, 'solde', t.solde,
      'gagnes', t.gagnes, 'utilises', t.utilises, 'dernier', t.dernier) order by t.solde desc, c.nom)
    from (
      select contact_id, sum(points)::integer solde, sum(points) filter (where type = 'gain')::integer gagnes,
        coalesce(-sum(points) filter (where type = 'utilisation'), 0)::integer utilises, max(cree_le) dernier
      from public.fidelite_mouvements where etablissement_id = p_etablissement_id group by contact_id
    ) t join public.contacts c on c.id = t.contact_id
  ), '[]'::jsonb);
end
$$;

create function public.tableau_de_bord_fidelite(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jour date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'fidelite.lire') then
    raise exception 'Permission refusée : fidelite.lire' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'clients', (select count(*) from (select contact_id from public.fidelite_mouvements where etablissement_id = p_etablissement_id
                 group by contact_id having sum(points) > 0) t),
    'points_en_cours', (select coalesce(sum(points), 0) from public.fidelite_mouvements where etablissement_id = p_etablissement_id),
    'gagnes_mois', (select coalesce(sum(points), 0) from public.fidelite_mouvements where etablissement_id = p_etablissement_id
                    and type in ('gain', 'annulation') and date_trunc('month', cree_le) = date_trunc('month', jour::timestamp)),
    'utilises_mois', (select coalesce(-sum(points), 0) from public.fidelite_mouvements where etablissement_id = p_etablissement_id
                      and type = 'utilisation' and date_trunc('month', cree_le) = date_trunc('month', jour::timestamp)),
    'valeur_point', coalesce((public.parametre_module(p_etablissement_id, 'fidelite', 'valeur_point') #>> '{}')::numeric, 10),
    'minimum_utilisation', coalesce((public.parametre_module(p_etablissement_id, 'fidelite', 'minimum_utilisation') #>> '{}')::numeric, 100)
  );
end
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.utiliser_points_fidelite(uuid, uuid, integer, text)', 'public.ajuster_points_fidelite(uuid, uuid, integer, text)',
    'public.soldes_fidelite(uuid)', 'public.tableau_de_bord_fidelite(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  execute 'revoke execute on function public.solde_fidelite(uuid, uuid) from public, anon, authenticated';
  execute 'revoke execute on function public.points_vente_fidelite() from public, anon, authenticated';
end
$$;
