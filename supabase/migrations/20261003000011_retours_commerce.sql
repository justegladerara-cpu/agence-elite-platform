-- Retours partiels et remboursements Commerce.
-- Une vente reste définitive : le retour est un document séparé, audité, qui
-- remet seulement les quantités concernées en stock et trace le remboursement.

insert into public.permissions (id, module_id, description) values
  ('ventes.retourner', 'ventes', 'Enregistrer un retour partiel et son remboursement')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role_id, 'ventes.retourner'
from unnest(array['gerant', 'responsable']) role_id
on conflict do nothing;

alter table public.mouvements_stock drop constraint if exists mouvements_stock_type_check;
alter table public.mouvements_stock add constraint mouvements_stock_type_check check (type in (
  'entree', 'sortie_vente', 'retour_annulation', 'retour_partiel', 'ajustement', 'inventaire',
  'transfert_sortie', 'transfert_entree', 'transfert_annulation'
));

create table public.retours_vente (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  vente_id uuid not null references public.ventes(id) on delete restrict,
  numero text not null,
  motif text not null check (length(btrim(motif)) between 3 and 500),
  montant numeric(14, 2) not null check (montant > 0),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, numero)
);
create index retours_vente_vente_idx on public.retours_vente(vente_id, cree_le);
create index retours_vente_etablissement_idx on public.retours_vente(etablissement_id, cree_le desc);

