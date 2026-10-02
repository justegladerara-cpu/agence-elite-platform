-- Mise à jour « Hubs » (2026-10-02), partie 2 : structure Client → Établissement → Hub → Caisse.
-- Un Hub est un lieu opérationnel d'un seul établissement (magasin, point de vente, dépôt).
-- Ce n'est pas un module : il porte des capacités (vente, stock, caisse, transfert).
-- Les caisses restent la table points_de_vente, désormais rattachée à un Hub.
-- Données existantes : chaque établissement reçoit un « Hub principal » ; toutes les lignes
-- existantes y sont rattachées. Le total du stock par établissement est vérifié avant/après :
-- la migration échoue (et rien n'est appliqué) si un seul total change.

create table public.hubs (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (btrim(nom) <> ''),
  code text check (code is null or code ~ '^[A-Z0-9-]{1,12}$'),
  type text not null default 'point_de_vente' check (type in ('point_de_vente', 'depot', 'mixte')),
  capacite_vente boolean not null default true,
  capacite_stock boolean not null default true,
  capacite_caisse boolean not null default true,
  capacite_transfert boolean not null default true,
  principal boolean not null default false,
  actif boolean not null default true,
  adresse text,
  telephone text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, nom),
  unique (id, etablissement_id),
  check (not capacite_caisse or capacite_vente),
  check (not principal or actif)
);
create unique index hubs_un_principal on public.hubs(etablissement_id) where principal;
create unique index hubs_code_unique on public.hubs(etablissement_id, code) where code is not null;
create index hubs_etablissement_id_idx on public.hubs(etablissement_id);
create trigger hubs_modifie_le before update on public.hubs
for each row execute function public.fixer_modifie_le();
create trigger hubs_verrou_etablissement before update on public.hubs
for each row execute function public.verrouiller_etablissement_id();
create trigger hubs_sans_suppression before delete on public.hubs
for each row execute function public.refuser_suppression();
create trigger hubs_audit after insert or update or delete on public.hubs
for each row execute function public.journaliser_modification();
alter table public.hubs enable row level security;

-- Restriction d'un membre à certains Hubs. Aucune ligne = accès à tous les Hubs de l'établissement.
create table public.membre_hubs (
  etablissement_id uuid not null,
  user_id uuid not null,
  hub_id uuid not null,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  primary key (user_id, hub_id),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict,
  foreign key (etablissement_id, user_id) references public.etablissement_membres(etablissement_id, user_id) on delete restrict
);
create index membre_hubs_etablissement_user_idx on public.membre_hubs(etablissement_id, user_id);
create index membre_hubs_hub_id_idx on public.membre_hubs(hub_id);
create trigger membre_hubs_audit after insert or update or delete on public.membre_hubs
for each row execute function public.journaliser_modification();
alter table public.membre_hubs enable row level security;

-- Vérification « avant » : stock total par établissement et par article.
create temporary table _hubs_avant on commit drop as
select etablissement_id, article_id, sum(quantite) as quantite
from public.mouvements_stock group by etablissement_id, article_id;

-- Un Hub principal par établissement existant ; puis automatiquement pour chaque nouvel établissement.
insert into public.hubs (etablissement_id, nom, type, principal)
select e.id, 'Hub principal', 'mixte', true
from public.etablissements e
where not exists (select 1 from public.hubs h where h.etablissement_id = e.id and h.principal);

create function public.creer_hub_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.hubs (etablissement_id, nom, type, principal)
  values (new.id, 'Hub principal', 'mixte', true);
  return new;
end
$$;
create trigger etablissements_hub_principal after insert on public.etablissements
for each row execute function public.creer_hub_principal();

