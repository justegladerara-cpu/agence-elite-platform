import React, { useState } from 'react';
import { Bouton, Erreur } from '../ui/composants.jsx';

// Boîte à suggestions (#/avis/<jeton du QR « Menu The Dream »>) : sans compte, sans nom, sans numéro.
// Rien ne suit le client (loi congolaise 29-2019 sur les données personnelles) : une note, des sujets, un mot.
const NOTES = [[1, '😞'], [2, '😕'], [3, '😐'], [4, '🙂'], [5, '😍']];
const SUJETS = ['Accueil', 'Service', 'Attente', 'Boissons', 'Cuisine', 'Prix', 'Musique', 'Propreté', 'Ambiance'];

export function AvisPublic({ donnees, jeton }) {
  const [note, setNote] = useState(0);
  const [sujets, setSujets] = useState([]);
  const [message, setMessage] = useState('');
  const [site, setSite] = useState('');
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');
  const basculer = (s) => setSujets((l) => (l.includes(s) ? l.filter((x) => x !== s) : l.length >= 6 ? l : [...l, s]));
  const envoyer = async (e) => {
    e.preventDefault();
    if (!note) return setErreur('Touchez un visage pour donner une note.');
    setEtat('envoi');
    setErreur('');
    try {
      await donnees.rpc('laisser_suggestion', { p_jeton: jeton, p: { note, sujets, message: message.trim() || null, site } });
      await donnees.attendreEcriture?.().catch(() => {});
      setEtat('merci');
    } catch (err) {
      setErreur(err.message);
      setEtat('');
    }
  };
  if (etat === 'merci') {
    return (
      <div className="ecran-centre">
        <div className="connexion-carte xp-avis-public" role="status">
          <h1>Merci !</h1>
          <p className="texte-doux">Votre avis est bien arrivé. Il aide l’équipe à faire encore mieux.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="ecran-centre">
      <form className="connexion-carte formulaire xp-avis-public" onSubmit={envoyer}>
        <h1>Votre avis compte</h1>
        <p className="texte-doux">Sans nom ni numéro : personne ne sait qui écrit.</p>
        <div className="xp-notes" role="group" aria-label="Note">
          {NOTES.map(([n, emoji]) => (
            <button key={n} type="button" className={note === n ? 'actif' : ''} aria-pressed={note === n} aria-label={`${n} sur 5`} onClick={() => setNote(n)}>{emoji}</button>
          ))}
        </div>
        <div className="puces" role="group" aria-label="Sujets">
          {SUJETS.map((s) => <button key={s} type="button" className={sujets.includes(s) ? 'actif' : ''} aria-pressed={sujets.includes(s)} onClick={() => basculer(s)}>{s}</button>)}
        </div>
        <label className="champ">
          <span className="champ-libelle">Un mot pour l’équipe (facultatif)</span>
          <textarea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        {/* Champ piège pour les robots : invisible pour les personnes. */}
        <input className="sr-only" tabIndex={-1} autoComplete="off" aria-hidden="true" value={site} onChange={(e) => setSite(e.target.value)} name="site" />
        <Erreur message={erreur} />
        <Bouton type="submit" variante="principal" chargement={etat === 'envoi'}>Envoyer mon avis</Bouton>
      </form>
    </div>
  );
}