create table public.lignes_retour_vente (
  id uuid primary key default gen_random_uuid(),
  retour_id uuid not null references public.retours_vente(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  ligne_vente_id uuid not null references public.lignes_vente(id) on delete restrict,
  -- Vide pour une ligne libre (facture sans article) : rien à remettre en stock.
  article_id uuid references public.articles(id) on delete restrict,
  quantite numeric(14, 3) not null check (quantite > 0),
  montant numeric(14, 2) not null check (montant >= 0),
  unique (retour_id, ligne_vente_id)
);
create index lignes_retour_vente_ligne_idx on public.lignes_retour_vente(ligne_vente_id);
create index lignes_retour_vente_etablissement_idx on public.lignes_retour_vente(etablissement_id);

create table public.remboursements_vente (
  id uuid primary key default gen_random_uuid(),
  retour_id uuid not null unique references public.retours_vente(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  session_caisse_id uuid references public.sessions_caisse(id) on delete restrict,
  mode text not null check (mode in ('especes', 'mobile_money', 'carte', 'virement', 'cheque', 'avoir')),
  montant numeric(14, 2) not null check (montant > 0),
  reference text check (reference is null or length(reference) <= 120),
  rembourse_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create index remboursements_vente_etablissement_idx on public.remboursements_vente(etablissement_id, cree_le desc);
create index remboursements_vente_session_idx on public.remboursements_vente(session_caisse_id);

do $$
declare nom_table text;
begin
  foreach nom_table in array array['retours_vente', 'lignes_retour_vente', 'remboursements_vente'] loop
    execute format('alter table public.%I enable row level security', nom_table);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, ''ventes.lire'') and public.lecture_hub(etablissement_id, hub_id))', nom_table);
    execute format('create trigger %I_sans_modification before update on public.%I for each row execute function public.refuser_modification()', nom_table, nom_table);
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
  end loop;
end
$$;

-- p_lignes : [{ ligne_id, quantite }]. Le montant est calculé depuis le ticket,
-- remise de ligne et remise globale comprises. Le remboursement ne peut jamais
-- dépasser ce qui a réellement été encaissé, net des remboursements antérieurs.
create function public.enregistrer_retour_vente(
  p_vente_id uuid,
  p_lignes jsonb,
  p_motif text,
  p_mode text default 'especes',
  p_session_id uuid default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  vente public.ventes%rowtype;
  session public.sessions_caisse%rowtype;
  element jsonb;
  ligne public.lignes_vente%rowtype;
  qte numeric;
  disponible numeric;
  montant_ligne numeric;
  montant_retour numeric := 0;
  deja_rembourse numeric;
  montant_rembourse numeric;
  retour_id uuid;
  numero text;
begin
  select * into vente from public.ventes where id = p_vente_id for update;
  if vente.id is null then raise exception 'Vente introuvable'; end if;
  perform public.exiger_permission(vente.etablissement_id, 'ventes.retourner');
  perform public.exiger_acces_hub(vente.hub_id);
  if vente.statut <> 'validee' then raise exception 'Une vente annulée ne peut pas faire l''objet d''un retour'; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Le motif du retour est obligatoire'; end if;
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then raise exception 'Choisissez au moins un article à retourner'; end if;
  if p_mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque', 'avoir') then raise exception 'Mode de remboursement inconnu'; end if;
  if exists (select 1 from jsonb_array_elements(p_lignes) x group by x ->> 'ligne_id' having count(*) > 1) then
    raise exception 'Une ligne ne peut apparaître qu''une fois dans un retour';
  end if;
  if p_mode = 'especes' then
    select * into session from public.sessions_caisse where id = p_session_id and etablissement_id = vente.etablissement_id and hub_id = vente.hub_id and statut = 'ouverte' for update;
    if session.id is null then raise exception 'Le remboursement en espèces exige la caisse ouverte du Hub de la vente'; end if;
  elsif p_session_id is not null then
    raise exception 'La caisse est réservée aux remboursements en espèces';
  end if;

  numero := public.prochain_numero(vente.etablissement_id, 'retour_vente', 'RET-');
  -- Premier passage : tout valider et calculer avant la moindre écriture.
  for element in select * from jsonb_array_elements(p_lignes) loop
    begin qte := (element ->> 'quantite')::numeric; exception when others then raise exception 'Quantité de retour invalide'; end;
    if qte is null or qte <= 0 then raise exception 'Quantité de retour invalide'; end if;
    select * into ligne from public.lignes_vente where id = nullif(element ->> 'ligne_id', '')::uuid and vente_id = vente.id for update;
    if ligne.id is null then raise exception 'Ligne de vente introuvable'; end if;
    select ligne.quantite - coalesce(sum(lr.quantite), 0) into disponible
    from public.lignes_retour_vente lr where lr.ligne_vente_id = ligne.id;
    if qte > disponible then raise exception 'Retour impossible pour « % » : % au plus', ligne.libelle, disponible; end if;
    montant_ligne := round((ligne.total * qte / ligne.quantite) * case when vente.sous_total > 0 then vente.total / vente.sous_total else 1 end, 2);
    montant_retour := montant_retour + montant_ligne;
  end loop;
  if montant_retour <= 0 then raise exception 'Le montant du retour doit être positif'; end if;
  insert into public.retours_vente(etablissement_id, hub_id, vente_id, numero, motif, montant, cree_par)
  values (vente.etablissement_id, vente.hub_id, vente.id, numero, btrim(p_motif), montant_retour, auth.uid()) returning id into retour_id;

  -- Deuxième passage : inscrire le document et remettre les seules quantités retournées en stock.
  for element in select * from jsonb_array_elements(p_lignes) loop
    qte := (element ->> 'quantite')::numeric;
    select * into ligne from public.lignes_vente where id = (element ->> 'ligne_id')::uuid and vente_id = vente.id;
    montant_ligne := round((ligne.total * qte / ligne.quantite) * case when vente.sous_total > 0 then vente.total / vente.sous_total else 1 end, 2);
    insert into public.lignes_retour_vente(retour_id, etablissement_id, hub_id, ligne_vente_id, article_id, quantite, montant)
    values (retour_id, vente.etablissement_id, vente.hub_id, ligne.id, ligne.article_id, qte, montant_ligne);
    if exists (select 1 from public.articles where id = ligne.article_id and suivi_stock) then
      insert into public.mouvements_stock(etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
      values (vente.etablissement_id, vente.hub_id, ligne.article_id, 'retour_partiel', qte, ligne.cout_unitaire, 'Retour ' || numero || ' · ' || btrim(p_motif), vente.id, auth.uid());
    end if;
  end loop;

  select coalesce(sum(r.montant), 0) into deja_rembourse
  from public.remboursements_vente r join public.retours_vente rv on rv.id = r.retour_id
  where rv.vente_id = vente.id;
  montant_rembourse := least(montant_retour, greatest(vente.montant_paye - deja_rembourse, 0));
  if montant_rembourse > 0 then
    insert into public.remboursements_vente(retour_id, etablissement_id, hub_id, session_caisse_id, mode, montant, reference, rembourse_par)
    values (retour_id, vente.etablissement_id, vente.hub_id, session.id, p_mode, montant_rembourse, nullif(btrim(p_reference), ''), auth.uid());
  end if;
  return jsonb_build_object('retour_id', retour_id, 'numero', numero, 'montant_retourne', montant_retour,
    'montant_rembourse', montant_rembourse, 'avoir', montant_retour - montant_rembourse);
end
$$;

create function public.historique_retours_vente(p_vente_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare vente public.ventes%rowtype;
begin
  select * into vente from public.ventes where id = p_vente_id;
  if vente.id is null or not public.lecture_autorisee(vente.etablissement_id, 'ventes.lire') or not public.lecture_hub(vente.etablissement_id, vente.hub_id) then
    raise exception 'Vente introuvable';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', r.id, 'numero', r.numero, 'motif', r.motif, 'montant', r.montant, 'cree_le', r.cree_le,
    'remboursement', (select to_jsonb(rb) - 'etablissement_id' - 'hub_id' from public.remboursements_vente rb where rb.retour_id = r.id),
    'lignes', (select jsonb_agg(jsonb_build_object('ligne_id', lr.ligne_vente_id, 'article_id', lr.article_id, 'quantite', lr.quantite, 'montant', lr.montant) order by lv.libelle)
      from public.lignes_retour_vente lr join public.lignes_vente lv on lv.id = lr.ligne_vente_id where lr.retour_id = r.id)
  ) order by r.cree_le) from public.retours_vente r where r.vente_id = vente.id), '[]'::jsonb);
