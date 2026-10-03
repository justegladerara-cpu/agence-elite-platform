-- Réservations de tables Restaurant : planning opérationnel, affectation de table,
-- arrivée et absence. Aucune réservation n'ouvre une commande automatiquement.

create table public.rest_reservations (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  table_id uuid references public.rest_tables(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete restrict,
  nom_client text not null check (length(btrim(nom_client)) between 2 and 120),
  telephone text check (telephone is null or length(telephone) <= 40),
  debut timestamptz not null,
  duree_minutes integer not null default 120 check (duree_minutes between 15 and 720),
  couverts integer not null check (couverts between 1 and 200),
  statut text not null default 'confirmee' check (statut in ('confirmee', 'arrivee', 'terminee', 'annulee', 'absente')),
  note text check (note is null or length(note) <= 500),
  motif text check (motif is null or length(motif) <= 500),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (statut not in ('annulee', 'absente') or btrim(coalesce(motif, '')) <> '')
);
create index rest_reservations_planning_idx on public.rest_reservations(etablissement_id, hub_id, debut);
create index rest_reservations_table_idx on public.rest_reservations(table_id, debut) where statut in ('confirmee', 'arrivee');
alter table public.rest_reservations enable row level security;
create policy lecture on public.rest_reservations for select to authenticated using (
  public.lecture_autorisee(etablissement_id, 'restaurant_salle.lire') and public.lecture_hub(etablissement_id, hub_id)
);
create trigger rest_reservations_modifie_le before update on public.rest_reservations for each row execute function public.fixer_modifie_le();
create trigger rest_reservations_sans_suppression before delete on public.rest_reservations for each row execute function public.refuser_suppression();
create trigger rest_reservations_audit after insert or update or delete on public.rest_reservations for each row execute function public.journaliser_modification();

create function public.enregistrer_reservation_restaurant(p_etablissement_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare resultat uuid := nullif(p->>'id','')::uuid; v_table public.rest_tables%rowtype; v_hub uuid := nullif(p->>'hub_id','')::uuid;
  v_debut timestamptz := nullif(p->>'debut','')::timestamptz; v_duree integer := coalesce(nullif(p->>'duree_minutes','')::integer,120);
begin
  perform public.exiger_permission(p_etablissement_id, 'restaurant_salle.servir');
  if nullif(p->>'table_id','') is not null then
    select * into v_table from public.rest_tables where id=(p->>'table_id')::uuid and etablissement_id=p_etablissement_id and actif;
    if v_table.id is null then raise exception 'Table introuvable'; end if;
    v_hub := v_table.hub_id;
  end if;
  if not exists(select 1 from public.hubs where id=v_hub and etablissement_id=p_etablissement_id and actif) then raise exception 'Choisissez un Hub actif'; end if;
  perform public.exiger_acces_hub(v_hub);
  if v_debut is null or v_debut < now() - interval '1 day' then raise exception 'Date de réservation invalide'; end if;
  if coalesce((p->>'couverts')::integer,0) < 1 then raise exception 'Indiquez le nombre de couverts'; end if;
  if coalesce(btrim(p->>'nom_client'),'')='' then raise exception 'Le nom du client est obligatoire'; end if;
  if v_table.id is not null then
    perform pg_advisory_xact_lock(hashtextextended('reservation-table:'||v_table.id::text,0));
    if (p->>'couverts')::integer > v_table.places then raise exception 'La table % offre seulement % places',v_table.nom,v_table.places; end if;
    if exists(select 1 from public.rest_reservations r where r.table_id=v_table.id and r.id is distinct from resultat and r.statut in ('confirmee','arrivee')
      and tstzrange(r.debut,r.debut+make_interval(mins=>r.duree_minutes),'[)') && tstzrange(v_debut,v_debut+make_interval(mins=>v_duree),'[)')) then
      raise exception 'Cette table est déjà réservée sur ce créneau';
    end if;
  end if;
  if resultat is null then
    insert into public.rest_reservations(etablissement_id,hub_id,table_id,contact_id,nom_client,telephone,debut,duree_minutes,couverts,note,cree_par)
    values(p_etablissement_id,v_hub,v_table.id,nullif(p->>'contact_id','')::uuid,btrim(p->>'nom_client'),nullif(btrim(p->>'telephone'),''),v_debut,v_duree,(p->>'couverts')::integer,nullif(btrim(p->>'note'),''),auth.uid()) returning id into resultat;
  else
    update public.rest_reservations set hub_id=v_hub,table_id=v_table.id,contact_id=nullif(p->>'contact_id','')::uuid,nom_client=btrim(p->>'nom_client'),telephone=nullif(btrim(p->>'telephone'),''),debut=v_debut,duree_minutes=v_duree,couverts=(p->>'couverts')::integer,note=nullif(btrim(p->>'note'),'')
    where id=resultat and etablissement_id=p_etablissement_id and statut='confirmee';
    if not found then raise exception 'Réservation introuvable ou déjà traitée'; end if;
  end if;
  return resultat;
end $$;

create function public.statut_reservation_restaurant(p_id uuid,p_statut text,p_motif text default null)
returns void language plpgsql security definer set search_path='' as $$
declare r public.rest_reservations%rowtype;
begin
  select * into r from public.rest_reservations where id=p_id for update;
  if r.id is null then raise exception 'Réservation introuvable'; end if;
  perform public.exiger_permission(r.etablissement_id,'restaurant_salle.servir'); perform public.exiger_acces_hub(r.hub_id);
  if (p_statut='arrivee' and r.statut='confirmee') or (p_statut='terminee' and r.statut='arrivee') then
    update public.rest_reservations set statut=p_statut where id=r.id;
  elsif p_statut in ('annulee','absente') and r.statut='confirmee' then
    if coalesce(btrim(p_motif),'')='' then raise exception 'Le motif est obligatoire'; end if;
    update public.rest_reservations set statut=p_statut,motif=btrim(p_motif) where id=r.id;
  else raise exception 'Transition de réservation impossible'; end if;
end $$;

revoke execute on function public.enregistrer_reservation_restaurant(uuid,jsonb) from public,anon;
grant execute on function public.enregistrer_reservation_restaurant(uuid,jsonb) to authenticated;
revoke execute on function public.statut_reservation_restaurant(uuid,text,text) from public,anon;
grant execute on function public.statut_reservation_restaurant(uuid,text,text) to authenticated;
