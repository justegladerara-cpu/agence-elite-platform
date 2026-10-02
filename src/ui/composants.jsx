import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const CHEMINS = {
  tableau: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
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
};

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
  useEffect(() => {
    const touche = (e) => e.key === 'Escape' && onFermer?.();
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFermer]);
  return createPortal(
    <div className="voile" onMouseDown={(e) => e.target === e.currentTarget && onFermer?.()}>
      <div className={`modale ${large ? 'large' : ''}`} role="dialog" aria-modal="true" aria-label={titre}>
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

export function EnTete({ titre, sousTitre, children }) {
  return (
    <div className="entete-page">
      <div>
        <h1>{titre}</h1>
        {sousTitre && <p>{sousTitre}</p>}
      </div>
      {children && <div className="entete-actions">{children}</div>}
    </div>
  );
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
