import React, { useEffect, useId, useRef, useState } from 'react';
import { Icone } from '../../ui/composants.jsx';

// Briques communes de la nouvelle version : tuiles qui répondent aux 4 questions (combien, est-ce bien, pourquoi,
// que faire), photo des serveurs, anneau d'objectif, petite courbe, modification sur place.

const COULEURS_INITIALES = ['#D4AF37', '#2FBF71', '#F2A93B', '#8AA4FF', '#E5484D', '#C9A0FF', '#4FD1C5'];

// « 1 ticket », « 3 tickets » : jamais de « ticket(s) ».
export function pluriel(n, singulier, plurielForme = `${singulier}s`) {
  return `${n} ${Math.abs(Number(n)) > 1 ? plurielForme : singulier}`;
}

export function initialesDe(nom) {
  // Lettres seulement : « Black Label (bouteille) » donne « BL », jamais « B( ».
  return String(nom ?? '').replace(/\(.*?\)/g, ' ').split(/\s+/).map((m) => m.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join('') || '?';
}

function couleurNom(nom) {
  let s = 0;
  for (const c of String(nom ?? '')) s += c.charCodeAt(0);
  return COULEURS_INITIALES[s % COULEURS_INITIALES.length];
}

export function PhotoServeur({ prenom, photo, taille = 56 }) {
  const style = { width: taille, height: taille };
  if (photo) return <img className="xp-photo" src={photo} alt="" style={style} />;
  return (
    <span className="xp-photo xp-photo-initiales" style={{ ...style, '--teinte': couleurNom(prenom), fontSize: Math.round(taille * 0.36) }} aria-hidden="true">
      {initialesDe(prenom)}
    </span>
  );
}

const mouvementReduit = () => typeof window === 'undefined' || /jsdom/i.test(navigator.userAgent ?? '')
  || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.animations === 'reduit');

// Le premier nombre d'un texte (« 1 250 000 FCFA », « 4,2 / 5 », « 38 % ») : sa valeur et son nombre de décimales.
export function premierNombre(texte) {
  const m = /\d[\d\u202f\u00a0 ]*(?:,\d+)?/.exec(String(texte ?? ''));
  if (!m) return null;
  const brut = m[0].replace(/[\s\u202f\u00a0]/g, '').trim();
  const valeur = Number(brut.replace(',', '.'));
  if (!Number.isFinite(valeur)) return null;
  return { valeur, decimales: (brut.split(',')[1] ?? '').length, debut: m.index, fin: m.index + m[0].trimEnd().length };
}

// Chiffre qui monte de 0 à sa valeur (0,8 s) à l'arrivée et à chaque changement. Le texte final est exactement celui reçu.
export function Chiffre({ valeur, duree = 800 }) {
  const texte = typeof valeur === 'number' ? String(valeur) : valeur;
  const [t, setT] = useState(() => (mouvementReduit() ? 1 : 0));
  const precedent = useRef(null);
  useEffect(() => {
    if (typeof texte !== 'string' || precedent.current === texte) return undefined;
    const avant = precedent.current;
    precedent.current = texte;
    const n = premierNombre(texte);
    if (!n || n.valeur === 0 || mouvementReduit() || (avant != null && premierNombre(avant)?.valeur === n.valeur)) {
      setT(1);
      return undefined;
    }
    let image;
    const depart = performance.now();
    const pas = (maintenant) => {
      const p = Math.min(1, (maintenant - depart) / duree);
      setT(1 - (1 - p) ** 3);
      if (p < 1) image = requestAnimationFrame(pas);
    };
    setT(0);
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [texte, duree]);
  if (typeof texte !== 'string' || t >= 1) return texte ?? null;
  const n = premierNombre(texte);
  if (!n) return texte;
  const courant = (n.valeur * t).toLocaleString('fr-FR', { minimumFractionDigits: n.decimales, maximumFractionDigits: n.decimales });
  return <span className="xp-chiffre-anime">{texte.slice(0, n.debut)}{courant}{texte.slice(n.fin)}</span>;
}

// Petite courbe sans axes (14 à 30 points) pour une carte : la tendance d'un article ou d'un serveur.
export function MiniCourbe({ points, couleur = 'var(--accent)', hauteur = 34, libelle }) {
  const pts = (points ?? []).map((v) => Number(v) || 0);
  if (pts.length < 2) return null;
  const max = Math.max(1, ...pts);
  const l = 100;
  const x = (i) => (i / (pts.length - 1)) * l;
  const y = (v) => hauteur - 3 - (v / max) * (hauteur - 6);
  const ligne = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="xp-mini-courbe" viewBox={`0 0 ${l} ${hauteur}`} preserveAspectRatio="none" role="img" aria-label={libelle ?? 'Tendance'}>
      <polygon points={`0,${hauteur} ${ligne} ${l},${hauteur}`} fill={couleur} opacity="0.12" />
      <polyline points={ligne} fill="none" stroke={couleur} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" className="xp-courbe-trace" />
    </svg>
  );
}

