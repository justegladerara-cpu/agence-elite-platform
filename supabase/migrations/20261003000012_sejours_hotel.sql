-- Gestion opérationnelle d'un séjour en cours : prolongation et changement de
-- chambre, sans réécrire l'historique de facturation ni créer de réservation.

create function public.prolonger_sejour_hotel(p_reservation_id uuid, p_nouveau_depart date)
returns void language plpgsql security definer set search_path='' as $$
declare r public.hotel_reservations%rowtype;
begin
  select * into r from public.hotel_reservations where id=p_reservation_id for update;
  if r.id is null then raise exception 'Séjour introuvable'; end if;
  perform public.exiger_permission(r.etablissement_id,'hotel_reservations.sejour');
  if r.statut<>'en_cours' then raise exception 'Seul un séjour en cours peut être prolongé'; end if;
  if p_nouveau_depart is null or p_nouveau_depart<=r.depart or p_nouveau_depart-r.arrivee>365 then raise exception 'La nouvelle date de départ doit prolonger le séjour, dans la limite de 365 nuits'; end if;
  perform public.verifier_disponibilite_hotel(r.etablissement_id,r.type_id,r.chambre_id,r.arrivee,p_nouveau_depart,r.id);
  update public.hotel_reservations set depart=p_nouveau_depart,note=concat_ws(E'\n',note,'Séjour prolongé jusqu’au '||to_char(p_nouveau_depart,'DD/MM/YYYY')) where id=r.id;
end $$;

create function public.changer_chambre_sejour_hotel(p_reservation_id uuid,p_chambre_id uuid,p_motif text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.hotel_reservations%rowtype; ancienne public.hotel_chambres%rowtype; nouvelle public.hotel_chambres%rowtype;
begin
  select * into r from public.hotel_reservations where id=p_reservation_id for update;
  if r.id is null then raise exception 'Séjour introuvable'; end if;
  perform public.exiger_permission(r.etablissement_id,'hotel_reservations.sejour');
  if r.statut<>'en_cours' then raise exception 'Seul un séjour en cours change de chambre'; end if;
  if coalesce(btrim(p_motif),'')='' then raise exception 'Le motif du changement est obligatoire'; end if;
  select * into ancienne from public.hotel_chambres where id=r.chambre_id for update;
  select * into nouvelle from public.hotel_chambres where id=p_chambre_id and etablissement_id=r.etablissement_id for update;
  if nouvelle.id is null or not nouvelle.actif or nouvelle.type_id<>r.type_id then raise exception 'Choisissez une chambre active du même type'; end if;
  if nouvelle.id=ancienne.id then raise exception 'Le client occupe déjà cette chambre'; end if;
  if nouvelle.menage<>'propre' then raise exception 'La nouvelle chambre doit être propre'; end if;
  perform public.verifier_disponibilite_hotel(r.etablissement_id,r.type_id,nouvelle.id,r.arrivee,r.depart,r.id);
  update public.hotel_reservations set chambre_id=nouvelle.id,note=concat_ws(E'\n',note,'Chambre '||ancienne.numero||' → '||nouvelle.numero||' : '||btrim(p_motif)) where id=r.id;
  update public.hotel_chambres set menage='sale',note='À nettoyer après changement vers la chambre '||nouvelle.numero where id=ancienne.id;
end $$;

revoke execute on function public.prolonger_sejour_hotel(uuid,date) from public,anon;
grant execute on function public.prolonger_sejour_hotel(uuid,date) to authenticated;
revoke execute on function public.changer_chambre_sejour_hotel(uuid,uuid,text) from public,anon;
grant execute on function public.changer_chambre_sejour_hotel(uuid,uuid,text) to authenticated;
