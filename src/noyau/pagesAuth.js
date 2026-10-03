// Pages d'authentification administrables : catalogue des réglages (même liste que public.champs_pages_auth()),
// valeurs par défaut du code et calcul du contenu effectif.
// Héritage : valeurs du code ← plateforme ← client ← établissement (publiés). L'identité (nom, logo, couleur)
// vient de l'identité générale tant que les pages ne la remplacent pas.
// Ces réglages ne touchent jamais au fonctionnement : authentification, droits, mots de passe, redirections.
import { marqueValide, melanger } from './marque.js';

// Pages et états réellement présents dans l'application (la double authentification n'existe pas).
export const PAGES_AUTH = [
  { id: 'connexion', libelle: 'Connexion', description: 'Premier écran : identifiant ou e-mail et mot de passe.' },
  { id: 'invitation', libelle: 'Invitation', description: 'Création du compte depuis le lien d’invitation reçu par e-mail.' },
  { id: 'premiere', libelle: 'Première connexion', description: 'Changement obligatoire du mot de passe temporaire.' },
  { id: 'expire', libelle: 'Mot de passe temporaire expiré', description: 'Le mot de passe temporaire n’est plus valable.' },
  { id: 'oubli', libelle: 'Mot de passe oublié', description: 'Demande du lien de réinitialisation par e-mail.' },
  { id: 'reinitialisation', libelle: 'Réinitialisation', description: 'Choix du nouveau mot de passe après le lien reçu.' },
  { id: 'bloque', libelle: 'Compte bloqué ou désactivé', description: 'Trop de tentatives, ou compte désactivé.' },
  { id: 'refuse', libelle: 'Accès refusé', description: 'Compte connecté sans aucun établissement.' },
  { id: 'bienvenue', libelle: 'Invitation en attente', description: 'Compte connecté invité à rejoindre un établissement.' },
  { id: 'expiree', libelle: 'Session expirée', description: 'La session a pris fin : il faut se reconnecter.' },
];

export const SECTIONS_AUTH = [
  ['identite', 'Identité'],
  ['textes', 'Textes'],
  ['apparence', 'Apparence'],
  ['liens', 'Boutons et liens'],
];

// Fonds proposés : même liste que public.couleurs_fond_auth().
export const COULEURS_FOND_AUTH = [
  ['#f8fafc', 'Blanc cassé'], ['#f1f5f9', 'Gris clair'], ['#eff6ff', 'Bleu pâle'], ['#eef2ff', 'Indigo pâle'], ['#f5f3ff', 'Lavande'],
  ['#fdf2f8', 'Rose pâle'], ['#fff7ed', 'Pêche'], ['#fefce8', 'Crème'], ['#ecfdf5', 'Menthe'],
  ['#0f172a', 'Nuit'], ['#18202f', 'Encre'], ['#1e293b', 'Ardoise foncée'],
];

const t = (max, section, libelle, defaut = '', extra = {}) => ({ type: 'texte', max, section, libelle, defaut, ...extra });
const l = (max, section, libelle, defaut = '', extra = {}) => ({ type: 'long', max, section, libelle, defaut, ...extra });

