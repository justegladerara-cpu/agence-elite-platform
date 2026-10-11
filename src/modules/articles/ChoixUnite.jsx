import React, { useState } from 'react';
import { UNITE_AUTRE, UNITES, uniteConnue } from './saisieRapide.js';

// « Vendu à » : liste simple des unités courantes, avec « Autre… » pour taper la sienne (valeur gardée telle quelle).
export default function ChoixUnite({ valeur, onChange, libelle = 'Vendu à', ...props }) {
  const [autre, setAutre] = useState(() => Boolean(valeur) && !uniteConnue(valeur));
  if (autre) {
    return (
      <span className="choix-unite">
        <input {...props} aria-label={libelle} value={valeur} maxLength={20} placeholder="ex. : botte, seau, plaquette"
          onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="lien" onClick={() => { setAutre(false); onChange('unité'); }}>Liste</button>
      </span>
    );
  }
  return (
    <select {...props} aria-label={libelle} value={valeur || 'unité'}
      onChange={(e) => {
        if (e.target.value === UNITE_AUTRE) {
          setAutre(true);
          onChange('');
        } else onChange(e.target.value);
      }}>
      {UNITES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      <option value={UNITE_AUTRE}>Autre…</option>
    </select>
  );
}