// Ton d'un verdict : bon (émeraude), vigilance (ambre), mauvais (rubis), neutre (or discret).
export function Verdict({ ton = 'neutre', children }) {
  return <span className={`xp-verdict ${ton}`}>{children}</span>;
}

// Une tuile = une question claire. valeur : le chiffre ; verdict : est-ce bien ; pourquoi : la raison ; conseil : quoi faire.
export function Tuile({ titre, icone, valeur, unite, verdict, pourquoi, conseil, onClick, children, className = '', large = false, style }) {
  const Balise = onClick ? 'button' : 'div';
  return (
    <Balise type={onClick ? 'button' : undefined} className={`xp-tuile ${large ? 'large' : ''} ${onClick ? 'cliquable' : ''} ${className}`} onClick={onClick} style={style}>
      <span className="xp-tuile-tete">
        {icone && <span className="xp-tuile-icone"><Icone nom={icone} taille={16} /></span>}
        <span className="xp-tuile-titre">{titre}</span>
        {verdict && <Verdict ton={verdict.ton}>{verdict.texte}</Verdict>}
      </span>
      {valeur != null && (
        <span className="xp-tuile-valeur">{typeof valeur === 'string' || typeof valeur === 'number' ? <Chiffre valeur={valeur} /> : valeur}{unite && <small>{unite}</small>}</span>
      )}
      {pourquoi && <span className="xp-tuile-pourquoi">{pourquoi}</span>}
      {children}
      {conseil && <span className="xp-tuile-conseil"><Icone nom="chevron" taille={14} />{conseil}</span>}
    </Balise>
  );
}

export function EnteteXp({ surtitre, titre, sousTitre, children }) {
  return (
    <header className="xp-entete">
      <div>
        {surtitre && <span className="xp-surtitre">{surtitre}</span>}
        <h1 className="xp-titre">{titre}</h1>
        {sousTitre && <p className="xp-sous-titre">{sousTitre}</p>}
      </div>
      {children && <div className="xp-entete-actions">{children}</div>}
    </header>
  );
}

// Anneau doré de l'objectif du jour (0 à 100 %, déborde en émeraude au-delà).
export function Anneau({ part, taille = 132, epaisseur = 10, children, libelle }) {
  const id = useId().replace(/:/g, '');
  const r = (taille - epaisseur) / 2;
  const tour = 2 * Math.PI * r;
  const cible = Math.max(0, Math.min(1, Number(part) || 0));
  // L'anneau part de zéro puis se remplit (transition CSS de 0,9 s).
  const [p, setP] = useState(0);
  useEffect(() => {
    const image = requestAnimationFrame(() => setP(cible));
    return () => cancelAnimationFrame(image);
  }, [cible]);
  return (
    <div className="xp-anneau" style={{ width: taille, height: taille }} role="img" aria-label={libelle}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`}>
        <defs>
          <linearGradient id={`or-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F3D98B" />
            <stop offset="55%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#9C7A2B" />
          </linearGradient>
        </defs>
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="var(--bordure)" strokeWidth={epaisseur} />
        <circle className="xp-anneau-trait" cx={taille / 2} cy={taille / 2} r={r} fill="none"
          stroke={Number(part) >= 1 ? 'var(--vert)' : `url(#or-${id})`} strokeWidth={epaisseur} strokeLinecap="round"
          strokeDasharray={tour} strokeDashoffset={tour * (1 - p)} transform={`rotate(-90 ${taille / 2} ${taille / 2})`} />
      </svg>
      <div className="xp-anneau-centre">{children}</div>
    </div>
  );
}

// Petite courbe en SVG pur (aucune bibliothèque) : séries [{ points: [nombres], couleur, pointille, remplie }].
export function Courbe({ series, hauteur = 120, largeur = 600, etiquettes = [], format = (v) => v, marqueur }) {
  const max = Math.max(1, ...series.flatMap((s) => s.points.filter((v) => v != null)));
  const n = Math.max(2, ...series.map((s) => s.points.length));
  const x = (i) => (i / (n - 1)) * largeur;
  const y = (v) => hauteur - 6 - (v / max) * (hauteur - 14);
  const chemin = (pts) => pts.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
  return (
    <figure className="xp-courbe">
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} preserveAspectRatio="none" role="img" aria-label={series.map((s) => s.nom).filter(Boolean).join(', ')}>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={largeur} y1={y(max * g)} y2={y(max * g)} className="xp-courbe-grille" />)}
        {series.map((s, i) => {
          const pts = chemin(s.points);
          if (pts.length < 2) return null;
          const dernier = s.points.length - 1 - [...s.points].reverse().findIndex((v) => v != null);
          return (
            <g key={i}>
              {s.remplie && <polygon points={`0,${hauteur} ${pts.join(' ')} ${x(dernier)},${hauteur}`} fill={s.couleur} opacity="0.12" />}
              <polyline points={pts.join(' ')} fill="none" stroke={s.couleur} strokeWidth={s.epaisseur ?? 2.2}
                strokeDasharray={s.pointille ? '5 5' : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
                className={s.pointille ? '' : 'xp-courbe-trace'} />
              {s.point && s.points[dernier] != null && <circle cx={x(dernier)} cy={y(s.points[dernier])} r="4" fill={s.couleur} className="xp-pulse" />}
            </g>
          );
        })}
        {marqueur != null && <line x1={x(marqueur)} x2={x(marqueur)} y1="0" y2={hauteur} className="xp-courbe-maintenant" />}
      </svg>
      {etiquettes.length > 0 && (
        <figcaption className="xp-courbe-axe">
          {etiquettes.map((e, i) => <span key={i}>{e}</span>)}
        </figcaption>
      )}
      <span className="sr-only">Maximum : {format(max)}</span>
    </figure>
  );
}

