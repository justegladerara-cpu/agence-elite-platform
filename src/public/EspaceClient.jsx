import React, { useCallback, useEffect, useState } from 'react';
import { enFuseau, formatDate, formatDateHeure, formatMontant, formatQuantite } from '../noyau/format.js';
import { envoyerAvecReprise } from '../noyau/envoi.js';
import { lireFichier, tailleLisible, telecharger, TYPES_ACCEPTES } from '../ui/communs.jsx';
import { Badge, Bouton, Champ, Chargement, Erreur, Modale, Onglets } from '../ui/composants.jsx';
import ChiffresBilan from '../ui/ChiffresBilan.jsx';

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
export const STATUTS_RDV_CLIENT = {
  prevu: ['À confirmer', 'orange'], confirme: ['Confirmé', 'vert'], honore: ['Passé', 'neutre'], annule: ['Annulé', 'neutre'], absent: ['Manqué', 'rouge'],
};

// Ce qui attend le client : messages de l'équipe depuis sa visite précédente, documents jamais ouverts, livrables à valider.
export function nouveautes(espace) {
  const depuis = espace.precedente_ouverture ? new Date(espace.precedente_ouverture) : null;
  const messages = depuis ? (espace.messages ?? []).filter((m) => m.auteur === 'equipe' && new Date(m.cree_le) > depuis).length : 0;
  const documents = (espace.documents ?? []).filter((d) => !d.vu_le).length;
  const livrables = (espace.projets ?? []).reduce((n, p) => n + p.livrables.filter((l) => l.statut === 'soumis').length, 0);
  const morceaux = [
    messages && `${messages} message${messages > 1 ? 's' : ''} de l’équipe`,
    documents && `${documents} document${documents > 1 ? 's' : ''} à consulter`,
    livrables && `${livrables} livrable${livrables > 1 ? 's' : ''} à valider`,
  ].filter(Boolean);
  return morceaux;
}

// Créneaux regroupés par jour, dans le fuseau de l'établissement.
export function parJour(creneaux, fuseau) {
  const jours = [];
  for (const c of creneaux) {
    const f = enFuseau(c, fuseau);
    const dernier = jours[jours.length - 1];
    if (dernier && dernier.cle === f.cle) dernier.creneaux.push({ debut: c, heure: f.heure });
    else jours.push({ cle: f.cle, jour: f.jour, creneaux: [{ debut: c, heure: f.heure }] });
  }
  return jours;
}

function ChoixCreneau({ agenda, titre, onChoisir, onFermer }) {
  const jours = parJour(agenda.creneaux, agenda.fuseau);
  const [jour, setJour] = useState(jours[0]?.cle ?? '');
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  const choisi = jours.find((j) => j.cle === jour);
  return (
    <Modale titre={titre} onFermer={onFermer}>
      <div className="pile">
        {jours.length === 0 ? <p className="texte-doux">Aucun créneau libre pour l’instant. Écrivez-nous dans « Messages ».</p> : (
          <>
            <p className="texte-doux">Heures de l’établissement ({agenda.fuseau}). Rendez-vous de {agenda.duree} minutes.</p>
            <Champ libelle="Jour">
              <select value={jour} onChange={(e) => setJour(e.target.value)}>{jours.map((j) => <option key={j.cle} value={j.cle}>{j.jour}</option>)}</select>
            </Champ>
            {onChoisir.avecNote && <Champ libelle="Motif du rendez-vous (facultatif)"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Champ>}
            <div className="creneaux" role="group" aria-label="Heures libres">
              {choisi?.creneaux.map((c) => (
                <Bouton key={c.debut} onClick={async () => {
                  setErreur('');
                  try {
                    await onChoisir.faire(c.debut, note);
                  } catch (err) {
                    setErreur(err.message);
                  }
                }}>{c.heure}</Bouton>
              ))}
            </div>
          </>
        )}
        <Erreur message={erreur} />
      </div>
    </Modale>
  );
}

