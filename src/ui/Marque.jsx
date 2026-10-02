// Identité affichée : composants partagés (barre latérale, connexion, formulaires d'apparence).
import React from 'react';
import { COULEURS_MARQUE, marqueValide, melanger } from '../noyau/marque.js';
import { Champ, lireImageReduite } from './composants.jsx';

export function Marque({ marque, sousTitre }) {
  const m = marqueValide(marque);
  return (
    <div className="marque">
      <span className="marque-logo">{m.logo_url ? <img src={m.logo_url} alt="" /> : m.nom_court}</span>
      <span className="marque-texte"><strong>{m.nom_logiciel}</strong><small>{sousTitre ?? m.sous_titre}</small></span>
    </div>
  );
}

export function ChoixCouleur({ valeur, onChange, heritee }) {
  return (
    <div className="palette" role="group" aria-label="Couleur principale">
      {heritee && (
        <button type="button" title="Couleur héritée" aria-pressed={!valeur} onClick={() => onChange('')} style={{ background: `repeating-linear-gradient(45deg, ${heritee}, ${heritee} 4px, #fff 4px, #fff 7px)` }} />
      )}
      {COULEURS_MARQUE.map(([c, nom]) => (
        <button key={c} type="button" title={nom} aria-label={nom} aria-pressed={valeur === c} onClick={() => onChange(c)} style={{ background: c }} />
      ))}
    </div>
  );
}

function ChoixImage({ libelle, valeur, onChange, taille, onErreur }) {
  return (
    <Champ libelle={libelle}>
      <span className="actions-gauche">
        {valeur ? <img className="vignette" src={valeur} alt="" /> : <span className="vignette vide-logo">—</span>}
        <label className="bouton secondaire">
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const fichier = e.target.files?.[0];
              if (!fichier) return;
              try {
                onChange(await lireImageReduite(fichier, taille));
              } catch (err) {
                onErreur?.(err.message);
              }
            }}
          />
          Choisir
        </label>
        {valeur && <button type="button" className="lien" onClick={() => onChange('')}>Retirer</button>}
      </span>
    </Champ>
  );
}

// Aperçu en direct, avec la couleur choisie (sans toucher au reste de l'écran).
export function ApercuMarque({ marque }) {
  const m = marqueValide(marque);
  const style = { '--accent': m.couleur_accent, '--accent-fort': melanger(m.couleur_accent, '#000000', 0.18) };
  return (
    <div className="apercu-marque" style={style} aria-label="Aperçu">
      <Marque marque={m} />
      <span className="bouton principal">Bouton principal</span>
    </div>
  );
}

// Champs d'apparence. Un champ vide reprend la valeur héritée (affichée en indication).
export function ChampsApparence({ valeurs, onChange, heritage = {}, logo = true, onErreur }) {
  const changer = (c) => (e) => onChange({ ...valeurs, [c]: e.target.value });
  const effectif = Object.fromEntries(Object.entries(heritage).map(([k, v]) => [k, valeurs[k] || v]));
  return (
    <div className="pile">
      <ApercuMarque marque={{ ...effectif, ...Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v)) }} />
      <div className="grille-champs">
        <Champ libelle="Nom du logiciel affiché" aide="40 caractères au plus."><input value={valeurs.nom_logiciel ?? ''} onChange={changer('nom_logiciel')} maxLength={40} placeholder={heritage.nom_logiciel} /></Champ>
        <Champ libelle="Nom court (logo texte)" aide="1 à 4 caractères."><input value={valeurs.nom_court ?? ''} onChange={changer('nom_court')} maxLength={4} placeholder={heritage.nom_court} /></Champ>
        <Champ libelle="Sous-titre" className="large"><input value={valeurs.sous_titre ?? ''} onChange={changer('sous_titre')} maxLength={60} placeholder={heritage.sous_titre} /></Champ>
      </div>
      <Champ libelle="Couleur principale" aide="Palette contrôlée : toujours lisible.">
        <ChoixCouleur valeur={valeurs.couleur_accent ?? ''} heritee={heritage.couleur_accent} onChange={(c) => onChange({ ...valeurs, couleur_accent: c })} />
      </Champ>
      <div className="grille-champs">
        {logo && <ChoixImage libelle="Logo" valeur={valeurs.logo_url} taille={300} onErreur={onErreur} onChange={(v) => onChange({ ...valeurs, logo_url: v })} />}
        <ChoixImage libelle="Icône de l’onglet (favicon)" valeur={valeurs.favicon_url} taille={64} onErreur={onErreur} onChange={(v) => onChange({ ...valeurs, favicon_url: v })} />
      </div>
    </div>
  );
}
