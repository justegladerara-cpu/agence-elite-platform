import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { lireParametres } from '../noyau/routes.js';

const CHEMINS = {
  tableau: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  coche: 'M5 12.5l4.5 4.5L19 7.5',
  caisse: 'M4 4h16v4H4zM6 10h12l1 10H5zM9 13h2v2H9zm4 0h2v2h-2z',
  ventes: 'M4 4h12l4 4v12H4zM8 10h8M8 14h8M8 18h5',
  articles: 'M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10',
  stock: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M7 9v6',
  cloture: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  contacts: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 4-6 8-6s8 2 8 6',
  depenses: 'M3 6h18v12H3zM3 10h18M7 15h4',
  parametres: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1-2 3.4-.2-.1a1.6 1.6 0 00-1.9.3 1.6 1.6 0 00-.6 1.5V22h-4v-.2a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.2.1-2-3.4.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2v-4h.2a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1 2-3.4.2.1a1.6 1.6 0 001.8-.3 1.6 1.6 0 001-1.5V2h4v.2a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.2-.1 2 3.4-.1.1a1.6 1.6 0 00-.3 1.8 1.6 1.6 0 001.5 1h.2v4h-.2a1.6 1.6 0 00-1.5 1z',
  membres: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 100-6M22 21c0-3-2-5-5-5',
  plus: 'M12 5v14M5 12h14',
  moins: 'M5 12h14',
  fermer: 'M6 6l12 12M18 6L6 18',
  recherche: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  imprimer: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  sortie: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
  alerte: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  panier: 'M3 4h3l3 11h10l2-8H7M10 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  retour: 'M15 18l-6-6 6-6',
  fusee: 'M12 2c3 2 5 6 5 10l-2 4H9l-2-4c0-4 2-8 5-10zM12 9a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM9 16l-3 4 4-1M15 16l3 4-4-1',
  editeur: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 10h.01M15 10h.01',
  hub: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  depot: 'M3 21V9l9-6 9 6v12M7 21v-8h10v8M7 17h10',
  transfert: 'M4 8h13l-3-3M20 16H7l3 3',
  modules: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  comptes: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6M18 8h4M20 6v4',
  cle: 'M15 7a4 4 0 11-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0115 7z',
  points: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'M9 6l6 6-6 6',
  bas: 'M6 9l6 6 6-6',
  clients: 'M3 21h18M5 21V5h9v16M14 9h5v12M8 9h2M8 13h2M8 17h2',
  offres: 'M20 12l-8 8-9-9V3h8zM7 7h.01',
  inventaire: 'M9 4h6v3H9zM6 6h3M15 6h3v15H6V6h0M9 12l2 2 4-4',
  echeance: 'M7 3v3M17 3v3M4 8h16M5 5h14v16H5zM12 12v4l3 2',
  activite: 'M3 12h4l3-8 4 16 3-8h4',
  oeil: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  cloche: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20a2 2 0 004 0',
  document: 'M6 2h8l5 5v15H6zM14 2v5h5M9 13h7M9 17h7',
  dossier: 'M3 6h6l2 2h10v11H3z',
  trombone: 'M21 11l-8.5 8.5a5 5 0 01-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 7',
  telecharger: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  horloge: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  calendrier: 'M7 3v3M17 3v3M4 8h16M5 5h14v16H5zM8 12h2M12 12h2M16 12h0M8 16h2M12 16h2',
  organigramme: 'M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4',
  valise: 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  utilisateur: 'M12 12a4 4 0 100-8 4 4 0 000 8zM5 21c0-4 3-6 7-6s7 2 7 6',
  table: 'M4 9h16M6 9v10M18 9v10M8 5h8l2 4H6z',
  cuisine: 'M6 3v8a3 3 0 006 0V3M9 3v18M17 3c-2 0-3 3-3 6s1 4 3 4v8',
  lit: 'M3 18V7M3 13h18v5M21 18v-3a3 3 0 00-3-3H11v1M7 11a2 2 0 100-4 2 2 0 000 4z',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18',
  facture: 'M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22zM9 7h6M9 11h6M9 15h4',
  camion: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  cible: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 17a5 5 0 100-10 5 5 0 000 10zM12 13a1 1 0 100-2 1 1 0 000 2z',
  taches: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  etoile: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  message: 'M4 5h16v11H8l-4 4z',
  graphique: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  repeter: 'M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4',
};

