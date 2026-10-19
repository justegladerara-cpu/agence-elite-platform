// Double authentification (code à 6 chiffres d'une application comme Google Authenticator) pour l'équipe
// Agence Elite. La base décide (mon_etat_securite) ; cet écran aide seulement à obtenir le niveau aal2.
// Modes :
//   'verifier'   : un téléphone est déjà enrôlé, le code est demandé avant toute administration ;
//   'enroler'    : mode obligatoire et aucun téléphone : enrôlement à faire maintenant ;
//   'proposer'   : transition, aucun téléphone : enrôlement conseillé, « Plus tard » possible ;
//   'reconnexion': session expirée ou fermée : il faut se reconnecter.
import React, { useEffect, useState } from 'react';
import { Bouton, Champ, Erreur } from '../ui/composants.jsx';

export const CLE_PLUS_TARD = 'ae-mfa-plus-tard';

export function modeDoubleAuth(securite, { mfaDisponible = true, plusTard = false } = {}) {
  if (!securite?.equipe || !mfaDisponible) return null;
  if (securite.reconnexion_requise) return 'reconnexion';
  if (securite.double_auth_requise) return 'verifier';
  if (securite.enrolement_requis) return 'enroler';
  if (!securite.facteur_verifie && !plusTard) return 'proposer';
  return null;
}

const journaliser = (donnees, evenement, details = {}) =>
  donnees.rpc('journaliser_securite', { p_evenement: evenement, p_details: details }).catch(() => {});

function ChampCode({ valeur, onChange }) {
  return (
    <Champ libelle="Code à 6 chiffres" aide="Le code change toutes les 30 secondes : saisissez celui affiché maintenant.">
      <input
        value={valeur}
        onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        required
        autoFocus
      />
    </Champ>
  );
}

function Verification({ donnees, onFait, onDeconnexion }) {
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const envoyer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const [facteur] = await donnees.mfa.facteurs();
      if (!facteur) throw new Error('Aucun téléphone enregistré : contactez le super administrateur.');
      await donnees.mfa.verifier(facteur.id, code);
      await journaliser(donnees, 'mfa_code_accepte');
      onFait();
    } catch (err) {
      await journaliser(donnees, 'mfa_code_refuse');
      setErreur(err.message);
      setCode('');
      setChargement(false);
    }
  };
  return (
    <form className="formulaire" onSubmit={envoyer}>
      <h1>Double authentification</h1>
      <p className="texte-doux">Ouvrez votre application d’authentification et saisissez le code « Agence Elite ».</p>
      <ChampCode valeur={code} onChange={setCode} />
      <Erreur message={erreur} />
      <Bouton type="submit" variante="principal" chargement={chargement}>Valider</Bouton>
      <button type="button" className="lien" onClick={() => onDeconnexion()}>Se déconnecter</button>
      <small className="texte-doux bloc">Téléphone perdu ? Suivez la procédure de récupération (SOP 91) avec le propriétaire du compte Supabase.</small>
    </form>
  );
}

function Enrolement({ donnees, obligatoire, onFait, onPlusTard, onDeconnexion }) {
  const [enrolement, setEnrolement] = useState(null);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [voirCle, setVoirCle] = useState(false);
  const commencer = async () => {
    setChargement(true);
    setErreur('');
    try {
      setEnrolement(await donnees.mfa.enroler());
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await donnees.mfa.verifier(enrolement.id, code);
      await journaliser(donnees, 'mfa_enrole');
      // Les sessions ouvertes ailleurs avant l'activation sont fermées.
      try {
        await donnees.mfa.fermerAutresSessions();
        await journaliser(donnees, 'autres_sessions_fermees');
      } catch { /* non bloquant : la base refuse déjà ces sessions (aal1) */ }
      onFait();
    } catch (err) {
      await journaliser(donnees, 'mfa_code_refuse', { etape: 'enrolement' });
      setErreur(err.message);
      setCode('');
      setChargement(false);
    }
  };
  if (!enrolement) {
    return (
      <div className="formulaire">
        <h1>Protégez votre compte</h1>
        <p>
          {obligatoire
            ? 'La double authentification est obligatoire pour l’équipe Agence Elite.'
            : 'Votre compte peut agir sur tous les clients. Activez la double authentification : sans votre téléphone, un mot de passe volé ne suffira plus.'}
        </p>
        <p className="texte-doux">Il vous faut une application d’authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator…).</p>
        <Erreur message={erreur} />
        <Bouton variante="principal" chargement={chargement} onClick={commencer}>Activer maintenant</Bouton>
        {!obligatoire && <button type="button" className="lien" onClick={onPlusTard}>Plus tard</button>}
        <button type="button" className="lien" onClick={() => onDeconnexion()}>Se déconnecter</button>
      </div>
    );
  }
  return (
    <form className="formulaire" onSubmit={valider}>
      <h1>Scannez ce code</h1>
      <p className="texte-doux">Dans votre application, ajoutez un compte puis scannez l’image. Ensuite, saisissez le code affiché.</p>
      {enrolement.qr && <img src={enrolement.qr} alt="Code QR à scanner avec l’application d’authentification" width={200} height={200} />}
      {voirCle
        ? <code className="bloc" style={{ wordBreak: 'break-all' }}>{enrolement.secret}</code>
        : <button type="button" className="lien" onClick={() => setVoirCle(true)}>Je ne peux pas scanner : afficher la clé</button>}
      <ChampCode valeur={code} onChange={setCode} />
      <Erreur message={erreur} />
      <Bouton type="submit" variante="principal" chargement={chargement}>Valider et activer</Bouton>
      <small className="texte-doux bloc">Conseil : enregistrez aussi ce code sur un 2e téléphone de confiance (secours en cas de perte).</small>
    </form>
  );
}

export default function DoubleAuthentification({ mode, donnees, onFait, onPlusTard, onDeconnexion }) {
  useEffect(() => {
    if (mode === 'reconnexion') onDeconnexion('expiree');
  }, [mode, onDeconnexion]);
  if (mode === 'reconnexion') return null;
  if (mode === 'verifier') return <Verification donnees={donnees} onFait={onFait} onDeconnexion={onDeconnexion} />;
  return <Enrolement donnees={donnees} obligatoire={mode === 'enroler'} onFait={onFait} onPlusTard={onPlusTard} onDeconnexion={onDeconnexion} />;
}
