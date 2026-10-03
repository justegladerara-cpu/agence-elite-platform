import React from 'react';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByLabelText('Hub')).toBeTruthy();
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
    window.location.hash = '#/tableau-de-bord';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Ressources humaines', { selector: 'h2' }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText('Effectif actif')).toBeTruthy();
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
    vue.unmount();
    window.location.hash = '#/crm/reglages';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Étapes du pipeline', {}, { timeout: 10000 })).toBeTruthy();
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

  test('le super administrateur arrive sur le tableau de bord Agence Elite', async () => {
    window.location.hash = '#/editeur';
    render(<App demarrer={demarrer('editeur@demo.local')} />);
    expect(await screen.findByText('Activité contractuelle', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText(/encaissé/i)).toBeNull();
    expect(screen.getByText('Échéances à surveiller')).toBeTruthy();
    expect(screen.getByText('Catalogue')).toBeTruthy();
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