export const NOMS_ICONES = Object.keys(CHEMINS);

export function Icone({ nom, taille = 18 }) {
  return (
    <svg className="icone" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CHEMINS[nom] ?? CHEMINS.plus} />
    </svg>
  );
}

export function Bouton({ variante = 'secondaire', icone, children, chargement, ...props }) {
  return (
    <button className={`bouton ${variante}`} disabled={chargement || props.disabled} {...props}>
      {icone && <Icone nom={icone} taille={16} />}
      {children && <span>{chargement ? 'Patientez…' : children}</span>}
    </button>
  );
}

export function Champ({ libelle, aide, children, className = '' }) {
  return (
    <label className={`champ ${className}`}>
      <span className="champ-libelle">{libelle}</span>
      {children}
      {aide && <small className="champ-aide">{aide}</small>}
    </label>
  );
}

export function Badge({ ton = 'neutre', children }) {
  return <span className={`badge ${ton}`}>{children}</span>;
}

export function Vide({ titre, texte, action }) {
  return (
    <div className="vide">
      <strong>{titre}</strong>
      {texte && <p>{texte}</p>}
      {action}
    </div>
  );
}

export function Chargement({ texte = 'Chargement…' }) {
  return (
    <div className="chargement" role="status">
      <span className="rouet" />
      {texte}
    </div>
  );
}

export function Erreur({ message }) {
  if (!message) return null;
  return (
    <div className="erreur" role="alert">
      <Icone nom="alerte" taille={16} />
      <span>{message}</span>
    </div>
  );
}

export function Modale({ titre, onFermer, children, pied, large }) {
  const dialogue = useRef(null);
  const elementPrecedent = useRef(null);
  useEffect(() => {
    elementPrecedent.current = document.activeElement;
    const premier = dialogue.current?.querySelector('input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
    premier?.focus();
    const touche = (e) => {
      if (e.key === 'Escape') onFermer?.();
      if (e.key !== 'Tab') return;
      const elements = [...(dialogue.current?.querySelectorAll('input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])') ?? [])]
        .filter((element) => !element.disabled && element.offsetParent !== null);
      if (!elements.length) return;
      const premierElement = elements[0];
      const dernierElement = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === premierElement) { e.preventDefault(); dernierElement.focus(); }
      else if (!e.shiftKey && document.activeElement === dernierElement) { e.preventDefault(); premierElement.focus(); }
    };
    window.addEventListener('keydown', touche);
    return () => {
      window.removeEventListener('keydown', touche);
      elementPrecedent.current?.focus?.();
    };
  }, [onFermer]);
  return createPortal(
    <div className="voile" onMouseDown={(e) => e.target === e.currentTarget && onFermer?.()}>
      <div ref={dialogue} className={`modale ${large ? 'large' : ''}`} role="dialog" aria-modal="true" aria-label={titre}>
        <header>
          <h2>{titre}</h2>
          {onFermer && <button className="icone-bouton" onClick={onFermer} aria-label="Fermer"><Icone nom="fermer" /></button>}
        </header>
        <div className="modale-corps">{children}</div>
        {pied && <footer>{pied}</footer>}
      </div>
    </div>,
    document.body
  );
}

