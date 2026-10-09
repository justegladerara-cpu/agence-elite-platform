# Guide de gestion locale

1. Lancer le site en demo et ouvrir /admin.
2. Utiliser le mot de passe local documenté dans README (modifiable via .env.local).
3. Consulter les demandes fictives avec référence, volume, agence et date affichée en heure de Paris.
4. Choisir une page, rédiger un titre et un texte, enregistrer la proposition éditoriale.
5. Consulter la page : le texte est visible comme proposition non validée. L’édition ne valide pas les données commerciales.
6. Se déconnecter ; la session est retirée côté serveur.

Ne pas saisir de données réelles. Aucun email, paiement ou suivi réel n’est produit. Les pièces jointes sont conservées en quarantaine et ne peuvent pas être téléchargées. Cette gestion ne remplace pas encore le back-office des expéditions, départs, propositions PDF, retraits et utilisateurs par rôle.

Le noyau opérationnel se teste à /demo avec les comptes fictifs du README. Après connexion administrateur et second facteur simulé : créer un dossier, réceptionner un colis, saisir les événements successifs, créer/affecter un départ, télécharger le manifeste et enregistrer la remise après contrôle du droit de retrait. Le compte client-a voit seulement ses dossiers, documents, propositions et assistance ; client-b et un agent de Brazzaville ne peuvent pas consulter un dossier de Paris appartenant au premier client. Les dates de départ saisies dans cette première interface sont en UTC. Le jeu db:seed:demo fournit trois cartons fictifs dans un dossier prédéfini.
