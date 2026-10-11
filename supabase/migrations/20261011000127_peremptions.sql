-- Dates de péremption (2026-10-11, demande de Juste : « savoir ce qui va périmer avant de le jeter »).
-- On note une quantité d'un article qui périme à une date, dans un Hub (à la réception ou plus tard). La liste montre
-- ce qui périme dans les prochains jours (et ce qui est déjà périmé). Quand c'est réglé, on peut retirer la quantité
-- du stock : c'est le même retrait que « Retirer » dans l'écran Stock (ajustement négatif, raison « Périmé »).
-- Rien ne change pour les mouvements existants. Écriture uniquement par les fonctions ci-dessous (stock.ajuster),
-- lecture avec stock.lire sur les Hubs autorisés.

create table public.peremptions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  quantite numeric(14, 3) not null check (quantite > 0 and quantite < 1000000000),
  date_peremption date not null,
  note text check (note is null or length(note) <= 200),
  statut text not null default 'a_surveiller' check (statut in ('a_surveiller', 'traitee')),
  quantite_retiree numeric(14, 3) check (quantite_retiree is null or quantite_retiree >= 0),
  cree_le timestamptz not null default now(),
  cree_par uuid not null references auth.users(id) on delete restrict,
  traitee_le timestamptz,
  traitee_par uuid references auth.users(id) on delete restrict,
  check ((statut = 'traitee') = (traitee_le is not null))
);
create index peremptions_etab_date_idx on public.peremptions(etablissement_id, statut, date_peremption);
create index peremptions_article_idx on public.peremptions(article_id);
create index peremptions_hub_idx on public.peremptions(hub_id);

alter table public.peremptions enable row level security;
create policy lecture on public.peremptions for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'stock.lire') and public.lecture_hub(etablissement_id, hub_id));
revoke insert, update, delete on public.peremptions from anon, authenticated;
create trigger peremptions_sans_suppression before delete on public.peremptions for each row execute function public.refuser_suppression();
create trigger peremptions_audit after insert or update on public.peremptions for each row execute function public.journaliser_modification();

-- Noter une date de péremption (droit stock.ajuster, Hub autorisé). p_hub_id vide : Hub principal.
create function public.noter_peremption(p_etablissement_id uuid, p_hub_id uuid, p_article_id uuid, p_quantite numeric,
  p_date date, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hub public.hubs%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'stock.ajuster');
  select * into hub from public.hubs
  where id = coalesce(p_hub_id, public.hub_principal(p_etablissement_id)) and etablissement_id = p_etablissement_id;
  if hub.id is null then
    raise exception 'Hub introuvable';
  end if;
  perform public.exiger_acces_hub(hub.id);
  if not hub.actif or not hub.capacite_stock then
    raise exception 'Ce Hub ne gère pas de stock';
  end if;
  if not exists (select 1 from public.articles where id = p_article_id and etablissement_id = p_etablissement_id and actif) then
    raise exception 'Article introuvable dans cet établissement';
  end if;
  if p_quantite is null or p_quantite = 'NaN'::numeric or p_quantite <= 0 or p_quantite >= 1000000000 then
    raise exception 'Indiquez une quantité supérieure à 0';
  end if;
  if p_date is null then
    raise exception 'Indiquez la date de péremption';
  end if;
  if p_date < public.date_locale(p_etablissement_id) - 366 or p_date > public.date_locale(p_etablissement_id) + 3660 then
    raise exception 'Date de péremption invalide';
  end if;
  if length(coalesce(v_note, '')) > 200 then
    raise exception 'Note trop longue (200 caractères au plus)';
  end if;
  insert into public.peremptions (etablissement_id, hub_id, article_id, quantite, date_peremption, note, cree_par)
  values (p_etablissement_id, hub.id, p_article_id, round(p_quantite, 3), p_date, v_note, auth.uid())
  returning id into resultat;
  return resultat;
end
$$;
revoke execute on function public.noter_peremption(uuid, uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.noter_peremption(uuid, uuid, uuid, numeric, date, text) to authenticated;

-- C'est réglé. p_retirer_du_stock : la quantité (au plus le stock du Hub) sort du stock comme un retrait « Périmé ».
create function public.traiter_peremption(p_id uuid, p_retirer_du_stock boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.peremptions%rowtype;
  article public.articles%rowtype;
  v_stock numeric;
  v_retrait numeric := 0;
begin
  select * into p from public.peremptions where id = p_id for update;
  if p.id is null then
    raise exception 'Date de péremption introuvable';
  end if;
  perform public.exiger_permission(p.etablissement_id, 'stock.ajuster');
  perform public.exiger_acces_hub(p.hub_id);
  if p.statut <> 'a_surveiller' then
    raise exception 'C''est déjà réglé';
  end if;
  if coalesce(p_retirer_du_stock, false) then
    select * into article from public.articles where id = p.article_id;
    if not article.suivi_stock then
      raise exception 'Cet article n''est pas suivi en stock : rien à retirer';
    end if;
    v_stock := public.stock_hub(p.hub_id, p.article_id);
    v_retrait := greatest(least(p.quantite, v_stock), 0);
    if v_retrait > 0 then
      v_stock := public.ajuster_stock_hub(p.hub_id, p.article_id, 'ajustement', -v_retrait, 'Périmé', null);
    end if;
  end if;
  update public.peremptions
  set statut = 'traitee', traitee_le = now(), traitee_par = auth.uid(), quantite_retiree = v_retrait
  where id = p.id;
  return jsonb_build_object('retire', v_retrait, 'stock', v_stock, 'cout_achat', article.cout_achat);
end
$$;
revoke execute on function public.traiter_peremption(uuid, boolean) from public, anon;
grant execute on function public.traiter_peremption(uuid, boolean) to authenticated;

-- À surveiller : ce qui périme dans les p_jours prochains jours, et ce qui est déjà périmé (droit stock.lire).
-- Tableau jsonb trié par date (jours : jours restants, négatif = déjà périmé).
create function public.peremptions_proches(p_etablissement_id uuid, p_jours integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jour date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'stock.lire') then
    raise exception 'Permission refusée : stock.lire' using errcode = '42501';
  end if;
  if p_jours is null or p_jours < 0 or p_jours > 3660 then
    raise exception 'Nombre de jours invalide';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'hub_id', p.hub_id, 'hub', h.nom, 'article_id', p.article_id,
      'article', a.nom, 'unite', a.unite, 'quantite', p.quantite, 'date_peremption', p.date_peremption,
      'jours', p.date_peremption - v_jour, 'note', p.note, 'cout_achat', a.cout_achat, 'cree_le', p.cree_le)
      order by p.date_peremption, a.nom)
    from public.peremptions p
    join public.articles a on a.id = p.article_id
    join public.hubs h on h.id = p.hub_id
    where p.etablissement_id = p_etablissement_id and p.statut = 'a_surveiller'
      and p.date_peremption <= v_jour + p_jours
      and public.lecture_hub(p_etablissement_id, p.hub_id)
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.peremptions_proches(uuid, integer) from public, anon;
grant execute on function public.peremptions_proches(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