// Demande un motif obligatoire avant une annulation.
export function ModaleMotif({ titre, texte, libelleAction = 'Confirmer', onValider, onFermer }) {
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await onValider(motif);
      onFermer();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  return (
    <Modale titre={titre} onFermer={onFermer}>
      <form onSubmit={valider} className="formulaire">
        {texte && <p className="texte-doux">{texte}</p>}
        <Champ libelle="Motif (obligatoire, conservé dans l’historique)">
          <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} required autoFocus />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Retour</Bouton>
          <Bouton type="submit" variante="danger" chargement={chargement} disabled={!motif.trim()}>{libelleAction}</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Ancien nom, conservé : même rendu que PageHeader.
export function EnTete({ titre, sousTitre, children }) {
  return <PageHeader titre={titre} sousTitre={sousTitre} actions={children} />;
}

export function Recherche({ valeur, onChange, placeholder = 'Rechercher…' }) {
  return (
    <div className="recherche">
      <Icone nom="recherche" taille={16} />
      <input type="search" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Onglets({ onglets, actif, onChange }) {
  return (
    <div className="onglets" role="tablist">
      {onglets.map(([id, libelle]) => (
        <button key={id} role="tab" aria-selected={actif === id} className={actif === id ? 'actif' : ''} onClick={() => onChange(id)}>
          {libelle}
        </button>
      ))}
    </div>
  );
}

export function Indicateur({ libelle, valeur, detail, ton }) {
  return (
    <div className={`indicateur ${ton ?? ''}`}>
      <span className="indicateur-libelle">{libelle}</span>
      <strong>{valeur}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

// Lit une image et la réduit (≤ 600 px, JPEG) pour l'enregistrer avec l'article.
export function lireImageReduite(fichier, taille = 600) {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => rejeter(new Error('Image illisible'));
    lecteur.onload = () => {
      const image = new Image();
      image.onerror = () => rejeter(new Error('Image illisible'));
      image.onload = () => {
        const echelle = Math.min(1, taille / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * echelle);
        canvas.height = Math.round(image.height * echelle);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resoudre(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

// --- Système de composants (mise à jour 2026-10) ------------------------------------------
// Voir docs/DESIGN_SYSTEM.md. Les anciens noms (EnTete, Indicateur, Onglets, Vide) restent valides.

export function Avatar({ nom, taille = 'normal', image, initiales }) {
  const lettres = initiales || String(nom ?? '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join('') || '?';
  if (image) return <img className={`avatar ${taille}`} src={image} alt="" aria-hidden="true" />;
  return <span className={`avatar ${taille}`} aria-hidden="true">{lettres}</span>;
}

export function FilAriane({ elements }) {
  if (!elements?.length) return null;
  return (
    <nav className="fil-ariane" aria-label="Fil d’Ariane">
      <ol>
        {elements.map((e, i) => (
          <li key={`${e.libelle}-${i}`}>
            {i < elements.length - 1 && e.href ? <a href={e.href}>{e.libelle}</a> : <span aria-current={i === elements.length - 1 ? 'page' : undefined}>{e.libelle}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Fil d'Ariane : quand la coquille fournit un emplacement (barre du haut), PageHeader y place son fil.
const ContexteFil = createContext(null);

export function FournisseurFil({ children }) {
  const [fil, setFil] = useState(null);
  const valeur = useMemo(() => ({ fil, setFil }), [fil]);
  return <ContexteFil.Provider value={valeur}>{children}</ContexteFil.Provider>;
}

export function useFilAriane() {
  return useContext(ContexteFil);
}

export function PageHeader({ titre, sousTitre, fil, badges, actions, children }) {
  const contexte = useContext(ContexteFil);
  const cle = JSON.stringify(fil ?? null);
  const setFil = contexte?.setFil;
  useEffect(() => {
    if (!setFil || !fil) return undefined;
    setFil(fil);
    return () => setFil(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, setFil]);
  return (
    <header className="page-header">
      {!contexte && <FilAriane elements={fil} />}
      <div className="page-header-ligne">
        <div className="page-header-titre">
          <div className="page-header-nom">
            <h1>{titre}</h1>
            {badges && <span className="badges">{badges}</span>}
          </div>
          {sousTitre && <p>{sousTitre}</p>}
        </div>
        {(actions || children) && <div className="entete-actions">{actions}{children}</div>}
      </div>
    </header>
  );
}

export function StatCard({ libelle, valeur, detail, ton, icone, onClick, note }) {
  const Balise = onClick ? 'button' : 'div';
  return (
    <Balise className={`stat-card ${ton ?? ''} ${onClick ? 'cliquable' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="stat-card-tete">
        {icone && <span className="stat-card-icone"><Icone nom={icone} taille={16} /></span>}
        <span className="stat-card-libelle">{libelle}</span>
      </span>
      <strong className="stat-card-valeur">{valeur}</strong>
      {detail && <small className="stat-card-detail">{detail}</small>}
      {note && <small className="stat-card-note">{note}</small>}
    </Balise>
  );
}

const STATUTS_CONNUS = {
  actif: ['Actif', 'vert'], active: ['Active', 'vert'], valide: ['Validé', 'vert'], validee: ['Validée', 'vert'], ouverte: ['Ouverte', 'vert'],
  payee: ['Payée', 'vert'], suspendu: ['Suspendu', 'alerte'], suspendue: ['Suspendue', 'alerte'], archive: ['Archivé', 'neutre'],
  annule: ['Annulé', 'alerte'], annulee: ['Annulée', 'alerte'], cloturee: ['Clôturée', 'neutre'], terminee: ['Terminée', 'neutre'],
  partielle: ['Partielle', 'attention'], impayee: ['Impayée', 'attention'], essai: ['Essai', 'bleu'], inactif: ['Inactif', 'neutre'],
  en_preparation: ['En préparation', 'attention'], futur: ['Futur', 'neutre'], retire: ['Retiré', 'neutre'],
};

export function StatusBadge({ statut, libelle }) {
  const [texte, ton] = STATUTS_CONNUS[statut] ?? [statut, 'neutre'];
  return <Badge ton={ton}>{libelle ?? texte}</Badge>;
}

export function EmptyState({ titre, texte, action, icone }) {
  return (
    <div className="vide">
      {icone && <span className="vide-icone"><Icone nom={icone} taille={22} /></span>}
      <strong>{titre}</strong>
      {texte && <p>{texte}</p>}
      {action}
    </div>
  );
}

export function Tabs({ onglets, actif, onChange }) {
  return (
    <div className="onglets" role="tablist">
      {onglets.map(([id, libelle, compteur]) => (
        <button key={id} role="tab" aria-selected={actif === id} className={actif === id ? 'actif' : ''} onClick={() => onChange(id)}>
          {libelle}
          {compteur != null && <span className="onglet-compteur">{compteur}</span>}
        </button>
      ))}
    </div>
  );
}

export function Section({ titre, sousTitre, action, children, className = '' }) {
  return (
    <section className={`carte ${className}`}>
      {(titre || action) && (
        <div className="titre-ligne">
          <div>
            {titre && <h2>{titre}</h2>}
            {sousTitre && <p className="texte-doux">{sousTitre}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Squelette({ lignes = 4 }) {
  return (
    <div className="squelette" role="status" aria-label="Chargement">
      {Array.from({ length: lignes }, (_, i) => <span key={i} style={{ width: `${92 - ((i * 17) % 35)}%` }} />)}
    </div>
  );
}

// Menu « ••• » : actions secondaires d'une fiche ou d'une ligne.
export function MenuActions({ actions, libelle = 'Plus d’actions' }) {
  const [ouvert, setOuvert] = useState(false);
  const zone = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !zone.current?.contains(e.target)) setOuvert(false);
    };
    window.addEventListener('mousedown', fermer);
    window.addEventListener('keydown', fermer);
    return () => {
      window.removeEventListener('mousedown', fermer);
      window.removeEventListener('keydown', fermer);
    };
  }, [ouvert]);
  const visibles = actions.filter(Boolean);
  if (!visibles.length) return null;
  return (
    <div className="menu-actions" ref={zone}>
      <button type="button" className="icone-bouton" aria-label={libelle} aria-haspopup="menu" aria-expanded={ouvert} onClick={(e) => { e.stopPropagation(); setOuvert((o) => !o); }}>
        <Icone nom="points" />
      </button>
      {ouvert && (
        <div className="menu-actions-liste" role="menu">
          {visibles.map((a) => (
            <button
              key={a.libelle}
              type="button"
              role="menuitem"
              className={a.danger ? 'danger' : ''}
              disabled={a.desactive}
              onClick={(e) => { e.stopPropagation(); setOuvert(false); a.onClick(); }}
            >
              {a.icone && <Icone nom={a.icone} taille={16} />}
              {a.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Tableau de données : recherche, filtres, tri, pagination, ligne cliquable.
// colonnes : [{ id, libelle, rendu: (l) => node, tri: (l) => valeur, classe }]
export function DataTable({
  colonnes, lignes, cle = 'id', rechercher, placeholder = 'Rechercher…', filtres = [], triInitial, parPage = 20,
  onLigne, vide, actions, chargement,
}) {
  // Filtres et recherche initiaux lus dans l'adresse (#/page?statut=…&q=…) : un indicateur du
  // tableau de bord ouvre l'écran déjà filtré.
  const [texte, setTexte] = useState(() => (rechercher ? lireParametres().get('q') ?? '' : ''));
  const [valeursFiltres, setValeursFiltres] = useState(() => {
    const p = lireParametres();
    return Object.fromEntries(filtres.filter((f) => p.get(f.id)).map((f) => [f.id, p.get(f.id)]));
  });
  const [tri, setTri] = useState(triInitial ?? null);
  const [page, setPage] = useState(0);
  const resultat = useMemo(() => {
    let liste = lignes ?? [];
    const t = texte.trim().toLowerCase();
    if (t && rechercher) liste = liste.filter((l) => rechercher(l).toLowerCase().includes(t));
    for (const f of filtres) {
      const v = valeursFiltres[f.id];
      if (v) liste = liste.filter((l) => f.appliquer(l, v));
    }
    if (tri) {
      const colonne = colonnes.find((c) => c.id === tri.id);
      if (colonne?.tri) {
        liste = [...liste].sort((a, b) => {
          const x = colonne.tri(a);
          const y = colonne.tri(b);
          const comparaison = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'fr');
          return tri.sens === 'desc' ? -comparaison : comparaison;
        });
      }
    }
    return liste;
  }, [lignes, texte, valeursFiltres, tri, colonnes, filtres, rechercher]);
  const pages = Math.max(1, Math.ceil(resultat.length / parPage));
  const filtresActifs = Boolean(texte.trim()) || Object.values(valeursFiltres).some(Boolean);
  const pageCourante = Math.min(page, pages - 1);
  const visibles = resultat.slice(pageCourante * parPage, (pageCourante + 1) * parPage);
  const trier = (c) => {
    if (!c.tri) return;
    setTri((t) => (t?.id === c.id ? { id: c.id, sens: t.sens === 'asc' ? 'desc' : 'asc' } : { id: c.id, sens: 'asc' }));
  };
  return (
    <div className="data-table">
      {(rechercher || filtres.length > 0 || actions) && (
        <div className="data-table-outils">
          {rechercher && <Recherche valeur={texte} onChange={(v) => { setTexte(v); setPage(0); }} placeholder={placeholder} />}
          {filtres.map((f) => (
            <select key={f.id} aria-label={f.libelle} value={valeursFiltres[f.id] ?? ''} onChange={(e) => { setValeursFiltres((v) => ({ ...v, [f.id]: e.target.value })); setPage(0); }}>
              <option value="">{f.libelle} : tous</option>
              {valeursFiltres[f.id] && !f.options.some(([v]) => v === valeursFiltres[f.id]) && <option value={valeursFiltres[f.id]}>{valeursFiltres[f.id]}</option>}
              {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          <span className="data-table-compte">{resultat.length} résultat{resultat.length > 1 ? 's' : ''}</span>
          {filtresActifs && <Bouton icone="fermer" onClick={() => { setTexte(''); setValeursFiltres({}); setPage(0); }}>Effacer les filtres</Bouton>}
          {actions}
        </div>
      )}
      {chargement && !lignes ? <Squelette /> : resultat.length === 0 ? (
        vide ?? <EmptyState titre={texte ? 'Aucun résultat' : 'Rien à afficher'} texte={texte ? 'Modifiez la recherche ou les filtres.' : undefined} />
      ) : (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead>
              <tr>
                {colonnes.map((c) => (
                  <th
                    key={c.id}
                    className={`${c.classe ?? ''} ${c.tri ? 'triable' : ''}`}
                    aria-sort={tri?.id === c.id ? (tri.sens === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {c.tri ? (
                      <button type="button" onClick={() => trier(c)}>
                        {c.libelle}
                        <span className="tri-indice">{tri?.id === c.id ? (tri.sens === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    ) : c.libelle}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((l) => (
                <tr
                  key={l[cle]}
                  className={onLigne ? 'cliquable' : ''}
                  onClick={onLigne ? () => onLigne(l) : undefined}
                  onKeyDown={onLigne ? (e) => { if (e.key === 'Enter') onLigne(l); } : undefined}
                  tabIndex={onLigne ? 0 : undefined}
                >
                  {colonnes.map((c) => <td key={c.id} data-label={c.libelle} className={c.classe ?? ''}>{c.rendu ? c.rendu(l) : l[c.id]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="pagination">
          <Bouton disabled={pageCourante === 0} onClick={() => setPage(pageCourante - 1)}>Précédent</Bouton>
          <span>Page {pageCourante + 1} sur {pages}</span>
          <Bouton disabled={pageCourante >= pages - 1} onClick={() => setPage(pageCourante + 1)}>Suivant</Bouton>
        </div>
      )}
    </div>
  );
}

function compacter(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000).toLocaleString('fr-FR')} k`;
  return Math.round(v).toLocaleString('fr-FR');
}

// Histogramme simple (une série, une échelle). donnees : [{ libelle, valeur, titre }]
// Plafond « rond » de l'axe (1, 2, 5 × 10^n) pour que chaque graduation tombe sur une valeur lisible.
function plafondRond(v) {
  if (v <= 0) return 1;
  const puissance = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * puissance).find((c) => c >= v);
}

export function GraphiqueBarres({ donnees, format = compacter, hauteur = 180, onBarre, libelle = 'Graphique', vide = 'Aucune valeur sur la période' }) {
  const brut = Math.max(...donnees.map((d) => Number(d.valeur) || 0), 0);
  if (brut <= 0) return <p className="graphique-vide texte-doux">{vide}</p>;
  const max = plafondRond(brut);
  const largeur = 560;
  const marge = { haut: 12, bas: 26, gauche: 46, droite: 8 };
  const zoneL = largeur - marge.gauche - marge.droite;
  const zoneH = hauteur - marge.haut - marge.bas;
  const pas = zoneL / Math.max(donnees.length, 1);
  const barre = Math.max(Math.min(pas - 8, 44), 4);
  return (
    <svg className="graphique" viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label={libelle}>
      {[0, max / 2, max].filter((g, i, t) => t.indexOf(g) === i).map((g) => {
        const y = marge.haut + zoneH - (g / max) * zoneH;
        return (
          <g key={g}>
            <line x1={marge.gauche} x2={largeur - marge.droite} y1={y} y2={y} className="graphique-grille" />
            <text x={marge.gauche - 6} y={y + 4} textAnchor="end" className="graphique-texte">{format(g)}</text>
          </g>
        );
      })}
      {donnees.map((d, i) => {
        const h = ((Number(d.valeur) || 0) / max) * zoneH;
        const x = marge.gauche + i * pas + (pas - barre) / 2;
        return (
          <g key={`${d.libelle}-${i}`} className={onBarre ? 'cliquable' : ''} onClick={onBarre ? () => onBarre(d) : undefined}>
            <rect x={x} y={marge.haut + zoneH - h} width={barre} height={Math.max(h, d.valeur > 0 ? 2 : 0)} rx="4" className="graphique-barre">
              <title>{d.titre ?? `${d.libelle} : ${format(d.valeur)}`}</title>
            </rect>
            <text x={x + barre / 2} y={hauteur - 8} textAnchor="middle" className="graphique-texte">{d.libelle}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Confirmation d'une action (sans motif). Le texte dit ce qui se passe, l'action est nommée.
export function Confirmation({ titre, texte, libelleAction = 'Confirmer', danger, onValider, onFermer }) {
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const valider = async () => {
    setChargement(true);
    setErreur('');
    try {
      await onValider();
      onFermer();
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale
      titre={titre}
      onFermer={onFermer}
      pied={(
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante={danger ? 'danger' : 'principal'} chargement={chargement} onClick={valider}>{libelleAction}</Bouton>
        </>
      )}
    >
      {texte && <p>{texte}</p>}
      <Erreur message={erreur} />
    </Modale>
  );
}