create function public.hub_principal(p_etablissement_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.hubs where etablissement_id = p_etablissement_id and principal
$$;

-- Colonnes hub_id : ajoutées, remplies, puis rendues obligatoires --------------------
alter table public.points_de_vente add column hub_id uuid;
alter table public.sessions_caisse add column hub_id uuid;
alter table public.ventes add column hub_id uuid;
alter table public.paiements add column hub_id uuid;
alter table public.clotures add column hub_id uuid;
alter table public.mouvements_stock add column hub_id uuid;
alter table public.depenses add column hub_id uuid;

-- Les protections d'immuabilité sont suspendues le temps du rattachement (même transaction).
alter table public.mouvements_stock disable trigger mouvements_stock_immuables;
alter table public.ventes disable trigger ventes_protection;
alter table public.paiements disable trigger paiements_protection;
alter table public.depenses disable trigger depenses_protection;
alter table public.clotures disable trigger clotures_immuables;
alter table public.sessions_caisse disable trigger sessions_caisse_protection;

update public.points_de_vente p set hub_id = public.hub_principal(p.etablissement_id) where hub_id is null;
update public.sessions_caisse s set hub_id = p.hub_id from public.points_de_vente p where p.id = s.point_de_vente_id and s.hub_id is null;
update public.ventes v set hub_id = coalesce(
  (select s.hub_id from public.sessions_caisse s where s.id = v.session_caisse_id),
  (select p.hub_id from public.points_de_vente p where p.id = v.point_de_vente_id),
  public.hub_principal(v.etablissement_id)) where hub_id is null;
update public.paiements p set hub_id = coalesce(
  (select s.hub_id from public.sessions_caisse s where s.id = p.session_caisse_id),
  (select v.hub_id from public.ventes v where v.id = p.vente_id)) where hub_id is null;
update public.clotures c set hub_id = (select s.hub_id from public.sessions_caisse s where s.id = c.session_caisse_id) where hub_id is null;
update public.mouvements_stock m set hub_id = coalesce(
  (select v.hub_id from public.ventes v where v.id = m.vente_id),
  public.hub_principal(m.etablissement_id)) where hub_id is null;
update public.depenses d set hub_id = (select s.hub_id from public.sessions_caisse s where s.id = d.session_caisse_id)
where hub_id is null and session_caisse_id is not null;

alter table public.mouvements_stock enable trigger mouvements_stock_immuables;
alter table public.ventes enable trigger ventes_protection;
alter table public.paiements enable trigger paiements_protection;
alter table public.depenses enable trigger depenses_protection;
alter table public.clotures enable trigger clotures_immuables;
alter table public.sessions_caisse enable trigger sessions_caisse_protection;

alter table public.points_de_vente alter column hub_id set not null;
alter table public.sessions_caisse alter column hub_id set not null;
alter table public.ventes alter column hub_id set not null;
alter table public.paiements alter column hub_id set not null;
alter table public.clotures alter column hub_id set not null;
alter table public.mouvements_stock alter column hub_id set not null;

-- Un Hub appartient toujours au même établissement que la ligne qui le cite.
alter table public.points_de_vente add constraint points_de_vente_hub_fk foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict;
alter table public.sessions_caisse add constraint sessions_caisse_hub_fk foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict;
alter table public.ventes add constraint ventes_hub_fk foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict;
alter table public.paiements add constraint paiements_hub_fk foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict;
alter table public.clotures add constraint clotures_hub_fk foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict;
alter table public.mouvements_stock add constraint mouvements_stock_hub_fk foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict;
alter table public.depenses add constraint depenses_hub_fk foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict;

create index points_de_vente_hub_id_idx on public.points_de_vente(hub_id);
create index sessions_caisse_hub_id_idx on public.sessions_caisse(hub_id);
create index ventes_hub_cree_le_idx on public.ventes(hub_id, cree_le desc);
create index paiements_hub_id_idx on public.paiements(hub_id);
create index clotures_hub_id_idx on public.clotures(hub_id);
create index mouvements_stock_hub_article_idx on public.mouvements_stock(hub_id, article_id);
create index depenses_hub_id_idx on public.depenses(hub_id);

-- Vérification « après » : aucun total par établissement ni par article n'a changé.
do $$
begin
  if exists (
    select 1
    from _hubs_avant a
    full join (
      select etablissement_id, article_id, sum(quantite) as quantite
      from public.mouvements_stock group by etablissement_id, article_id
    ) b using (etablissement_id, article_id)
    where a.quantite is distinct from b.quantite
  ) then
    raise exception 'Migration Hubs : le stock a changé pendant le rattachement, rien n''est appliqué';
  end if;
  if exists (select 1 from public.mouvements_stock m join public.hubs h on h.id = m.hub_id where not h.principal) then
    raise exception 'Migration Hubs : un mouvement existant n''est pas rattaché au Hub principal';
  end if;
end
$$;

-- Le Hub d'une ligne est définitif.
create function public.verrouiller_hub_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.hub_id is distinct from old.hub_id then
    raise exception 'Le Hub d''une ligne ne peut pas être modifié';
  end if;
  return new;
end
$$;
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['points_de_vente', 'sessions_caisse', 'ventes', 'paiements', 'clotures', 'mouvements_stock', 'depenses'] loop
    execute format(
      'create trigger %I_verrou_hub before update on public.%I for each row execute function public.verrouiller_hub_id()',
      nom_table, nom_table
    );
  end loop;
end
$$;

-- Compatibilité : une écriture sans Hub prend le Hub cohérent (caisse, vente ou Hub principal).
-- Ainsi l'application déjà publiée continue de fonctionner pendant le déploiement.
create function public.completer_hub()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hub_id is not null then
    return new;
  end if;
  if tg_table_name = 'points_de_vente' then
    new.hub_id := public.hub_principal(new.etablissement_id);
  elsif tg_table_name = 'sessions_caisse' then
    new.hub_id := (select p.hub_id from public.points_de_vente p where p.id = new.point_de_vente_id);
  elsif tg_table_name = 'ventes' then
    new.hub_id := coalesce((select s.hub_id from public.sessions_caisse s where s.id = new.session_caisse_id), public.hub_principal(new.etablissement_id));
  elsif tg_table_name = 'paiements' then
    new.hub_id := coalesce((select s.hub_id from public.sessions_caisse s where s.id = new.session_caisse_id),
                           (select v.hub_id from public.ventes v where v.id = new.vente_id));
  elsif tg_table_name = 'clotures' then
    new.hub_id := (select s.hub_id from public.sessions_caisse s where s.id = new.session_caisse_id);
  elsif tg_table_name = 'mouvements_stock' then
    new.hub_id := coalesce((select v.hub_id from public.ventes v where v.id = new.vente_id), public.hub_principal(new.etablissement_id));
  elsif tg_table_name = 'depenses' then
    new.hub_id := (select s.hub_id from public.sessions_caisse s where s.id = new.session_caisse_id);
  end if;
  return new;
end
$$;
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['points_de_vente', 'sessions_caisse', 'ventes', 'paiements', 'clotures', 'mouvements_stock', 'depenses'] loop
    execute format(
      'create trigger %I_completer_hub before insert on public.%I for each row execute function public.completer_hub()',
      nom_table, nom_table
    );
  end loop;
end
$$;

-- Une caisse n'existe que dans un Hub actif qui a la capacité « caisse ».
create function public.verifier_hub_caisse()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.actif and not exists (
    select 1 from public.hubs h where h.id = new.hub_id and h.actif and h.capacite_caisse
  ) then
    raise exception 'Ce Hub n''a pas de caisse : activez la capacité « caisse » du Hub';
  end if;
  return new;
end
$$;
create trigger points_de_vente_hub_caisse before insert or update on public.points_de_vente
for each row execute function public.verifier_hub_caisse();

-- Mouvements : nouveaux types (transferts) et références (transfert, inventaire).
create table public.transferts (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  hub_source_id uuid not null,
  hub_destination_id uuid not null,
  statut text not null default 'valide' check (statut in ('valide', 'annule')),
  motif text,
  auteur uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  motif_annulation text,
  unique (etablissement_id, numero),
  check (hub_source_id <> hub_destination_id),
  check (statut = 'valide' or (annule_le is not null and annule_par is not null and btrim(coalesce(motif_annulation, '')) <> '')),
  foreign key (hub_source_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict,
  foreign key (hub_destination_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create index transferts_etablissement_cree_le_idx on public.transferts(etablissement_id, cree_le desc);
create index transferts_hub_source_idx on public.transferts(hub_source_id);
create index transferts_hub_destination_idx on public.transferts(hub_destination_id);

create table public.lignes_transfert (
  id uuid primary key default gen_random_uuid(),
  transfert_id uuid not null references public.transferts(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  libelle text not null,
  quantite numeric(14, 3) not null check (quantite > 0)
);
create index lignes_transfert_transfert_id_idx on public.lignes_transfert(transfert_id);
create index lignes_transfert_article_id_idx on public.lignes_transfert(article_id);

create table public.inventaires (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  numero text not null,
  motif text,
  auteur uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create index inventaires_hub_cree_le_idx on public.inventaires(hub_id, cree_le desc);
create index inventaires_etablissement_id_idx on public.inventaires(etablissement_id);

create table public.lignes_inventaire (
  id uuid primary key default gen_random_uuid(),
  inventaire_id uuid not null references public.inventaires(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  libelle text not null,
  quantite_theorique numeric(14, 3) not null,
  quantite_comptee numeric(14, 3) not null check (quantite_comptee >= 0),
  ecart numeric(14, 3) not null,
  check (ecart = quantite_comptee - quantite_theorique)
);
create index lignes_inventaire_inventaire_id_idx on public.lignes_inventaire(inventaire_id);
create index lignes_inventaire_article_id_idx on public.lignes_inventaire(article_id);

alter table public.mouvements_stock add column transfert_id uuid references public.transferts(id) on delete restrict;
alter table public.mouvements_stock add column inventaire_id uuid references public.inventaires(id) on delete restrict;
create index mouvements_stock_transfert_id_idx on public.mouvements_stock(transfert_id) where transfert_id is not null;
create index mouvements_stock_inventaire_id_idx on public.mouvements_stock(inventaire_id) where inventaire_id is not null;
do $$
declare
  contrainte text;
begin
  select c.conname into contrainte
  from pg_constraint c
  where c.conrelid = 'public.mouvements_stock'::regclass and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%sortie_vente%';
  if contrainte is not null then
    execute format('alter table public.mouvements_stock drop constraint %I', contrainte);
  end if;
end
$$;
alter table public.mouvements_stock add constraint mouvements_stock_type_check check (type in (
  'entree', 'sortie_vente', 'retour_annulation', 'ajustement', 'inventaire',
  'transfert_sortie', 'transfert_entree', 'transfert_annulation'
));

-- Protections : transferts annulables seulement ; lignes, inventaires définitifs ; jamais supprimés.
create trigger transferts_protection before update on public.transferts
for each row execute function public.proteger_annulable();
create trigger lignes_transfert_immuables before update on public.lignes_transfert
for each row execute function public.refuser_modification();
create trigger inventaires_immuables before update on public.inventaires
for each row execute function public.refuser_modification();
create trigger lignes_inventaire_immuables before update on public.lignes_inventaire
for each row execute function public.refuser_modification();
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['transferts', 'lignes_transfert', 'inventaires', 'lignes_inventaire'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;

-- Rôles Hub ----------------------------------------------------------------------------
-- Responsable d'établissement = gérant ; caissier = employé (identifiants inchangés).
do $$
declare
  contrainte text;
begin
  select c.conname into contrainte
  from pg_constraint c
  where c.conrelid = 'public.roles'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%gerant%';
  if contrainte is not null then
    execute format('alter table public.roles drop constraint %I', contrainte);
  end if;
end
$$;
alter table public.roles add constraint roles_id_check
  check (id in ('gerant', 'responsable', 'responsable_hub', 'gestionnaire_depot', 'employe', 'comptable', 'lecteur'));
update public.roles set ordre = ordre * 10 where ordre < 10;
update public.roles set ordre = 50 where id = 'employe';
update public.roles set ordre = 60 where id = 'comptable';
update public.roles set ordre = 70 where id = 'lecteur';
update public.roles set nom = 'Responsable d''établissement', description = 'Tout l''établissement, tous ses Hubs' where id = 'gerant';
update public.roles set nom = 'Caissier', description = 'Vend et encaisse à sa caisse' where id = 'employe';
insert into public.roles (id, nom, description, ordre) values
  ('responsable_hub', 'Responsable Hub', 'Pilote un ou plusieurs Hubs : caisse, stock, transferts, clôtures', 30),
  ('gestionnaire_depot', 'Gestionnaire dépôt', 'Entrées, inventaires et transferts du dépôt', 40)
on conflict (id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('stock.transferer', 'stock', 'Transférer du stock entre Hubs du même établissement'),
  ('etablissement.gerer_hubs', 'etablissement', 'Créer et modifier les Hubs et leurs caisses')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id) values
  ('gerant', 'stock.transferer'), ('gerant', 'etablissement.gerer_hubs'),
  ('responsable', 'stock.transferer')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select 'responsable_hub', id from public.permissions
where id in ('etablissement.lire', 'membres.lire', 'tableau_de_bord.lire', 'articles.lire', 'stock.lire', 'stock.ajuster',
  'stock.transferer', 'caisse.utiliser', 'ventes.lire', 'ventes.annuler', 'paiements.lire', 'paiements.encaisser',
  'recus.lire', 'cloture.lire', 'cloture.cloturer', 'contacts.lire', 'contacts.gerer', 'depenses.lire', 'depenses.gerer')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select 'gestionnaire_depot', id from public.permissions
where id in ('etablissement.lire', 'tableau_de_bord.lire', 'articles.lire', 'stock.lire', 'stock.ajuster', 'stock.transferer')
on conflict do nothing;

-- Accès aux Hubs ---------------------------------------------------------------------
-- Membre actif de l'établissement du Hub, sans restriction ou avec ce Hub dans sa liste.
create function public.acces_hub(p_hub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.compte_pret() and exists (
    select 1
    from public.hubs h
    join public.etablissement_membres m on m.etablissement_id = h.etablissement_id and m.user_id = auth.uid() and m.actif
    where h.id = p_hub_id
      and (
        not exists (select 1 from public.membre_hubs r where r.etablissement_id = h.etablissement_id and r.user_id = auth.uid())
        or exists (select 1 from public.membre_hubs r where r.hub_id = h.id and r.user_id = auth.uid())
      )
  )
$$;

-- Lecture d'une ligne rattachée à un Hub : Hub autorisé, dirigeant du client ou session support.
create function public.lecture_hub(p_etablissement_id uuid, p_hub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_hub_id is null
    or public.acces_hub(p_hub_id)
    or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = p_etablissement_id))
    or public.session_support_active(p_etablissement_id)
$$;

create function public.exiger_acces_hub(p_hub_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.acces_hub(p_hub_id) then
    raise exception 'Accès refusé à ce Hub' using errcode = '42501';
  end if;
end
$$;

create policy hubs_lecture on public.hubs for select to authenticated
using (public.est_editeur() or public.est_membre(etablissement_id)
  or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = hubs.etablissement_id))
  or public.session_support_active(etablissement_id));
create policy membre_hubs_lecture on public.membre_hubs for select to authenticated
using (public.est_editeur() or user_id = auth.uid() or public.a_permission(etablissement_id, 'membres.lire')
  or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = membre_hubs.etablissement_id)));

alter policy lecture on public.ventes
  using (public.lecture_autorisee(etablissement_id, 'ventes.lire') and public.lecture_hub(etablissement_id, hub_id));
alter policy lecture on public.lignes_vente
  using (public.lecture_autorisee(etablissement_id, 'ventes.lire')
    and exists (select 1 from public.ventes v where v.id = lignes_vente.vente_id));
alter policy lecture on public.paiements
  using (public.lecture_autorisee(etablissement_id, 'paiements.lire') and public.lecture_hub(etablissement_id, hub_id));
alter policy lecture on public.mouvements_stock
  using (public.lecture_autorisee(etablissement_id, 'stock.lire') and public.lecture_hub(etablissement_id, hub_id));
alter policy lecture on public.depenses
  using (public.lecture_autorisee(etablissement_id, 'depenses.lire') and public.lecture_hub(etablissement_id, hub_id));
alter policy lecture on public.clotures
  using (public.lecture_autorisee(etablissement_id, 'cloture.lire') and public.lecture_hub(etablissement_id, hub_id));
alter policy lecture on public.sessions_caisse
  using ((public.lecture_autorisee(etablissement_id, 'cloture.lire') or public.a_permission(etablissement_id, 'caisse.utiliser'))
    and public.lecture_hub(etablissement_id, hub_id));

create policy lecture on public.transferts for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'stock.lire')
  and (public.lecture_hub(etablissement_id, hub_source_id) or public.lecture_hub(etablissement_id, hub_destination_id)));
create policy lecture on public.lignes_transfert for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'stock.lire')
  and exists (select 1 from public.transferts t where t.id = lignes_transfert.transfert_id));
create policy lecture on public.inventaires for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'stock.lire') and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.lignes_inventaire for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'stock.lire')
  and exists (select 1 from public.inventaires i where i.id = lignes_inventaire.inventaire_id));

-- Stock par Hub, toujours calculé depuis les mouvements (la RLS des mouvements s'applique).
create view public.stock_hubs with (security_invoker = true) as
select m.etablissement_id, m.hub_id, m.article_id, sum(m.quantite)::numeric(14, 3) as quantite
from public.mouvements_stock m
group by m.etablissement_id, m.hub_id, m.article_id;

create function public.stock_hub(p_hub_id uuid, p_article_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantite), 0) from public.mouvements_stock where hub_id = p_hub_id and article_id = p_article_id
$$;

revoke execute on function public.stock_hub(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.completer_hub() from public, anon, authenticated;
revoke execute on function public.creer_hub_principal() from public, anon, authenticated;
revoke execute on function public.verrouiller_hub_id() from public, anon, authenticated;
revoke execute on function public.verifier_hub_caisse() from public, anon, authenticated;
revoke execute on function public.hub_principal(uuid) from public, anon;
revoke execute on function public.acces_hub(uuid) from public, anon;
revoke execute on function public.lecture_hub(uuid, uuid) from public, anon;
revoke execute on function public.exiger_acces_hub(uuid) from public, anon, authenticated;