end
$$;

revoke execute on function public.enregistrer_retour_vente(uuid, jsonb, text, text, uuid, text) from public, anon;
grant execute on function public.enregistrer_retour_vente(uuid, jsonb, text, text, uuid, text) to authenticated;
revoke execute on function public.historique_retours_vente(uuid) from public, anon;
grant execute on function public.historique_retours_vente(uuid) to authenticated;

-- Les remboursements en espèces font partie du tiroir et du ticket Z.
alter table public.clotures add column if not exists nombre_retours integer not null default 0;
alter table public.clotures add column if not exists total_retours numeric(14, 2) not null default 0;
alter table public.clotures add column if not exists remboursements jsonb not null default '{}'::jsonb;

create or replace function public.apercu_cloture(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  encaissements jsonb;
  remboursements jsonb;
  especes numeric;
  especes_remboursees numeric;
  depenses_especes numeric;
begin
  select * into session from public.sessions_caisse where id = p_session_id;
  if session.id is null or not (public.lecture_autorisee(session.etablissement_id, 'cloture.lire') or public.a_permission(session.etablissement_id, 'caisse.utiliser'))
     or not public.lecture_hub(session.etablissement_id, session.hub_id) then raise exception 'Session de caisse introuvable'; end if;
  select coalesce(jsonb_object_agg(mode, total), '{}'::jsonb) into encaissements from (
    select p.mode, sum(p.montant) total from public.paiements p where p.session_caisse_id = session.id and p.statut = 'valide' group by p.mode
  ) t;
  select coalesce(jsonb_object_agg(mode, total), '{}'::jsonb) into remboursements from (
    select r.mode, sum(r.montant) total from public.remboursements_vente r where r.session_caisse_id = session.id group by r.mode
  ) t;
  especes := coalesce((encaissements ->> 'especes')::numeric, 0);
  especes_remboursees := coalesce((remboursements ->> 'especes')::numeric, 0);
  select coalesce(sum(montant), 0) into depenses_especes from public.depenses where session_caisse_id = session.id and statut = 'valide' and mode = 'especes';
  return jsonb_build_object(
    'session_id', session.id, 'statut', session.statut,
    'point_de_vente', (select nom from public.points_de_vente where id = session.point_de_vente_id),
    'hub_id', session.hub_id, 'hub', (select nom from public.hubs where id = session.hub_id),
    'ouverte_le', session.ouverte_le, 'fond_initial', session.fond_initial,
    'nombre_ventes', (select count(*) from public.ventes where session_caisse_id = session.id and statut = 'validee'),
    'total_ventes', (select coalesce(sum(total), 0) from public.ventes where session_caisse_id = session.id and statut = 'validee'),
    'nombre_annulations', (select count(*) from public.ventes where session_caisse_id = session.id and statut = 'annulee'),
    'total_annulations', (select coalesce(sum(total), 0) from public.ventes where session_caisse_id = session.id and statut = 'annulee'),
    'nombre_retours', (select count(*) from public.remboursements_vente where session_caisse_id = session.id),
    'total_retours', (select coalesce(sum(montant), 0) from public.remboursements_vente where session_caisse_id = session.id),
    'total_remises', (select coalesce(sum(v.remise), 0) + coalesce((select sum(l.remise) from public.lignes_vente l join public.ventes w on w.id = l.vente_id where w.session_caisse_id = session.id and w.statut = 'validee'), 0) from public.ventes v where v.session_caisse_id = session.id and v.statut = 'validee'),
    'encaissements', encaissements, 'remboursements', remboursements,
    'depenses_especes', depenses_especes,
    'credit_accorde', (select coalesce(sum(total - montant_paye), 0) from public.ventes where session_caisse_id = session.id and statut = 'validee'),
    'especes_attendues', session.fond_initial + especes - especes_remboursees - depenses_especes,
    'articles_vendus', coalesce((select jsonb_agg(jsonb_build_object('libelle', libelle, 'quantite', quantite, 'total', total) order by total desc) from (
      select l.libelle, sum(l.quantite) quantite, sum(l.total) total from public.lignes_vente l join public.ventes v on v.id = l.vente_id
      where v.session_caisse_id = session.id and v.statut = 'validee' group by l.libelle
    ) a), '[]'::jsonb)
  );
end
$$;

create or replace function public.cloturer_caisse(p_session_id uuid, p_especes_comptees numeric, p_commentaire text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare session public.sessions_caisse%rowtype; apercu jsonb; numero text; resultat public.clotures%rowtype;
begin
  select * into session from public.sessions_caisse where id = p_session_id for update;
  if session.id is null then raise exception 'Session de caisse introuvable'; end if;
  perform public.exiger_permission(session.etablissement_id, 'cloture.cloturer');
  perform public.exiger_acces_hub(session.hub_id);
  if session.statut <> 'ouverte' then raise exception 'Cette caisse est déjà clôturée'; end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then raise exception 'Indiquez les espèces comptées dans le tiroir'; end if;
  apercu := public.apercu_cloture(p_session_id);
  numero := public.prochain_numero(session.etablissement_id, 'cloture', 'Z-');
  insert into public.clotures(etablissement_id, hub_id, numero, session_caisse_id, point_de_vente_id, ouverte_le, cloturee_par, fond_initial,
    nombre_ventes, total_ventes, nombre_annulations, total_annulations, nombre_retours, total_retours, total_remises, encaissements, remboursements,
    depenses_especes, credit_accorde, especes_attendues, especes_comptees, ecart, articles_vendus, commentaire)
  values (session.etablissement_id, session.hub_id, numero, session.id, session.point_de_vente_id, session.ouverte_le, auth.uid(), session.fond_initial,
    (apercu->>'nombre_ventes')::int, (apercu->>'total_ventes')::numeric, (apercu->>'nombre_annulations')::int, (apercu->>'total_annulations')::numeric,
    (apercu->>'nombre_retours')::int, (apercu->>'total_retours')::numeric, (apercu->>'total_remises')::numeric, apercu->'encaissements', apercu->'remboursements',
    (apercu->>'depenses_especes')::numeric, (apercu->>'credit_accorde')::numeric, (apercu->>'especes_attendues')::numeric, p_especes_comptees,
    p_especes_comptees-(apercu->>'especes_attendues')::numeric, apercu->'articles_vendus', nullif(btrim(p_commentaire), '')) returning * into resultat;
  update public.sessions_caisse set statut='cloturee', cloturee_le=now() where id=session.id;
  return to_jsonb(resultat) || jsonb_build_object('point_de_vente', apercu->>'point_de_vente', 'hub', apercu->>'hub');
end
$$;
