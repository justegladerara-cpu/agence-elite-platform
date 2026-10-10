-- Ventes saisies après coup (2026-10-10, plainte des clients : impossible d'enregistrer plusieurs ventes d'un jour passé
-- puis de fermer la caisse de ce jour). Réservé au droit « caisse.rattraper » (gérant, responsable).
-- Une saisie = un jour passé (31 jours au plus), une caisse, plusieurs ventes : la plateforme ouvre une caisse datée de ce
-- jour, enregistre chaque vente avec les mêmes contrôles qu'en caisse (prix, stock, paiements, crédit), puis la ferme
-- avec un ticket Z daté de ce jour. Ventes, paiements et mouvements de stock portent la date et l'heure indiquées ; chaque
-- vente et le ticket Z portent la mention « Saisie après coup » avec le motif. Le journal d'audit garde la vraie date de
-- saisie et la personne. Aucune donnée existante n'est modifiée.

-- ---------------------------------------------------------------------------
-- 1. Droit
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('caisse.rattraper', 'caisse', 'Saisir après coup les ventes d''un jour passé et fermer la caisse de ce jour')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'caisse.rattraper' from unnest(array['gerant', 'responsable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Date de saisie : celle du jour rattrapé pendant la saisie après coup, sinon maintenant
-- ---------------------------------------------------------------------------
-- La date n'est fixée que par saisir_ventes_passees, dans sa transaction (réglage local) ; l'interface ne peut pas la
-- fixer (aucun accès SQL direct).
create function public.instant_saisie()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('app.date_rattrapage', true), '')::timestamptz, now())
$$;
alter table public.ventes alter column cree_le set default public.instant_saisie();
alter table public.paiements alter column cree_le set default public.instant_saisie();
alter table public.mouvements_stock alter column cree_le set default public.instant_saisie();

-- Caisse de rattrapage : ouverte et fermée dans la même transaction, elle ne bloque pas la caisse du jour.
alter table public.sessions_caisse add column rattrapage boolean not null default false;
drop index public.sessions_caisse_une_ouverte;
create unique index sessions_caisse_une_ouverte on public.sessions_caisse(point_de_vente_id) where statut = 'ouverte' and not rattrapage;

-- La caisse de rattrapage est par nature « d'un jour passé » : le contrôle de fin de journée ne s'applique qu'aux autres.
create or replace function public.refuser_caisse_echue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  fin timestamptz;
begin
  if new.session_caisse_id is null then
    return new;
  end if;
  select * into session from public.sessions_caisse where id = new.session_caisse_id;
  if session.statut = 'ouverte' and not session.rattrapage then
    fin := public.fin_journee_caisse(session.etablissement_id, now());
    if fin is not null and session.ouverte_le < fin then
      raise exception 'Journée de caisse terminée (fermeture automatique) : ouvrez la caisse du jour pour continuer';
    end if;
  end if;
  return new;
end
$$;

