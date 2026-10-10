# Module CRM — Prospects et opportunités

Statut : **actif** (migration `20261002000020_crm.sql`, module `crm_pipeline`). Proposé dans les solutions Commerce et Services.

## Principe
- Un **prospect** est un contact de type `prospect` (même table que les clients : aucune fiche en double).
  Origine (`source` : Instagram, Facebook, WhatsApp, appel, recommandation, site, salon, passage, autre) et responsable.
- Une **opportunité** (OP-) relie un prospect ou client, un montant estimé, une étape du pipeline (probabilité),
  une date de signature prévue, un responsable. Gagner transforme le prospect en client.
- Le **pipeline** est propre à chaque établissement : Nouveau → Contacté → Qualifié → Proposition → Négociation
  → Gagné / Perdu par défaut (créé à la première visite), renommable, réordonnable, étapes ajoutables/désactivables.
- Les **activités** (appel, message, rendez-vous, e-mail, visite, démo, tâche, note) se planifient avec une date,
  s'assignent, se terminent avec un résultat (et proposent la relance suivante), s'annulent avec un motif.
- **Devis lié** : « Créer le devis » ouvre un devis (module Facturation) rattaché à l'opportunité, qui passe en Proposition.

## Règles (base)
- Lecture : `crm_pipeline.lire`. Écriture : `crm_pipeline.gerer` sur ses opportunités (responsable ou créateur) ;
  `crm_pipeline.administrer` pour toutes, la réattribution, l'assignation d'activités à autrui et le pipeline.
- Perdre exige un motif ; une opportunité clôturée ne se modifie plus (rouvrir la ramène dans une étape ouverte).
- Gagné et Perdu restent uniques et actifs ; une étape ne se désactive pas tant qu'elle contient des opportunités.
- Rien ne se supprime (déclencheurs `refuser_suppression`), tout est journalisé.
- Un fournisseur pur ne porte pas d'opportunité ; tout contact doit appartenir à l'établissement.
- Notifications : opportunité attribuée, activité assignée, opportunité gagnée (administrateurs).
- **Devis lié** (migration `20261003000016_liens_modules`) : devis accepté ou converti en facture → opportunité encore
  ouverte gagnée (prospect → client, notification) ; devis refusé → opportunité perdue, motif « Devis refusé ». Une note
  est ajoutée aux activités. Fonctionne même si la personne qui change le devis n'a pas le droit CRM (fonction interne
  `crm_synchroniser_devis`, non appelable par les clients). Une opportunité déjà gagnée ou perdue n'est jamais rouverte.
  La facture issue du devis se retrouve par `documents_vente.origine_id` : bouton « Ouvrir la facture » sur la fiche.
- Rendez-vous : un rendez-vous de l'Agenda peut être rattaché à une opportunité ; la fiche opportunité et la vue CRM
  d'un contact listent les rendez-vous et proposent « Nouveau rendez-vous ».

## Rôle « Commercial »
Nouveau rôle (requiert le module) : CRM (lire, gérer), contacts, articles en lecture, facturation (lire, gérer), tableau de bord.

## Paramètres
`relance_jours` (3), `jours_sans_activite` (14 : alerte « à relancer »).

## Fonctions
`crm_initialiser`, `enregistrer_etape_crm`, `enregistrer_opportunite`, `deplacer_opportunite`, `rouvrir_opportunite`,
`enregistrer_activite_crm`, `terminer_activite_crm`, `creer_devis_opportunite`, `crm_commerciaux`, `tableau_de_bord_crm`.

## Écrans
Page « Prospects et opportunités » (groupe Relations) : pipeline en colonnes (glisser-déposer, ou « Déplacer… »
au clavier), liste filtrable et exportable, activités à faire / historique, prospects ; fiche opportunité (fil des
étapes, activités, devis, documents) ; vue CRM d'un contact ; réglage des étapes ; widget « Commercial ».
Contacts : type Prospect, origine, onglet Prospects quand le CRM est actif.

## Qualification (lot D, migration `20261010000114_qualification_crm`)
- **Interlocuteurs** : plusieurs personnes par entreprise (nom, fonction, téléphone, e-mail), une ou plusieurs
  marquées « décideur » (`contact_interlocuteurs`, `enregistrer_interlocuteur`, droit `contacts.gerer`). Visibles
  sur la fiche contact, la vue CRM du contact et la fiche opportunité. Un interlocuteur se retire, il ne se supprime pas.
- **Budget en fourchette** et **démarrage souhaité** sur l'opportunité (`budget_min`, `budget_max`, `demarrage_souhaite`).
- **Questions de qualification et d'audit** propres à l'établissement (`crm_criteres`, réglées par
  `crm_pipeline.administrer` dans « Étapes et questions ») : oui/non, choix, nombre ou texte, aide, poids. Une question
  peut n'être posée que si une autre (oui/non ou à choix, elle-même sans condition) a une réponse donnée. Questions de
  départ génériques proposées (`crm_criteres_initialiser`). Réponses par opportunité (`repondre_criteres_crm`, même
  droit que modifier l'opportunité). **Score** (`qualification_opportunite`) : poids des « oui » (ou des réponses
  données pour les autres types) sur le total des questions de qualification visibles. **Fiche audit** imprimable.
- **Motifs de perte** : liste réglable (`motifs_perte`, une ligne par motif) ; le motif choisi est enregistré avec la
  précision écrite après « : ». Répartition « Pourquoi les affaires sont perdues » sous la liste des opportunités.
  À la perte, « Relancer ce contact plus tard » (1, 3 ou 6 mois) planifie un appel rattaché à l'opportunité.
- **Compte rendu d'appel** : modèle réglable (`modele_compte_rendu`) prérempli quand on termine un appel, un
  rendez-vous, une visite ou une démo ; laissé tel quel, rien n'est enregistré.
- **Coordonnées confirmées** (`confirmer_coordonnees_contact`) : date et auteur ; un changement de téléphone,
  d'e-mail ou d'adresse les remet « à confirmer ».
- **Doublons** : onglet « Doublons » (même téléphone sur les 8 derniers chiffres, même e-mail ou même nom) et
  avertissement à la création d'un contact ou d'un prospect (`contacts_doublons`, `contacts_similaires`). Rien n'est bloqué.
- Lecture : `crm_pipeline.lire` (questions, réponses, score, réglages), `contacts.lire` (interlocuteurs, doublons).

## Limites connues
- Pas d'envoi de message (WhatsApp, e-mail, SMS) depuis la plateforme : l'activité trace l'échange fait ailleurs.
- Pas d'import de prospects en masse (l'import CSV des contacts reste à faire).
- Pas de prévision de chiffre d'affaires par mois au-delà du pipeline pondéré.
- Doublons : pas de fusion automatique (les ventes, factures et opportunités restent sur leur fiche) ; on garde la
  bonne fiche et on désactive l'autre. Les noms sont comparés sans espaces ni ponctuation, mais avec les accents.
- Questions conditionnelles sur un seul niveau (une question qui dépend d'une autre ne peut pas en commander une troisième).
- Le formulaire public du site web ne pose pas ces questions : elles se remplissent dans la plateforme.
- La fiche audit s'imprime depuis le navigateur (« Enregistrer en PDF ») ; pas d'envoi au client depuis la plateforme.
