# Cahier des charges — Nouveau site Express Congo

|                  |                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| **Client**       | Express Congo (fret France → République du Congo)                                                       |
| **Préparé par**  | Agence Élite                                                                                            |
| **Destinataire** | Codex (réalisation), puis Claude (reprise, vérification et poursuite)                                   |
| **Version**      | 2.0 — 8 octobre 2026                                                                                    |
| **Statut**       | Cahier des charges de réalisation. Ne vaut ni validation commerciale d'Express Congo ni avis juridique. |

---

## 0. À lire en premier

### 0.1 Ordre de priorité des règles

En cas de conflit entre deux consignes, applique cet ordre :

1. **Règles de vérité** (§2) : aucune donnée inventée.
2. **Sécurité et données personnelles** (§16).
3. **Règles de passation à Claude** (§19) : le projet doit être repris sans perte d'information.
4. **Critères de réception** (§18).
5. Toutes les autres sections.

### 0.2 Mode de travail

- Travaille en autonomie. Ne bloque jamais sur une question : prends un choix raisonnable, consigne-le dans `DECISIONS.md` et continue.
- Ce qui dépend d'une information client manquante est développé, mais **désactivé par un interrupteur** (§15.3) et inscrit dans `LAUNCH_REGISTER.md`.
- Réalise les lots dans l'ordre 1 → 2 → 3. Chaque lot doit être **fonctionnel et testé** avant de passer au suivant. Un lot 3 commencé ne justifie jamais un lot 1 inachevé.
- Si le temps ou le contexte manque, arrête-toi proprement : tests au vert ou échecs documentés, `HANDOFF.md` à jour, code poussé. Claude reprendra à partir de là.

### 0.3 Hors périmètre

- Aucun accès au domaine expresscongo.fr, à l'hébergement IONOS actuel, au WordPress existant, aux comptes de paiement ou à la production.
- Aucune mise en ligne publique, aucune migration DNS, aucun envoi réel d'emails, SMS ou WhatsApp vers des clients.
- Aucun service vers la République démocratique du Congo, aucun sens Congo → France, aucun autre pays, tant que ce n'est pas confirmé.

---

## 1. Mission

Conçois et développe un site Express Congo complet, professionnel, rapide et adapté au mobile, accompagné d'un espace client et d'un outil de gestion des expéditions. Le site doit expliquer les services, aider à préparer un envoi, recueillir des demandes exploitables et permettre un suivi fiable.

Le résultat comprend trois ensembles cohérents :

| Ensemble                   | Rôle                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| **Site public**            | Présenter les services, guider la préparation d'un envoi, recueillir les demandes de devis     |
| **Espace client sécurisé** | Devis, expéditions, documents, suivi et assistance                                             |
| **Back-office**            | Traitement des demandes, réception des colis, départs, suivi, tarifs, contenus et utilisateurs |

Utilise ce document comme cahier des charges, le dossier `assets/` comme référence visuelle et les sources du §22 comme base factuelle. Le dossier `assets/` contient le logo officiel, des visuels existants et la grille tarifaire consultée. Il ne contient pas le code du futur site.

Pour les connexions qui nécessitent des identifiants (email, SMS, WhatsApp, paiement), fournis l'interface, l'adaptateur, les variables d'environnement et une démonstration explicitement identifiée. **N'annonce jamais qu'une intégration fonctionne si elle n'est pas connectée et vérifiée.**

---

## 2. Règles de vérité et de publication

### 2.1 Trois statuts pour chaque information

Toute donnée affichée ou stockée porte l'un de ces statuts :

| Statut        | Signification                                        | Affichage en production                                    |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `OBSERVÉ`     | Relevé sur le site actuel le 8 octobre 2026          | Affiché seulement après confirmation par Express Congo     |
| `PROPOSÉ`     | Amélioration rédigée par Agence Élite                | Affiché après relecture et validation                      |
| `À_CONFIRMER` | Information absente, ambiguë ou contradictoire       | Masqué, ou remplacé par « Sur devis » / « Nous contacter » |
| `VALIDÉ`      | Confirmé par Express Congo, avec date et responsable | Affiché                                                    |

Les données publiques relevées le 8 octobre 2026 ne prouvent pas, à elles seules, que les coordonnées ou conditions commerciales sont encore applicables.

### 2.2 Interdictions

N'invente aucun délai, tarif, départ, avis client, volume d'activité, certification, partenariat, garantie, adresse, horaire, coordonnée GPS ou service assuré.

