import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { actionsAccessibles, correspond, LIBELLES_RESULTATS, score } from '../noyau/actionsRapides.js';
import { useEspace } from '../noyau/espace.jsx';
import { pagesAccessibles } from '../modules/index.js';
import { Icone } from './composants.jsx';

// Palette universelle (Ctrl+K, « / » ou bouton loupe) : aller à un écran, créer, ou retrouver une donnée de
// l'établissement actif. Les données viennent de la fonction recherche_universelle (droits et Hubs vérifiés par la
// base) ; si elle n'existe pas encore en base, seuls écrans et créations sont proposés.
export function Palette({ mode = 'tout', onFermer, naviguer }) {
  const espace = useEspace();
  const { api, etablissement } = espace;
  const [texte, setTexte] = useState('');
  const [donnees, setDonnees] = useState({ texte: '', liste: [], chargement: false, indisponible: false });
  const [actif, setActif] = useState(0);
  const champ = useRef(null);
  const liste = useRef(null);
  const pages = useMemo(() => pagesAccessibles(espace), [espace]);
  const actions = useMemo(() => actionsAccessibles(espace), [espace]);

  useEffect(() => { champ.current?.focus(); }, []);

  // Données : recherche côté serveur, 250 ms après la dernière frappe.
  useEffect(() => {
    const t = texte.trim();
    if (mode === 'creer' || t.length < 2 || !etablissement || donnees.indisponible) {
      setDonnees((d) => ({ ...d, texte: t, liste: [], chargement: false }));
      return undefined;
    }
    let actifEffet = true;
    setDonnees((d) => ({ ...d, chargement: true }));
    const minuterie = setTimeout(() => {
      api.rpc('recherche_universelle', { p_etablissement_id: etablissement.id, p_texte: t, p_limite: 5 })
        .then((r) => actifEffet && setDonnees((d) => ({ ...d, texte: t, liste: r ?? [], chargement: false })))
        .catch(() => actifEffet && setDonnees((d) => ({ ...d, texte: t, liste: [], chargement: false, indisponible: true })));
    }, 250);
    return () => {
      actifEffet = false;
      clearTimeout(minuterie);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texte, mode, etablissement?.id]);

  const elements = useMemo(() => {
    const t = texte.trim();
    const lignes = [];
    if (mode !== 'creer') {
      const trouvees = t ? pages.filter((x) => correspond(t, x.libelle, x.groupe)).sort((a, b) => score(t, b.libelle) - score(t, a.libelle)) : pages;
      for (const p of trouvees.slice(0, t ? 6 : 8)) {
        lignes.push({ cle: `page-${p.id}`, groupe: 'Aller à', libelle: p.libelle, detail: p.groupe, icone: p.icone, route: p.id });
      }
    }
    const actionsTrouvees = t ? actions.filter((x) => correspond(t, x.libelle, x.mots)).sort((a, b) => score(t, b.libelle) - score(t, a.libelle)) : actions;
    for (const a of actionsTrouvees.slice(0, mode === 'creer' ? 20 : 4)) {
      lignes.push({ cle: `action-${a.id}`, groupe: 'Créer', libelle: a.libelle, icone: a.icone ?? 'plus', route: a.route });
    }
    if (mode !== 'creer') {
      for (const d of donnees.liste) {
        lignes.push({ cle: `${d.type}-${d.id}`, groupe: LIBELLES_RESULTATS[d.type] ?? 'Résultat', libelle: d.libelle, detail: d.detail, icone: 'recherche', route: d.route });
      }
    }
    return lignes;
  }, [texte, pages, actions, donnees.liste, mode]);

  useEffect(() => setActif(0), [texte, donnees.liste]);
  useEffect(() => {
    liste.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [actif]);

  const ouvrir = (element) => {
    if (!element) return;
    onFermer();
    naviguer(element.route);
  };
  const touche = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((i) => Math.min(i + 1, elements.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); ouvrir(elements[actif]); }
    else if (e.key === 'Escape') { e.preventDefault(); onFermer(); }
  };

  let groupePrecedent = null;
  const t = texte.trim();
  return createPortal(
    <div className="voile voile-palette" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={mode === 'creer' ? 'Créer' : 'Rechercher'}>
        <div className="palette-saisie">
          <Icone nom={mode === 'creer' ? 'plus' : 'recherche'} />
          <input
            ref={champ}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={touche}
            placeholder={mode === 'creer' ? 'Que voulez-vous créer ?' : 'Rechercher un écran, un article, un client, une facture…'}
            aria-label={mode === 'creer' ? 'Que voulez-vous créer ?' : 'Rechercher partout'}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-resultats"
            aria-activedescendant={elements[actif] ? `palette-${elements[actif].cle}` : undefined}
          />
          <kbd>Échap</kbd>
        </div>
        <div className="palette-resultats" id="palette-resultats" role="listbox" ref={liste}>
          {elements.map((el, i) => {
            const titre = el.groupe !== groupePrecedent ? <div className="palette-groupe" role="presentation">{el.groupe}</div> : null;
            groupePrecedent = el.groupe;
            return (
              <React.Fragment key={el.cle}>
                {titre}
                <div
                  id={`palette-${el.cle}`}
                  role="option"
                  aria-selected={i === actif}
                  className={`palette-ligne ${i === actif ? 'active' : ''}`}
                  onMouseEnter={() => setActif(i)}
                  onMouseDown={(e) => { e.preventDefault(); ouvrir(el); }}
                >
                  <Icone nom={el.icone} taille={16} />
                  <span className="palette-libelle">{el.libelle}</span>
                  {el.detail && <small className="texte-doux">{el.detail}</small>}
                </div>
              </React.Fragment>
            );
          })}
          {donnees.chargement && t.length >= 2 && <p className="palette-note texte-doux">Recherche dans vos données…</p>}
          {!donnees.chargement && t.length >= 2 && !elements.length && (
            <p className="palette-note texte-doux">Aucun résultat pour « {t} ». Essayez un autre mot, un numéro ou un téléphone.</p>
          )}
          {mode !== 'creer' && t.length === 1 && <p className="palette-note texte-doux">Tapez au moins 2 lettres pour chercher dans vos données.</p>}
          {donnees.indisponible && t.length >= 2 && <p className="palette-note texte-doux">La recherche dans les données n’est pas encore active ici : seuls les écrans sont proposés.</p>}
        </div>
        <div className="palette-pied texte-doux">
          <span><kbd>↑</kbd><kbd>↓</kbd> choisir</span>
          <span><kbd>Entrée</kbd> ouvrir</span>
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> rechercher</span>
          <span><kbd>?</kbd> raccourcis</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Raccourcis clavier globaux. Ignorés quand on écrit dans un champ (sauf Ctrl+K qui marche partout).
export function useRaccourcis({ ouvrirRecherche, ouvrirCreation, ouvrirAide, actif = true }) {
  useEffect(() => {
    if (!actif) return undefined;
    const ecoute = (e) => {
      const cible = e.target;
      const saisie = cible && (cible.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName));
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ouvrirRecherche();
        return;
      }
      if (saisie || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      if (e.key === '/') { e.preventDefault(); ouvrirRecherche(); }
      else if (e.key === '+' || e.key === 'n') { e.preventDefault(); ouvrirCreation(); }
      else if (e.key === '?') { e.preventDefault(); ouvrirAide(); }
    };
    window.addEventListener('keydown', ecoute);
    return () => window.removeEventListener('keydown', ecoute);
  }, [ouvrirRecherche, ouvrirCreation, ouvrirAide, actif]);
}

export const RACCOURCIS = [
  [['Ctrl', 'K'], 'Rechercher partout (écrans, articles, clients, factures…)'],
  [['/'], 'Rechercher partout'],
  [['N'], 'Créer (vente, article, contact, facture…)'],
  [['?'], 'Afficher cette aide'],
  [['Échap'], 'Fermer une fenêtre'],
  [['↑', '↓', 'Entrée'], 'Choisir et ouvrir un résultat'],
];
