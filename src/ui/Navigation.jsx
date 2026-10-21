import React, { useEffect } from 'react';
import { useEspace } from '../noyau/espace.jsx';
import { basculerFavori, MAX_FAVORIS, useMenuEssentiel } from '../noyau/menuEssentiel.js';
import { useRoute } from '../noyau/routes.js';
import { pagesAccessibles } from '../modules/index.js';
import { Icone } from './composants.jsx';

// Navigation (Elite UX 2.0) : favoris, retour, barre d'onglets du téléphone, raccourcis Alt+chiffre.
// Rien ne change dans les droits : chaque élément vient des pages déjà autorisées (registre des modules).

// Écrans proposés dans la barre du bas du téléphone, dans cet ordre, après les favoris.
const PRIORITE_TELEPHONE = ['accueil', 'caisse', 'salle', 'hotel', 'ventes', 'tableau-de-bord', 'articles', 'stock', 'factures', 'contacts'];
const PLACES_TELEPHONE = 4;

export function ongletsTelephone(pages, favoris = []) {
  const parId = new Map(pages.map((p) => [p.id, p]));
  const ordre = [...favoris, ...PRIORITE_TELEPHONE, ...pages.map((p) => p.id)];
  return [...new Set(ordre)].map((id) => parId.get(id)).filter(Boolean).slice(0, PLACES_TELEPHONE);
}

// Groupe « Favoris » en tête du menu latéral (seulement les écrans encore accessibles).
export function MenuFavoris({ pages, pageActive, aller }) {
  const { favoris } = useMenuEssentiel();
  const liste = favoris.map((id) => pages.find((p) => p.id === id)).filter(Boolean);
  if (!liste.length) return null;
  return (
    <div className="menu-groupe menu-favoris">
      <span className="menu-groupe-titre">Favoris</span>
      {liste.map((p) => (
        <button key={p.id} className={p.id === pageActive ? 'actif' : ''} aria-current={p.id === pageActive ? 'page' : undefined} onClick={() => aller(p.id)}>
          <Icone nom={p.icone} />
          <span>{p.libelle}</span>
        </button>
      ))}
    </div>
  );
}

// Étoile de la barre du haut : épingler l'écran affiché dans les favoris.
export function BoutonFavori() {
  const espace = useEspace();
  const [route] = useRoute();
  const { favoris } = useMenuEssentiel();
  if (!espace.etablissement) return null;
  const id = route.split('/')[0];
  const page = pagesAccessibles(espace).find((p) => p.id === id);
  if (!page) return null;
  const actif = favoris.includes(id);
  const plein = !actif && favoris.length >= MAX_FAVORIS;
  const libelle = actif ? `Retirer « ${page.libelle} » des favoris` : plein ? `Favoris complets (${MAX_FAVORIS})` : `Ajouter « ${page.libelle} » aux favoris`;
  return (
    <button
      type="button"
      className={`icone-bouton bouton-favori ${actif ? 'actif' : ''}`}
      aria-pressed={actif}
      aria-label={libelle}
      title={libelle}
      disabled={plein}
      onClick={() => basculerFavori(id)}
    >
      <Icone nom="etoile" />
    </button>
  );
}

// Retour à l'écran parent depuis une sous-page (#/employes/<id> → #/employes).
export function BoutonRetour({ naviguer }) {
  const [route] = useRoute();
  const segments = route.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const parent = segments.slice(0, -1).join('/');
  return (
    <button type="button" className="icone-bouton bouton-retour" aria-label="Revenir à l’écran précédent" title="Retour" onClick={() => naviguer(parent)}>
      <Icone nom="retour" />
    </button>
  );
}

// Barre du bas du téléphone : 4 écrans (favoris d'abord) + « Menu ». Cachée sur les écrans plein écran (caisse),
// qui ont leur propre barre d'encaissement.
export function BarreOngletsMobile({ pages, pageActive, aller, onMenu }) {
  const { favoris } = useMenuEssentiel();
  const onglets = ongletsTelephone(pages, favoris);
  if (!onglets.length) return null;
  return (
    <nav className="onglets-mobile" aria-label="Écrans principaux">
      {onglets.map((p) => (
        <button key={p.id} type="button" className={p.id === pageActive ? 'actif' : ''} aria-current={p.id === pageActive ? 'page' : undefined} onClick={() => aller(p.id)}>
          <Icone nom={p.icone} />
          <span>{p.libelle}</span>
        </button>
      ))}
      <button type="button" onClick={onMenu} aria-label="Tout le menu">
        <Icone nom="menu" />
        <span>Menu</span>
      </button>
    </nav>
  );
}

// Alt + 1…9 : ouvre le n-ième écran du menu (touches physiques, quelle que soit la disposition du clavier).
export function useRaccourcisNavigation(pages, aller, actif = true) {
  useEffect(() => {
    if (!actif) return undefined;
    const ecoute = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || document.querySelector('[role="dialog"]')) return;
      const chiffre = /^Digit([1-9])$/.exec(e.code)?.[1];
      if (!chiffre) return;
      const page = pages[Number(chiffre) - 1];
      if (!page) return;
      e.preventDefault();
      aller(page.id);
    };
    window.addEventListener('keydown', ecoute);
    return () => window.removeEventListener('keydown', ecoute);
  }, [pages, aller, actif]);
}
