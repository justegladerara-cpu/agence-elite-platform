do $$
declare t text;
begin
  foreach t in array array['hse_parametres','hse_journal','hse_incidents','hse_actions','hse_permis',
                           'hse_inspections','hse_formations','hse_personnel','hse_epi','hse_documents'] loop
    execute format('create policy hse_lire on public.%I for select to authenticated using (public.hse_est_membre())', t);
    execute format('create policy hse_ecrire on public.%I for all to authenticated using (public.hse_peut_ecrire()) with check (public.hse_peut_ecrire())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
create policy hse_membres_lire on public.hse_membres for select to authenticated using (public.hse_est_membre());
grant select on public.hse_membres to authenticated;
insert into public.hse_parametres(cle, valeur) values
  ('site', '{"nom":"Site de Kundji (MKB II)","client":"Trident OGX","entreprise":"RARA Mercia","heures_par_jour":12,"dernier_arret":"2024-02-28","dernier_incident":"2024-12-28","objectif_trir":0.5}'),
  ('objectifs', '{"inspections":20,"causeries":20,"jsa":20,"formations":2,"reunions_generales":1,"exercices":1}')
on conflict (cle) do nothing;
