import React, { useCallback, useEffect, useState } from 'react';
import { formatDate, formatDateHeure, formatMontant, formatQuantite } from '../noyau/format.js';
import { lireFichier, tailleLisible, telecharger, TYPES_ACCEPTES } from '../ui/communs.jsx';
import { Badge, Bouton, Champ, Chargement, Erreur, Modale, Onglets } from '../ui/composants.jsx';

// Espace client (#/espace/<jeton>) : sans compte, par le lien personnel envoyé par l'établissement.
// La base contrôle tout (jeton, expiration, document du bon client, limites) ; cet écran ne fait qu'afficher.

const NOMS = { devis: 'Devis', facture: 'Facture', avoir: 'Avoir' };
export function etatDocument(d) {
  if (d.type === 'devis') {
    return {
      envoye: ['À votre réponse', 'orange'], accepte: ['Accepté', 'vert'], refuse: ['Refusé', 'rouge'], converti: ['Facturé', 'bleu'],
    }[d.statut] ?? [d.statut, 'neutre'];
  }
  if (d.type === 'avoir') return ['Avoir', 'bleu'];
  return Number(d.reste) > 0 ? ['Reste à payer', 'orange'] : ['Payée', 'vert'];
}
export const peutRepondre = (d) => d.type === 'devis' && d.statut === 'envoye';
const STATUTS_TACHE = { a_faire: 'À faire', en_cours: 'En cours', en_revue: 'En relecture', terminee: 'Terminée' };
const STATUTS_LIVRABLE = { soumis: ['À valider', 'orange'], valide: ['Validé', 'vert'], a_corriger: ['En correction', 'rouge'] };
const STATUTS_PROJET = { a_venir: 'À venir', en_cours: 'En cours', en_pause: 'En pause', termine: 'Terminé' };

