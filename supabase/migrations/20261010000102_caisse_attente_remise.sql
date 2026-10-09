-- Caisse : ventes mises en attente, plafond de remise par rôle, coupures pour le comptage du tiroir.
-- Rien ne change pour les ventes existantes : aucune colonne ajoutée à ventes, plafond par défaut 100 % (aucune limite).
-- Plan : docs/AMELIORATIONS/PROPOSITIONS_2026-10-09.md (C01, C03, C04).

-- ---------------------------------------------------------------------------
-- 1. Réglages : plafond de remise (caisse) et coupures du tiroir (clôture)
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "remise_max_pourcentage", "libelle": "Remise maximale sans autorisation (% du ticket, 100 = aucune limite)", "type": "nombre", "defaut": 100}
]'::jsonb
where id = 'caisse' and not parametres_schema @> '[{"cle": "remise_max_pourcentage"}]'::jsonb;

update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "coupures", "libelle": "Billets et pièces du tiroir, séparés par des virgules (ex. 10000, 5000, 1000, 500, 100) : aide au comptage", "type": "texte", "defaut": ""}
]'::jsonb
where id = 'cloture' and not parametres_schema @> '[{"cle": "coupures"}]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Droit de dépasser le plafond de remise : rôles qui gèrent déjà l'établissement
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('caisse.remise_libre', 'caisse', 'Accorder une remise au-delà du plafond réglé dans la caisse')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'caisse.remise_libre' from unnest(array['gerant', 'responsable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- Contrôle à la validation de la transaction (les lignes et leurs remises existent alors) : seules les ventes de caisse
-- faites par une personne connectée sont concernées.
create function public.controler_plafond_remise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remises numeric;
  brut numeric;
  plafond numeric;
begin
  if new.session_caisse_id is null or auth.uid() is null then return null; end if;
  plafond := coalesce((public.parametre_module(new.etablissement_id, 'caisse', 'remise_max_pourcentage', '100'::jsonb) #>> '{}')::numeric, 100);
  if plafond >= 100 then return null; end if;
  select coalesce(sum(l.remise), 0) into remises from public.lignes_vente l where l.vente_id = new.id;
  brut := new.sous_total + remises;
  remises := remises + new.remise;
  if brut <= 0 or remises <= 0 then return null; end if;
  if remises * 100 > brut * greatest(plafond, 0) and not public.a_permission(new.etablissement_id, 'caisse.remise_libre') then
    raise exception 'Remise de % %% : au-delà de % %%, un responsable doit valider la vente', round(remises * 100 / brut, 1), plafond
      using errcode = 'P0001';
  end if;
  return null;
end
$$;
revoke execute on function public.controler_plafond_remise() from public, anon, authenticated;

create constraint trigger ventes_plafond_remise
after insert on public.ventes
deferrable initially deferred
for each row execute function public.controler_plafond_remise();

-- ---------------------------------------------------------------------------
-- 3. Ventes en attente : un panier mis de côté puis repris (aucune écriture de stock ni de vente)
-- ---------------------------------------------------------------------------
create table public.ventes_en_attente (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  session_caisse_id uuid not null references public.sessions_caisse(id) on delete restrict,
  libelle text not null check (length(btrim(libelle)) between 1 and 60),
  lignes jsonb not null check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) between 1 and 200),
  contact_id uuid references public.contacts(id) on delete restrict,
  remise numeric(14, 2) not null default 0 check (remise >= 0),
  total_estime numeric(14, 2) not null default 0 check (total_estime >= 0),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'reprise', 'abandonnee')),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  termine_par uuid references auth.users(id) on delete restrict,
  termine_le timestamptz,
  check ((statut = 'en_attente') = (termine_le is null))
);
create index ventes_en_attente_hub_idx on public.ventes_en_attente(etablissement_id, hub_id, statut);

alter table public.ventes_en_attente enable row level security;
create policy lecture on public.ventes_en_attente for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.utiliser') and public.lecture_hub(etablissement_id, hub_id));
create trigger ventes_en_attente_verrou_etablissement before update on public.ventes_en_attente
  for each row execute function public.verrouiller_etablissement_id();
create trigger ventes_en_attente_sans_suppression before delete on public.ventes_en_attente
  for each row execute function public.refuser_suppression();
create trigger ventes_en_attente_audit after insert or update or delete on public.ventes_en_attente
  for each row execute function public.journaliser_modification();