- Ne confonds pas République du Congo (XAF, indicatif +242) et République démocratique du Congo.
- Ne transforme pas une photo d'avion ou un logo visible sur un véhicule en preuve de partenariat.
- Ne présente ni suivi GPS, ni assurance automatique, ni douane toujours incluse, ni livraison à domicile systématique sans preuve.
- Ne reprends pas sans validation les superlatifs du site actuel (« meilleur prix », « meilleurs prix du marché », « garantir l'arrivée à bon port ») : ils ne sont pas vérifiables.
- Ne réutilise aucune information propre à Agence Élite dans les coordonnées d'Express Congo.

### 2.3 Environnements

| Environnement | Données                                         | Indexation                     | Marquage                            |
| ------------- | ----------------------------------------------- | ------------------------------ | ----------------------------------- |
| `development` | Fictives                                        | Non                            | —                                   |
| `demo`        | Fictives, jeu séparé                            | Non (`noindex` + `robots.txt`) | Bandeau permanent « Démonstration » |
| `staging`     | Réelles validées + `[À CONFIRMER : …]` visibles | Non                            | Bandeau « Préproduction »           |
| `production`  | Réelles validées uniquement                     | Oui (zones publiques)          | Aucun placeholder visible           |

En préproduction, affiche les données manquantes sous la forme `[À CONFIRMER : information]`. En production, un build doit **échouer** si un placeholder `[À CONFIRMER` subsiste dans une page publique (test automatisé, §18).

---

## 3. Informations de référence relevées sur le site actuel

> Toutes les données de cette section ont le statut `OBSERVÉ`. Elles doivent être confirmées avant publication.

### 3.1 Présentation

- Le site présente Express Congo comme une société de fret de marchandises vers la République du Congo, fondée par Annie Tsakala pour rapprocher les familles, et mentionne une équipe sans en préciser la taille. (S2)
- Services affichés : fret aérien, fret maritime en groupage, conteneurs complets. (S1, S3)
- Aérien : courriers « en normal ou en express », colis dédouanés, colis sous douane, départs programmés avec des « collaborateurs du transport aérien ». (S3)
- Maritime : plusieurs options de groupage, cartons ou palettes, colis dédouanés ou sous douane. (S3)
- Conteneurs complets : « différents types d'équipement », solutions sur mesure, sans précision. (S3)
- La page d'accueil affirme l'organisation de l'enlèvement en France et de la livraison au Congo via des transporteurs partenaires. **Non démontré : à confirmer avant toute reprise.** (S1)
- Slogan de pied de page : « Un service de fret sûr à destination du Congo ». (S1)

### 3.2 Coordonnées publiées (S4)

| Agence       | Adresse publiée                                                                | Téléphones publiés                    | Lien `tel:` à préparer                    |
| ------------ | ------------------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------- |
| Paris        | 67 boulevard de Belleville, 75011 Paris                                        | 01 48 05 22 20 / 24 ; 07 62 37 47 92  | `tel:+33148052220` ; `tel:+33762374792`   |
| Brazzaville  | 97 bis rue Djambala, Moungali (en venant par l'avenue Marien Ngouabi)          | +242 05 627 16 74 ; +242 06 581 44 81 | `tel:+242056271674` ; `tel:+242065814481` |
| Pointe-Noire | Route de la Base, arrêt Entrée KM4, deuxième parcelle à droite du bar Dynastie | +242 05 627 16 72 ; +242 06 581 44 80 | `tel:+242056271672` ; `tel:+242065814480` |

- Email public : `expresscongo@yahoo.fr`.
- WhatsApp publié pour Paris : 06 21 93 32 98 → lien à préparer `https://wa.me/33621933298`, à faire vérifier.
- La notation « / 24 » est ambiguë : ne génère pas automatiquement un second numéro complet.
- **Horaires publiés** : du lundi au vendredi de 9 h à 17 h et le samedi de 9 h à 17 h, sans interruption. Ils sont affichés une seule fois pour l'ensemble du réseau : confirmer s'ils s'appliquent aux trois agences et dans quel fuseau.
- **Réseau social publié** : une page Facebook, `https://www.facebook.com/ExpressCG/`. Aucun autre réseau n'apparaît.

### 3.3 Informations légales (S5, S6)

- Les mentions légales désignent comme propriétaire Madame Annie-Jésus Tsakala Massala, avec le numéro à 14 chiffres 52942792400012 (format SIRET) et l'adresse du 67 boulevard de Belleville.
- Le PDF tarifaire indique le SIREN 529427924 (cohérent avec les 9 premiers chiffres du numéro précédent) et le code APE 5229B.
- Hébergeur cité : 1&1 IONOS, Sarreguemines. Créateur du site actuel : Christ Loubota.
- Ces éléments sont des transcriptions, pas une vérification de registre. Faire confirmer le statut juridique, l'identité de l'éditeur et l'hébergeur du futur site.

---

## 4. Diagnostic du site actuel

> Analyse réalisée le 8 octobre 2026 sur les pages publiques, leur contenu HTML, le sitemap, les PDF et les mentions publiées. Ce n'est pas un audit de l'administration WordPress, des statistiques, des performances mesurées ou des procédures internes.

### 4.1 Constat technique

- Site WordPress (balise générateur 7.1.3), hébergé chez IONOS selon les mentions légales.
- Sitemap : six pages (accueil, à propos, services, contact, CGV, mentions légales) modifiées en août 2025, plus deux articles, dont l'article par défaut « Bonjour tout le monde » et un article « Comment prendre les mesures ».
- Le sitemap expose une page auteur : à exclure du futur site (réduction de l'énumération des comptes).
- Un favicon existe déjà (`cropped-logo-expresscongo-270x270.png`, octobre 2025).

### 4.2 Problèmes constatés et améliorations

| Élément constaté                                                                                                                                                                                                                      | Amélioration demandée                                                                            | Critère de réussite                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Navigation réduite à Accueil, à propos, Services, Contact                                                                                                                                                                             | Organiser l'information par besoin, ajouter des pages services détaillées                        | Devis, préparation et agence accessibles en deux actions maximum   |
| Tous les « En savoir plus » et flèches de services mènent à la même page `/services/`                                                                                                                                                 | Une page dédiée par service                                                                      | Aucun CTA principal ne mène à une page générique ou à une impasse  |
| **Lien cassé** : les boutons « Grille tarifaire » de `/services/` pointent vers `/2025/08/grille-tarifaire.pdf`, qui renvoie une erreur 404 ; l'accueil pointe vers la version `/2026/09/`                                            | Une seule source tarifaire, versionnée, servie depuis `/tarifs/`                                 | Aucun lien interne ou téléchargement en erreur (test automatisé)   |
| Tarifs uniquement en PDF                                                                                                                                                                                                              | Version HTML lisible + moteur de règles validées                                                 | PDF et page HTML affichent la même version et les mêmes conditions |
| Rubrique « Prendre les mesures » réduite à une image technique de palettes aériennes                                                                                                                                                  | Guide complet et calculateur (§9)                                                                | Un particulier mesure un carton sans connaissance logistique       |
| Numéro du header lié à `/contact` au lieu d'un appel                                                                                                                                                                                  | Liens `tel:` et WhatsApp directs                                                                 | Un appel se lance en un geste sur mobile                           |
| Aucun formulaire de contact ou de devis visible dans le contenu analysé, alors que les mentions légales évoquent un espace pour poser des questions                                                                                   | Formulaire de devis structuré et persisté (§11)                                                  | Chaque demande reçoit une référence serveur                        |
| Parcours en quatre étapes non relié à une action                                                                                                                                                                                      | Relier chaque étape à la demande de devis                                                        | L'étape 1 ouvre le formulaire                                      |
| Coordonnées des trois agences regroupées sur une page                                                                                                                                                                                 | Fiches agences autonomes (§6)                                                                    | Chaque agence a une page éditable                                  |
| Promesses non vérifiables (« meilleurs prix du marché », « garantir l'arrivée à bon port »)                                                                                                                                           | Remplacer par des preuves concrètes                                                              | Aucune promesse non validée en production                          |
| Fautes visibles (voir 4.3)                                                                                                                                                                                                            | Relecture complète                                                                               | Zéro faute relevée sur les pages livrées                           |
| Mentions légales datées : référence à un autre domaine (`expresscongo.com`), numéro CNIL laissé vide, textes de loi abrogés ou remplacés, instructions pour Internet Explorer, demande d'une copie d'identité pour exercer ses droits | Nouvelles mentions, politique de confidentialité et page cookies décrivant les traitements réels | Textes relus et validés avant publication                          |
| CGV : texte type TLF publié le 1er janvier 2017, orienté relations entre professionnels                                                                                                                                               | Faire vérifier l'adéquation aux offres et à une clientèle de particuliers                        | Version approuvée identifiée et archivée                           |
| Copyright 2025 figé                                                                                                                                                                                                                   | Année et contenus datés automatiquement                                                          | —                                                                  |

### 4.3 Fautes relevées à corriger

- À propos : « Dans le soucis de vous rapprocher des familles que Annie TSAKALA a fondé… »
- Accueil : « Un conseiller vous contact », « Dites nous le type marchandise que vous souhaitiez expédier », « pour une courrier », intitulés en minuscules (« le transport aérien au meilleur prix »), doubles espaces.
- Pied de page : « Designé & Développé ».
- PDF : « Fret sans doune », « mercie de bien vouloir », en-tête « Prix € / Kg » sur une ligne exprimée en m³.
- Mentions légales : « Tous les informations », « peuvent êtres recueillies ».

### 4.4 Points des CGV qui impactent le contenu du site (S7)

À faire valider juridiquement ; ce document ne donne pas d'avis juridique. En attendant, le site ne doit pas contredire les CGV publiées :

- Les prix ne comprennent pas les droits, taxes et redevances douanières (art. 2.2) → contradiction apparente avec les offres « avec douane » TTC du PDF.
- Aucune assurance n'est souscrite sans ordre écrit pour chaque expédition (art. 3) → ne jamais afficher « assuré » par défaut.
- Les dates de départ et d'arrivée sont indicatives (art. 4) → les afficher comme « prévisionnelles ».
- Responsabilité plafonnée (art. 6), déclaration de valeur possible avec supplément (art. 6.4), prescription d'un an (art. 9).

### 4.5 Ce qui n'a pas été démontré

Suivi en ligne, compte client, simulateur et outil de gestion sont des **propositions de refonte**. Leur absence dans les pages publiques ne prouve pas qu'Express Congo n'utilise aucun outil interne.

---

## 5. Identité visuelle et ressources

### 5.1 Logo

- Conserver le vrai logo `assets/logo-expresscongo.png` (horizontal, rouge et bleu, environ 511 × 80 px), récupéré sur le site officiel.
- Ne pas le redessiner, modifier son lettrage, y ajouter un slogan ou le déformer.
- Demander un original vectoriel pour les grands formats ; un PNG agrandi ne devient pas un logo vectoriel.
- Favicon : partir du favicon existant (§4.1) ou d'un détail identifiable du logo, tester à 16 et 32 px, sans inventer une nouvelle identité.

### 5.2 Direction visuelle

Sobre et professionnelle : fond blanc, bleu profond pour structurer, rouge pour les actions prioritaires, gris clair pour les surfaces secondaires.

| Rôle            | Couleur proposée |
| --------------- | ---------------- |
| Bleu principal  | `#143F86`        |
| Rouge action    | `#E21E26`        |
| Texte           | `#17233A`        |
| Fond secondaire | `#F4F7FB`        |
| Bordure         | `#DCE3EC`        |

Palette proposée, distincte d'une charte officielle. Le logo garde ses couleurs d'origine. Vérifier les contrastes réels (texte blanc sur rouge notamment) et ajuster les teintes si nécessaire, en consignant l'ajustement.

- Police sans sérif lisible, sous licence libre conservée dans le dépôt, auto-hébergée.
- Largeur de contenu d'environ 1 200 px, espacements réguliers, hiérarchie typographique nette.
- À éviter : carrousels automatiques, animations lourdes, badges décoratifs, photos génériques répétées. Respecter `prefers-reduced-motion`.

### 5.3 Header, footer et barre mobile

- **Header** : logo à gauche, navigation au centre, bouton « Demander un devis » à droite ; menu mobile simple.
- **Footer** : coordonnées validées, agences, services, aide, pages légales, réseaux confirmés uniquement (Facebook observé, à confirmer).
- **Barre mobile** : « Devis », « WhatsApp », « Appeler », discrète, qui ne masque ni le contenu, ni les erreurs de formulaire, ni le bandeau cookies. Le numéro s'adapte à l'agence choisie.

### 5.4 Inventaire des ressources

Logo ; bannières `ae_1_banniere.png`, `m_1_banniere.png`, `cc_1_banniere.png` ; icônes `red-plane.png`, `red-boat.png`, `red-container.png` ; `comment-mesurer.jpg` ; `grille-tarifaire-source.pdf`. Le fichier `assets/SOURCES.json` conserve URL et empreintes.

Ces fichiers proviennent du site actuel ; leur présence ne remplace pas la vérification des droits de réutilisation. Les bannières sont des références de marque, pas une mise en page imposée. Préférer des photos autorisées à l'agrandissement de compositions raster.

---

## 6. Arborescence du site public

| Route                                                                  | Contenu et rôle                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `/`                                                                    | Accueil orienté choix du service et demande de devis    |
| `/services/`                                                           | Comparatif des trois offres                             |
| `/services/fret-aerien/`                                               | Colis et courriers, fonctionnement, conditions, devis   |
| `/services/fret-maritime/`                                             | Groupage, cartons, palettes, calcul de volume           |
| `/services/conteneurs-complets/`                                       | Projet de conteneur et demande professionnelle          |
| `/tarifs/`                                                             | Tarifs validés, conditions, date de validité, PDF       |
| `/devis/`                                                              | Formulaire progressif avec récapitulatif                |
| `/suivi/`                                                              | Recherche sécurisée d'une expédition                    |
| `/preparer-mon-envoi/`                                                 | Guide général et checklist                              |
| `/prendre-les-mesures/`                                                | Dimensions, poids, volume, calculateur, schémas         |
| `/emballage-et-documents/`                                             | Conseils et documents requis, après validation métier   |
| `/marchandises-reglementees/`                                          | Orientation et demande de validation avant dépôt        |
| `/agences/`                                                            | Réseau des trois agences                                |
| `/agences/paris/` · `/agences/brazzaville/` · `/agences/pointe-noire/` | Coordonnées, horaires et modalités locales              |
| `/professionnels/`                                                     | Besoins récurrents, volumes, contact commercial         |
| `/a-propos/`                                                           | Histoire vérifiée, équipe réelle, méthode de travail    |
| `/faq/`                                                                | Questions fréquentes par sujet                          |
| `/contact/`                                                            | Contacts, choix d'agence, demande générale              |
| `/actualites/`                                                         | Articles utiles et annonces datées validées             |
| `/cgv/` · `/mentions-legales/`                                         | Documents applicables au nouveau site                   |
| `/confidentialite/` · `/cookies/`                                      | Traitements réellement mis en place                     |
| `/accessibilite/`                                                      | Informations et contact, sans déclaration non justifiée |

- Espace client : `/espace-client/` (connexion, profil, devis, expéditions, documents, assistance).
- Administration : `/admin/` avec accès par rôle.
- Ne pas indexer les zones privées, les résultats de suivi, la démonstration ni la préproduction.
- Pages 404 et erreur serveur utiles (liens vers devis, agences, contact).

### 6.1 Redirections depuis le site actuel

| Ancienne URL                                                                | Destination                                 |
| --------------------------------------------------------------------------- | ------------------------------------------- |
| `/`, `/a-propos/`, `/services/`, `/contact/`, `/cgv/`, `/mentions-legales/` | Conservées à l'identique                    |
| `/2025/07/30/comment-prendre-les-mesures/`                                  | 301 → `/prendre-les-mesures/`               |
| `/2025/08/02/bonjour-tout-le-monde/`                                        | 410 (contenu par défaut)                    |
| `/wp-content/uploads/2026/09/grille-tarifaire.pdf`                          | 301 → PDF versionné servi depuis `/tarifs/` |
| `/wp-content/uploads/2025/08/grille-tarifaire.pdf` (déjà en 404)            | 301 → `/tarifs/`                            |
| `/author/…`, pages de catégories et d'étiquettes                            | 410 ou 301 vers la page la plus proche      |

Inventorier les autres URL avant migration, éviter les redirections en chaîne et livrer la table dans `docs/REDIRECTS.md` et dans la configuration de l'hébergeur.

---

## 7. Page d'accueil

1. **Premier écran** : logo, visuel de transport, titre proposé « Vos envois de la France vers le Congo ». Sous-titre proposé : « Fret aérien, maritime et conteneurs complets. Décrivez votre envoi, notre équipe prépare votre expédition avec vous. » CTA principal « Demander un devis », secondaire « Trouver une agence ».
2. **Accès au suivi**, activé uniquement lorsque des expéditions réelles sont gérées (`FEATURE_TRACKING`). En démonstration, exemple clairement identifié ; jamais de faux suivi d'une référence réelle.
3. **Trois cartes services** : explication courte, types d'envoi, lien vers la page détaillée. Délais et prix seulement s'ils sont validés.
4. **Comparatif** aérien / maritime / conteneur selon le besoin, le format et le mode de tarification. « Selon devis » plutôt qu'un délai ou un prix inventé.
5. **Déroulement en quatre étapes** : décrire l'envoi, valider la proposition, remettre les marchandises, consulter les informations d'acheminement. Texte adapté à la procédure réellement retenue.
6. **Bloc « Préparez votre envoi »** : mesurer, emballer, documents, restrictions.
7. **Trois cartes agences**, une FAQ courte et un dernier CTA devis. Un bloc d'avis n'apparaît que si des témoignages vérifiables et autorisés sont fournis (`FEATURE_TESTIMONIALS`).

Les preuves de confiance sont des informations vérifiables : points de contact, déroulement explicite, documents et conditions accessibles. Pas de faux compteurs, pas de promesses comme « zéro risque ».

---

## 8. Pages services et guides

Chaque page service contient : bénéfice concret, marchandises et formats concernés, destinations confirmées, procédure, dépôt ou enlèvement, éléments qui déterminent le devis, documents nécessaires, restrictions, FAQ dédiée, puis un formulaire prérempli avec le service choisi.

- **Aérien** : distinguer courriers, colis et le traitement douanier. Le PDF précise que le fret « sans douane » de 20 kg et plus est à dédouaner à l'aéroport : expliquer simplement la différence, après validation.
- **Maritime** : expliquer le groupage et le volume, lien direct vers le calculateur.
- **Conteneurs complets** : recueillir les besoins sans publier d'équipements, charges maximales ou disponibilités non confirmés.

**Guide général** pour une première expédition : identifier son contenu, vérifier son admissibilité, choisir une solution, mesurer et peser, préparer les justificatifs, demander confirmation, puis déposer ou faire enlever si l'option existe. Les listes de documents et de produits réglementés sont validées par l'opérateur pour la route et le mode concernés. Pas de liste universelle présentée comme définitive.

**Page professionnels** : formulaire sur la fréquence d'envoi, les volumes estimés, les types de marchandises, les contraintes et l'interlocuteur. Aucune promesse de crédit, remise, contrat cadre, collecte gratuite ou gestion douanière particulière sans accord commercial.

---

## 9. Prendre les mesures et calculateur de volume

### 9.1 Contenu

L'image actuelle (`comment-mesurer.jpg`) illustre des chargements sur palettes aériennes : longueur de 317,5 cm, largeurs de 244 ou 223,5 cm, plages de hauteur variables. Ce sont des **exemples visuels**, pas des dimensions obligatoires ni des limites de service confirmées. La conserver comme référence spécialisée, avec une légende qui le précise.

Créer un guide principal simple :

- Schémas SVG accessibles (libellés textuels) : carton avec trois flèches L, l, H ; palette ; objet irrégulier ; plusieurs colis.
- Mesurer les dimensions extérieures de l'envoi emballé, palette comprise si elle fait partie de l'envoi.
- Objet irrégulier : relever les dimensions extérieures maximales.
- Expliquer la différence entre poids réel, volume et éventuel poids volumétrique.

### 9.2 Calculateur

- Saisie : dimensions en cm ou en m, poids réel en kg, quantité de colis identiques, ajout et suppression de lignes.
- Accepter la virgule décimale française ; refuser zéro, valeurs négatives et unités incohérentes.
- Erreur affichée sur le champ concerné, sans effacer la saisie.

**Formule exacte en cm** : volume unitaire (m³) = L × l × H / 1 000 000. Volume total = Σ (volume unitaire × quantité).

Exemple : 60 × 40 × 40 cm = 0,096 m³ ; trois cartons = 0,288 m³. Ces valeurs calculent un volume, pas un prix garanti.

- Poids volumétrique et poids taxable **paramétrables par offre**. Une formule du type L × l × H / diviseur ne s'active qu'avec un diviseur validé par Express Congo (`FEATURE_VOLUMETRIC_WEIGHT`). Ne choisis jamais 5 000 ou 6 000 par défaut. Sans règle approuvée, afficher le volume seul et transmettre les dimensions pour devis.
- Précision interne conservée ; arrondis commerciaux appliqués uniquement au stade défini par la règle tarifaire.
- Actions finales : « Ajouter ces colis à mon devis », « Imprimer le récapitulatif », « Demander conseil ».
- La logique de calcul vit dans un module métier pur, testé unitairement, indépendant de l'interface.

---

## 10. Tarifs et estimation

### 10.1 Grille actuelle (S6)

Le PDF consulté est rangé dans un dossier daté de septembre 2026 ; ce n'est pas une date de prise d'effet certifiée. Les valeurs ci-dessous sont transcrites pour préparer la migration et restent **inactives** dans le moteur de prix tant qu'elles ne sont pas approuvées (`FEATURE_PRICING_ENGINE`).

| Élément du PDF                                                                                         | Valeur lue                                       | Traitement demandé                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------- |
| Aérien avec douane, « messagerie et colis en express » : courrier, téléphone                           | 10 € par unité TTC chacun                        | Définir l'unité, l'admissibilité et les conditions                |
| Aérien avec douane : effets personnels, électronique et électroménager, marchandises, pièces détachées | 13 € par kg TTC                                  | Confirmer poids taxable, minimum et frais annexes                 |
| Aérien sans douane, dès 20 kg, à dédouaner à l'aéroport                                                | Tranches 20–99, 100–199, 200 et plus ; sur devis | Préciser les bornes pour les poids décimaux                       |
| Frais de dossier                                                                                       | 90 €                                             | Confirmer le service concerné et la fréquence                     |
| Maritime avec douane, carton ou palette, ligne « 1 m³ »                                                | 800, sous un en-tête « Prix € / Kg »             | Contradiction : ne pas interpréter automatiquement comme 800 €/m³ |
| Maritime au-delà de 1 m³, sans douane, conteneurs complets                                             | Sur devis                                        | Traitement manuel                                                 |

Ne pas utiliser le tarif de 6 500 FCFA/kg évoqué dans un contexte client antérieur comme tarif public. La grille du nouveau site provient d'une version validée par Express Congo.

### 10.2 Moteur de tarification

- Chaque règle porte : version, dates de validité, service, route, catégorie, unité, minimum, paliers, arrondi, frais, devise, traitement douanier, statut de validation.
- Chaque devis conserve un **instantané** de la règle appliquée. Une mise à jour ne modifie jamais rétroactivement un devis accepté.
- Résultat décomposé : transport, dossier, options, traitement fiscal ou douanier confirmé, éléments exclus, total estimatif.
- Si un élément essentiel manque : afficher « Devis nécessaire », jamais 0 €.
- Mention systématique : l'estimation ne vaut pas engagement de transport.

### 10.3 Devises

- EUR ou XAF est une option de présentation. Distinguer devise d'affichage, de facturation et de paiement.
- La parité officielle fixe entre l'euro et le franc CFA d'Afrique centrale est 1 EUR = 655,957 XAF. Le taux et l'arrondi réellement appliqués par Express Congo restent à confirmer et sont stockés avec leur source.
- Pas de conversion implicite. Ne pas confondre XAF (Afrique centrale) et XOF (Afrique de l'Ouest).

---

## 11. Formulaire de devis

Demande possible sans compte.

| Étape | Contenu                                                                                                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Particulier ou professionnel ; service ou « Aidez-moi à choisir » ; origine et destination disponibles                                                                            |
| 2     | Nature des marchandises, nombre de colis, dimensions, poids, valeur déclarée si pertinente, besoin de dédouanement, date souhaitée (une date souhaitée n'est pas une réservation) |
| 3     | Dépôt ou enlèvement si proposé, agence préférée, ville et coordonnées utiles                                                                                                      |
| 4     | Nom, téléphone avec indicatif, email, canal de réponse souhaité, commentaire                                                                                                      |
| 5     | Récapitulatif, information sur les données, validation. Inscription marketing séparée et facultative                                                                              |

- Pièces jointes PDF, JPG, PNG avec limites explicites. Pas de pièce d'identité à ce stade sans nécessité démontrée.
- Progression, retour arrière, sauvegarde temporaire, erreurs compréhensibles. Aucun document sensible dans le stockage local du navigateur.
- Soumission **idempotente** (clé d'idempotence côté serveur) : un double clic ou un réseau lent ne crée qu'une demande.
- Après enregistrement serveur : référence de demande et moyens de contact.
- Accusé de réception envoyé uniquement via un service configuré, avec état réel enregistré. Jamais « Email envoyé » sur la seule base d'un clic.
- Message WhatsApp prérempli limité au contexte utile ; ouvrir WhatsApp ne vaut pas enregistrement de la demande.

**Cycle de vie dans le back-office** : nouveau → à compléter → en étude → proposition envoyée → acceptée / refusée / expirée. Motifs et dates enregistrés, propositions versionnées, PDF numéroté. Une acceptation commerciale ne prouve pas un paiement.

---

## 12. Suivi des expéditions et espace client

### 12.1 Suivi

Le suivi repose sur de vrais événements, saisis par un agent autorisé ou reçus d'une source connectée. Aucun marqueur de carte ne simule une position.

États proposés, à valider avec l'équipe : créé, reçu en agence, contrôlé, en attente de départ, expédié, arrivé, formalités en cours, disponible au retrait, remis. Exceptions : incident, en attente d'information, annulé. Branche livraison à domicile activée seulement si le service est confirmé (`FEATURE_HOME_DELIVERY`). Historique des corrections conservé avec auteur, lieu et heure.

- Accès public par référence non devinable, vérification complémentaire ou code ponctuel avant toute donnée personnelle.
- Affichage public limité au statut général et à sa date.
- Adresses, documents, noms complets et preuves de remise derrière authentification.
- Limitation des essais, réponse neutre, aucune énumération possible des références.

### 12.2 Espace client

- Devis, expéditions, historique, documents, assistance.
- Création de compte, vérification d'email, récupération d'accès, gestion des sessions, déconnexion.
- Compte professionnel multi-utilisateurs avec permissions distinctes.
- Une demande faite en invité se rattache au compte après vérification, jamais sur simple déclaration d'un email.

### 12.3 Notifications

Événements : proposition disponible, changement important, pièce manquante, disponibilité au retrait. Préférences par canal, historique d'envoi, anti-doublon, reprise après échec, séparation service / marketing. SMS et WhatsApp automatisés nécessitent des prestataires réellement connectés.

---

## 13. Back-office et exploitation

Outil utilisable par une petite équipe, avec recherche, filtres, exports et vues par agence. Modules : demandes, propositions, clients, colis, expéditions, événements, départs, documents, assistance, contenus, agences, tarifs, utilisateurs.

- **Réception** : retrouver le dossier, compter les colis, saisir poids et mesures contrôlés (en conservant les valeurs déclarées), photographier si besoin, noter l'état et les réserves, imprimer une étiquette avec référence interne. Le QR code ne contient aucune donnée personnelle lisible. Un écart qui change le prix déclenche une révision tracée et l'accord requis.
- **Départ** : créer un lot aérien ou maritime, affecter les colis, contrôler les doublons, exporter un manifeste, gérer les changements. Dates « prévisionnelles » ou « confirmées ». Un événement groupé met à jour les colis concernés, avec gestion des exceptions et journal.
- **Destination** : constater la réception, enregistrer les écarts, rendre disponible, notifier, contrôler le droit de retrait, enregistrer une preuve de remise privée, retrait par mandataire si autorisé. Ne pas confondre « arrivé », « disponible » et « remis ».
- **Tableau de bord** : demandes en attente, devis à relancer, colis à contrôler, incidents, retraits en attente. Chiffres issus des données réelles, avec période et agence. Aucun chiffre fictif en production.

| Rôle               | Accès de principe                                    |
| ------------------ | ---------------------------------------------------- |
| Administrateur     | Configuration, accès, supervision complète           |
| Responsable agence | Dossiers et opérations de son agence                 |
| Agent              | Saisie et traitement dans son périmètre              |
| Commercial         | Demandes, propositions, suivi commercial             |
| Finance            | Documents financiers et paiements selon habilitation |
| Client             | Ses propres dossiers et documents                    |

Permissions appliquées **côté serveur** pour chaque lecture, téléchargement, export et modification. Un menu masqué n'est pas une protection. L'accès inter-agences et financier est attribué explicitement.

---

## 14. Paiements et extensions

- Modèle de données prévu pour acomptes, soldes, remboursements et rapprochement.
- Paiement en ligne activé seulement après choix et raccordement d'un prestataire acceptant le pays, la devise et le titulaire du compte (`FEATURE_ONLINE_PAYMENT`). Carte, virement et mobile money sont des possibilités à confirmer, pas des moyens déjà acceptés.
- Confirmation de paiement uniquement par notification serveur authentifiée et idempotente. Une redirection ou une capture d'écran ne suffit pas ; un justificatif reste « à vérifier » jusqu'au rapprochement par un agent habilité.

Extensions sans retarder le cœur : calendrier des départs réels, rendez-vous de dépôt ou d'enlèvement, portail entreprise, import CSV contrôlé, scanner d'étiquettes, réclamations avec justificatifs, centre d'aide, assistant documentaire limité aux contenus validés (sources citées, transmission humaine, aucune décision seule sur un tarif, une indemnisation ou une marchandise réglementée).

Pages publiques consultables avec une connexion faible ; pas de mise en cache hors ligne des documents privés.

---

## 15. Architecture technique

### 15.1 Pile recommandée

Si aucun dépôt n'existe, utiliser cette pile, qu'Agence Élite peut administrer directement :

| Couche                                      | Choix recommandé                                             |
| ------------------------------------------- | ------------------------------------------------------------ |
| Langage                                     | TypeScript en mode strict                                    |
| Framework                                   | Next.js (rendu serveur et pages statiques pour le public)    |
| Base de données, authentification, stockage | Supabase (PostgreSQL, Auth, Storage privé, politiques RLS)   |
| Hébergement de préproduction                | Netlify                                                      |
| Tests                                       | Vitest (unitaires et intégration), Playwright (bout en bout) |
| Qualité                                     | ESLint, Prettier, vérification de types en CI                |

Ces choix ne doivent pas enfermer le projet : la logique métier ne dépend ni de Supabase ni de Netlify directement, mais d'interfaces (repositories, adaptateurs). Versions stables du moment, dépendances verrouillées. Un écart à cette pile se justifie dans `DECISIONS.md`.

Si un dépôt existe déjà : examiner d'abord sa structure, ses instructions et ses composants réutilisables.

### 15.2 Organisation du code

Domaines séparés : contenu, devis, tarification, mesures, expéditions, suivi, clients, paiements, notifications. Les composants visuels ne contiennent pas de règle métier. Adaptateurs pour email, SMS, WhatsApp et paiement, avec une implémentation « console » ou « démo » par défaut, clairement identifiée.

### 15.3 Interrupteurs de fonctions

Regroupés dans un seul fichier de configuration typé, documentés dans `.env.example`, **désactivés par défaut en production** :

| Interrupteur                                  | Active                                           |
| --------------------------------------------- | ------------------------------------------------ |
| `FEATURE_PRICING_ENGINE`                      | Estimation chiffrée à partir des règles validées |
| `FEATURE_VOLUMETRIC_WEIGHT`                   | Calcul du poids volumétrique                     |
| `FEATURE_TRACKING`                            | Suivi public                                     |
| `FEATURE_CLIENT_ACCOUNTS`                     | Création de comptes clients                      |
| `FEATURE_PICKUP`                              | Demande d'enlèvement                             |
| `FEATURE_HOME_DELIVERY`                       | Branche livraison à domicile                     |
| `FEATURE_ONLINE_PAYMENT`                      | Paiement en ligne                                |
| `FEATURE_NOTIFY_EMAIL` / `_SMS` / `_WHATSAPP` | Envois automatiques par canal                    |
| `FEATURE_TESTIMONIALS`                        | Bloc d'avis                                      |
| `FEATURE_XAF_DISPLAY`                         | Affichage en XAF                                 |
| `ROUTES_ENABLED`                              | Routes ouvertes (défaut : `FR-CG` uniquement)    |

### 15.4 Données

| Entité                      | Données et relations essentielles                                                      |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Agence                      | Adresse, contacts, horaires et coordonnées géographiques validés, statut de validation |
| Utilisateur et organisation | Identité, adhésion, rôle, périmètre d'agence ou d'entreprise                           |
| Demande de devis            | Client invité ou authentifié, route, besoin, état, clé d'idempotence                   |
| Proposition et lignes       | Version, montants, devise, exclusions, validité, acceptation, instantané tarifaire     |
| Colis                       | Référence, description, mesures déclarées et contrôlées, quantité                      |
| Expédition et affectations  | Client, route, service, colis, agence responsable, départ                              |
| Départ                      | Mode, dates prévisionnelles et confirmées, état                                        |
| Événement                   | Expédition, statut, date, lieu, auteur, source, visibilité                             |
| Tarif et règle              | Périmètre, unité, paliers, frais, dates, statut de validation                          |
| Document                    | Propriétaire, dossier, chemin privé, type, version, droits                             |
| Paiement                    | Prestataire, référence, montant, devise, état, rapprochement                           |
| Notification et assistance  | Canal, tentative, résultat, demande, pièces                                            |
| Contenu et audit            | Version éditoriale, statut de vérité (§2.1) ; action, auteur, date, objet modifié      |

- Montants en décimal exact ou en unités mineures, jamais en flottant.
- Dates stockées en UTC, affichées en heure de Paris ou du Congo selon l'agence.
- Contraintes, clés uniques et transactions pour les numéros, acceptations, paiements et affectations.
- Migrations versionnées, sauvegarde, restauration vérifiée, import documenté.

---

## 16. Sécurité et données personnelles

- Authentification robuste, second facteur obligatoire pour l'administration, contrôle d'accès serveur, limitation de débit, validation des entrées, protection des sessions et formulaires.
- Secrets uniquement côté serveur ; `.env.example` sans valeur privée ; environnements séparés.
- Documents dans un stockage privé avec liens temporaires. Validation de l'extension, du type réel et de la taille ; noms neutralisés ; quarantaine des fichiers suspects. Jamais de HTML ou SVG actif accepté comme justificatif.
- Données limitées au nécessaire ; durées de conservation à définir avec Express Congo par catégorie. Demandes d'accès, de rectification et de suppression prévues, sans exiger par défaut une copie d'identité.
- Données personnelles absentes des URL, des statistiques et des journaux techniques. Exports et logs de démonstration expurgés.
- Textes de confidentialité et de cookies décrivant les outils réellement installés, en tenant compte du RGPD puisque l'éditeur est établi en France. Gestion du consentement si des traceurs l'exigent ; cartes et services tiers chargés après consentement. Textes relus par un professionnel avant publication.

---

## 17. Référencement, accessibilité et performance

- Titre et description propres à chaque page, titres hiérarchisés, liens internes utiles, sitemap, URL canoniques, redirections du §6.1.
- Fiches agences avec informations distinctes et vérifiées ; données structurées uniquement pour les informations réellement présentes. Pas de notes, avis ou coordonnées GPS fabriqués.
- Articles utiles et datés ; aucun remplissage automatique de dizaines de pages.
- Accessibilité visée : WCAG 2.2 niveau AA, vérifiée critère par critère. Navigation clavier, focus visible, libellés explicites, erreurs liées aux champs, textes alternatifs, contrastes, zones tactiles suffisantes. Pas de déclaration de conformité sur la seule base d'un score automatique.
- Performance : images et polices optimisées, espace des médias réservé, chargement différé des images secondaires, pas de vidéo lourde en premier écran. Objectifs indicatifs au 75e percentile des mesures réelles : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1. Les mesures de laboratoire servent à détecter les problèmes en attendant.
- Tests à 360, 390, 768, 1 024 et 1 440 px, sans défilement horizontal involontaire, et sur connexion mobile limitée.
- Mesure des conversions : début de devis, soumission confirmée, proposition acceptée, clic contact. Un clic WhatsApp n'est pas un client ; aucun contenu de formulaire dans les événements analytiques.

---

## 18. Tests et critères de réception

Le site est acceptable lorsque toutes les routes prévues répondent, que les contenus sont cohérents, que liens et téléchargements fonctionnent et que les fonctions non validées restent désactivées. Aucun bouton ne simule un succès sans opération réelle.

| Parcours                                           | Résultat attendu                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| Trois cartons de 60 × 40 × 40 cm                   | 0,288 m³, repris à l'identique dans le devis                             |
| Virgule décimale, unité m, quantité modifiée       | Calcul exact, affichage cohérent                                         |
| Valeur négative, champ vide, poids invalide        | Erreur claire, autres données conservées                                 |
| Prix maritime ambigu ou règle absente              | Devis manuel, jamais 0 € ni total inventé                                |
| Soumission répétée après réseau lent               | Une seule demande, référence stable                                      |
| Référence de suivi inconnue ou essais multiples    | Réponse neutre, limitation des abus                                      |
| Accès au dossier d'un autre client                 | Refus serveur pour pages, API et fichiers                                |
| Agent d'une autre agence sans habilitation         | Refus des opérations hors périmètre                                      |
| Événement corrigé ou colis en incident             | Historique conservé, état public cohérent                                |
| Prestataire email indisponible                     | Demande conservée, erreur tracée, reprise possible                       |
| Notification de paiement répétée                   | Une seule écriture financière                                            |
| Restauration d'une sauvegarde                      | Données et documents récupérables                                        |
| Build de production avec un `[À CONFIRMER` restant | Échec du build                                                           |
| Analyse des liens internes et des téléchargements  | Aucune erreur 404 (le défaut constaté au §4.2 ne doit pas se reproduire) |
| Interrupteurs désactivés                           | Fonctions invisibles côté public et refusées côté API                    |

En complément : vérification manuelle au clavier et sur téléphone, tests d'intégration sur permissions et calculs, tests de bout en bout sur devis, suivi et administration, contrôle des frais, exclusions et arrondis aux bornes des paliers.

`TEST_REPORT.md` distingue tests exécutés, réussis, échoués et impossibles faute d'accès, avec la commande utilisée et la date.

---

## 19. Passation à Claude

À la fin de ton travail, **Claude reprend le projet** pour le vérifier, le corriger et le poursuivre. Claude ne voit que le dépôt : tout ce qui n'y est pas écrit est perdu. Ces règles sont obligatoires.

### 19.1 Fichiers obligatoires à la racine

| Fichier              | Contenu                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`          | Guide de reprise : objectif du projet, carte des dossiers, commandes, conventions, règles de vérité résumées, pièges connus. Court (moins de 200 lignes), à jour, sans duplication du cahier des charges |
| `AGENTS.md`          | Mêmes conventions, au format attendu par Codex, pour que les deux agents suivent les mêmes règles                                                                                                        |
| `HANDOFF.md`         | État réel de chaque lot et module : terminé, partiel ou non commencé ; bugs connus ; dette technique ; prochaines étapes ordonnées ; dernière commande de test exécutée et son résultat                  |
| `DECISIONS.md`       | Chaque choix technique ou de design : contexte, décision, alternatives écartées, date                                                                                                                    |
| `LAUNCH_REGISTER.md` | Registre des points à confirmer (§21) avec identifiant, responsable, état, date                                                                                                                          |
| `INTEGRATIONS.md`    | Chaque intégration : statut réel (non connectée, démo, connectée et vérifiée), variables requises, procédure d'activation                                                                                |
| `TEST_REPORT.md`     | Rapport de tests (§18)                                                                                                                                                                                   |
| `README.md`          | Installation, lancement, déploiement de préproduction                                                                                                                                                    |
| `.env.example`       | Toutes les variables, commentées, sans valeur privée                                                                                                                                                     |
| `docs/`              | Guide administrateur, schéma de données, redirections, sources des ressources                                                                                                                            |

### 19.2 Commandes standard

Toutes lancées depuis la racine, sans étape manuelle cachée :

| Commande                        | Rôle                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| `npm install`                   | Installation                                                           |
| `npm run dev`                   | Développement local                                                    |
| `npm run build`                 | Build de production                                                    |
| `npm run typecheck`             | Vérification des types                                                 |
| `npm run lint`                  | Qualité du code                                                        |
| `npm test`                      | Tests unitaires et d'intégration                                       |
| `npm run test:e2e`              | Tests de bout en bout                                                  |
| `npm run db:start` / `db:reset` | Base locale (Docker), remise à zéro                                    |
| `npm run db:migrate`            | Migrations                                                             |
| `npm run db:seed:demo`          | Données fictives déterministes                                         |
| `npm run check`                 | Enchaîne typecheck, lint et tests : doit passer avant chaque livraison |

### 19.3 Contraintes de reprise

- Le projet s'installe, se construit et se teste **sans accès Internet autre que les registres de paquets et GitHub**, et sans compte externe. Les prestataires sont remplacés par leurs adaptateurs de démonstration en local.
- Code poussé sur un dépôt GitHub, branche `main` stable. Commits petits, un module à la fois, messages explicites au format `type(domaine): description` (ex. `feat(devis): soumission idempotente`).
- Aucun secret, jeton ou donnée personnelle réelle dans le dépôt ou l'historique.
- Marqueurs de travail restant au format unique et recherchable : `TODO(EC-xxx): description`, où `EC-xxx` renvoie à une ligne de `LAUNCH_REGISTER.md` ou de `HANDOFF.md`. Pas de TODO orphelin.
- Pas de code mort, de fichier généré non documenté ou de configuration commentée « au cas où ».
- Les tests couvrent en priorité les règles métier (mesures, tarification, permissions, états) : ce sont elles que Claude vérifiera en premier.
- `HANDOFF.md` décrit la réalité, pas l'intention. Un module « presque fini » est noté « partiel » avec ce qui manque.

---

## 20. Lots et livrables

| Lot   | Contenu                                                                                                                                                                        | Définition de « terminé »                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Identité visuelle, site public complet, contenus relus, agences, guides, mesures et calculateur, demandes de devis persistées, gestion éditoriale, référencement, redirections | Toutes les routes publiques livrées, devis enregistré avec référence, tests du calculateur et des liens au vert, tarifs non validés « sur devis » |
| **2** | Espace client, propositions, dossiers d'expédition, colis, étiquettes, départs, suivi manuel, contrôle des accès, documents, assistance                                        | Parcours réception → départ → remise testé de bout en bout, permissions vérifiées côté serveur                                                    |
| **3** | Notifications connectées, paiement après validation du prestataire, imports, exports avancés, rendez-vous, intégrations                                                        | Adaptateurs testés en mode démo, statut réel de chaque intégration dans `INTEGRATIONS.md`                                                         |

Les trois lots forment la cible complète ; l'ordre organise la réalisation sans faire passer un site vitrine pour une plateforme terminée.

**Livrables** : dépôt complet, fichiers du §19.1, migrations, jeux de données fictifs séparés, ressources avec provenance, tests, aperçu de préproduction, captures mobile et bureau des pages principales.

**Avant mise en ligne** (hors mission de Codex) : sauvegarde du site WordPress actuel, contrôle des redirections, validation des contacts, tarifs et textes, vérification des emails techniques, plan de retour à la version précédente.

---

## 21. Registre des points à faire confirmer par Express Congo

À reprendre tel quel dans `LAUNCH_REGISTER.md`, avec colonnes Responsable, État et Date de validation.

| ID     | Sujet                         | Détail                                                                                                |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| EC-001 | Identité légale               | Statut, éditeur, numéros SIREN/SIRET, adresse du siège                                                |
| EC-002 | Coordonnées                   | Numéros des trois agences, sens de « / 24 », WhatsApp, email (adresse sur domaine propre souhaitable) |
| EC-003 | Horaires                      | Horaires par agence, jours fériés, fuseau                                                             |
| EC-004 | Localisation                  | Coordonnées géographiques des agences                                                                 |
| EC-005 | Réseaux sociaux               | Page Facebook observée et autres comptes officiels                                                    |
| EC-006 | Droits visuels                | Logo vectoriel, photos et bannières réutilisables                                                     |
| EC-007 | Routes                        | Routes réellement opérées (France → Brazzaville, Pointe-Noire, autres villes ?)                       |
| EC-008 | Départs                       | Dates, fréquences, délais indicatifs par mode                                                         |
| EC-009 | Dépôt et enlèvement           | Conditions de dépôt en agence et d'enlèvement en France (affirmé sur l'accueil actuel)                |
| EC-010 | Livraison et retrait au Congo | Livraison à domicile, retrait, mandataire, justificatifs                                              |
| EC-011 | Marchandises particulières    | Téléphones, électronique, produits réglementés, interdits                                             |
| EC-012 | Grille tarifaire              | Validation complète, date d'effet, minima, paliers, arrondis                                          |
| EC-013 | Frais de dossier              | Montant, service et fréquence                                                                         |
| EC-014 | Unité maritime                | Sens de la valeur 800 sur la ligne 1 m³                                                               |
| EC-015 | Poids volumétrique            | Diviseur et règles par offre                                                                          |
| EC-016 | Devises et taxes              | Devise de facturation et de paiement, taux et arrondi XAF, TVA                                        |
| EC-017 | Douane                        | Ce qu'inclut « avec douane » ; cohérence avec l'art. 2.2 des CGV                                      |
| EC-018 | Assurance et responsabilité   | Déclaration de valeur, assurance, réclamations                                                        |
| EC-019 | CGV                           | Version applicable aux particuliers et aux professionnels                                             |
| EC-020 | Mentions et confidentialité   | Hébergeur futur, durées de conservation, outils de mesure                                             |
| EC-021 | Procédures internes           | États de suivi, rôles des agents, règles de remise, modèles de devis                                  |
| EC-022 | Prestataires                  | Email, SMS, WhatsApp Business, paiement                                                               |
| EC-023 | Équipe et histoire            | Contenu vérifié pour la page À propos                                                                 |
| EC-024 | Témoignages                   | Avis réels autorisés, s'il en existe                                                                  |

Tant qu'une ligne n'est pas validée, la fonction concernée reste développée mais désactivée.

---

## 22. Sources

Consultées le 8 octobre 2026. Les liens permettent une nouvelle vérification au moment de la réalisation.

| Réf. | Source                                                       | URL                                                                      |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| S1   | Accueil                                                      | https://expresscongo.fr/                                                 |
| S2   | À propos                                                     | https://expresscongo.fr/a-propos/                                        |
| S3   | Services                                                     | https://expresscongo.fr/services/                                        |
| S4   | Contact                                                      | https://expresscongo.fr/contact/                                         |
| S5   | Mentions légales                                             | https://expresscongo.fr/mentions-legales/                                |
| S6   | Grille tarifaire (lien de l'accueil)                         | https://expresscongo.fr/wp-content/uploads/2026/09/grille-tarifaire.pdf  |
| S7   | CGV                                                          | https://expresscongo.fr/cgv/                                             |
| S8   | Logo                                                         | https://expresscongo.fr/wp-content/uploads/2025/08/logo-expresscongo.png |
| S9   | Illustration des mesures                                     | https://expresscongo.fr/wp-content/uploads/2025/08/comment-mesurer.jpg   |
| S10  | Sitemap                                                      | https://expresscongo.fr/wp-sitemap.xml                                   |
| S11  | Grille tarifaire liée depuis Services (erreur 404 constatée) | https://expresscongo.fr/wp-content/uploads/2025/08/grille-tarifaire.pdf  |

La capture transmise par le client a également été examinée. Les préconisations de design, de fonctionnalités et d'architecture sont des propositions d'Agence Élite ; elles ne décrivent pas des capacités déjà démontrées chez Express Congo.

---

## 23. Message de lancement à copier dans Codex

```text
Lis intégralement Fiche_Express_Congo_Codex.md, puis inspecte le dossier assets.

Réalise le nouveau site Express Congo conformément au cahier des charges : site public, espace client et back-office, en suivant l'ordre des lots 1, 2 puis 3. Chaque lot doit être fonctionnel et testé avant de passer au suivant. Si un dépôt existe, examine-le d'abord ; sinon, utilise la pile recommandée au §15.1 et documente tout écart dans DECISIONS.md.

Règles absolues :
- N'invente aucune donnée commerciale (tarif, délai, horaire, garantie, avis, partenariat). Applique les statuts du §2.1.
- Toute fonction qui dépend d'une information manquante est développée, mais désactivée par un interrupteur du §15.3 et inscrite dans LAUNCH_REGISTER.md.
- Toute démonstration est marquée « Démonstration », séparée des données réelles et non indexable.
- N'annonce jamais qu'une intégration fonctionne si elle n'est pas connectée et vérifiée.
- Ne t'arrête pas à une maquette : implémente les flux, la persistance, les permissions côté serveur, les états d'erreur et les tests du §18.

Priorités de qualité : guide de mesures et calculateur de volume, formulaire de devis idempotent, trois fiches agences, suivi sécurisé, redirections de l'ancien site, aucun lien cassé.

Le projet sera ensuite repris par Claude. Respecte strictement le §19 : crée et tiens à jour CLAUDE.md, AGENTS.md, HANDOFF.md, DECISIONS.md, LAUNCH_REGISTER.md, INTEGRATIONS.md, TEST_REPORT.md et .env.example ; fournis les commandes standard du §19.2 ; fais en sorte que `npm run check` passe sans compte externe ; pousse le code sur GitHub en commits petits et explicites.

Termine par un aperçu utilisable, la documentation, le rapport de tests et la liste factuelle des connexions et validations restantes. HANDOFF.md doit décrire l'état réel, pas l'état souhaité.
```