// section : où le réglage apparaît dans l'éditeur ; page : l'aperçu montré quand on le modifie.
export const CHAMPS_PAGES_AUTH = {
  nom_logiciel: t(40, 'identite', 'Nom affiché', null, { aide: 'Vide : nom de l’identité générale.' }),
  nom_court: t(4, 'identite', 'Monogramme', null, { aide: '1 à 4 caractères, affiché sans logo.' }),
  sous_titre: t(60, 'identite', 'Sous-titre', null),
  logo_url: { type: 'image', max: 400000, section: 'identite', libelle: 'Logo', defaut: null },
  nom_editeur: t(60, 'identite', 'Nom de l’éditeur (à contacter)', 'Agence Elite', { aide: 'Repris dans « Contactez … » et « Support … ».' }),
  contact_support: t(120, 'identite', 'Contact du support', '', { aide: 'Téléphone ou e-mail affiché aux comptes bloqués ou sans accès.' }),

  couleur_accent: { type: 'couleur', section: 'apparence', libelle: 'Couleur principale', defaut: null },
  disposition: { type: 'choix', choix: [['centree', 'Centrée'], ['partagee', 'Partagée avec image'], ['laterale', 'Carte à gauche']], section: 'apparence', libelle: 'Disposition', defaut: 'centree' },
  fond: { type: 'choix', choix: [['degrade', 'Dégradé de la couleur'], ['uni', 'Couleur unie'], ['image', 'Image']], section: 'apparence', libelle: 'Fond', defaut: 'degrade' },
  couleur_fond: { type: 'fond', section: 'apparence', libelle: 'Couleur du fond', defaut: '#f1f5f9' },
  image_fond: { type: 'image', max: 900000, section: 'apparence', libelle: 'Image d’accompagnement', defaut: null, aide: 'Fond « Image » ou disposition « Partagée ».' },
  accroche: l(160, 'apparence', 'Phrase d’accroche', '', { aide: 'Affichée sur le panneau de la disposition « Partagée ».' }),
  alignement: { type: 'choix', choix: [['gauche', 'À gauche'], ['centre', 'Centré']], section: 'apparence', libelle: 'Alignement des textes', defaut: 'gauche' },

  pied: l(300, 'textes', 'Texte de bas de page', '', { page: 'connexion', groupe: 'commun' }),
  copyright: t(120, 'textes', 'Mention de droits', '© {annee} {logiciel}', { page: 'connexion', groupe: 'commun' }),
  lien_1_libelle: t(40, 'liens', 'Lien 1 : texte', '', { page: 'connexion', groupe: 'pied' }),
  lien_1_url: { type: 'lien', section: 'liens', libelle: 'Lien 1 : adresse', defaut: '', page: 'connexion', groupe: 'pied' },
  lien_2_libelle: t(40, 'liens', 'Lien 2 : texte', '', { page: 'connexion', groupe: 'pied' }),
  lien_2_url: { type: 'lien', section: 'liens', libelle: 'Lien 2 : adresse', defaut: '', page: 'connexion', groupe: 'pied' },
  lien_3_libelle: t(40, 'liens', 'Lien 3 : texte', '', { page: 'connexion', groupe: 'pied' }),
  lien_3_url: { type: 'lien', section: 'liens', libelle: 'Lien 3 : adresse', defaut: '', page: 'connexion', groupe: 'pied' },

  connexion_titre: t(80, 'textes', 'Titre', 'Connexion', { page: 'connexion' }),
  connexion_intro: l(300, 'textes', 'Texte d’introduction', '', { page: 'connexion' }),
  onglet_connexion: t(40, 'liens', 'Onglet « connexion »', 'Connexion', { page: 'connexion' }),
  onglet_invitation: t(40, 'liens', 'Onglet « invitation »', 'J’ai reçu une invitation', { page: 'invitation' }),
  champ_identifiant: t(60, 'textes', 'Champ identifiant', 'Identifiant ou e-mail', { page: 'connexion' }),
  champ_mot_de_passe: t(60, 'textes', 'Champ mot de passe', 'Mot de passe', { page: 'connexion' }),
  bouton_connexion: t(40, 'liens', 'Bouton de connexion', 'Se connecter', { page: 'connexion' }),
  lien_oubli: t(60, 'liens', 'Lien « mot de passe oublié »', 'Mot de passe oublié ?', { page: 'connexion' }),

  invitation_intro: l(300, 'textes', 'Texte d’introduction', 'Utilisez l’adresse e-mail à laquelle vous avez été invité(e).', { page: 'invitation' }),
  champ_nom: t(60, 'textes', 'Champ nom', 'Votre nom', { page: 'invitation' }),
  champ_email: t(60, 'textes', 'Champ e-mail', 'E-mail', { page: 'invitation' }),
  bouton_invitation: t(40, 'liens', 'Bouton de création du compte', 'Créer mon compte', { page: 'invitation' }),
  invitation_succes: l(300, 'textes', 'Message après création', 'Compte créé. Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.', { page: 'invitation' }),

  premiere_titre: t(80, 'textes', 'Titre', 'Créer votre nouveau mot de passe', { page: 'premiere' }),
  premiere_intro: l(400, 'textes', 'Texte', 'Bonjour {nom}. Vous vous êtes connecté(e) avec un mot de passe temporaire. Choisissez votre mot de passe personnel pour continuer ; l’ancien ne fonctionnera plus.', { page: 'premiere' }),
  champ_nouveau: t(60, 'textes', 'Champ nouveau mot de passe', 'Nouveau mot de passe', { page: 'premiere' }),
  champ_confirmation: t(60, 'textes', 'Champ confirmation', 'Confirmer le mot de passe', { page: 'premiere' }),
  bouton_mot_de_passe: t(40, 'liens', 'Bouton d’enregistrement du mot de passe', 'Enregistrer mon mot de passe', { page: 'premiere' }),
  expire_titre: t(80, 'textes', 'Titre', 'Mot de passe temporaire expiré', { page: 'expire' }),
  expire_texte: l(400, 'textes', 'Texte', 'Le mot de passe temporaire de ce compte n’est plus valable. Demandez-en un nouveau à {editeur} ou à votre responsable.', { page: 'expire' }),

  oubli_titre: t(80, 'textes', 'Titre', 'Mot de passe oublié', { page: 'oubli' }),
  oubli_intro: l(300, 'textes', 'Texte', 'Indiquez l’adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.', { page: 'oubli' }),
  bouton_oubli: t(40, 'liens', 'Bouton d’envoi du lien', 'Recevoir le lien', { page: 'oubli' }),
  oubli_envoye: l(300, 'textes', 'Message après l’envoi', 'Si un compte existe pour cette adresse, un e-mail vient d’être envoyé. Ouvrez le lien qu’il contient.', { page: 'oubli' }),
  lien_retour: t(60, 'liens', 'Lien « retour à la connexion »', 'Retour à la connexion', { page: 'oubli' }),
  lien_expire: l(300, 'textes', 'Lien reçu expiré', 'Ce lien n’est plus valable ou a déjà servi. Demandez-en un nouveau.', { page: 'oubli' }),
  reinit_titre: t(80, 'textes', 'Titre', 'Choisir un nouveau mot de passe', { page: 'reinitialisation' }),
  reinit_intro: l(300, 'textes', 'Texte', 'Choisissez votre nouveau mot de passe. L’ancien ne fonctionnera plus.', { page: 'reinitialisation' }),
  bouton_reinit: t(40, 'liens', 'Bouton d’enregistrement', 'Enregistrer et continuer', { page: 'reinitialisation' }),

  bloque_texte: l(300, 'textes', 'Trop de tentatives', 'Trop de tentatives : réessayez dans quelques minutes.', { page: 'bloque' }),
  desactive_texte: l(300, 'textes', 'Compte désactivé', 'Ce compte est désactivé. Contactez {editeur}.', { page: 'bloque' }),
  refuse_titre: t(80, 'textes', 'Titre', 'Aucun établissement pour ce compte', { page: 'refuse' }),
  refuse_texte: l(400, 'textes', 'Texte', 'Connecté avec {compte}. Demandez à votre responsable ou à {editeur} de vous donner un accès.', { page: 'refuse' }),
  bienvenue_titre: t(80, 'textes', 'Titre', 'Bienvenue {nom}', { page: 'bienvenue' }),
  bienvenue_intro: l(300, 'textes', 'Texte', 'Vous êtes invité(e) à rejoindre :', { page: 'bienvenue' }),
  lien_changer_compte: t(40, 'liens', 'Lien « changer de compte »', 'Changer de compte', { page: 'refuse' }),
  lien_deconnexion: t(40, 'liens', 'Lien « se déconnecter »', 'Se déconnecter', { page: 'premiere' }),
  expiree_titre: t(80, 'textes', 'Titre', 'Session expirée', { page: 'expiree' }),
  expiree_texte: l(300, 'textes', 'Texte', 'Par sécurité, votre session a pris fin. Reconnectez-vous pour continuer.', { page: 'expiree' }),
};