function Fiche({ d, devise, jeton, donnees, onFait }) {
  const [action, setAction] = useState(null);
  const [nom, setNom] = useState('');
  const [accord, setAccord] = useState(false);
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const montant = (v) => formatMontant(v, devise);
  const repondre = async () => {
    setErreur('');
    setEnvoi(true);
    try {
      await donnees.rpc('portail_repondre_devis', { p_jeton: jeton, p_document_id: d.id, p_reponse: action, p_nom: nom || null, p_note: note || null });
      setAction(null);
      onFait();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  const piece = async (p) => {
    try {
      const f = await donnees.rpc('portail_telecharger', { p_jeton: jeton, p_piece_id: p.id });
      telecharger(f.nom, f.contenu);
    } catch (err) {
      setErreur(err.message);
    }
  };
  const [libelle, ton] = etatDocument(d);
  return (
    <div className="pile">
      <div className="a-imprimer">
        <h2>{NOMS[d.type]} {d.numero}{d.version > 1 ? ` (version ${d.version})` : ''} <Badge ton={ton}>{libelle}</Badge></h2>
        <p className="texte-doux">Du {formatDate(d.date_document)}{d.echeance ? ` · ${d.type === 'devis' ? 'valable jusqu’au' : 'à payer avant le'} ${formatDate(d.echeance)}` : ''}{d.objet ? ` · ${d.objet}` : ''}</p>
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Désignation</th><th className="nombre">Quantité</th><th className="nombre">Prix</th><th className="nombre">Total</th></tr></thead>
            <tbody>
              {d.lignes.map((l, i) => (
                <tr key={i}>
                  <td>{l.libelle}{l.optionnelle && <> <Badge ton={l.retenue ? 'vert' : 'neutre'}>{l.retenue ? 'Option retenue' : 'Option'}</Badge></>}{l.description && <><br /><small className="texte-doux">{l.description}</small></>}</td>
                  <td className="nombre">{formatQuantite(l.quantite, l.unite)}</td>
                  <td className="nombre">{montant(l.prix_unitaire)}</td>
                  <td className="nombre">{montant(l.total_ttc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="nombre">Total HT {montant(d.total_ht)}{Number(d.total_tva) > 0 ? ` · TVA ${montant(d.total_tva)}` : ''} · <strong>Total {montant(d.total_ttc)}</strong></p>
        {d.reste != null && Number(d.reste) > 0 && <p><strong>Reste à payer : {montant(d.reste)}</strong></p>}
        {d.notes && <p>{d.notes}</p>}
        {d.conditions && <p className="texte-doux"><strong>Conditions :</strong> {d.conditions}</p>}
      </div>
      {d.pieces.length > 0 && (
        <div className="groupe-boutons">
          {d.pieces.map((p) => <Bouton key={p.id} icone="telecharger" onClick={() => piece(p)}>{p.nom} ({tailleLisible(p.taille)})</Bouton>)}
        </div>
      )}
      {d.reponse && <p className="texte-doux">Votre réponse du {formatDateHeure(d.reponse.le)}{d.reponse.nom ? `, par ${d.reponse.nom}` : ''} : {{ devis_accepte: 'accepté', devis_refuse: 'refusé', devis_modification: 'modification demandée' }[d.reponse.type]}.</p>}
      <Erreur message={erreur} />
      <div className="groupe-boutons">
        {peutRepondre(d) && <Bouton variante="principal" icone="coche" onClick={() => setAction('accepte')}>Accepter le devis</Bouton>}
        {peutRepondre(d) && <Bouton onClick={() => setAction('modification')}>Demander une modification</Bouton>}
        {peutRepondre(d) && <Bouton onClick={() => setAction('refuse')}>Refuser</Bouton>}
        <Bouton icone="imprimer" onClick={() => window.print()}>Imprimer</Bouton>
      </div>
      {action && (
        <Modale titre={{ accepte: 'Accepter le devis', refuse: 'Refuser le devis', modification: 'Demander une modification' }[action]} onFermer={() => setAction(null)}>
          <div className="formulaire">
            {action === 'accepte' && (
              <>
                <p>Montant : <strong>{montant(d.total_ttc)}</strong>. Votre acceptation est enregistrée avec votre nom, la date et l’heure.</p>
                <Champ libelle="Votre nom et prénom"><input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} autoComplete="name" /></Champ>
                <label className="case"><input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} /> J’accepte ce devis et ses conditions.</label>
              </>
            )}
            <Champ libelle={action === 'modification' ? 'Ce qu’il faut modifier' : 'Commentaire (facultatif)'}>
              <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            </Champ>
            <Erreur message={erreur} />
            <Bouton variante="principal" chargement={envoi} onClick={repondre}
              disabled={(action === 'accepte' && (!accord || nom.trim().length < 2)) || (action === 'modification' && !note.trim())}>
              {{ accepte: 'Accepter', refuse: 'Refuser le devis', modification: 'Envoyer la demande' }[action]}
            </Bouton>
          </div>
        </Modale>
      )}
    </div>
  );
}

function Livrable({ l, jeton, donnees, onFait }) {
  const [decision, setDecision] = useState(null);
  const [nom, setNom] = useState('');
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  const [libelle, ton] = STATUTS_LIVRABLE[l.statut] ?? [l.statut, 'neutre'];
  const envoyer = async () => {
    setErreur('');
    try {
      await donnees.rpc('portail_decider_livrable', { p_jeton: jeton, p_livrable_id: l.id, p_decision: decision, p_nom: nom, p_note: note || null });
      setDecision(null);
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <li>
      <strong>{l.titre}</strong> (version {l.version}) <Badge ton={ton}>{libelle}</Badge>
      {l.note && <><br /><small className="texte-doux">{l.note}</small></>}
      {l.statut === 'soumis' && (
        <div className="groupe-boutons">
          <Bouton variante="principal" onClick={() => setDecision('valide')}>Valider</Bouton>
          <Bouton onClick={() => setDecision('a_corriger')}>Demander une correction</Bouton>
        </div>
      )}
      {decision && (
        <Modale titre={decision === 'valide' ? `Valider « ${l.titre} »` : `Faire corriger « ${l.titre} »`} onFermer={() => setDecision(null)}>
          <div className="formulaire">
            <Champ libelle="Votre nom et prénom"><input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} autoComplete="name" /></Champ>
            <Champ libelle={decision === 'valide' ? 'Commentaire (facultatif)' : 'Ce qu’il faut corriger'}>
              <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            </Champ>
            <Erreur message={erreur} />
            <Bouton variante="principal" onClick={envoyer} disabled={nom.trim().length < 2 || (decision === 'a_corriger' && !note.trim())}>Envoyer</Bouton>
          </div>
        </Modale>
      )}
    </li>
  );
}

export function EspaceClientPublic({ donnees, jeton }) {
  const [espace, setEspace] = useState(null);
  const [erreur, setErreur] = useState('');
  const [onglet, setOnglet] = useState('documents');
  const [ouvert, setOuvert] = useState(null);
  const [message, setMessage] = useState('');
  const [retour, setRetour] = useState('');
  const charger = useCallback(() => donnees.rpc('portail_ouvrir', { p_jeton: jeton }).then(setEspace)
    .catch(() => setErreur('Ce lien n’existe pas ou a expiré. Demandez un nouveau lien à l’établissement qui vous l’a envoyé.')), [donnees, jeton]);
  useEffect(() => { charger(); }, [charger]);
  if (erreur) return <div className="ecran-centre"><div className="connexion-carte"><h1>Espace client</h1><p className="texte-doux">{erreur}</p></div></div>;
  if (!espace) return <div className="ecran-centre"><Chargement /></div>;
  const devise = espace.emetteur.devise;
  const documents = espace.documents ?? [];
  const projets = espace.projets ?? [];
  const ouvrir = (d) => {
    setOuvert(d.id);
    donnees.rpc('portail_document_vu', { p_jeton: jeton, p_document_id: d.id }).catch(() => {});
  };
  const fiche = documents.find((d) => d.id === ouvert);
  const envoyer = async () => {
    setRetour('');
    try {
      await donnees.rpc('portail_envoyer_message', { p_jeton: jeton, p_texte: message });
      setMessage('');
      charger();
    } catch (err) {
      setRetour(err.message);
    }
  };
  const deposer = async (e) => {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    setRetour('');
    try {
      const contenu = await lireFichier(fichier);
      await donnees.rpc('portail_deposer_fichier', { p_jeton: jeton, p_nom: fichier.name.replace(/[<>/\\]/g, '_').slice(0, 160), p_contenu: contenu, p_note: null });
      setRetour('Fichier envoyé.');
      charger();
    } catch (err) {
      setRetour(err.message);
    }
  };
  const attente = documents.filter(peutRepondre).length;
  const onglets = [
    ['documents', `Devis et factures${attente ? ` (${attente} à répondre)` : ''}`],
    projets.length > 0 && ['projets', 'Projets'],
    ['messages', 'Messages'],
    espace.depot_fichiers && ['fichiers', 'Envoyer un fichier'],
  ].filter(Boolean);
  return (
    <div className="page espace-client">
      <header className="pile">
        <p className="texte-doux">{espace.emetteur.nom}{espace.emetteur.telephone ? ` · ${espace.emetteur.telephone}` : ''}{espace.emetteur.email ? ` · ${espace.emetteur.email}` : ''}</p>
        <h1>Espace de {espace.contact.societe || espace.contact.nom}</h1>
        {espace.message_accueil && <p>{espace.message_accueil}</p>}
        <p className="texte-doux">Lien personnel, valable jusqu’au {formatDate(espace.expire_le)}. Ne le transférez pas.</p>
      </header>
      <Onglets onglets={onglets} actif={onglet} onChange={(o) => { setOnglet(o); setOuvert(null); }} />
      {onglet === 'documents' && !fiche && (
        documents.length === 0 ? <p className="texte-doux">Aucun devis ni facture pour l’instant.</p> : (
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead><tr><th>Document</th><th>Date</th><th className="nombre">Montant</th><th>État</th></tr></thead>
              <tbody>
                {documents.map((d) => {
                  const [libelle, ton] = etatDocument(d);
                  return (
                    <tr key={d.id} className="cliquable" onClick={() => ouvrir(d)}>
                      <td><button type="button" className="lien">{NOMS[d.type]} {d.numero}</button>{d.objet ? ` · ${d.objet}` : ''}</td>
                      <td>{formatDate(d.date_document)}</td>
                      <td className="nombre">{formatMontant(d.total_ttc, devise)}</td>
                      <td><Badge ton={ton}>{libelle}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
      {onglet === 'documents' && fiche && (
        <>
          <Bouton icone="retour" onClick={() => setOuvert(null)}>Tous les documents</Bouton>
          <Fiche key={fiche.id} d={fiche} devise={devise} jeton={jeton} donnees={donnees} onFait={charger} />
        </>
      )}
      {onglet === 'projets' && projets.map((p) => (
        <section key={p.id} className="carte pile">
          <h2>{p.nom} <Badge ton="bleu">{STATUTS_PROJET[p.statut] ?? p.statut}</Badge></h2>
          <p className="texte-doux">Avancement {p.avancement} %{p.date_fin_prevue ? ` · fin prévue le ${formatDate(p.date_fin_prevue)}` : ''}</p>
          <progress max={100} value={p.avancement} aria-label={`Avancement de ${p.nom}`} />
          {p.livrables.length > 0 && (
            <>
              <h3>Livrables</h3>
              <ul className="pile">{p.livrables.map((l) => <Livrable key={l.id} l={l} jeton={jeton} donnees={donnees} onFait={charger} />)}</ul>
            </>
          )}
          {p.taches.length > 0 && (
            <>
              <h3>Étapes</h3>
              <ul>{p.taches.map((t, i) => <li key={i}>{t.titre} · <span className="texte-doux">{STATUTS_TACHE[t.statut] ?? t.statut}{t.echeance ? `, prévu le ${formatDate(t.echeance)}` : ''}</span></li>)}</ul>
            </>
          )}
        </section>
      ))}
      {onglet === 'messages' && (
        <div className="pile">
          {espace.messages.length === 0 && <p className="texte-doux">Aucun message. Écrivez-nous ci-dessous.</p>}
          {espace.messages.map((m, i) => (
            <div key={i} className={`carte ${m.auteur === 'client' ? 'message-client' : ''}`}>
              <small className="texte-doux">{m.auteur === 'client' ? 'Vous' : espace.emetteur.nom} · {formatDateHeure(m.cree_le)}</small>
              <p>{m.texte}</p>
            </div>
          ))}
          <Champ libelle="Votre message"><textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} /></Champ>
          <Erreur message={retour} />
          <Bouton variante="principal" icone="message" onClick={envoyer} disabled={!message.trim()}>Envoyer</Bouton>
        </div>
      )}
      {onglet === 'fichiers' && (
        <div className="pile">
          <p className="texte-doux">Images, PDF, Word, Excel ou PowerPoint, 3 Mo au plus. L’équipe est prévenue à chaque envoi.</p>
          <Champ libelle="Choisir un fichier"><input type="file" accept={TYPES_ACCEPTES} onChange={deposer} /></Champ>
          {retour && <p role="status">{retour}</p>}
          {espace.depots.length > 0 && (
            <ul>{espace.depots.map((d, i) => <li key={i}>{d.nom} · {tailleLisible(d.taille)} · {formatDateHeure(d.cree_le)}{d.statut === 'traite' ? ' · reçu par l’équipe' : ''}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
