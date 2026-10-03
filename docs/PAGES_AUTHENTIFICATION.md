# Pages d'authentification administrables

Où : **Espace Agence Elite › Identité et apparence › Pages d'authentification** (`#/editeur/identite/auth`).
Migration : `20261003000009_pages_authentification.sql`. Écrans : `src/auth/EcransAuth.jsx`. Catalogue : `src/noyau/pagesAuth.js`.

## Ce qui se règle (sans code)
| Section | Réglages |
|---|---|
| Identité | nom affiché, monogramme (AE), sous-titre, logo, nom de l'éditeur à contacter, contact du support |
| Textes | titre et texte de chaque page, libellés des champs, messages (lien envoyé, compte créé, bloqué…), bas de page, mention de droits |
| Apparence | couleur principale (palette), disposition (centrée, partagée avec image, carte à gauche), fond (dégradé, couleur unie, image), image d'accompagnement, phrase d'accroche, alignement |
| Boutons et liens | onglets, boutons, liens « mot de passe oublié », « retour », « se déconnecter », « changer de compte », 3 liens de bas de page |

Mots remplacés automatiquement : `{nom}`, `{compte}`, `{editeur}`, `{logiciel}`, `{annee}`. Le texte est toujours affiché comme texte.

## Pages et états couverts
Connexion · Invitation (création du compte) · Première connexion (changement obligatoire) · Mot de passe temporaire expiré ·
Mot de passe oublié (nouveau) · Réinitialisation du mot de passe (nouveau) · Compte bloqué ou désactivé · Accès refusé ·
Invitation en attente · Session expirée (nouveau). **La double authentification n'existe pas** sur la plateforme : aucune page.

## Héritage
Valeurs du code ← **plateforme** ← **client** ← **établissement** (contenu publié). Un champ vide reprend la valeur du
niveau au-dessus. Nom, logo et couleur viennent de l'identité générale tant que les pages ne les remplacent pas.
Lien d'un client ou d'un établissement : `#/connexion/<adresse>` (adresse unique entre clients et établissements, mémorisée
par le navigateur pour les écrans suivants). Client ou établissement non actif : pages de la plateforme.

## Brouillon → aperçu → publication
- **Enregistrer le brouillon** : jamais visible sans connexion.
- **Aperçu** : vraies pages, données fictives, ordinateur / téléphone, brouillon / publié.
- **Publier** : visible immédiatement (aucun redéploiement).
- **Historique** (qui, quand, valeurs avant → après) ; **Remettre une version dans le brouillon** ; **Abandonner le brouillon** ;
  **Revenir aux valeurs par défaut** (brouillon vidé, à publier).

## Droits
Plateforme : Super Admin seulement (l'Admin voit en lecture seule). Client et établissement : Super Admin et Admin.
Aucun client ni gérant n'y a accès. Fonctions : `editeur_pages_auth`, `editeur_liste_pages_auth`,
`enregistrer_brouillon_pages_auth`, `publier_pages_auth`, `restaurer_pages_auth`, `reinitialiser_pages_auth`,
`enregistrer_adresse_connexion_etablissement`. Lecture publique : `pages_connexion(adresse)` (contenu **publié** seulement).

## Ce qui ne se règle jamais ici
Supabase Auth, droits et permissions, politique des mots de passe, changement obligatoire, RLS, redirections (l'adresse de retour
du lien « mot de passe oublié » est calculée par le code et vérifiée par Supabase). La base refuse toute clé hors catalogue
(`champs_pages_auth()`), tout `<` ou `>`, toute image autre que PNG/JPEG/GIF/WebP ou https, tout lien autre que https/mailto/tel,
toute couleur hors palette. Aucun CSS, HTML ni script.

## Hors éditeur
- Le texte des e-mails envoyés par Supabase (invitation, mot de passe oublié) se règle dans Supabase › Authentication › Email Templates.
- Pour que le lien « mot de passe oublié » revienne sur un nouveau domaine, ce domaine doit figurer dans Supabase › Authentication › URL Configuration.
