# Glossaire (vocabulaire obligatoire)

| Mot | Définition | Table |
|---|---|---|
| **Éditeur** | Agence Elite, qui administre la plateforme | `plateforme_admins` |
| **Client** | L'entreprise ou la personne cliente d'Agence Elite. Elle ne porte **aucune** donnée métier. | `clients` |
| **Établissement** | L'unité opérationnelle qui utilise le logiciel (un magasin, un restaurant…). Toutes les données métier lui appartiennent. | `etablissements` |
| **Solution** | Le produit métier utilisé par un établissement (Commerce, puis Restaurant et Hôtel). C'est une configuration : la liste des modules proposés. | `solutions` |
| **Module** | Une fonctionnalité écrite une seule fois et proposée par une ou plusieurs solutions | `modules` |
| **Module proposé** | Module disponible dans une solution | `solution_modules` |
| **Module accordé / activé** | Module réellement ouvert pour un établissement. Plus tard, l'accord pourra venir d'une licence. | `etablissement_modules` |
| **Permission** | Ce qu'un utilisateur a le droit de faire (`module.action`) | `permissions`, `role_permissions` |
| **Rôle** | Un ensemble de permissions par défaut (gérant, responsable, employé, comptable, lecteur) | `roles` |
| **Utilisateur** | Une personne avec un compte unique, membre d'un ou plusieurs établissements | `auth.users`, `profils` |
| **Dirigeant** | Un utilisateur qui voit tous les établissements d'un client, en lecture. Il peut aussi être membre d'un établissement avec un rôle opérationnel. | `client_membres` |
| **Contact** | Un acheteur ou un fournisseur **d'un établissement**. **Ce n'est jamais un « client ».** | `contacts` (Lot 2) |
| **Point de vente** | Une caisse ou un comptoir à l'intérieur d'un établissement | `points_de_vente` |
| **Licence / abonnement** | Le droit commercial d'utiliser une solution ou un module. Couche future, hors Lot 1. | (plus tard) |