// Barre horizontale simple (part d'un total), avec le libellé et la valeur.
export function Barre({ libelle, valeur, part, couleur = 'var(--accent)', detail, onClick }) {
  const Balise = onClick ? 'button' : 'div';
  return (
    <Balise type={onClick ? 'button' : undefined} className={`xp-barre ${onClick ? 'cliquable' : ''}`} onClick={onClick}>
      <span className="xp-barre-texte"><span>{libelle}</span><strong>{valeur}</strong></span>
      <span className="xp-barre-piste"><span style={{ width: `${Math.max(2, Math.min(100, (part ?? 0) * 100))}%`, background: couleur }} /></span>
      {detail && <small>{detail}</small>}
    </Balise>
  );
}

// Valeur modifiable sur place : un toucher ouvre le champ, Entrée enregistre, Échap annule. Aucun rechargement.
export function ChampEnPlace({ valeur, onEnregistrer, format = (v) => v, type = 'text', libelle, min, largeur, desactive }) {
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState('');
  const [etat, setEtat] = useState('');
  const champ = useRef(null);
  useEffect(() => {
    if (edition) champ.current?.select();
  }, [edition]);
  const ouvrir = () => {
    if (desactive) return;
    setTexte(valeur == null ? '' : String(valeur));
    setEdition(true);
  };
  const enregistrer = async () => {
    const brut = type === 'number' ? (texte === '' ? null : Number(String(texte).replace(',', '.'))) : texte.trim();
    if (brut === valeur || (type === 'number' && brut != null && Number.isNaN(brut))) {
      setEdition(false);
      return;
    }
    setEtat('envoi');
    try {
      await onEnregistrer(brut);
      setEtat('ok');
      setEdition(false);
      setTimeout(() => setEtat(''), 1200);
    } catch (err) {
      setEtat('erreur');
      setTimeout(() => setEtat(''), 2500);
      throw err;
    }
  };
  if (!edition) {
    return (
      <button type="button" className={`xp-en-place ${etat}`} onClick={ouvrir} disabled={desactive} aria-label={libelle ? `Modifier ${libelle}` : 'Modifier'}>
        <span>{valeur == null || valeur === '' ? '—' : format(valeur)}</span>
        {!desactive && <Icone nom={etat === 'ok' ? 'coche' : 'crayon'} taille={12} />}
      </button>
    );
  }
  return (
    <input
      ref={champ}
      className="xp-en-place-champ"
      type={type}
      min={min}
      inputMode={type === 'number' ? 'decimal' : undefined}
      value={texte}
      style={largeur ? { width: largeur } : undefined}
      aria-label={libelle}
      disabled={etat === 'envoi'}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => enregistrer().catch(() => {})}
      onKeyDown={(e) => {
        if (e.key === 'Enter') enregistrer().catch(() => {});
        if (e.key === 'Escape') setEdition(false);
      }}
    />
  );
}

// Interrupteur doré.
export function Interrupteur({ actif, onChange, libelle, desactive }) {
  return (
    <button type="button" role="switch" aria-checked={!!actif} aria-label={libelle} disabled={desactive}
      className={`xp-interrupteur ${actif ? 'actif' : ''}`} onClick={() => onChange(!actif)}>
      <span />
    </button>
  );
}

// Panneau qui glisse depuis la droite : le détail d'une tuile, sans quitter l'écran.
export function Panneau({ titre, onFermer, children }) {
  useEffect(() => {
    const touche = (e) => e.key === 'Escape' && onFermer();
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFermer]);
  return (
    <>
      <div className="xp-panneau-voile" onClick={onFermer} />
      <aside className="xp-panneau" role="dialog" aria-modal="true" aria-label={titre}>
        <div className="xp-panneau-tete">
          <h2>{titre}</h2>
          <button type="button" className="icone-bouton" onClick={onFermer} aria-label="Fermer"><Icone nom="fermer" /></button>
        </div>
        <div className="xp-panneau-corps">{children}</div>
      </aside>
    </>
  );
}

export function Segments({ options, valeur, onChange, libelle }) {
  return (
    <div className="xp-segments" role="group" aria-label={libelle}>
      {options.map(([id, texte]) => (
        <button key={id} type="button" className={valeur === id ? 'actif' : ''} aria-pressed={valeur === id} onClick={() => onChange(id)}>{texte}</button>
      ))}
    </div>
  );
}
