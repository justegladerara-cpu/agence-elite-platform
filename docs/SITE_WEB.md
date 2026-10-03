# Module Site web — pages par blocs contrôlés

Statut : **actif** (migration `20261003000003_site_web.sql`, module `site_web`). Proposé par les solutions Commerce,
Restaurant, Hôtel, E-commerce et Services ; **accordé par Agence Elite comme module supplémentaire** (centre des modules
› accorder puis activer). Aucune offre n'a été modifiée : son prix est une décision commerciale d'Agence Elite.

## Principe
- **Site** (`sites`, un par établissement) : adresse publique `#/site/<adresse>` (unique), nom, description (moteurs de
  recherche), couleur choisie dans la palette, thème clair ou sombre, pied de page, en ligne ou non (exige un accueil publié).
- **Pages** (`site_pages`) : titre, adresse (`/services`…), description SEO, ordre et présence dans le menu (navigation
  automatique), une page d'accueil. Chaque page a un **brouillon** et une **version publiée** : on modifie, on regarde
  l'**aperçu**, puis on **publie**. Une page s'**archive** (jamais supprimée).
- **Blocs** : bandeau d'accueil (hero), texte, image, galerie, appel à l'action, services, produits de la boutique en
  ligne, témoignages, questions fréquentes, contact (coordonnées et formulaire). 30 blocs par page au plus.
- **Messages** (`site_messages`) : le formulaire de contact enregistre nom, téléphone ou e-mail, message ; l'équipe est
  notifiée et marque le message traité.

## Sécurité : aucun code fourni par le client
- La base (`blocs_site_valides`) ne garde que les **types et champs connus** ; tout le reste est retiré. Le texte est du
  texte brut, borné en longueur, et l'écran l'affiche toujours comme texte (jamais `innerHTML`).
- **Liens** : seulement `https://…`, `tel:…`, `mailto:…`, `/page` ou `/boutique` (refus de `javascript:`, `data:`, `http:`…).
- **Images** : PNG, JPEG, WebP, GIF importées (réduites dans le navigateur) ou adresse `https://` ; jamais SVG.
- **Couleurs** : palette fermée (`couleurs_marque`), pas de CSS libre. Page limitée à 3 Mo.
- Le visiteur n'appelle que `site_public` (pages publiées seulement) et `envoyer_message_site` (au plus 3 messages par
  contact et par jour, 30 par heure et par site). Site hors ligne, module ou licence inactifs : introuvable.

## Droits
`site_web.lire / modifier / publier`. Gérant, responsable : tout. Commercial : lire et modifier (prépare, ne publie pas).
Responsable Hub, employé, lecteur : lecture.

## Démo
Site `demo-site` de la « Boutique en ligne Démo » : accueil (bandeau, produits de `demo-boutique`, témoignages),
services, contact publiés, « À propos » en brouillon, deux messages.

## Hors périmètre
Nom de domaine propre (configuration Cloudflare et DNS par Agence Elite, au cas par cas), statistiques de visite,
référencement avancé (rendu côté serveur : les pages sont rendues dans le navigateur).
