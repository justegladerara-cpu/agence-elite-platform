-- STP2i : repartir de zéro (décision de Juste, 24/10/2026, canal #83).
-- Efface le seul compte STP2i restant, superadmin@stp2i.app, et sa ligne de journal.
-- Juste recrée ensuite son administrateur depuis l'écran « Premier démarrage » du site STP2i.
-- Garde les 8 camions et les réglages. Ne touche à rien d'autre.
do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = 'superadmin@stp2i.app';
  if v_id is null then
    raise notice 'STP2i : superadmin n''existe plus, rien à effacer.';
    return;
  end if;
  delete from public.stp2i_journal where par = v_id;
  delete from auth.users where id = v_id; -- stp2i_profils suit en cascade
end $$;
