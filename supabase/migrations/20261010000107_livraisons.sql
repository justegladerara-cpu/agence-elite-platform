-- Livraisons (module M05, Bêta) : livraisons à domicile, tournées, livreurs, statut, preuve de livraison,
-- montant à encaisser à la livraison. Une livraison peut venir d'une vente, d'une commande de la boutique en ligne,
-- d'une facture ou être saisie librement. Le livreur ne voit et ne met à jour que ce qui lui est confié.
-- Rien ne se supprime. Proposé, jamais activé d'office.

-- ---------------------------------------------------------------------------
-- 1. Catalogue, droits, rôle Livreur
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('livraisons', 'Livraisons', 'Livraisons à domicile, tournées, livreurs, preuve de livraison et encaissement à la livraison.',
   'transversal', 'beta', 'ventes', 'camion', 138, '0.1', 'docs/LIVRAISONS.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "preuve_obligatoire", "libelle": "Exiger le nom de la personne qui reçoit", "type": "booleen", "defaut": true}
]'::jsonb where id = 'livraisons';
insert into public.module_dependances (module_id, depend_de) values ('livraisons', 'contacts')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'livraisons', false from public.solutions s where s.id in ('commerce', 'restaurant', 'ecommerce', 'services')
on conflict (solution_id, module_id) do nothing;

insert into public.roles (id, nom, description, ordre, modules_requis) values
  ('livreur', 'Livreur', 'Ses livraisons et tournées seulement', 58, '{livraisons}')
on conflict (id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('livraisons.lire', 'livraisons', 'Voir les livraisons et les tournées'),
  ('livraisons.livrer', 'livraisons', 'Mettre à jour ses livraisons (en route, livrée, échec)'),
  ('livraisons.gerer', 'livraisons', 'Créer, affecter, organiser les tournées et annuler')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'responsable_hub']) r
