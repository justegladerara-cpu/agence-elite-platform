insert into storage.buckets (id, name, public, file_size_limit) values ('hse', 'hse', false, 20971520) on conflict (id) do nothing;
create policy hse_fichiers_lire on storage.objects for select to authenticated
  using (bucket_id = 'hse' and public.hse_est_membre());
create policy hse_fichiers_ajouter on storage.objects for insert to authenticated
  with check (bucket_id = 'hse' and public.hse_peut_ecrire());
create policy hse_fichiers_supprimer on storage.objects for delete to authenticated
  using (bucket_id = 'hse' and public.hse_peut_ecrire());
