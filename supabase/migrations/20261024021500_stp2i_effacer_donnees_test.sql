-- STP2i : effacer les données du test du site du 23/10/2026 (décision de Juste, 24/10/2026, canal #83).
-- N'efface que les comptes e2e.*@stp2i.app et ce qu'ils ont créé.
-- Garde le compte superadmin, les 8 camions et tout le reste. Ne touche qu'à des objets stp2i_*,
-- sauf la suppression des comptes de test dans auth.users (avec leurs lignes liées en cascade).
-- Un seul bloc : tout passe, ou rien ne change.
-- Les 5 fichiers de test du dossier stp2i-documents ne sont pas concernés : ils s'effacent par le stockage, pas en SQL.
do $$
declare
  v_test uuid[];
  v_demandes uuid[];
  v_commandes uuid[];
  v_receptions uuid[];
  v_stock uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_test
    from auth.users where email like 'e2e.%@stp2i.app';
  if cardinality(v_test) = 0 then
    raise notice 'STP2i : aucun compte de test, rien à effacer.';
    return;
  end if;

  select coalesce(array_agg(id), '{}') into v_demandes
    from public.stp2i_demandes where created_by = any(v_test);
  select coalesce(array_agg(id), '{}') into v_commandes
    from public.stp2i_commandes where created_by = any(v_test) or demande_id = any(v_demandes);
  select coalesce(array_agg(id), '{}') into v_receptions
    from public.stp2i_receptions where commande_id = any(v_commandes);
  select coalesce(array_agg(distinct stock_id), '{}') into v_stock
    from public.stp2i_mouvements where created_by = any(v_test);

  -- Sécurité : aucune donnée réelle ne doit dépendre de ces lignes.
  if exists (select 1 from public.stp2i_factures where commande_id = any(v_commandes) and not (created_by = any(v_test)))
     or exists (select 1 from public.stp2i_receptions where id = any(v_receptions) and not (created_by = any(v_test)))
     or exists (select 1 from public.stp2i_mouvements where stock_id = any(v_stock) and not (created_by = any(v_test))) then
    raise exception 'STP2i : des données réelles sont liées aux données de test, rien n''est effacé.';
  end if;

  delete from public.stp2i_mouvements where created_by = any(v_test);
  delete from public.stp2i_stock where id = any(v_stock);
  delete from public.stp2i_factures where commande_id = any(v_commandes) or created_by = any(v_test);
  delete from public.stp2i_reception_lignes where reception_id = any(v_receptions);
  delete from public.stp2i_receptions where id = any(v_receptions);
  update public.stp2i_demandes set commande_id = null where id = any(v_demandes);
  delete from public.stp2i_commande_lignes where commande_id = any(v_commandes);
  delete from public.stp2i_commandes where id = any(v_commandes);
  delete from public.stp2i_demandes where id = any(v_demandes);
  delete from public.stp2i_journal where par = any(v_test);

  -- Numéros : on repart de 001 seulement s'il ne reste aucun document de ce type.
  if not exists (select 1 from public.stp2i_demandes) then
    delete from public.stp2i_compteurs where prefixe = 'DP';
  end if;
  if not exists (select 1 from public.stp2i_commandes) then
    delete from public.stp2i_compteurs where prefixe = 'BC';
  end if;
  if not exists (select 1 from public.stp2i_receptions) then
    delete from public.stp2i_compteurs where prefixe = 'BR';
  end if;

  -- Les comptes de test (stp2i_profils suit en cascade).
  delete from auth.users where id = any(v_test);

  raise notice 'STP2i : % comptes de test effacés avec leurs données.', cardinality(v_test);
end $$;
