import React from 'react';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import App from '../src/App.jsx';
import { pagesAccessibles, PAGES } from '../src/modules/index.js';
import { listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { creerApiLocale } from '../src/noyau/donnees/moteurLocal.js';
import { formatMontant, formatQuantite } from '../src/noyau/format.js';
import { creerClientSupabase } from '../src/noyau/supabase.js';
import { creerBaseLocale } from './helpers/locale.js';

afterEach(cleanup);

describe('formats', () => {
  test('les montants en FCFA sont arrondis', () => {
    expect(formatMontant(12500.4).replace(/\s/g, ' ')).toBe('12 500 FCFA');
    expect(formatQuantite(2.5)).toContain('2,5');
  });
});

describe('registre des écrans', () => {
  test('une page exige module actif et permission', () => {
    const espace = (modules, permissions) => ({ moduleActif: (m) => modules.includes(m), peut: (p) => permissions.includes(p) });
    expect(pagesAccessibles(espace(['caisse'], ['caisse.utiliser'])).map((p) => p.id)).toEqual(['caisse']);
    expect(pagesAccessibles(espace([], ['caisse.utiliser']))).toEqual([]);
    expect(pagesAccessibles(espace(PAGES.map((p) => p.module), PAGES.map((p) => p.permission)))).toHaveLength(PAGES.length);
  });
});

describe('configuration Supabase locale', () => {
  test('reste désactivée sans variables', () => expect(creerClientSupabase({})).toBeNull());
  test('refuse toute URL distante sans accord explicite', () => expect(() => creerClientSupabase({ VITE_SUPABASE_URL: 'https://projet.supabase.co', VITE_SUPABASE_ANON_KEY: 'fictive' })).toThrow(/locale/));
  test('accepte une instance hébergée seulement avec l’accord du déploiement', () => {
    expect(creerClientSupabase({ VITE_SUPABASE_URL: 'https://projet.supabase.co', VITE_SUPABASE_ANON_KEY: 'fictive', VITE_AUTORISER_SUPABASE_DISTANT: 'oui' })).toBeTruthy();
    expect(() => creerClientSupabase({ VITE_SUPABASE_URL: 'https://pirate.example.com', VITE_SUPABASE_ANON_KEY: 'fictive', VITE_AUTORISER_SUPABASE_DISTANT: 'oui' })).toThrow();
  });
});

describe('application sur la base locale', () => {
  let db;
  let comptes;
  beforeAll(async () => {
    db = await creerBaseLocale();
    await semerDemo(db);
    comptes = await listerComptesDemo(db);
  }, 60000);
  afterAll(async () => db.close());

  function demarrer(email) {
    let utilisateur = email ? comptes.find((c) => c.email === email).id : null;
    const api = creerApiLocale(db, () => utilisateur);
    return async () => ({
      ...api,
      comptes: async () => comptes,
      utilisateur: () => utilisateur,
      connecter: async (id) => { utilisateur = id; },
      deconnecter: async () => { utilisateur = null; },
      demanderReinitialisation: async () => {},
      reinitialiser: async () => {},
    });
  }

  test('l\'écran de connexion propose les profils de démo', async () => {
    render(<App demarrer={demarrer(null)} />);
    expect(await screen.findByText(/Mireille/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Junior/));
    expect(await screen.findAllByText('Caisse')).toBeTruthy();
  });

  test('le caissier ne voit ni dépenses ni paramètres de gestion', async () => {
    window.location.hash = '';
    render(<App demarrer={demarrer('caisse-marche@demo.agence-elite.fr')} />);
    await waitFor(() => expect(screen.getAllByText('Caisse').length).toBeGreaterThan(0));
    expect(screen.queryByText('Dépenses')).toBeNull();
  });

  test('le gérant voit le tableau de bord avec le chiffre du jour', async () => {
    window.location.hash = '#/tableau-de-bord';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect((await screen.findAllByText('Chiffre d’affaires', {}, { timeout: 10000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Commerce Démo/).length).toBeGreaterThan(0);
    // Plusieurs Hubs : le sélecteur apparaît et le tableau « Par Hub » détaille chaque lieu.
    expect(screen.getAllByLabelText('Hub').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Boutique Marché Total')).length).toBeGreaterThan(0);
  });

  test('un compte au mot de passe temporaire ne voit que l’écran de nouveau mot de passe', async () => {
    window.location.hash = '#/tableau-de-bord';
    render(<App demarrer={demarrer('patrondemo@identifiants.agence-elite.fr')} />);
    expect(await screen.findByText('Créer votre nouveau mot de passe')).toBeTruthy();
    expect(screen.queryByText('Tableau de bord')).toBeNull();
    expect(screen.getByLabelText(/^Nouveau mot de passe/)).toBeTruthy();
    expect(screen.getByLabelText('Confirmer le mot de passe')).toBeTruthy();
  });

  test('un caissier limité à un Hub ne voit aucune notion de Hub', async () => {
    window.location.hash = '#/caisse';
    render(<App demarrer={demarrer('caisse-marche@demo.agence-elite.fr')} />);
    await waitFor(() => expect(screen.getAllByText('Caisse').length).toBeGreaterThan(0));
    expect(screen.queryByLabelText('Hub')).toBeNull();
    expect(screen.queryByText('Transferts')).toBeNull();
  });

  test('RH : le caissier pointe son arrivée depuis son espace', async () => {
    window.location.hash = '#/mon-espace';
    render(<App demarrer={demarrer('caisse-marche@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Bonjour Junior', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText('Employés')).toBeNull();
    fireEvent.click(screen.getByText('Pointer mon arrivée'));
    expect(await screen.findByText(/^Arrivé à/)).toBeTruthy();
    expect(screen.getByText('Pointer mon départ')).toBeTruthy();
  });

  test('RH : la gérante parcourt employés, fiche, congés, présences et documents', async () => {
    window.location.hash = '#/employes';
    const { unmount } = render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect((await screen.findAllByText('Sandra Tchibinda', {}, { timeout: 10000 })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText('Sandra Tchibinda')[0]);
    expect(await screen.findByText('Contrat en cours')).toBeTruthy();
    expect(screen.getAllByText('Chef de boutique').length).toBeGreaterThan(0);
    unmount();
    window.location.hash = '#/conges';
    const conges = render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Grâce Loubaki', {}, { timeout: 10000 })).toBeTruthy();
    conges.unmount();
    window.location.hash = '#/presences';
    const presences = render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Non pointés', {}, { timeout: 10000 })).toBeTruthy();
    presences.unmount();
    window.location.hash = '#/documents';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Procédures', {}, { timeout: 10000 })).toBeTruthy();
  });

  test('RH : le tableau de bord de la gérante affiche la synthèse RH', async () => {
    window.location.hash = '#/tableau-de-bord/rh';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Tableau RH', {}, { timeout: 10000 })).toBeTruthy();
    expect((await screen.findAllByText('Effectif', {}, { timeout: 10000 })).length).toBeGreaterThan(0);
  });

  test('Facturation : liste, document A4 et éditeur', async () => {
    window.location.hash = '#/factures';
    const liste = render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('En retard', { selector: 'span, div, p' }, { timeout: 10000 }).catch(() => screen.findAllByText('En retard'))).toBeTruthy();
    fireEvent.click((await screen.findAllByText('FA-00001'))[0]);
    expect(await screen.findByText('Paiements', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getAllByText('Hôtel Démo Côte Sauvage').length).toBeGreaterThan(0);
    liste.unmount();
    window.location.hash = '#/factures/nouvelle-facture';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Ajouter une ligne', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText('Enregistrer le brouillon')).toBeTruthy();
  });

  test('Trésorerie : facture contestée, relevé client, crédit client, dépense à valider, export comptable', async () => {
    window.location.hash = '#/factures?onglet=retards';
    const liste = render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Contesté', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Relevé client/ }));
    fireEvent.change(await screen.findByLabelText('Client'), { target: { value: screen.getByRole('option', { name: 'École Démo Les Palmiers' }).value } });
    expect(await screen.findByText(/Crédit client disponible/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText('Solde d’ouverture')).toBeTruthy();
    liste.unmount();
    window.location.hash = '#/depenses';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Réparation du congélateur', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeTruthy();
  });

  test('Données personnelles : export et anonymisation proposés au gérant, contact anonymisé signalé', async () => {
    window.location.hash = '#/contacts';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    fireEvent.click(await screen.findByText('M. Ibara (économat)', {}, { timeout: 10000 }));
    expect(await screen.findByRole('button', { name: 'Exporter ses données' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser' }));
    expect(await screen.findByText(/Tapez ANONYMISER pour confirmer/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Anonymiser définitivement' }).disabled).toBe(true);
  });

  test('Achats : liste, commande et réception', async () => {
    window.location.hash = '#/achats';
    const liste = render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Dû aux fournisseurs', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Toutes/ }));
    fireEvent.click((await screen.findAllByText('BC-00002'))[0]);
    expect(await screen.findByText('Réceptions', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByText('Réceptionner'));
    expect(await screen.findByText('Valider la réception')).toBeTruthy();
    liste.unmount();
    window.location.hash = '#/achats/nouveau';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Ajouter un article', {}, { timeout: 10000 })).toBeTruthy();
  });

  test('CRM : pipeline, fiche opportunité et étapes', async () => {
    window.location.hash = '#/crm';
    const vue = render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Pipeline en cours', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Pipeline commercial' })).toBeTruthy();
    fireEvent.click(screen.getByText('Fournitures de la cantine (trimestre)'));
    expect(await screen.findByText('Rendez-vous avec l’économe'.replace('’', "'"), {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Étape du pipeline' })).toBeTruthy();
    expect(await screen.findByText('Score 75 %', {}, { timeout: 10000 })).toBeTruthy();
    expect(await screen.findByText('M. Ibara')).toBeTruthy();
    vue.unmount();
    window.location.hash = '#/crm/reglages';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Étapes et questions', {}, { timeout: 10000 })).toBeTruthy();
    expect(await screen.findByText('Le budget est confirmé', {}, { timeout: 10000 })).toBeTruthy();
  });

  test('Projets : liste, fiche avec tâches en colonnes, saisie de temps', async () => {
    window.location.hash = '#/projets';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    fireEvent.click(await screen.findByText('Mini-boutique du hall de l’hôtel'.replace('’', "'"), {}, { timeout: 10000 }));
    expect(await screen.findByText('Installer le présentoir', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Tâches' })).toBeTruthy();
    fireEvent.click(screen.getByText('Saisir du temps'));
    expect(await screen.findByText('Ce qui a été fait')).toBeTruthy();
  });

  test('Restaurant : plan de salle, commande de table, écran cuisine', async () => {
    window.location.hash = '#/salle';
    const vue = render(<App demarrer={demarrer('resto@demo.agence-elite.fr')} />);
    fireEvent.click(await screen.findByRole('button', { name: /Table T1, occupée/ }, { timeout: 10000 }));
    expect(await screen.findByText(/Bien pimenté/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/Envoyer \(1\)/)).toBeTruthy();
    vue.unmount();
    window.location.hash = '#/cuisine';
    render(<App demarrer={demarrer('cuisine@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Table Terrasse 1', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getAllByText('Commencer').length).toBeGreaterThan(0);
  });

  test('Restaurant : serveur sur chaque table, filtres, affectation et catégories d’articles', async () => {
    window.location.hash = '#/salle';
    const vue = render(<App demarrer={demarrer('resto@demo.agence-elite.fr')} />);
    expect(await screen.findByRole('button', { name: /Table T1, occupée.*serveur/ }, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mes tables' }));
    expect(await screen.findByText('Aucune table ne vous est affectée pour le moment.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Toutes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Affecter les serveurs' }));
    fireEvent.click(screen.getByRole('button', { name: /^Table T2,/ }));
    expect(await screen.findByText('Historique de la table')).toBeTruthy();
    expect(screen.getAllByRole('option', { name: /Rodrigue/ }).length).toBeGreaterThan(0);
    vue.unmount();
    window.location.hash = '#/articles';
    render(<App demarrer={demarrer('resto@demo.agence-elite.fr')} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Catégories' }, { timeout: 10000 }));
    expect(await screen.findByRole('button', { name: 'Nouvelle catégorie' })).toBeTruthy();
    expect(screen.getAllByText(/article\(s\)/).length).toBeGreaterThan(0);
  });

  test('Hôtel : réception, planning, fiche de séjour, entretien', async () => {
    window.location.hash = '#/hotel';
    const vue = render(<App demarrer={demarrer('reception@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Famille Massamba', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Planning/ }));
    expect(screen.getByRole('table', { name: 'Planning des chambres' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Aujourd/ }));
    fireEvent.click(screen.getByText('Mme Loemba'));
    expect(await screen.findByText('Départ et facture', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/Minibar : eau 50 cl/)).toBeTruthy();
    vue.unmount();
    window.location.hash = '#/chambres';
    render(<App demarrer={demarrer('menage@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Climatisation en réparation', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getAllByText('Commencer').length).toBe(1);
  });

  test('E-commerce : commandes reçues, fiche, boutique publique et commande d’un visiteur', async () => {
    window.location.hash = '#/boutique';
    const vue = render(<App demarrer={demarrer('boutique@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Mireille T. (démo)', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByText('Mireille T. (démo)'));
    expect(await screen.findByText('Appeler avant de passer', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeTruthy();
    vue.unmount();
    window.location.hash = '#/commander/demo-boutique';
    render(<App demarrer={demarrer(null)} />);
    expect(await screen.findByText('Elite Mode (démo)', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'L' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter Sac en raphia au panier' }));
    fireEvent.click(screen.getByRole('button', { name: /Panier : 1/ }));
    fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Visiteur Test' } });
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '+242 06 777 88 99' } });
    fireEvent.change(screen.getByLabelText('Remise'), { target: { value: 'retrait' } });
    fireEvent.click(screen.getByRole('button', { name: 'Commander' }));
    expect(await screen.findByText(/Merci, commande CW-/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/#\/suivi\//)).toBeTruthy();
  });

  test('Site web : pages, éditeur par blocs, messages ; site public et formulaire', async () => {
    window.location.hash = '#/siteweb';
    const vue = render(<App demarrer={demarrer('boutique@demo.agence-elite.fr')} />);
    expect(await screen.findByText('À propos', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText('Brouillon')).toBeTruthy();
    fireEvent.click(screen.getByText('Nos services'));
    expect((await screen.findAllByText('Questions fréquentes', {}, { timeout: 10000 })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Texte' }));
    expect(screen.getByText('Modifications non enregistrées.')).toBeTruthy();
    vue.unmount();
    window.location.hash = '#/site/demo-site/contact';
    render(<App demarrer={demarrer(null)} />);
    expect(await screen.findByText('Nous écrire', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Menu du site' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Visiteur Test' } });
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '+242 06 999 00 11' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByText(/votre message est envoyé/, {}, { timeout: 10000 })).toBeTruthy();
  });

  test('Agenda, Support et Abonnements : semaine, liste, ticket avec échanges, abonnés et périodes', async () => {
    window.location.hash = '#/agenda';
    let vue = render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByRole('tab', { name: /Liste/ }, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Liste/ }));
    expect(await screen.findByText('Mme Ngoma (démo)', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByText('Mme Ngoma (démo)'));
    expect(await screen.findByText(/Présentation des nouveautés/, {}, { timeout: 10000 })).toBeTruthy();
    vue.unmount();
    window.location.hash = '#/support';
    vue = render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    fireEvent.click(await screen.findByText("Commande de l'hôtel incomplète", {}, { timeout: 10000 }));
    expect(await screen.findByText('Échanges', {}, { timeout: 10000 })).toBeTruthy();
    expect(await screen.findByText(/Vérifier le bon de livraison/, {}, { timeout: 10000 })).toBeTruthy();
    vue.unmount();
    window.location.hash = '#/abonnements';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Réassort mensuel hôtel', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Périodes facturées/ }));
    expect((await screen.findAllByText(/AB-/, {}, { timeout: 10000 })).length).toBe(3);
  });

  test('Rapports : indicateurs, analyse par article avec marge, par Hub', async () => {
    window.location.hash = '#/rapports';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Marge brute', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Analyse'), { target: { value: 'article' } });
    expect(await screen.findByText('Riz parfumé 25 kg', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exporter/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Analyse'), { target: { value: 'hub' } });
    expect(await screen.findByRole('cell', { name: 'Dépôt principal' }, { timeout: 10000 })).toBeTruthy();
  });

  test('Fidélité : soldes, fiche client avec historique, utilisation de points', async () => {
    window.location.hash = '#/fidelite';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    fireEvent.click(await screen.findByText('Client fidèle Démo', {}, { timeout: 10000 }));
    expect(await screen.findByText('Reprise de la carte de fidélité papier', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Points à utiliser/), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/Récompense accordée/), { target: { value: 'Savon offert' } });
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser les points' }));
    expect(await screen.findByText('100 points utilisés', {}, { timeout: 10000 })).toBeTruthy();
  });

  test('Paramètres › Réglages des modules : chaque application active expose ses réglages', async () => {
    window.location.hash = '#/parametres?onglet=reglages';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    const formulaire = await screen.findByRole('form', { name: 'Réglages Support et demandes' }, { timeout: 10000 });
    const champ = within(formulaire).getByLabelText(/priorité urgente/);
    expect(champ.value).toBe('2');
    fireEvent.change(champ, { target: { value: '1' } });
    fireEvent.click(within(formulaire).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Réglages Support et demandes enregistrés', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Réglages Devis et factures' })).toBeTruthy();
  });

  test('le super administrateur arrive sur le tableau de bord Agence Elite', async () => {
    window.location.hash = '#/editeur';
    render(<App demarrer={demarrer('editeur@demo.local')} />);
    expect(await screen.findByText('Activité contractuelle', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText(/encaissé/i)).toBeNull();
    expect(screen.getByText('Échéances à surveiller')).toBeTruthy();
    expect(screen.getByText('Catalogue')).toBeTruthy();
  });

  test('pages d’authentification : brouillon invisible, aperçu, publication, injection refusée, retour aux valeurs par défaut', async () => {
    window.location.hash = '#/editeur/identite/auth';
    const editeur = render(<App demarrer={demarrer('editeur@demo.local')} />);
    expect(await screen.findByText('Pages à modifier', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(await screen.findByRole('tab', { name: 'Textes' }, { timeout: 10000 }));
    const titre = await screen.findByPlaceholderText('Connexion');
    // Injection : refusée par la base, rien n'est enregistré.
    fireEvent.change(titre, { target: { value: '<script>alert(1)</script>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await screen.findByText(/Texte refusé/, {}, { timeout: 10000 })).toBeTruthy();
    // Brouillon : visible dans l'aperçu, pas sur l'écran de connexion.
    fireEvent.change(screen.getByPlaceholderText('Connexion'), { target: { value: 'Bienvenue chez Élégance' } });
    const apercu = screen.getByLabelText('Aperçu de la page');
    expect(within(apercu).getByRole('heading', { name: 'Bienvenue chez Élégance' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Téléphone' }));
    expect(apercu.className).toContain('mobile');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await screen.findByText('Brouillon enregistré', {}, { timeout: 10000 })).toBeTruthy();
    editeur.unmount();
    window.location.hash = '';
    const avant = render(<App demarrer={demarrer(null)} />);
    expect(await screen.findByRole('heading', { name: 'Connexion' }, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText('Bienvenue chez Élégance')).toBeNull();
    avant.unmount();
    // Publication : appliquée sans redéploiement.
    window.location.hash = '#/editeur/identite/auth';
    const publication = render(<App demarrer={demarrer('editeur@demo.local')} />);
    expect(await screen.findByText('Brouillon non publié', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publier' }));
    expect(await screen.findByText(/Pages publiées/, {}, { timeout: 10000 })).toBeTruthy();
    publication.unmount();
    window.location.hash = '';
    const apres = render(<App demarrer={demarrer(null)} />);
    expect(await screen.findByRole('heading', { name: 'Bienvenue chez Élégance' }, { timeout: 10000 })).toBeTruthy();
    apres.unmount();
    // Retour aux valeurs par défaut, puis publication.
    window.location.hash = '#/editeur/identite/auth';
    const retour = render(<App demarrer={demarrer('editeur@demo.local')} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Publication' }, { timeout: 10000 }));
    expect(screen.getAllByText(/Publication \(v1\)/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Revenir aux valeurs par défaut' }));
    expect(await screen.findByText(/valeurs par défaut : publiez/, {}, { timeout: 10000 })).toBeTruthy();
    expect(await screen.findByText('Brouillon non publié', {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publier' }));
    expect(await screen.findByText(/Pages publiées/, {}, { timeout: 10000 })).toBeTruthy();
    retour.unmount();
    const fin = render(<App demarrer={demarrer(null)} />);
    expect(await screen.findByRole('heading', { name: 'Connexion' }, { timeout: 10000 })).toBeTruthy();
    fin.unmount();
  }, 60000);

  test('mot de passe oublié et session expirée', async () => {
    window.location.hash = '';
    localStorage.setItem('ae-session-ouverte', '1');
    render(<App demarrer={demarrer(null)} />);
    expect(await screen.findByText('Session expirée', {}, { timeout: 10000 })).toBeTruthy();
    expect(localStorage.getItem('ae-session-ouverte')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    expect(screen.getByRole('heading', { name: 'Mot de passe oublié' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'awa@exemple.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le lien' }));
    expect(await screen.findByText(/un e-mail vient d’être envoyé/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeTruthy();
  });
});

describe('message d’invitation', () => {
  test('explique comment créer son mot de passe et pré-remplit l’adresse', async () => {
    const { messageInvitation } = await import('../src/modules/etablissement/Equipe.jsx');
    const texte = messageInvitation({ etablissement: 'Boutique Test', email: 'awa@exemple.test', role: 'gerant' });
    expect(texte).toContain('#/invitation?email=awa%40exemple.test');
    expect(texte).toContain('choisissez votre mot de passe');
    expect(texte).toContain('Responsable d’établissement');
  });
});
