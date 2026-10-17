import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Erreur } from '../../ui/composants.jsx';

// Serveurs (migration 20261013100133) : liste partagée par toutes les tablettes de l'établissement. Le serveur se choisit
// d'un geste au début de la commande ; « + Nouveau serveur » ne sert qu'une fois par prénom. Le choix est facultatif.
const cle = (etab) => `serveur-choisi:${etab}`;

// Le dernier serveur choisi reste sélectionné sur cette tablette.
export function lireServeurChoisi(etab) {
  try {
    return window.localStorage.getItem(cle(etab)) || '';
  } catch {
    return '';
  }
}

export function retenirServeurChoisi(etab, prenom) {
  try {
    if (prenom) window.localStorage.setItem(cle(etab), prenom);
    else window.localStorage.removeItem(cle(etab));
  } catch {
    /* stockage indisponible : le choix n'est pas retenu, rien de grave */
  }
}

// Liste affichée : serveurs enregistrés, puis noms du réglage caisse « serveurs » pas encore enregistrés.
export function listeServeurs(enregistres = [], reglage = []) {
  const vus = new Set();
  const liste = [];
  for (const prenom of [...enregistres.map((s) => s.prenom), ...reglage]) {
    const nom = String(prenom ?? '').trim();
    const k = nom.toLocaleLowerCase('fr');
    if (!nom || vus.has(k)) continue;
    vus.add(k);
    liste.push(nom);
  }
  return liste;
}

export function ChoixServeur({ serveurs, valeur, onChange, onCree, compact = false }) {
  const { api, etablissement } = useEspace();
  const [ajout, setAjout] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const choisir = (nom) => onChange(valeur && valeur.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr') ? '' : nom);
  const creer = async (e) => {
    e.preventDefault();
    const nom = prenom.trim();
    if (!nom) {
      setErreur('Tapez le prénom du serveur.');
      return;
    }
    setEnCours(true);
    setErreur('');
    try {
      const s = await api.rpc('enregistrer_serveur', { p_etablissement_id: etablissement.id, p_prenom: nom });
      onCree?.(s);
      onChange(s.prenom);
      setAjout(false);
      setPrenom('');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <div className={`choix-serveur ${compact ? 'compact' : ''}`} role="group" aria-label="Serveur">
      <span className="choix-serveur-titre">Serveur</span>
      <div className="choix-serveur-puces">
        {serveurs.map((nom) => {
          const actif = valeur && valeur.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr');
          return (
            <button key={nom} type="button" className={actif ? 'actif' : ''} aria-pressed={!!actif} onClick={() => choisir(nom)}>{nom}</button>
          );
        })}
        {!ajout && <button type="button" className="ajout" onClick={() => setAjout(true)}>+ Nouveau serveur</button>}
      </div>
      {ajout && (
        <form className="choix-serveur-ajout" onSubmit={creer}>
          <input value={prenom} maxLength={40} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom du serveur" aria-label="Prénom du nouveau serveur" autoFocus />
          <Bouton type="submit" variante="principal" chargement={enCours}>Enregistrer</Bouton>
          <Bouton type="button" onClick={() => { setAjout(false); setErreur(''); }}>Annuler</Bouton>
        </form>
      )}
      <Erreur message={erreur} />
    </div>
  );
}
