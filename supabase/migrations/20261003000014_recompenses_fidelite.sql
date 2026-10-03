-- Catalogue de récompenses et attribution structurée. Le mouvement de points
-- reste la vérité du solde ; l'attribution relie ce mouvement à une récompense
-- et, si elle existe, à la vente sur laquelle elle a été accordée.

create table public.fidelite_recompenses (
  id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check(length(btrim(nom)) between 2 and 120), description text check(description is null or length(description)<=500),
  points integer not null check(points>0), valeur numeric(14,2) check(valeur is null or valeur>=0), actif boolean not null default true,
  cree_le timestamptz not null default now(), modifie_le timestamptz not null default now(), unique(etablissement_id,nom)
);
create table public.fidelite_attributions (
  id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  recompense_id uuid not null references public.fidelite_recompenses(id) on delete restrict, contact_id uuid not null references public.contacts(id) on delete restrict,
  mouvement_id uuid not null unique references public.fidelite_mouvements(id) on delete restrict, vente_id uuid references public.ventes(id) on delete restrict,
  note text check(note is null or length(note)<=300), attribue_par uuid not null references auth.users(id) on delete restrict, attribue_le timestamptz not null default now()
);
create index fidelite_recompenses_etab_idx on public.fidelite_recompenses(etablissement_id,actif);
create index fidelite_attributions_contact_idx on public.fidelite_attributions(etablissement_id,contact_id,attribue_le desc);
do $$ declare t text; begin foreach t in array array['fidelite_recompenses','fidelite_attributions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy lecture on public.%I for select to authenticated using(public.lecture_autorisee(etablissement_id,''fidelite.lire''))',t);
  execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()',t,t);
  execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()',t,t);
end loop; end $$;
create trigger fidelite_recompenses_modifie_le before update on public.fidelite_recompenses for each row execute function public.fixer_modifie_le();
create trigger fidelite_attributions_immuables before update on public.fidelite_attributions for each row execute function public.refuser_modification();

create function public.enregistrer_recompense_fidelite(p_etablissement_id uuid,p jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare resultat uuid:=nullif(p->>'id','')::uuid;
begin
 perform public.exiger_permission(p_etablissement_id,'fidelite.gerer');
 if coalesce(btrim(p->>'nom'),'')='' or coalesce((p->>'points')::integer,0)<=0 then raise exception 'Nom et nombre de points obligatoires'; end if;
 if resultat is null then insert into public.fidelite_recompenses(etablissement_id,nom,description,points,valeur) values(p_etablissement_id,btrim(p->>'nom'),nullif(btrim(p->>'description'),''),(p->>'points')::integer,nullif(p->>'valeur','')::numeric) returning id into resultat;
 else update public.fidelite_recompenses set nom=btrim(p->>'nom'),description=nullif(btrim(p->>'description'),''),points=(p->>'points')::integer,valeur=nullif(p->>'valeur','')::numeric,actif=coalesce((p->>'actif')::boolean,true) where id=resultat and etablissement_id=p_etablissement_id; if not found then raise exception 'Récompense introuvable'; end if; end if;
 return resultat;
end $$;

create function public.attribuer_recompense_fidelite(p_recompense_id uuid,p_contact_id uuid,p_vente_id uuid default null,p_note text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.fidelite_recompenses%rowtype; mouvement uuid; nouveau_solde integer;
begin
 select * into r from public.fidelite_recompenses where id=p_recompense_id for update;
 if r.id is null or not r.actif then raise exception 'Récompense introuvable ou retirée'; end if;
 perform public.exiger_permission(r.etablissement_id,'fidelite.utiliser');
 if p_vente_id is not null and not exists(select 1 from public.ventes where id=p_vente_id and etablissement_id=r.etablissement_id and contact_id=p_contact_id and statut='validee') then raise exception 'La vente ne correspond pas à ce client'; end if;
 nouveau_solde:=public.utiliser_points_fidelite(r.etablissement_id,p_contact_id,r.points,'Récompense : '||r.nom||case when p_note is null then '' else ' · '||left(btrim(p_note),200) end);
 select id into mouvement from public.fidelite_mouvements where etablissement_id=r.etablissement_id and contact_id=p_contact_id and type='utilisation' order by cree_le desc limit 1;
 insert into public.fidelite_attributions(etablissement_id,recompense_id,contact_id,mouvement_id,vente_id,note,attribue_par) values(r.etablissement_id,r.id,p_contact_id,mouvement,p_vente_id,nullif(btrim(p_note),''),auth.uid());
 return nouveau_solde;
end $$;
revoke execute on function public.enregistrer_recompense_fidelite(uuid,jsonb) from public,anon; grant execute on function public.enregistrer_recompense_fidelite(uuid,jsonb) to authenticated;
revoke execute on function public.attribuer_recompense_fidelite(uuid,uuid,uuid,text) from public,anon; grant execute on function public.attribuer_recompense_fidelite(uuid,uuid,uuid,text) to authenticated;
