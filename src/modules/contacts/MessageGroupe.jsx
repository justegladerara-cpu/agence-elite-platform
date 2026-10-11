import React, { useMemo, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { liensGroupe, numeroWhatsApp } from '../../noyau/messagesWhatsapp.js';
import { Bouton, Champ, Modale, Onglets, Recherche } from '../../ui/composants.jsx';
import { contactsPourEnvoi, FILTRES_ENVOI } from './envoiGroupe.js';
import './contacts.css';

// « Message à plusieurs clients » : on choisit les clients, on écrit le message, puis l'application prépare un lien
// WhatsApp par client. La personne ouvre chaque lien et appuie elle-même sur « Envoyer » : rien ne part tout seul.
export function MessageGroupe({ contacts, soldes, onFermer }) {
  const { etablissement } = useEspace();
  const [filtre, setFiltre] = useState('clients');
  const [recherche, setRecherche] = useState('');
  const [choisis, setChoisis] = useState(() => new Set());
  const [message, setMessage] = useState(`Bonjour {nom},\n\n\n${etablissement.identite?.nom_commercial ?? etablissement.nom}`);
  const [liens, setLiens] = useState(null);
  const [ouverts, setOuverts] = useState(() => new Set());
  const proposes = useMemo(() => contactsPourEnvoi(contacts, { filtre, soldes, recherche }), [contacts, filtre, soldes, recherche]);
  const joignables = proposes.filter((c) => numeroWhatsApp(c.telephone));
  const basculer = (id) => setChoisis((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const toutCocher = () => setChoisis((s) => new Set([...s, ...joignables.map((c) => c.id)]));
  const selection = contacts.filter((c) => choisis.has(c.id));

  if (liens) {
    return (
      <Modale titre="Envoyer un par un" onFermer={onFermer} pied={<Bouton onClick={() => setLiens(null)}>Revenir au message</Bouton>}>
        <p className="texte-doux">
          Touchez « Ouvrir WhatsApp » pour chaque client, puis « Envoyer » dans WhatsApp. {ouverts.size} / {liens.avec.length} ouvert(s).
        </p>
        <div className="envoi-groupe-liste">
          {liens.avec.map(({ contact, url }) => (
            <div key={contact.id} className={`liste-ligne ${ouverts.has(contact.id) ? 'fait' : ''}`}>
              <span><strong>{contact.nom}</strong><small className="texte-doux bloc">{contact.telephone}</small></span>
              <a className="bouton" href={url} target="_blank" rel="noreferrer" onClick={() => setOuverts((s) => new Set([...s, contact.id]))}>
                {ouverts.has(contact.id) ? 'Ouvert ✓' : 'Ouvrir WhatsApp'}
              </a>
            </div>
          ))}
        </div>
        {liens.sans.length > 0 && <p className="texte-doux">Sans numéro (non prévenus) : {liens.sans.map((c) => c.nom).join(', ')}.</p>}
      </Modale>
    );
  }

  return (
    <Modale titre="Message à plusieurs clients" onFermer={onFermer} large pied={(
      <>
        <Bouton onClick={onFermer}>Annuler</Bouton>
        <Bouton variante="principal" disabled={!selection.length || !message.trim()} onClick={() => setLiens(liensGroupe(selection, message))}>
          Préparer {selection.length || ''} message(s)
        </Bouton>
      </>
    )}>
      <div className="formulaire">
        <Champ libelle="Message" aide="{nom} sera remplacé par le nom de chaque client.">
          <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Champ>
        <p className="texte-doux">Envoyez seulement aux clients d’accord pour recevoir vos messages.</p>
        <div className="filtres">
          <Onglets onglets={FILTRES_ENVOI} actif={filtre} onChange={setFiltre} />
          <Recherche valeur={recherche} onChange={setRecherche} placeholder="Nom ou téléphone" />
        </div>
        <div className="titre-ligne">
          <span>{choisis.size} choisi(s)</span>
          <span className="groupe-boutons">
            {joignables.length > 0 && <button type="button" className="lien" onClick={toutCocher}>Tout cocher ({joignables.length})</button>}
            {choisis.size > 0 && <button type="button" className="lien" onClick={() => setChoisis(new Set())}>Tout décocher</button>}
          </span>
        </div>
        <div className="envoi-groupe-liste">
          {!proposes.length && <p className="texte-doux">Aucun contact ici.</p>}
          {proposes.map((c) => {
            const joignable = Boolean(numeroWhatsApp(c.telephone));
            return (
              <label key={c.id} className={`case envoi-groupe-choix ${joignable ? '' : 'texte-faible'}`}>
                <input type="checkbox" checked={choisis.has(c.id)} disabled={!joignable} onChange={() => basculer(c.id)} />
                <span>{c.nom}<small className="texte-doux bloc">{joignable ? c.telephone : 'Pas de numéro'}</small></span>
              </label>
            );
          })}
        </div>
      </div>
    </Modale>
  );
}
