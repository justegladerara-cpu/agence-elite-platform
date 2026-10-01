insert into public.solutions(id,nom,statut) values ('commerce','Commerce','en_preparation'),('restaurant','Restaurant','future'),('hotel','Hôtel','future') on conflict do nothing;
insert into public.modules(id,nom,nature,statut) values ('etablissement','Établissement','socle','actif'),('membres','Membres','socle','actif'),('tableau_de_bord','Tableau de bord','socle','actif') on conflict do nothing;
insert into public.module_dependances values ('membres','etablissement'),('tableau_de_bord','etablissement') on conflict do nothing;
insert into public.solution_modules(solution_id,module_id,par_defaut) select s.id,m.id,true from public.solutions s cross join public.modules m on conflict do nothing;
insert into public.roles(id,nom,ordre) values ('gerant','Gérant',1),('responsable','Responsable',2),('employe','Employé',3),('comptable','Comptable',4),('lecteur','Lecteur',5) on conflict do nothing;
insert into public.permissions(id,module_id) values ('etablissement.lire','etablissement'),('etablissement.modifier','etablissement'),('membres.lire','membres'),('membres.gerer','membres'),('tableau_de_bord.lire','tableau_de_bord') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id) values
 ('gerant','etablissement.lire'),('gerant','etablissement.modifier'),('gerant','membres.lire'),('gerant','membres.gerer'),('gerant','tableau_de_bord.lire'),
 ('responsable','etablissement.lire'),('responsable','membres.lire'),('responsable','tableau_de_bord.lire'),
 ('employe','etablissement.lire'),('comptable','etablissement.lire'),('comptable','tableau_de_bord.lire'),('lecteur','etablissement.lire'),('lecteur','tableau_de_bord.lire') on conflict do nothing;