function RendezVous({ jeton, donnees }) {
  const [agenda, setAgenda] = useState(null);
  const [choix, setChoix] = useState(null);
  const [annulation, setAnnulation] = useState(null);
  const [motif, setMotif] = useState('');
  const [retour, setRetour] = useState('');
  const charger = useCallback(() => donnees.rpc('portail_agenda', { p_jeton: jeton }).then(setAgenda).catch((e) => setRetour(e.message)), [donnees, jeton]);
  useEffect(() => { charger(); }, [charger]);
  if (!agenda) return retour ? <Erreur message={retour} /> : <Chargement />;
  const agir = async (appel, texte) => {
    setRetour('');
    try {
      await appel();
      setRetour(texte);
      setChoix(null);
      setAnnulation(null);
      charger();
    } catch (err) {
      setRetour(err.message);
      throw err;
    }
  };
  const quand = (r) => {
    const f = enFuseau(r.debut, agenda.fuseau);
    return `${f.jour} à ${f.heure}`;
  };
  const avenir = agenda.rendez_vous.filter((r) => r.modifiable);
  const passes = agenda.rendez_vous.filter((r) => !r.modifiable);
  return (
    <div className="pile">
      {agenda.en_ligne && (
        <div><Bouton variante="principal" icone="plus" onClick={() => setChoix({ titre: 'Prendre rendez-vous', avecNote: true,
          faire: (debut, note) => agir(() => donnees.rpc('portail_demander_rdv', { p_jeton: jeton, p_debut: debut, p_note: note || null }), 'Rendez-vous demandé : l’équipe est prévenue.') })}>Prendre rendez-vous</Bouton></div>
      )}
      {retour && <p role="status">{retour}</p>}
      {agenda.rendez_vous.length === 0 && <p className="texte-doux">Aucun rendez-vous.{agenda.en_ligne ? '' : ' Pour en prendre un, écrivez-nous dans « Messages ».'}</p>}
      {avenir.map((r) => {
        const [libelle, ton] = STATUTS_RDV_CLIENT[r.statut] ?? [r.statut, 'neutre'];
        return (
          <section key={r.id} className="carte pile">
            <h2>{quand(r)} <Badge ton={ton}>{libelle}</Badge></h2>
            <p className="texte-doux">{r.titre}{r.lieu ? ` · ${r.lieu}` : ''}</p>
            <div className="actions">
              {r.statut === 'prevu' && <Bouton variante="principal" onClick={() => agir(() => donnees.rpc('portail_confirmer_rdv', { p_jeton: jeton, p_rdv_id: r.id }), 'Merci, votre présence est confirmée.').catch(() => {})}>Je confirme</Bouton>}
              {agenda.en_ligne && <Bouton onClick={() => setChoix({ titre: 'Déplacer le rendez-vous',
                faire: (debut) => agir(() => donnees.rpc('portail_deplacer_rdv', { p_jeton: jeton, p_rdv_id: r.id, p_debut: debut }), 'Rendez-vous déplacé : l’équipe va le confirmer.') })}>Déplacer</Bouton>}
              <Bouton variante="danger" onClick={() => { setMotif(''); setAnnulation(r); }}>Annuler</Bouton>
            </div>
          </section>
        );
      })}
      {passes.length > 0 && (
        <>
          <h3>Rendez-vous passés ou annulés</h3>
          <ul>{passes.map((r) => <li key={r.id}>{quand(r)} · {r.titre} · <span className="texte-doux">{(STATUTS_RDV_CLIENT[r.statut] ?? [r.statut])[0]}</span></li>)}</ul>
        </>
      )}
      {choix && <ChoixCreneau agenda={agenda} titre={choix.titre} onChoisir={choix} onFermer={() => setChoix(null)} />}
      {annulation && (
        <Modale titre="Annuler le rendez-vous" onFermer={() => setAnnulation(null)}>
          <div className="pile">
            <p>{quand(annulation)} · {annulation.titre}</p>
            <Champ libelle="Motif (facultatif)"><textarea rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={500} /></Champ>
            <div className="actions">
              <Bouton onClick={() => setAnnulation(null)}>Garder le rendez-vous</Bouton>
              <Bouton variante="danger" onClick={() => agir(() => donnees.rpc('portail_annuler_rdv', { p_jeton: jeton, p_rdv_id: annulation.id, p_motif: motif || null }), 'Rendez-vous annulé : l’équipe est prévenue.').catch(() => {})}>Annuler le rendez-vous</Bouton>
            </div>
          </div>
        </Modale>
      )}
    </div>
  );
}

function Aide({ jeton, donnees }) {
  const [articles, setArticles] = useState(null);
  const [recherche, setRecherche] = useState('');
  useEffect(() => { donnees.rpc('portail_aide', { p_jeton: jeton }).then(setArticles).catch(() => setArticles([])); }, [donnees, jeton]);
  if (!articles) return <Chargement />;
  const mot = recherche.trim().toLowerCase();
  const vus = articles.filter((a) => !mot || `${a.titre} ${a.texte} ${a.categorie ?? ''}`.toLowerCase().includes(mot));
  return (
    <div className="pile">
      <Champ libelle="Chercher dans l’aide"><input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} /></Champ>
      {vus.length === 0 && <p className="texte-doux">Aucun article. Posez votre question dans « Messages ».</p>}
      {vus.map((a) => (
        <details key={a.id} className="carte">
          <summary><strong>{a.titre}</strong>{a.categorie ? <span className="texte-doux"> · {a.categorie}</span> : null}</summary>
          <p className="texte-multiligne">{a.texte}</p>
        </details>
      ))}
    </div>
  );
}