export const DEFAUTS_PAGES_AUTH = Object.fromEntries(Object.entries(CHAMPS_PAGES_AUTH).map(([cle, c]) => [cle, c.defaut ?? '']));

const IDENTITE = ['nom_logiciel', 'nom_court', 'sous_titre', 'logo_url', 'couleur_accent'];

// Ne garde que les clés connues et non vides (même règle que la base).
export function nettoyer(contenu) {
  return Object.fromEntries(Object.entries(contenu ?? {}).filter(([cle, v]) => CHAMPS_PAGES_AUTH[cle] && typeof v === 'string' && v.trim() !== ''));
}

// Contenu effectif : valeurs du code, identité générale, puis contenu (déjà fusionné par niveau).
export function configAuth({ marque, contenu } = {}) {
  const m = marqueValide(marque);
  const c = nettoyer(contenu);
  const config = { ...DEFAUTS_PAGES_AUTH, ...Object.fromEntries(IDENTITE.map((k) => [k, m[k] ?? ''])), favicon_url: m.favicon_url, ...c };
  if (!CHAMPS_PAGES_AUTH.disposition.choix.some(([v]) => v === config.disposition)) config.disposition = 'centree';
  if (!CHAMPS_PAGES_AUTH.fond.choix.some(([v]) => v === config.fond)) config.fond = 'degrade';
  if (!/^#[0-9a-f]{6}$/i.test(config.couleur_accent)) config.couleur_accent = m.couleur_accent;
  return config;
}

// Marque à afficher (logo, monogramme, nom, sous-titre) d'après le contenu effectif.
export function marqueAuth(config) {
  return marqueValide(Object.fromEntries([...IDENTITE, 'favicon_url'].map((k) => [k, config[k] || null])));
}

// Remplace {nom}, {compte}, {editeur}, {logiciel}, {annee}. Le résultat est toujours affiché comme texte.
export function texteAuth(config, cle, variables = {}) {
  const valeurs = { editeur: config.nom_editeur || 'Agence Elite', logiciel: config.nom_logiciel, annee: String(new Date().getFullYear()), ...variables };
  return String(config[cle] ?? '').replace(/\{(nom|compte|editeur|logiciel|annee)\}/g, (_, v) => valeurs[v] ?? '').replace(/ {2,}/g, ' ').trim();
}

// Couleurs d'accent en variables CSS (appliquées à un conteneur, sans toucher au document).
export function variablesAccent(couleur) {
  return {
    '--accent': couleur,
    '--accent-fort': melanger(couleur, '#000000', 0.18),
    '--accent-doux': melanger(couleur, '#ffffff', 0.9),
    '--bleu-doux': melanger(couleur, '#ffffff', 0.9),
  };
}

// Liens du pied de page : seulement ceux qui ont un texte et une adresse sûre.
export function liensAuth(config) {
  return [1, 2, 3]
    .map((n) => ({ libelle: config[`lien_${n}_libelle`], url: config[`lien_${n}_url`] }))
    .filter((x) => x.libelle && /^(https:\/\/|mailto:|tel:)/.test(x.url ?? ''));
}