cross join unnest(array['livraisons.lire', 'livraisons.livrer', 'livraisons.gerer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['livreur', 'employe']) r
cross join unnest(array['livraisons.lire', 'livraisons.livrer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'livraisons.lire' from unnest(array['lecteur', 'comptable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.liv_tournees (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  numero text not null,
  date_tournee date not null,
  livreur_id uuid not null references auth.users(id) on delete restrict,
  statut text not null default 'preparee' check (statut in ('preparee', 'en_cours', 'terminee')),
  note text check (note is null or length(note) <= 500),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);

create table public.liv_livraisons (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  numero text not null,
  source text not null default 'libre' check (source in ('libre', 'vente', 'boutique', 'facture')),
  source_id uuid,
  source_numero text,
  contact_id uuid references public.contacts(id) on delete restrict,
  destinataire text not null check (btrim(destinataire) <> '' and length(destinataire) <= 120),
  telephone text check (telephone is null or length(telephone) <= 40),
  adresse text not null check (btrim(adresse) <> '' and length(adresse) <= 500),
  instructions text check (instructions is null or length(instructions) <= 500),
  date_prevue date not null,
  creneau text check (creneau is null or length(creneau) <= 40),
  montant_a_encaisser numeric(14, 2) not null default 0 check (montant_a_encaisser >= 0),
  montant_encaisse numeric(14, 2) not null default 0 check (montant_encaisse >= 0),
  mode_encaissement text check (mode_encaissement is null or mode_encaissement in ('especes', 'mobile_money', 'carte', 'virement', 'cheque')),
  livreur_id uuid references auth.users(id) on delete restrict,
  tournee_id uuid references public.liv_tournees(id) on delete restrict,
  statut text not null default 'a_preparer' check (statut in ('a_preparer', 'prete', 'en_route', 'livree', 'echec', 'annulee')),
  recu_par text check (recu_par is null or length(recu_par) <= 120),
  motif text check (motif is null or length(motif) <= 300),
  tentatives integer not null default 0 check (tentatives >= 0),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  livree_le timestamptz,
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict,
  check ((source = 'libre') = (source_id is null)),
  check (statut <> 'livree' or livree_le is not null),
  check (statut not in ('echec', 'annulee') or btrim(coalesce(motif, '')) <> ''),
  check (montant_encaisse <= montant_a_encaisser)
);
create index liv_livraisons_etab_idx on public.liv_livraisons(etablissement_id, statut, date_prevue);
create index liv_livraisons_livreur_idx on public.liv_livraisons(livreur_id, date_prevue) where livreur_id is not null;
create unique index liv_livraisons_source_active on public.liv_livraisons(source, source_id)
  where source_id is not null and statut not in ('annulee', 'echec');

-- Lecture : qui gère voit tout (dans ses Hubs) ; un livreur sans le droit de gérer ne voit que ses livraisons.
create function public.liv_peut_voir(p_etablissement_id uuid, p_hub_id uuid, p_livreur_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.lecture_autorisee(p_etablissement_id, 'livraisons.lire') and public.lecture_hub(p_etablissement_id, p_hub_id)
    and (p_livreur_id = auth.uid() or not public.a_permission(p_etablissement_id, 'livraisons.livrer')
         or public.a_permission(p_etablissement_id, 'livraisons.gerer'))
$$;
revoke all on function public.liv_peut_voir(uuid, uuid, uuid) from public, anon;
grant execute on function public.liv_peut_voir(uuid, uuid, uuid) to authenticated;

alter table public.liv_tournees enable row level security;
alter table public.liv_livraisons enable row level security;
create policy lecture on public.liv_tournees for select to authenticated
  using (public.liv_peut_voir(etablissement_id, hub_id, livreur_id));
create policy lecture on public.liv_livraisons for select to authenticated
  using (public.liv_peut_voir(etablissement_id, hub_id, livreur_id));
revoke insert, update, delete on public.liv_tournees, public.liv_livraisons from anon, authenticated;

create trigger liv_tournees_etab before update on public.liv_tournees for each row execute function public.verrouiller_etablissement_id();
create trigger liv_tournees_sans_suppression before delete on public.liv_tournees for each row execute function public.refuser_suppression();
create trigger liv_tournees_audit after insert or update or delete on public.liv_tournees for each row execute function public.journaliser_modification();
create trigger liv_livraisons_etab before update on public.liv_livraisons for each row execute function public.verrouiller_etablissement_id();
create trigger liv_livraisons_sans_suppression before delete on public.liv_livraisons for each row execute function public.refuser_suppression();
create trigger liv_livraisons_audit after insert or update or delete on public.liv_livraisons for each row execute function public.journaliser_modification();

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
create function public.liv_exiger_livreur(p_etablissement_id uuid, p_livreur_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_livreur_id is null then return; end if;
  if not exists (
    select 1 from public.etablissement_membres em
    left join public.role_permissions rp on rp.role_id = em.role_id and rp.permission_id = 'livraisons.livrer'
    where em.etablissement_id = p_etablissement_id and em.user_id = p_livreur_id and em.actif
      and coalesce((em.permissions_ajustees ->> 'livraisons.livrer')::boolean, rp.permission_id is not null)
  ) then
    raise exception 'Ce membre ne peut pas livrer dans cet établissement';
  end if;
end
$$;
revoke all on function public.liv_exiger_livreur(uuid, uuid) from public, anon, authenticated;

-- Livraison : p = { source?, source_id?, contact_id?, destinataire?, telephone?, adresse?, instructions?, date_prevue?,
--                   creneau?, montant_a_encaisser?, livreur_id?, hub_id? }
-- Depuis une vente, une commande boutique ou une facture : client, téléphone, adresse et numéro sont repris de la source.
create function public.creer_livraison(p_etablissement_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := coalesce(nullif(p ->> 'source', ''), 'libre');
  v_source_id uuid := nullif(p ->> 'source_id', '')::uuid;
  v_hub uuid := nullif(p ->> 'hub_id', '')::uuid;
  v_contact uuid := nullif(p ->> 'contact_id', '')::uuid;
  v_dest text := nullif(btrim(p ->> 'destinataire'), '');
  v_tel text := nullif(btrim(p ->> 'telephone'), '');
  v_adresse text := nullif(btrim(p ->> 'adresse'), '');
  v_numero_source text;
  v_montant numeric := coalesce(nullif(p ->> 'montant_a_encaisser', '')::numeric, 0);
  v_livreur uuid := nullif(p ->> 'livreur_id', '')::uuid;
  v_id uuid;
  v_numero text;
  r record;
begin
  perform public.exiger_permission(p_etablissement_id, 'livraisons.gerer');
  if v_source not in ('libre', 'vente', 'boutique', 'facture') then raise exception 'Origine inconnue'; end if;
  if v_source = 'libre' then
    v_source_id := null;
  elsif v_source_id is null then
    raise exception 'Choisissez la vente, la commande ou la facture';
  elsif v_source = 'vente' then
    select v.numero, v.hub_id, v.contact_id, greatest(v.total - v.montant_paye, 0) reste into r
    from public.ventes v where v.id = v_source_id and v.etablissement_id = p_etablissement_id and v.statut = 'validee';
    if r.numero is null then raise exception 'Vente introuvable ou annulée'; end if;
    v_numero_source := r.numero; v_hub := coalesce(v_hub, r.hub_id); v_contact := coalesce(v_contact, r.contact_id);
    if p ->> 'montant_a_encaisser' is null then v_montant := r.reste; end if;
  elsif v_source = 'boutique' then
    select c.numero, c.hub_id, c.contact_id, c.nom_client, c.telephone, c.adresse_livraison into r
    from public.boutique_commandes c where c.id = v_source_id and c.etablissement_id = p_etablissement_id
      and c.mode_livraison = 'livraison' and c.statut not in ('annulee', 'retournee', 'livree');
    if r.numero is null then raise exception 'Commande introuvable, sans livraison ou déjà close'; end if;
    v_numero_source := r.numero; v_hub := coalesce(v_hub, r.hub_id); v_contact := coalesce(v_contact, r.contact_id);
    v_dest := coalesce(v_dest, r.nom_client); v_tel := coalesce(v_tel, r.telephone); v_adresse := coalesce(v_adresse, r.adresse_livraison);
  else
    select d.numero, d.hub_id, d.contact_id into r
    from public.documents_vente d where d.id = v_source_id and d.etablissement_id = p_etablissement_id and d.type = 'facture' and d.numero is not null;
    if r.numero is null then raise exception 'Facture introuvable ou non émise'; end if;
    v_numero_source := r.numero; v_hub := coalesce(v_hub, r.hub_id); v_contact := coalesce(v_contact, r.contact_id);
  end if;
  if v_contact is not null then
    select c.nom, c.telephone, c.adresse into r from public.contacts c where c.id = v_contact and c.etablissement_id = p_etablissement_id;
    if r.nom is null then raise exception 'Client introuvable'; end if;
    v_dest := coalesce(v_dest, r.nom); v_tel := coalesce(v_tel, r.telephone); v_adresse := coalesce(v_adresse, nullif(btrim(r.adresse), ''));
  end if;
  v_hub := coalesce(v_hub, public.hub_principal(p_etablissement_id));
  if not exists (select 1 from public.hubs where id = v_hub and etablissement_id = p_etablissement_id) then raise exception 'Hub introuvable'; end if;
  perform public.exiger_acces_hub(v_hub);
  if v_dest is null then raise exception 'Le destinataire est obligatoire'; end if;
  if v_adresse is null then raise exception 'L''adresse de livraison est obligatoire'; end if;
  if v_montant < 0 or v_montant = 'NaN'::numeric then raise exception 'Montant à encaisser invalide'; end if;
  perform public.liv_exiger_livreur(p_etablissement_id, v_livreur);
  v_numero := public.prochain_numero(p_etablissement_id, 'livraison', 'LV-');
  insert into public.liv_livraisons (etablissement_id, hub_id, numero, source, source_id, source_numero, contact_id, destinataire, telephone,
    adresse, instructions, date_prevue, creneau, montant_a_encaisser, livreur_id, cree_par)
  values (p_etablissement_id, v_hub, v_numero, v_source, v_source_id, v_numero_source, v_contact, left(v_dest, 120), left(v_tel, 40),
    left(v_adresse, 500), nullif(btrim(p ->> 'instructions'), ''), coalesce(nullif(p ->> 'date_prevue', '')::date, current_date),
    nullif(btrim(p ->> 'creneau'), ''), round(v_montant, 2), v_livreur, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
exception when unique_violation then
  raise exception 'Une livraison est déjà prévue pour %', coalesce(v_numero_source, 'cette source');
end
$$;

-- Tournée : un livreur, une date, des livraisons (à préparer ou prêtes, non affectées à une autre tournée en cours).
create function public.creer_tournee(p_etablissement_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hub uuid := coalesce(nullif(p ->> 'hub_id', '')::uuid, public.hub_principal(p_etablissement_id));
  v_livreur uuid := nullif(p ->> 'livreur_id', '')::uuid;
  v_ids uuid[];
  v_nb integer;
  v_id uuid;
  v_numero text;
begin
  perform public.exiger_permission(p_etablissement_id, 'livraisons.gerer');
  if not exists (select 1 from public.hubs where id = v_hub and etablissement_id = p_etablissement_id) then raise exception 'Hub introuvable'; end if;
  perform public.exiger_acces_hub(v_hub);
  if v_livreur is null then raise exception 'Choisissez le livreur'; end if;
  perform public.liv_exiger_livreur(p_etablissement_id, v_livreur);
  if jsonb_typeof(p -> 'livraisons') <> 'array' or jsonb_array_length(p -> 'livraisons') = 0 then raise exception 'Choisissez au moins une livraison'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(p -> 'livraisons') x;
  select count(*) into v_nb from (
    select 1 from public.liv_livraisons l
    where l.id = any (v_ids) and l.etablissement_id = p_etablissement_id and l.hub_id = v_hub and l.statut in ('a_preparer', 'prete')
      and (l.tournee_id is null or exists (select 1 from public.liv_tournees t where t.id = l.tournee_id and t.statut = 'terminee'))
    order by l.id for update) t;
  if v_nb <> cardinality(v_ids) then raise exception 'Une livraison n''est plus disponible pour une tournée'; end if;
  v_numero := public.prochain_numero(p_etablissement_id, 'tournee', 'TO-');
  insert into public.liv_tournees (etablissement_id, hub_id, numero, date_tournee, livreur_id, note, cree_par)
  values (p_etablissement_id, v_hub, v_numero, coalesce(nullif(p ->> 'date_tournee', '')::date, current_date), v_livreur,
          nullif(btrim(p ->> 'note'), ''), auth.uid())
  returning id into v_id;
  update public.liv_livraisons set tournee_id = v_id, livreur_id = v_livreur, statut = 'prete', modifie_le = now() where id = any (v_ids);
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'livraisons', cardinality(v_ids));
end
$$;

-- Avancement : p_statut = prete | en_route | livree | echec ; p = { recu_par?, motif?, montant_encaisse?, mode? }
create function public.avancer_livraison(p_livraison_id uuid, p_statut text, p jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.liv_livraisons%rowtype;
  v_gere boolean;
  v_montant numeric := coalesce(nullif(p ->> 'montant_encaisse', '')::numeric, 0);
  v_preuve boolean;
begin
  select * into l from public.liv_livraisons where id = p_livraison_id for update;
  if l.id is null then raise exception 'Livraison introuvable'; end if;
  perform public.exiger_permission(l.etablissement_id, 'livraisons.livrer');
  perform public.exiger_acces_hub(l.hub_id);
  v_gere := public.a_permission(l.etablissement_id, 'livraisons.gerer') or public.session_support_active(l.etablissement_id, true);
  if not v_gere and l.livreur_id is distinct from auth.uid() then raise exception 'Cette livraison ne vous est pas confiée'; end if;
  if l.statut in ('livree', 'annulee') then raise exception 'Livraison déjà close'; end if;
  if p_statut = 'prete' then
    if l.statut not in ('a_preparer', 'echec') then raise exception 'Seule une livraison à préparer ou en échec peut être prête'; end if;
    update public.liv_livraisons set statut = 'prete', motif = null, modifie_le = now() where id = l.id;
  elsif p_statut = 'en_route' then
    if l.statut not in ('prete', 'a_preparer') then raise exception 'La livraison doit être prête'; end if;
    if l.livreur_id is null then
      update public.liv_livraisons set livreur_id = auth.uid() where id = l.id;
    end if;
    update public.liv_livraisons set statut = 'en_route', tentatives = tentatives + 1, modifie_le = now() where id = l.id;
    update public.liv_tournees set statut = 'en_cours' where id = l.tournee_id and statut = 'preparee';
  elsif p_statut = 'livree' then
    if l.statut <> 'en_route' then raise exception 'La livraison doit être en route'; end if;
    v_preuve := coalesce((public.parametre_module(l.etablissement_id, 'livraisons', 'preuve_obligatoire') #>> '{}')::boolean, true);
    if v_preuve and coalesce(btrim(p ->> 'recu_par'), '') = '' then raise exception 'Indiquez le nom de la personne qui a reçu'; end if;
    if v_montant < 0 or v_montant = 'NaN'::numeric or v_montant > l.montant_a_encaisser then raise exception 'Montant encaissé invalide'; end if;
    if v_montant > 0 and coalesce(p ->> 'mode', '') not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then
      raise exception 'Mode d''encaissement inconnu';
    end if;
    update public.liv_livraisons
    set statut = 'livree', livree_le = now(), recu_par = nullif(left(btrim(p ->> 'recu_par'), 120), ''), montant_encaisse = round(v_montant, 2),
        mode_encaissement = case when v_montant > 0 then p ->> 'mode' end, motif = null, modifie_le = now()
    where id = l.id;
  elsif p_statut = 'echec' then
    if l.statut <> 'en_route' then raise exception 'La livraison doit être en route'; end if;
    if coalesce(btrim(p ->> 'motif'), '') = '' then raise exception 'Le motif est obligatoire (absent, adresse introuvable…)'; end if;
    update public.liv_livraisons set statut = 'echec', motif = left(btrim(p ->> 'motif'), 300), modifie_le = now() where id = l.id;
  else
    raise exception 'Étape inconnue';
  end if;
  -- Tournée terminée quand toutes ses livraisons sont closes (livrée, échec, annulée).
  if l.tournee_id is not null and not exists (
    select 1 from public.liv_livraisons x where x.tournee_id = l.tournee_id and x.statut in ('a_preparer', 'prete', 'en_route')) then
    update public.liv_tournees set statut = 'terminee' where id = l.tournee_id;
  end if;
end
$$;

-- Replanifier un échec ou changer de livreur / de date (avant le départ).
create function public.replanifier_livraison(p_livraison_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.liv_livraisons%rowtype;
  v_livreur uuid := nullif(p ->> 'livreur_id', '')::uuid;
begin
  select * into l from public.liv_livraisons where id = p_livraison_id for update;
  if l.id is null then raise exception 'Livraison introuvable'; end if;
  perform public.exiger_permission(l.etablissement_id, 'livraisons.gerer');
  perform public.exiger_acces_hub(l.hub_id);
  if l.statut not in ('a_preparer', 'prete', 'echec') then raise exception 'Seule une livraison pas encore partie ou en échec se replanifie'; end if;
  perform public.liv_exiger_livreur(l.etablissement_id, v_livreur);
  update public.liv_livraisons
  set date_prevue = coalesce(nullif(p ->> 'date_prevue', '')::date, date_prevue), creneau = coalesce(nullif(btrim(p ->> 'creneau'), ''), creneau),
      livreur_id = v_livreur, tournee_id = case when v_livreur is distinct from livreur_id then null else tournee_id end,
      statut = 'a_preparer', motif = null, modifie_le = now()
  where id = l.id;
end
$$;

create function public.annuler_livraison(p_livraison_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.liv_livraisons%rowtype;
begin
  select * into l from public.liv_livraisons where id = p_livraison_id for update;
  if l.id is null then raise exception 'Livraison introuvable'; end if;
  perform public.exiger_permission(l.etablissement_id, 'livraisons.gerer');
  perform public.exiger_acces_hub(l.hub_id);
  if l.statut in ('livree', 'annulee', 'en_route') then raise exception 'Une livraison en route ou close ne s''annule pas'; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Le motif est obligatoire'; end if;
  update public.liv_livraisons set statut = 'annulee', motif = left(btrim(p_motif), 300), modifie_le = now() where id = l.id;
end
$$;

-- Livreurs possibles (membres actifs ayant le droit de livrer), pour les listes de choix.
create function public.livreurs_etablissement(p_etablissement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', em.user_id, 'nom', public.cockpit_nom_utilisateur(em.user_id)) order by public.cockpit_nom_utilisateur(em.user_id)), '[]'::jsonb)
  from public.etablissement_membres em
  left join public.role_permissions rp on rp.role_id = em.role_id and rp.permission_id = 'livraisons.livrer'
  where em.etablissement_id = p_etablissement_id and em.actif
    and coalesce((em.permissions_ajustees ->> 'livraisons.livrer')::boolean, rp.permission_id is not null)
    and public.lecture_autorisee(p_etablissement_id, 'livraisons.lire')
$$;

-- ---------------------------------------------------------------------------
-- 4. Tableau de bord
-- ---------------------------------------------------------------------------
create function public.cockpit_livraisons(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_jour bigint; v_retard bigint; v_echecs bigint; v_sans_livreur bigint; v_livrees bigint; v_livrees_p bigint; v_premier date; v_comp boolean;
  v_a_encaisser numeric; v_encaisse numeric;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'livraisons.lire') then
    raise exception 'Permission refusée : livraisons.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  select count(*) filter (where l.statut in ('a_preparer', 'prete', 'en_route') and l.date_prevue = c.auj),
         count(*) filter (where l.statut in ('a_preparer', 'prete', 'en_route') and l.date_prevue < c.auj),
         count(*) filter (where l.statut = 'echec'),
         count(*) filter (where l.statut in ('a_preparer', 'prete') and l.livreur_id is null and l.date_prevue <= c.auj),
         count(*) filter (where l.statut = 'livree' and (l.livree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where l.statut = 'livree' and (l.livree_le at time zone c.tz)::date between c.pdu and c.pau),
         min((l.livree_le at time zone c.tz)::date),
         coalesce(sum(l.montant_a_encaisser) filter (where l.statut in ('a_preparer', 'prete', 'en_route')), 0),
         coalesce(sum(l.montant_encaisse) filter (where l.statut = 'livree' and (l.livree_le at time zone c.tz)::date between c.du and c.au), 0)
  into v_jour, v_retard, v_echecs, v_sans_livreur, v_livrees, v_livrees_p, v_premier, v_a_encaisser, v_encaisse
  from public.liv_livraisons l where l.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, l.hub_id);
  v_comp := public.cockpit_comparable(v_livrees_p, v_premier, c.pdu);
  return jsonb_build_object(
    'domaine', 'livraisons',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('aujourdhui', 'À livrer aujourd’hui', v_jour, 'nombre', 'livraisons', null,
        case when v_retard > 0 then format('%s en retard', v_retard) end, case when v_retard > 0 then 'attention' end, true),
      public.cockpit_kpi('livrees', 'Livrées', v_livrees, 'nombre', 'livraisons?statut=livree', case when v_comp then v_livrees_p end, null, null, true),
      public.cockpit_kpi('encaisse', 'Encaissé à la livraison', v_encaisse, 'montant', 'livraisons?statut=livree'),
      public.cockpit_kpi('a_encaisser', 'À encaisser à la livraison', v_a_encaisser, 'montant', 'livraisons')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('retard', 'critique', 'Livraisons en retard', 'Date prévue dépassée', v_retard, 'livraisons'),
      public.cockpit_alerte('echecs', 'alerte', 'Livraisons en échec à replanifier', null, v_echecs, 'livraisons?statut=echec'),
      public.cockpit_alerte('sans_livreur', 'alerte', 'Livraisons du jour sans livreur', null, v_sans_livreur, 'livraisons')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', '[]'::jsonb,
    'activite', '[]'::jsonb
  );
end
$$;

create or replace function public.cockpit_domaines(p_etablissement_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'titre', d.titre) order by d.ordre), '[]'::jsonb)
  from (values
    (1, 'commerce', 'Commerce', public.lecture_autorisee(p_etablissement_id, 'ventes.lire') and public.module_actif(p_etablissement_id, 'caisse')
        and ((select e.solution_id from public.etablissements e where e.id = p_etablissement_id) = 'commerce'
             or exists (select 1 from public.ventes v where v.etablissement_id = p_etablissement_id and v.origine = 'caisse'))),
    (2, 'restaurant', 'Restaurant', public.lecture_autorisee(p_etablissement_id, 'restaurant_salle.lire')),
    (3, 'hotel', 'Hôtel', public.lecture_autorisee(p_etablissement_id, 'hotel_reservations.lire')),
    (4, 'boutique', 'E-commerce', public.lecture_autorisee(p_etablissement_id, 'ecommerce_boutique.lire')),
    (5, 'livraisons', 'Livraisons', public.lecture_autorisee(p_etablissement_id, 'livraisons.lire')),
    (6, 'location', 'Location', public.lecture_autorisee(p_etablissement_id, 'location.lire')),
    (7, 'facturation', 'Facturation', public.lecture_autorisee(p_etablissement_id, 'facturation.lire')),
    (8, 'tresorerie', 'Trésorerie', public.lecture_autorisee(p_etablissement_id, 'depenses.lire') and public.lecture_autorisee(p_etablissement_id, 'paiements.lire')),
    (9, 'crm', 'CRM', public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire')),
    (10, 'achats', 'Achats', public.lecture_autorisee(p_etablissement_id, 'achats.lire')),
    (11, 'production', 'Production', public.lecture_autorisee(p_etablissement_id, 'production.lire')),
    (12, 'rh', 'RH', public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')),
    (13, 'projets', 'Projets', public.lecture_autorisee(p_etablissement_id, 'projets.lire')),
    (14, 'agenda', 'Agenda', public.lecture_autorisee(p_etablissement_id, 'agenda.lire')),
    (15, 'support', 'Support', public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire')),
    (16, 'abonnements', 'Abonnements', public.lecture_autorisee(p_etablissement_id, 'abonnements.lire')),
    (17, 'fidelite', 'Fidélité', public.lecture_autorisee(p_etablissement_id, 'fidelite.lire')),
    (18, 'siteweb', 'Site web', public.lecture_autorisee(p_etablissement_id, 'site_web.lire'))
  ) as d(ordre, id, titre, visible)
  where d.visible
$$;

revoke all on function public.creer_livraison(uuid, jsonb) from public, anon;
revoke all on function public.creer_tournee(uuid, jsonb) from public, anon;
revoke all on function public.avancer_livraison(uuid, text, jsonb) from public, anon;
revoke all on function public.replanifier_livraison(uuid, jsonb) from public, anon;
revoke all on function public.annuler_livraison(uuid, text) from public, anon;
revoke all on function public.livreurs_etablissement(uuid) from public, anon;
revoke all on function public.cockpit_livraisons(uuid, date, date, jsonb) from public, anon;
grant execute on function public.creer_livraison(uuid, jsonb) to authenticated;
grant execute on function public.creer_tournee(uuid, jsonb) to authenticated;
grant execute on function public.avancer_livraison(uuid, text, jsonb) to authenticated;
grant execute on function public.replanifier_livraison(uuid, jsonb) to authenticated;
grant execute on function public.annuler_livraison(uuid, text) to authenticated;
grant execute on function public.livreurs_etablissement(uuid) to authenticated;
grant execute on function public.cockpit_livraisons(uuid, date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
