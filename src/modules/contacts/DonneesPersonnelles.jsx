import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { dateLocale } from '../../noyau/format.js';
import { telecharger } from '../../ui/communs.jsx';
import { Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';

const MOT_CONFIRMATION = 'ANONYMISER';

// Droits de la personne (export, effacement) : réservés au gérant (permission contacts.donnees_personnelles).
export function ActionsDonneesPersonnelles({ contact, onChange }) {
  const { api, peut, notifier } = useEspace();
  const [anonymiser, setAnonymiser] = useState(false);
  const [erreur, setErreur] = useState('');
  if (!peut('contacts.donnees_personnelles') || contact.anonymise_le) return null;
  const exporter = async () => {
    setErreur('');
    try {
      const r = await api.rpc('exporter_donnees_contact', { p_contact_id: contact.id });
      telecharger(`donnees-contact-${dateLocale()}.json`, JSON.stringify(r, null, 2), 'application/json;charset=utf-8');
      notifier('Données exportées');
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <>
      <Bouton icone="telecharger" onClick={exporter}>Exporter ses données</Bouton>
      <Bouton variante="danger" onClick={() => setAnonymiser(true)}>Anonymiser</Bouton>
      <Erreur message={erreur} />
      {anonymiser && (
        <ModaleAnonymisation contact={contact} onFermer={() => setAnonymiser(false)}
          onFait={() => { setAnonymiser(false); notifier('Contact anonymisé'); onChange?.(); }} />
      )}
    </>
  );
}

function ModaleAnonymisation({ contact, onFermer, onFait }) {
  const { api } = useEspace();
  const [motif, setMotif] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      await api.rpc('anonymiser_contact', { p_contact_id: contact.id, p_motif: motif });
      onFait();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={`Anonymiser « ${contact.societe || contact.nom} »`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p>À faire seulement quand la personne le demande. Nom, téléphone, e-mail, adresse et notes sont effacés de sa fiche,
          de ses interlocuteurs, rendez-vous, réservations, tickets, commandes, livraisons et campagnes, ainsi que de l’historique.</p>
        <p className="texte-doux">Les montants, dates et numéros restent (comptabilité). Ce n’est pas réversible : exportez ses données avant si elle les demande aussi.</p>
        <Champ libelle="Demande reçue (date, canal)"><textarea rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={500} required autoFocus /></Champ>
        <Champ libelle={`Tapez ${MOT_CONFIRMATION} pour confirmer`}><input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Retour</Bouton>
          <Bouton type="submit" variante="danger" chargement={envoi} disabled={!motif.trim() || confirmation.trim().toUpperCase() !== MOT_CONFIRMATION}>Anonymiser définitivement</Bouton>
        </div>
      </form>
    </Modale>
  );
}