-- p_lignes : [{ article_id, quantite }] comme enregistrer_vente. Le prix est relu au moment de la vente.
create function public.mettre_vente_en_attente(
  p_session_id uuid, p_lignes jsonb, p_libelle text default null, p_contact_id uuid default null, p_remise numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  propres jsonb;
  estime numeric;
  nouvel uuid;
  rang integer;
begin
  select * into session from public.sessions_caisse where id = p_session_id;
  if session.id is null then raise exception 'Session de caisse introuvable'; end if;
  perform public.exiger_permission(session.etablissement_id, 'caisse.utiliser');
  perform public.exiger_acces_hub(session.hub_id);
  if session.statut <> 'ouverte' then raise exception 'Aucune caisse ouverte : ouvrez la caisse avant de vendre'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le panier est vide';
  end if;
  if jsonb_array_length(p_lignes) > 200 then raise exception 'Panier trop long (200 lignes au plus)'; end if;
  if p_remise is null or p_remise < 0 or p_remise = 'NaN'::numeric then raise exception 'Remise invalide'; end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts where id = p_contact_id and etablissement_id = session.etablissement_id
  ) then raise exception 'Contact inconnu dans cet établissement'; end if;
  -- Seuls article et quantité sont gardés ; chaque article doit appartenir à l'établissement.
  select jsonb_agg(jsonb_build_object('article_id', a.id, 'quantite', x.quantite)), sum(a.prix_vente * x.quantite)
  into propres, estime
  from (
    select (l ->> 'article_id')::uuid article_id, (l ->> 'quantite')::numeric quantite
    from jsonb_array_elements(p_lignes) l
  ) x
  left join public.articles a on a.id = x.article_id and a.etablissement_id = session.etablissement_id;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    left join public.articles a on a.id = (l ->> 'article_id')::uuid and a.etablissement_id = session.etablissement_id
    where a.id is null or (l ->> 'quantite')::numeric is null or (l ->> 'quantite')::numeric <= 0 or (l ->> 'quantite')::numeric = 'NaN'::numeric
  ) then raise exception 'Ligne de vente invalide'; end if;
  if (select count(*) from public.ventes_en_attente where session_caisse_id = session.id and statut = 'en_attente') >= 20 then
    raise exception 'Déjà 20 ventes en attente sur cette caisse : reprenez-en une d''abord';
  end if;
  select count(*) + 1 into rang from public.ventes_en_attente where session_caisse_id = session.id;
  insert into public.ventes_en_attente(etablissement_id, hub_id, session_caisse_id, libelle, lignes, contact_id, remise, total_estime, cree_par)
  values (session.etablissement_id, session.hub_id, session.id,
    coalesce(nullif(left(btrim(p_libelle), 60), ''), 'Attente ' || rang), propres, p_contact_id, round(p_remise, 2),
    greatest(round(coalesce(estime, 0) - p_remise, 2), 0), auth.uid())
  returning id into nouvel;
  return nouvel;
end
$$;

-- Reprendre (le panier revient en caisse) ou abandonner (motif implicite : client parti). Une seule fois.
create function public.terminer_vente_en_attente(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attente public.ventes_en_attente%rowtype;
begin
  if p_action not in ('reprendre', 'abandonner') then raise exception 'Action inconnue'; end if;
  select * into attente from public.ventes_en_attente where id = p_id for update;
  if attente.id is null then raise exception 'Vente en attente introuvable'; end if;
  perform public.exiger_permission(attente.etablissement_id, 'caisse.utiliser');
  perform public.exiger_acces_hub(attente.hub_id);
  if attente.statut <> 'en_attente' then raise exception 'Cette vente en attente a déjà été reprise ou abandonnée'; end if;
  update public.ventes_en_attente
  set statut = case p_action when 'reprendre' then 'reprise' else 'abandonnee' end, termine_par = auth.uid(), termine_le = now()
  where id = attente.id;
  return jsonb_build_object('lignes', attente.lignes, 'contact_id', attente.contact_id, 'remise', attente.remise, 'libelle', attente.libelle);
end
$$;

revoke execute on function public.mettre_vente_en_attente(uuid, jsonb, text, uuid, numeric) from public, anon;
grant execute on function public.mettre_vente_en_attente(uuid, jsonb, text, uuid, numeric) to authenticated;
revoke execute on function public.terminer_vente_en_attente(uuid, text) from public, anon;
grant execute on function public.terminer_vente_en_attente(uuid, text) to authenticated;

notify pgrst, 'reload schema';
