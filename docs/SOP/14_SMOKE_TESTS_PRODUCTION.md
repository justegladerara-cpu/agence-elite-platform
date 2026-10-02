# SOP 14 · Vérifier la production après un déploiement

1. Actions → **Pilote en production** → champ `site` = adresse du site. Le pilote crée des comptes fictifs,
   déroule tout le parcours (ventes, paiements, stock, clôture), vérifie isolation et refus, puis neutralise
   les comptes et archive le client « Pilote fictif ».
2. Actions → **Démo et comptes** : remet la démo à jour et vérifie la connexion par identifiant.
3. À la main (2 minutes) :
   - connexion super admin → tableau Agence Elite s'affiche, sans erreur ;
   - connexion `Userdemo` → écran « Créer votre nouveau mot de passe » ;
   - connexion responsable démo → tableau de bord, sélecteur de Hub, stock, transferts.
4. Rien de rouge ? La mise en production est terminée.
