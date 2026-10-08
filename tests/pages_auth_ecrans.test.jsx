// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { ApercuPageAuth, messageConnexion } from '../src/auth/EcransAuth.jsx';
import { configAuth, liensAuth, PAGES_AUTH, texteAuth } from '../src/noyau/pagesAuth.js';

afterEach(cleanup);

describe('contenu effectif', () => {
  test('valeurs du code, puis identité, puis contenu publié ; clés inconnues ignorées', () => {
    const c = configAuth({
      marque: { nom_logiciel: 'Élégance Gestion', nom_court: 'EG', couleur_accent: '#15803d' },
      contenu: { sous_titre: 'Votre espace de gestion', connexion_titre: '', css: 'body{}', disposition: 'inconnue' },
    });
    expect([c.nom_logiciel, c.nom_court, c.sous_titre, c.couleur_accent]).toEqual(['Élégance Gestion', 'EG', 'Votre espace de gestion', '#15803d']);
    expect(c.connexion_titre).toBe('Connexion');
    expect(c).not.toHaveProperty('css');
    expect(c.disposition).toBe('centree');
    expect(texteAuth(c, 'copyright')).toBe(`© ${new Date().getFullYear()} Élégance Gestion`);
    expect(texteAuth({ ...c, premiere_intro: 'Bonjour {nom}, {inconnu}' }, 'premiere_intro', { nom: 'Awa' })).toBe('Bonjour Awa, {inconnu}');
  });

  test('liens : seulement https, mailto et tel', () => {
    const c = configAuth({ contenu: { lien_1_libelle: 'Aide', lien_1_url: 'javascript:alert(1)', lien_2_libelle: 'Site', lien_2_url: 'https://exemple.cg' } });
    expect(liensAuth(c)).toEqual([{ libelle: 'Site', url: 'https://exemple.cg' }]);
  });

  test('états connus de connexion : texte réglé', () => {
    const c = configAuth({ contenu: { bloque_texte: 'Patientez un peu.' } });
    expect(messageConnexion(c, new Error('Trop de tentatives : réessayez dans quelques minutes'))).toBe('Patientez un peu.');
    expect(messageConnexion(c, new Error('User is banned'))).toBe('Ce compte est désactivé. Contactez Agence Elite.');
    expect(messageConnexion(c, new Error('Identifiant ou mot de passe incorrect'))).toBe('Identifiant ou mot de passe incorrect');
  });
});

describe('aperçu des pages', () => {
  test('chaque page existe et s’affiche', () => {
    for (const p of PAGES_AUTH) {
      const { unmount, container } = render(<ApercuPageAuth page={p.id} config={configAuth()} />);
      expect(container.querySelector('.connexion-carte')).toBeTruthy();
      unmount();
    }
  });

  test('sans logo : monogramme ; textes longs et caractères spéciaux affichés tels quels, jamais interprétés', () => {
    const long = 'Très long titre '.repeat(5).trim();
    const { container } = render(
      <ApercuPageAuth
        page="connexion"
        config={configAuth({ marque: { nom_court: 'ÇA' }, contenu: { connexion_titre: long, connexion_intro: '<img src=x onerror=alert(1)> & « guillemets »\nligne 2' } })}
      />,
    );
    expect(screen.getByRole('heading', { name: long })).toBeTruthy();
    expect(screen.getAllByText('ÇA').length).toBeGreaterThan(0);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)> & « guillemets »');
  });

  test('image de fond non sûre ignorée ; disposition partagée avec accroche', () => {
    const { container } = render(
      <ApercuPageAuth page="connexion" config={configAuth({ contenu: { fond: 'image', image_fond: 'https://x.cg/a.png") ; color:red', disposition: 'partagee', accroche: 'Gérez tout au même endroit' } })} />,
    );
    const ecran = container.querySelector('.auth');
    expect(ecran.className).toContain('auth-fond-degrade');
    expect(ecran.style.backgroundImage).toBe('');
    expect(screen.getByText('Gérez tout au même endroit')).toBeTruthy();
  });
});
