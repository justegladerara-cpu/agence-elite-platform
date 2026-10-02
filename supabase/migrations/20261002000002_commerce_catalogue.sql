-- Lot 2 : modules de la Solution Commerce (catalogue, dépendances, permissions, rôles).

update public.solutions set statut = 'active' where id = 'commerce';

insert into public.modules(id, nom, nature, statut) values
  ('articles', 'Articles', 'metier', 'actif'),
  ('stock', 'Stock', 'metier', 'actif'),
  ('caisse', 'Caisse', 'metier', 'actif'),
  ('ventes', 'Ventes', 'metier', 'actif'),
  ('paiements', 'Paiements', 'metier', 'actif'),
  ('recus', 'Reçus', 'metier', 'actif'),
  ('cloture', 'Clôture de caisse', 'metier', 'actif'),
  ('contacts', 'Contacts', 'metier', 'actif'),
  ('depenses', 'Dépenses', 'metier', 'actif')
on conflict do nothing;

insert into public.module_dependances(module_id, depend_de) values
  ('articles', 'etablissement'),
  ('stock', 'articles'),
  ('ventes', 'articles'),
  ('paiements', 'ventes'),
  ('recus', 'ventes'),
  ('caisse', 'ventes'),
  ('caisse', 'paiements'),
  ('caisse', 'stock'),
  ('cloture', 'caisse'),
  ('contacts', 'etablissement'),
  ('depenses', 'etablissement')
on conflict do nothing;

insert into public.solution_modules(solution_id, module_id, par_defaut)
select 'commerce', id, true
from public.modules
where id in ('articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture', 'contacts', 'depenses')
on conflict do nothing;

insert into public.permissions(id, module_id, description) values
  ('articles.lire', 'articles', 'Voir le catalogue'),
  ('articles.gerer', 'articles', 'Créer et modifier les articles et catégories'),
  ('stock.lire', 'stock', 'Voir les quantités et les mouvements'),
  ('stock.ajuster', 'stock', 'Enregistrer entrées, ajustements et inventaires'),
  ('caisse.utiliser', 'caisse', 'Ouvrir une caisse et vendre'),
  ('ventes.lire', 'ventes', 'Retrouver les ventes'),
  ('ventes.annuler', 'ventes', 'Annuler une vente (avec motif)'),
  ('paiements.lire', 'paiements', 'Voir les paiements'),
  ('paiements.encaisser', 'paiements', 'Encaisser ou annuler un paiement'),
  ('recus.lire', 'recus', 'Afficher et imprimer les reçus'),
  ('cloture.lire', 'cloture', 'Voir les tickets Z'),
  ('cloture.cloturer', 'cloture', 'Clôturer une caisse (ticket Z)'),
  ('contacts.lire', 'contacts', 'Voir les contacts'),
  ('contacts.gerer', 'contacts', 'Créer et modifier les contacts'),
  ('depenses.lire', 'depenses', 'Voir les dépenses'),
  ('depenses.gerer', 'depenses', 'Enregistrer ou annuler une dépense')
on conflict do nothing;

-- Gérant : tout. Responsable : tout le Commerce. Employé (caissier) : la vente au quotidien.
-- Comptable : lecture complète, dépenses. Lecteur : lecture.
insert into public.role_permissions(role_id, permission_id)
select 'gerant', id from public.permissions where module_id in
  ('articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture', 'contacts', 'depenses')
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select 'responsable', id from public.permissions where module_id in
  ('articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture', 'contacts', 'depenses')
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id) values
  ('employe', 'articles.lire'),
  ('employe', 'stock.lire'),
  ('employe', 'caisse.utiliser'),
  ('employe', 'ventes.lire'),
  ('employe', 'paiements.lire'),
  ('employe', 'paiements.encaisser'),
  ('employe', 'recus.lire'),
  ('employe', 'cloture.lire'),
  ('employe', 'contacts.lire'),
  ('employe', 'contacts.gerer'),
  ('comptable', 'articles.lire'),
  ('comptable', 'stock.lire'),
  ('comptable', 'ventes.lire'),
  ('comptable', 'paiements.lire'),
  ('comptable', 'recus.lire'),
  ('comptable', 'cloture.lire'),
  ('comptable', 'contacts.lire'),
  ('comptable', 'depenses.lire'),
  ('comptable', 'depenses.gerer'),
  ('lecteur', 'articles.lire'),
  ('lecteur', 'stock.lire'),
  ('lecteur', 'ventes.lire'),
  ('lecteur', 'paiements.lire'),
  ('lecteur', 'recus.lire'),
  ('lecteur', 'cloture.lire'),
  ('lecteur', 'contacts.lire'),
  ('lecteur', 'depenses.lire')
on conflict do nothing;

-- Le responsable lit aussi les membres et le tableau de bord (déjà accordés au Lot 1) ;
-- l'employé voit le tableau de bord de sa journée.
insert into public.role_permissions(role_id, permission_id) values
  ('employe', 'tableau_de_bord.lire')
on conflict do nothing;