const IMPACTS_CLIENT = { interruption: 'Service interrompu', partiel: 'Service en partie indisponible', ralentissement: 'Service ralenti' };
export const STATUTS_RECOMMANDATION = { en_attente: ['Transmise', 'orange'], converti: ['Devenue cliente', 'bleu'], recompense: ['Récompense accordée', 'vert'] };

// Annonces de maintenance : en cours, à venir dans les 30 jours, ou annulées récemment (dans le fuseau de l'établissement).
export function texteMaintenance(m, fuseau) {
  const debut = enFuseau(m.debut, fuseau);
  const fin = enFuseau(m.fin, fuseau);
  const quand = debut.cle === fin.cle ? `${debut.jour}, de ${debut.heure} à ${fin.heure}` : `du ${debut.jour} ${debut.heure} au ${fin.jour} ${fin.heure}`;
  if (m.statut === 'annulee') return `Maintenance annulée (${quand}) : ${m.titre}${m.motif_annulation ? `. ${m.motif_annulation}` : ''}`;
  return `${m.en_cours ? 'Maintenance en cours' : 'Maintenance prévue'} ${quand} : ${m.titre} (${IMPACTS_CLIENT[m.impact] ?? m.impact})${m.description ? `. ${m.description}` : ''}`;
}

function BilansClient({ jeton, donnees, bilans }) {
  const [ouvert, setOuvert] = useState(null);
  const ouvrir = (b) => {
    setOuvert(ouvert === b.id ? null : b.id);
    if (!b.vu_le) donnees.rpc('portail_bilan_vu', { p_jeton: jeton, p_bilan_id: b.id }).catch(() => {});
  };
  return (
    <div className="pile">
      {bilans.map((b) => (
        <section key={b.id} className="carte pile">
          <h2><button type="button" className="lien" onClick={() => ouvrir(b)} aria-expanded={ouvert === b.id}>{b.titre}</button> {!b.vu_le && <Badge ton="orange">Nouveau</Badge>}</h2>
          <p className="texte-doux">Du {formatDate(b.du)} au {formatDate(b.au)} · {b.numero}</p>
          {ouvert === b.id && (
            <div className="pile a-imprimer">
              <ChiffresBilan chiffres={b.chiffres} />
              {b.synthese && <><h3>Synthèse</h3><p className="texte-multiligne">{b.synthese}</p></>}
              {b.prochaines_actions && <><h3>Prochaines actions</h3><p className="texte-multiligne">{b.prochaines_actions}</p></>}
              <p className="texte-doux">Une question ou une remarque sur ce bilan ? Écrivez-nous dans « Messages ».</p>
              <div><Bouton icone="imprimer" onClick={() => window.print()}>Imprimer</Bouton></div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Recommander({ jeton, donnees, parrainage, onFait }) {
  const [v, setV] = useState({ nom: '', telephone: '', email: '', note: '' });
  const [retour, setRetour] = useState('');
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const envoyer = async (e) => {
    e.preventDefault();
    setErreur('');
    setRetour('');
    try {
      await donnees.rpc('portail_recommander', { p_jeton: jeton, p_nom: v.nom, p_telephone: v.telephone || null, p_email: v.email || null, p_note: v.note || null });
      setV({ nom: '', telephone: '', email: '', note: '' });
      setRetour('Merci : votre recommandation est transmise à l’équipe.');
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <div className="pile">
      {parrainage.actif && (
        <form className="formulaire carte" onSubmit={envoyer}>
          <p>Vous connaissez quelqu’un à qui nous pourrions être utiles ? Recommandez-le : l’équipe le contactera de votre part.</p>
          {parrainage.recompense && <p><strong>Votre récompense quand cette personne devient cliente : {parrainage.recompense}</strong></p>}
          <Champ libelle="Nom de la personne ou de l’entreprise"><input value={v.nom} onChange={changer('nom')} maxLength={120} required /></Champ>
          <Champ libelle="Téléphone"><input type="tel" value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={v.email} onChange={changer('email')} maxLength={160} /></Champ>
          <Champ libelle="Son besoin, en quelques mots (facultatif)"><textarea rows={2} value={v.note} onChange={changer('note')} maxLength={1000} /></Champ>
          <p className="texte-doux">Prévenez la personne avant : nous la contacterons de votre part.</p>
          <Erreur message={erreur} />
          {retour && <p role="status">{retour}</p>}
          <div><Bouton type="submit" variante="principal" disabled={v.nom.trim().length < 2 || (!v.telephone.trim() && !v.email.trim())}>Recommander</Bouton></div>
        </form>
      )}
      {parrainage.recommandations.length > 0 && (
        <>
          <h2>Vos recommandations</h2>
          <ul>{parrainage.recommandations.map((r, i) => {
            const [libelle, ton] = STATUTS_RECOMMANDATION[r.statut] ?? [r.statut, 'neutre'];
            return <li key={i}>{r.nom} · {formatDate(r.cree_le)} <Badge ton={ton}>{libelle}</Badge>{r.statut === 'recompense' && (r.recompense || r.points) ? ` ${[r.recompense, r.points && `${r.points} points de fidélité`].filter(Boolean).join(' · ')}` : ''}</li>;
          })}</ul>
        </>
      )}
    </div>
  );
}

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
        {d.devise_document && Number(d.taux_document) > 0 && (
          <p className="nombre texte-doux">
            Soit {formatMontant(Math.round((Number(d.total_ttc) / Number(d.taux_document)) * 100) / 100, d.devise_document)} (1 {d.devise_document} = {montant(d.taux_document)}
            {d.taux_jour ? ` au ${formatDate(d.taux_jour)}` : ''}). Le montant à régler est le total en {devise}.
          </p>
        )}
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
  const [suivi, setSuivi] = useState(null);
  const chargerSuivi = useCallback(() => donnees.rpc('portail_suivi', { p_jeton: jeton }).then(setSuivi).catch(() => {}), [donnees, jeton]);
  useEffect(() => { chargerSuivi(); }, [chargerSuivi]);
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
      const nom = fichier.name.replace(/[<>/\\]/g, '_').slice(0, 160);
      const avant = espace.depots.filter((d) => d.nom === nom).length;
      const resultat = await envoyerAvecReprise(() => donnees.rpc('portail_deposer_fichier', { p_jeton: jeton, p_nom: nom, p_contenu: contenu, p_note: null }), {
        surAttente: (essai, total) => setRetour(`Connexion perdue : l’envoi reprendra tout seul dès le retour du réseau (essai ${essai} sur ${total}).`),
        dejaRecu: async () => (await donnees.rpc('portail_ouvrir', { p_jeton: jeton })).depots.filter((d) => d.nom === nom).length > avant,
      });
      setRetour(resultat?.dejaRecu ? 'Fichier bien reçu (après la coupure de réseau).' : 'Fichier envoyé.');
      charger();
    } catch (err) {
      setRetour(err.message);
    }
  };
  const attente = documents.filter(peutRepondre).length;
  const onglets = [
    ['documents', `Devis et factures${attente ? ` (${attente} à répondre)` : ''}`],
    projets.length > 0 && ['projets', 'Projets'],
    espace.agenda && ['rdv', 'Rendez-vous'],
    ['messages', 'Messages'],
    espace.depot_fichiers && ['fichiers', 'Envoyer un fichier'],
    espace.aide && ['aide', 'Aide'],
    suivi?.bilans.length > 0 && ['bilans', 'Bilans'],
    (suivi?.parrainage.actif || suivi?.parrainage.recommandations.length > 0) && ['recommander', 'Recommander'],
  ].filter(Boolean);
  const aVoir = nouveautes(espace);
  const bilansNonLus = (suivi?.bilans ?? []).filter((b) => !b.vu_le).length;
  if (bilansNonLus) aVoir.push(`${bilansNonLus} bilan${bilansNonLus > 1 ? 's' : ''} à lire`);
  return (
    <div className="page espace-client">
      <header className="pile">
        <p className="texte-doux">{espace.emetteur.nom}{espace.emetteur.telephone ? ` · ${espace.emetteur.telephone}` : ''}{espace.emetteur.email ? ` · ${espace.emetteur.email}` : ''}</p>
        <h1>Espace de {espace.contact.societe || espace.contact.nom}</h1>
        {espace.message_accueil && <p>{espace.message_accueil}</p>}
        <p className="texte-doux">Lien personnel, valable jusqu’au {formatDate(espace.expire_le)}. Ne le transférez pas.</p>
        {(suivi?.maintenances ?? []).map((m) => <p key={m.id} className="encart" role="status">{texteMaintenance(m, suivi.fuseau)}</p>)}
        {aVoir.length > 0 && <p className="encart" role="status">{espace.precedente_ouverture ? 'Depuis votre dernière visite' : 'À voir'} : {aVoir.join(', ')}.</p>}
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
      {onglet === 'rdv' && <RendezVous jeton={jeton} donnees={donnees} />}
      {onglet === 'aide' && <Aide jeton={jeton} donnees={donnees} />}
      {onglet === 'bilans' && suivi && <BilansClient jeton={jeton} donnees={donnees} bilans={suivi.bilans} />}
      {onglet === 'recommander' && suivi && <Recommander jeton={jeton} donnees={donnees} parrainage={suivi.parrainage} onFait={chargerSuivi} />}
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
