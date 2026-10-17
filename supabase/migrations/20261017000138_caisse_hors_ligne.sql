-- Caisse sans internet (2026-10-13) : dans les bars et restaurants, la connexion coupe souvent. La caisse continue de
-- vendre : chaque vente reçoit sur l'appareil une clé unique (uuid) et part dès que la connexion revient.
-- La même clé envoyée deux fois (réponse perdue en route, deux onglets, nouvel essai) ne crée qu'UNE vente : la seconde
-- fois, la vente déjà enregistrée est renvoyée. enregistrer_vente n'est pas modifiée : cette fonction l'appelle, avec
-- les mêmes contrôles (droits, caisse à soi, prix actuels, stock, crédit, plafond de remise).
-- L'heure réelle de la vente est gardée (même mécanisme que la saisie après coup, migration 20261010000125), bornée à la
-- période de la caisse : jamais avant son ouverture, jamais dans le futur.
-- « Servi par », raison des offerts et pourboire partent dans le même appel : une vente renvoyée ne les double pas, et
-- leur échec ne remet pas la vente en cause (ils sont rendus dans « avertissements », comme avant en caisse).
-- Additive : une colonne, un index, deux fonctions. Aucune donnée existante n'est modifiée.

-- ---------------------------------------------------------------------------
-- 1. Clé de la vente faite sur l'appareil
-- ---------------------------------------------------------------------------
alter table public.ventes add column cle_hors_ligne uuid;
create unique index ventes_cle_hors_ligne on public.ventes(etablissement_id, cle_hors_ligne) where cle_hors_ligne is not null;

-- Une clé posée ne change plus (elle prouve que la vente a déjà été reçue).
create function public.proteger_cle_hors_ligne()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.cle_hors_ligne is not null and new.cle_hors_ligne is distinct from old.cle_hors_ligne then
    raise exception 'La clé d''une vente envoyée par la caisse ne peut pas être modifiée';
  end if;
  return new;
end
$$;
revoke execute on function public.proteger_cle_hors_ligne() from public, anon, authenticated;
create trigger ventes_cle_hors_ligne_fixe before update of cle_hors_ligne on public.ventes
for each row execute function public.proteger_cle_hors_ligne();

-- ---------------------------------------------------------------------------
-- 2. Enregistrer une vente avec sa clé (en ligne comme au retour de la connexion)
-- ---------------------------------------------------------------------------
-- p_cle : clé tirée sur l'appareil au moment de la vente. p_vendue_le : heure de la vente sur l'appareil.
-- p_serveur : « Servi par ». p_offerts : [{ article_id, quantite, raison, precision? }] (voir enregistrer_offerts_vente).
-- p_pourboire : { montant, mode } (voir enregistrer_pourboire).
-- Retour : celui d'enregistrer_vente + deja_recue (true si la clé avait déjà servi) + avertissements (textes).
create function public.enregistrer_vente_hors_ligne(
  p_cle uuid, p_etablissement_id uuid, p_session_id uuid, p_lignes jsonb, p_paiements jsonb default '[]'::jsonb,
  p_contact_id uuid default null, p_remise numeric default 0, p_note text default null, p_vendue_le timestamptz default null,
  p_serveur text default null, p_offerts jsonb default null, p_pourboire jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existante public.ventes%rowtype;
  session public.sessions_caisse%rowtype;
  instant timestamptz;
  resultat jsonb;
  vente_id uuid;
  verse numeric := 0;
  avertissements jsonb := '[]'::jsonb;
  serveur text := nullif(btrim(coalesce(p_serveur, '')), '');
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.utiliser');
  if p_cle is null then
    raise exception 'Clé de vente manquante';
  end if;
  -- Deux envois simultanés de la même clé : le second attend le premier, puis trouve la vente.
  perform pg_advisory_xact_lock(hashtextextended('vente_hors_ligne:' || p_etablissement_id::text || ':' || p_cle::text, 0));

  select * into existante from public.ventes where etablissement_id = p_etablissement_id and cle_hors_ligne = p_cle;
  if found then
    if existante.vendeur is distinct from auth.uid() and not public.a_permission(p_etablissement_id, 'cloture.cloturer') then
      raise exception 'Permission refusée';
    end if;
    if p_paiements is not null and jsonb_typeof(p_paiements) = 'array' then
      select coalesce(sum((x ->> 'montant')::numeric), 0) into verse
      from jsonb_array_elements(p_paiements) x
      where jsonb_typeof(x) = 'object' and (x ->> 'montant') ~ '^[0-9]+(\.[0-9]+)?$';
    end if;
    return jsonb_build_object(
      'vente_id', existante.id, 'numero', existante.numero, 'hub_id', existante.hub_id, 'total', existante.total,
      'paye', existante.montant_paye, 'reste', existante.total - existante.montant_paye,
      'monnaie', greatest(verse - existante.total, 0), 'deja_recue', true, 'avertissements', '[]'::jsonb
    );
  end if;

  -- Heure réelle de la vente, bornée à la période de la caisse ; une heure récente (moins d'une minute) = maintenant.
  if p_vendue_le is not null then
    select * into session from public.sessions_caisse where id = p_session_id and etablissement_id = p_etablissement_id;
    if session.id is not null then
      instant := least(greatest(p_vendue_le, session.ouverte_le), now());
      if instant < now() - interval '1 minute' then
        perform set_config('app.date_rattrapage', instant::text, true);
      end if;
    end if;
  end if;
  resultat := public.enregistrer_vente(p_etablissement_id, p_session_id, p_lignes, coalesce(p_paiements, '[]'::jsonb),
    p_contact_id, coalesce(p_remise, 0), p_note);
  perform set_config('app.date_rattrapage', '', true);
  vente_id := (resultat ->> 'vente_id')::uuid;
  update public.ventes set cle_hors_ligne = p_cle where id = vente_id;

  -- Compléments : leur échec n'annule pas la vente.
  if serveur is not null then
    begin
      perform public.indiquer_serveur_vente(vente_id, serveur);
    exception when others then
      avertissements := avertissements || to_jsonb('Serveur non enregistré : ' || sqlerrm);
    end;
  end if;
  if p_offerts is not null and jsonb_typeof(p_offerts) = 'array' and jsonb_array_length(p_offerts) > 0 then
    begin
      perform public.enregistrer_offerts_vente(vente_id, p_offerts);
    exception when others then
      avertissements := avertissements || to_jsonb('Raison de l''offert non enregistrée : ' || sqlerrm);
    end;
  end if;
  if p_pourboire is not null and jsonb_typeof(p_pourboire) = 'object' then
    begin
      perform public.enregistrer_pourboire(vente_id, nullif(p_pourboire ->> 'montant', '')::numeric, p_pourboire ->> 'mode', serveur);
    exception when others then
      avertissements := avertissements || to_jsonb('Pourboire non enregistré : ' || sqlerrm);
    end;
  end if;

  return resultat || jsonb_build_object('deja_recue', false, 'avertissements', avertissements);
end
$$;
revoke execute on function public.enregistrer_vente_hors_ligne(uuid, uuid, uuid, jsonb, jsonb, uuid, numeric, text, timestamptz, text, jsonb, jsonb) from public, anon;
grant execute on function public.enregistrer_vente_hors_ligne(uuid, uuid, uuid, jsonb, jsonb, uuid, numeric, text, timestamptz, text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