-- La fermeture automatique ne touche jamais une caisse de rattrapage.
create or replace function public.fermer_caisses_echues(p_etablissement_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  fin timestamptz;
  apercu jsonb;
  numero text;
  nombre integer := 0;
begin
  for session in
    select s.* from public.sessions_caisse s
    where s.statut = 'ouverte' and not s.rattrapage and (p_etablissement_id is null or s.etablissement_id = p_etablissement_id)
    order by s.ouverte_le
    for update skip locked
  loop
    fin := public.fin_journee_caisse(session.etablissement_id, now());
    continue when fin is null or session.ouverte_le >= fin;
    apercu := public.donnees_cloture(session.id);
    numero := public.prochain_numero(session.etablissement_id, 'cloture', 'Z-');
    insert into public.clotures(etablissement_id, hub_id, numero, session_caisse_id, point_de_vente_id, ouverte_le, cloturee_le, cloturee_par,
      fond_initial, nombre_ventes, total_ventes, nombre_annulations, total_annulations, nombre_retours, total_retours, total_remises,
      encaissements, remboursements, depenses_especes, credit_accorde, especes_attendues, especes_comptees, ecart, articles_vendus,
      commentaire, automatique)
    values (session.etablissement_id, session.hub_id, numero, session.id, session.point_de_vente_id, session.ouverte_le, fin, null,
      session.fond_initial, (apercu->>'nombre_ventes')::int, (apercu->>'total_ventes')::numeric, (apercu->>'nombre_annulations')::int,
      (apercu->>'total_annulations')::numeric, (apercu->>'nombre_retours')::int, (apercu->>'total_retours')::numeric,
      (apercu->>'total_remises')::numeric, apercu->'encaissements', apercu->'remboursements', (apercu->>'depenses_especes')::numeric,
      (apercu->>'credit_accorde')::numeric, (apercu->>'especes_attendues')::numeric, null, null, apercu->'articles_vendus',
      'Fermée automatiquement : espèces à compter', true);
    update public.sessions_caisse set statut = 'cloturee', cloturee_le = fin where id = session.id;
    nombre := nombre + 1;
  end loop;
  return nombre;
end
$$;
revoke execute on function public.fermer_caisses_echues(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Saisie après coup
-- ---------------------------------------------------------------------------
-- p_ventes : [{ heure: 'HH:MM' (facultatif, 12:00 par défaut), lignes: [{article_id, quantite, remise?}],
--               paiements: [{mode, montant, reference?}], contact_id?, remise? }]
-- p_especes_comptees : espèces du tiroir de ce jour si on les connaît ; sinon le ticket Z porte « espèces à compter ».
create function public.saisir_ventes_passees(
  p_etablissement_id uuid, p_point_de_vente_id uuid, p_jour date, p_ventes jsonb,
  p_motif text, p_especes_comptees numeric default null, p_fond_initial numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pdv public.points_de_vente%rowtype;
  fuseau text;
  aujourdhui date;
  motif text := nullif(btrim(coalesce(p_motif, '')), '');
  session_id uuid;
  v jsonb;
  numero integer := 0;
  heure text;
  instant timestamptz;
  resultat jsonb;
  numeros jsonb := '[]'::jsonb;
  total numeric := 0;
  apercu jsonb;
  z public.clotures%rowtype;
  fin_jour timestamptz;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.rattraper');
  perform public.exiger_permission(p_etablissement_id, 'caisse.utiliser');
  select * into pdv from public.points_de_vente where id = p_point_de_vente_id and etablissement_id = p_etablissement_id;
  if pdv.id is null or not pdv.actif then
    raise exception 'Point de vente introuvable ou inactif';
  end if;
  perform public.exiger_acces_hub(pdv.hub_id);
  if motif is null then
    raise exception 'Indiquez pourquoi ces ventes sont saisies après coup';
  end if;
  if length(motif) > 200 then
    raise exception 'Motif trop long (200 caractères au plus)';
  end if;
  select e.fuseau into fuseau from public.etablissements e where e.id = p_etablissement_id;
  fuseau := coalesce(fuseau, 'UTC');
  aujourdhui := public.date_locale(p_etablissement_id);
  if p_jour is null or p_jour >= aujourdhui then
    raise exception 'Choisissez un jour passé : les ventes du jour se font en caisse';
  end if;
  if p_jour < aujourdhui - 31 then
    raise exception 'Pas plus de 31 jours en arrière';
  end if;
  if p_ventes is null or jsonb_typeof(p_ventes) is distinct from 'array' or jsonb_array_length(p_ventes) = 0 then
    raise exception 'Ajoutez au moins une vente';
  end if;
  if jsonb_array_length(p_ventes) > 500 then
    raise exception 'Pas plus de 500 ventes à la fois';
  end if;
  if p_especes_comptees is not null and p_especes_comptees < 0 then
    raise exception 'Espèces comptées invalides';
  end if;
  if coalesce(p_fond_initial, 0) < 0 then
    raise exception 'Le fond de caisse ne peut pas être négatif';
  end if;

  insert into public.sessions_caisse (etablissement_id, point_de_vente_id, hub_id, fond_initial, ouverte_par, ouverte_le, rattrapage)
  values (p_etablissement_id, pdv.id, pdv.hub_id, coalesce(p_fond_initial, 0), auth.uid(), p_jour::timestamp at time zone fuseau, true)
  returning id into session_id;

  for v in select value from jsonb_array_elements(p_ventes) loop
    numero := numero + 1;
    begin
      if jsonb_typeof(v) <> 'object' then
        raise exception 'vente invalide';
      end if;
      heure := coalesce(nullif(btrim(v ->> 'heure'), ''), '12:00');
      if heure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'heure invalide (HH:MM)';
      end if;
      instant := (p_jour + heure::time) at time zone fuseau;
      perform set_config('app.date_rattrapage', instant::text, true);
      resultat := public.enregistrer_vente(p_etablissement_id, session_id, v -> 'lignes', coalesce(v -> 'paiements', '[]'::jsonb),
        nullif(v ->> 'contact_id', '')::uuid, coalesce(nullif(v ->> 'remise', '')::numeric, 0),
        'Saisie après coup : ' || motif);
      numeros := numeros || to_jsonb(resultat ->> 'numero');
      total := total + (resultat ->> 'total')::numeric;
    exception when others then
      raise exception 'Vente % : %', numero, sqlerrm;
    end;
  end loop;

  -- Ticket Z du jour rattrapé.
  fin_jour := ((p_jour + 1)::timestamp at time zone fuseau) - interval '1 second';
  perform set_config('app.date_rattrapage', '', true);
  apercu := public.donnees_cloture(session_id);
  insert into public.clotures(etablissement_id, hub_id, numero, session_caisse_id, point_de_vente_id, ouverte_le, cloturee_le, cloturee_par,
    fond_initial, nombre_ventes, total_ventes, nombre_annulations, total_annulations, nombre_retours, total_retours, total_remises,
    encaissements, remboursements, depenses_especes, credit_accorde, especes_attendues, especes_comptees, ecart, articles_vendus,
    commentaire, automatique)
  values (p_etablissement_id, pdv.hub_id, public.prochain_numero(p_etablissement_id, 'cloture', 'Z-'), session_id, pdv.id,
    p_jour::timestamp at time zone fuseau, fin_jour, auth.uid(),
    coalesce(p_fond_initial, 0), (apercu->>'nombre_ventes')::int, (apercu->>'total_ventes')::numeric, (apercu->>'nombre_annulations')::int,
    (apercu->>'total_annulations')::numeric, (apercu->>'nombre_retours')::int, (apercu->>'total_retours')::numeric,
    (apercu->>'total_remises')::numeric, apercu->'encaissements', apercu->'remboursements', (apercu->>'depenses_especes')::numeric,
    (apercu->>'credit_accorde')::numeric, (apercu->>'especes_attendues')::numeric,
    round(p_especes_comptees, 2), round(p_especes_comptees, 2) - (apercu->>'especes_attendues')::numeric, apercu->'articles_vendus',
    format('Saisie après coup du %s : %s%s', to_char(p_jour, 'DD/MM/YYYY'), motif,
      case when p_especes_comptees is null then ' · espèces à compter' else '' end),
    p_especes_comptees is null)
  returning * into z;
  update public.sessions_caisse set statut = 'cloturee', cloturee_le = fin_jour where id = session_id;

  return jsonb_build_object('jour', p_jour, 'ventes', numero, 'numeros', numeros, 'total', total,
    'cloture', to_jsonb(z));
end
$$;
revoke execute on function public.saisir_ventes_passees(uuid, uuid, date, jsonb, text, numeric, numeric) from public, anon;
grant execute on function public.saisir_ventes_passees(uuid, uuid, date, jsonb, text, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
