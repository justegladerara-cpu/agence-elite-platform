import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, ModaleMotif, PageHeader, Section, Squelette } from '../../ui/composants.jsx';
import { PiecesJointes } from '../../ui/communs.jsx';

export const STATUTS_TICKET = {
  ouvert: ['Ouvert', 'bleu'], en_cours: ['En cours', 'violet'], attente_client: ['En attente du client', 'orange'], resolu: ['Résolu', 'vert'], ferme: ['Fermé', 'neutre'],
};
export const PRIORITES = { basse: ['Basse', 'neutre'], normale: ['Normale', 'bleu'], haute: ['Haute', 'orange'], urgente: ['Urgente', 'rouge'] };
const CANAUX = { telephone: 'Téléphone', whatsapp: 'WhatsApp', email: 'E-mail', sur_place: 'Sur place', site_web: 'Site web', autre: 'Autre' };
export const NATURES = { demande: ['Demande', 'neutre'], question: ['Question', 'bleu'], incident: ['Incident', 'orange'], reclamation: ['Réclamation', 'rouge'] };
const GENRES = { reponse: 'Réponse type', article: "Article d'aide" };

// Lien WhatsApp prérempli (wa.me) : chiffres seulement ; « 00 » devant = indicatif international.
export function lienWhatsApp(telephone, texte) {
  const brut = String(telephone ?? '').trim();
  let chiffres = brut.replace(/\D/g, '');
  if (!brut.startsWith('+') && chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  if (!chiffres) return null;
  const international = brut.startsWith('+') || String(brut).replace(/\s/g, '').startsWith('00');
  return { url: `https://wa.me/${chiffres}${texte ? `?text=${encodeURIComponent(texte)}` : ''}`, international };
}
const actif = (t) => ['ouvert', 'en_cours', 'attente_client'].includes(t.statut);
const enRetard = (t) => ['ouvert', 'en_cours'].includes(t.statut) && new Date(t.echeance) < new Date();

// Support : tickets des clients, échanges, statuts, assignation.
export default function Support({ naviguer, sousRoute }) {
  const { api, etablissement, peut, utilisateur } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [tickets, equipe, contacts, bibliotheque] = await Promise.all([
      api.lire('support_tickets', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 3000 }),
      api.rpc('support_equipe', { p_etablissement_id: etab }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('support_bibliotheque', { eq: { etablissement_id: etab }, ordre: ['titre'] }).catch(() => []),
    ]);
    return { tickets, equipe, bibliotheque, contacts: contacts.filter((c) => c.type !== 'fournisseur'), membre: Object.fromEntries(equipe.map((m) => [m.user_id, m])) };
  }, [etab]);
  // #/support?etat=…&priorite=…&nouveau=1 (tableau de bord).
  const [nouveau, setNouveau] = useState(() => lireParametres().get('nouveau') === '1' && peut('support_tickets.traiter'));
  const [ticketId] = (sousRoute ?? '').split('/');
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  if (ticketId === 'bibliotheque') return <Bibliotheque d={d} onRetour={() => naviguer('support')} onChange={recharger} />;
  const ouvert = ticketId && d.tickets.find((t) => t.id === ticketId);
  if (ouvert) return <Ticket t={ouvert} d={d} onRetour={() => naviguer('support')} onChange={recharger} />;
  return (
    <div className="page page-large">
      <PageHeader titre="Support" sousTitre="Demandes des clients : pannes, réclamations, questions, service après-vente."
        actions={<>
          <Bouton onClick={() => naviguer('support/bibliotheque')}>Réponses et aide</Bouton>
          {peut('support_tickets.traiter') && <Bouton variante="principal" icone="plus" onClick={() => setNouveau(true)}>Ticket</Bouton>}
        </>} />
      <Section>
        <DataTable lignes={d.tickets} onLigne={(t) => naviguer(`support/${t.id}`)}
          rechercher={(t) => `${t.numero} ${t.sujet} ${t.nom_client} ${t.telephone ?? ''}`} placeholder="Numéro, sujet, client…"
          filtres={[
            { id: 'etat', libelle: 'État', options: [['actifs', 'À traiter'], ['retard', 'En retard'], ['moi', 'Mes tickets'], ['non_assignes', 'Non assignés'], ['escalades', 'Escaladés'], ...Object.entries(STATUTS_TICKET).map(([id, [l]]) => [id, l])],
              appliquer: (t, v) => (v === 'actifs' ? actif(t) : v === 'retard' ? enRetard(t) : v === 'moi' ? t.assigne_a === utilisateur?.id && actif(t) : v === 'non_assignes' ? !t.assigne_a && actif(t) : v === 'escalades' ? t.niveau_escalade > 0 && actif(t) : t.statut === v) },
            { id: 'nature', libelle: 'Nature', options: Object.entries(NATURES).map(([id, [l]]) => [id, l]), appliquer: (t, v) => t.nature === v },
            { id: 'priorite', libelle: 'Priorité', options: Object.entries(PRIORITES).map(([id, [l]]) => [id, l]), appliquer: (t, v) => t.priorite === v },
          ]}
          vide={<p className="texte-doux">Aucun ticket.</p>}
          colonnes={[
            { id: 'numero', libelle: 'Ticket', rendu: (t) => <><strong>{t.numero}</strong><br /><small className="texte-doux">{formatDateHeure(t.cree_le)}</small></>, tri: (t) => t.cree_le },
            { id: 'sujet', libelle: 'Sujet', rendu: (t) => <>{t.sujet}<br /><small className="texte-doux">{NATURES[t.nature]?.[0] ?? ''} · {t.nom_client}</small></> },
            { id: 'priorite', libelle: 'Priorité', rendu: (t) => <Badge ton={PRIORITES[t.priorite][1]}>{PRIORITES[t.priorite][0]}</Badge> },
            { id: 'qui', libelle: 'Assigné à', rendu: (t) => d.membre[t.assigne_a]?.nom ?? '—' },
            { id: 'echeance', libelle: 'Répondre avant', rendu: (t) => (actif(t) ? <span className={enRetard(t) ? 'texte-erreur' : ''}>{formatDateHeure(t.echeance)}</span> : '—'), tri: (t) => t.echeance },
            { id: 'statut', libelle: 'Statut', rendu: (t) => <Badge ton={STATUTS_TICKET[t.statut][1]}>{STATUTS_TICKET[t.statut][0]}</Badge> },
          ]} />
      </Section>
      {nouveau && <ModaleTicket d={d} onFermer={() => setNouveau(false)} onFait={(id) => { setNouveau(false); recharger(); naviguer(`support/${id}`); }} />}
    </div>
  );
}

function Ticket({ t, d, onRetour, onChange }) {
  const { api, peut, notifier, moduleActif } = useEspace();
  const { donnees: messages, recharger } = useDonnees(() => api.lire('support_messages', { eq: { ticket_id: t.id }, ordre: ['cree_le'] }), [t.id, t.modifie_le]);
  const { donnees: similaires } = useDonnees(() => api.rpc('tickets_similaires', { p_ticket_id: t.id }), [t.id]);
  const [texte, setTexte] = useState('');
  const [interne, setInterne] = useState(false);
  const [statut, setStatut] = useState(null);
  const [motif, setMotif] = useState(null);
  const [rdv, setRdv] = useState(false);
  const reponses = d.bibliotheque.filter((b) => b.genre === 'reponse' && b.actif);
  const wa = lienWhatsApp(t.telephone, texte.trim() || `Bonjour ${t.nom_client ?? ''}, au sujet de votre demande ${t.numero} : `);
  const [erreur, setErreur] = useState('');
  const traiter = peut('support_tickets.traiter');
  const agir = async (fn, message) => {
    setErreur('');
    try {
      await fn();
      notifier(message);
      recharger();
      onChange();
      return true;
    } catch (err) {
      setErreur(err.message);
      return false;
    }
  };
  const envoyer = async (e) => {
    e.preventDefault();
    if (await agir(() => api.rpc('ecrire_ticket_support', { p_ticket_id: t.id, p_texte: texte, p_interne: interne }), interne ? 'Note ajoutée' : 'Réponse consignée')) setTexte('');
  };
  const changer = (s, note) => agir(() => api.rpc('changer_statut_ticket', { p_ticket_id: t.id, p_statut: s, p_note: note ?? null }), STATUTS_TICKET[s][0]);
  const actionsMotif = {
    escalader: { titre: 'Escalader le ticket', texte: 'La priorité monte d\'un cran et les responsables sont prévenus.', faire: (note) => agir(() => api.rpc('escalader_ticket', { p_ticket_id: t.id, p_motif: note }), 'Ticket escaladé') },
    refus: { titre: 'Ce que le client signale encore', texte: 'Le ticket est rouvert.', faire: (note) => agir(() => api.rpc('confirmer_resolution_ticket', { p_ticket_id: t.id, p_confirme: false, p_note: note }), 'Ticket rouvert') },
  };
  return (
    <div className="page page-large">
      <PageHeader titre={`${t.numero} · ${t.sujet}`} sousTitre={`${t.nom_client}${t.telephone ? ` · ${t.telephone}` : ''} · ${CANAUX[t.canal]}`}
        badges={<><Badge ton={STATUTS_TICKET[t.statut][1]}>{STATUTS_TICKET[t.statut][0]}</Badge> <Badge ton={PRIORITES[t.priorite][1]}>{PRIORITES[t.priorite][0]}</Badge> <Badge ton={NATURES[t.nature]?.[1] ?? 'neutre'}>{NATURES[t.nature]?.[0] ?? t.nature}</Badge>{t.niveau_escalade > 0 && <> <Badge ton="rouge">Escaladé ×{t.niveau_escalade}</Badge></>}</>}
        actions={<Bouton onClick={onRetour}>Retour</Bouton>} />
      <Erreur message={erreur} />
      <div className="ticket-grille">
        <Section titre="Échanges">
          {t.description && <div className="message-ticket client"><small>Demande initiale · {formatDateHeure(t.cree_le)}</small><p className="texte-multiligne">{t.description}</p></div>}
          {(messages ?? []).map((m) => (
            <div key={m.id} className={`message-ticket${m.evenement ? ' evenement' : m.interne ? ' interne' : ''}`}>
              <small>{d.membre[m.auteur]?.nom ?? 'Équipe'} · {formatDateHeure(m.cree_le)}{m.interne && !m.evenement ? ' · note interne' : ''}</small>
              <p className="texte-multiligne">{m.texte}</p>
            </div>
          ))}
          {traiter && t.statut !== 'ferme' && (
            <form className="formulaire" onSubmit={envoyer}>
              {reponses.length > 0 && (
                <Champ libelle="Réponse type">
                  <select value="" onChange={(e) => { const r = reponses.find((x) => x.id === e.target.value); if (r) setTexte((avant) => (avant ? `${avant}\n${r.texte}` : r.texte)); }}>
                    <option value="">— Insérer une réponse type</option>
                    {reponses.map((r) => <option key={r.id} value={r.id}>{r.titre}</option>)}
                  </select>
                </Champ>
              )}
              <Champ libelle={interne ? 'Note interne (invisible pour le client)' : 'Réponse donnée au client'}>
                <textarea rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} required maxLength={5000} />
              </Champ>
              <label className="case"><input type="checkbox" checked={interne} onChange={(e) => setInterne(e.target.checked)} /> Note interne</label>
              <div className="groupe-boutons">
                <Bouton type="submit" variante="principal">Ajouter</Bouton>
                {wa && !interne && <a className="bouton secondaire" href={wa.url} target="_blank" rel="noopener noreferrer">Ouvrir dans WhatsApp</a>}
              </div>
              {wa && !interne && !wa.international && <small className="texte-doux">Numéro sans indicatif international (+…) : vérifiez-le dans WhatsApp.</small>}
              {wa && !interne && <small className="texte-doux">WhatsApp s'ouvre avec le texte ; ajoutez ensuite la réponse ici pour la garder dans le ticket.</small>}
            </form>
          )}
        </Section>
        <Section titre="Suivi">
          <dl className="fiche">
            <dt>Répondre avant</dt><dd>{formatDateHeure(t.echeance)}</dd>
            <dt>Assigné à</dt><dd>{d.membre[t.assigne_a]?.nom ?? 'Personne'}</dd>
            {t.resolu_le && <><dt>Résolu le</dt><dd>{formatDateHeure(t.resolu_le)}</dd></>}
            {t.resolution_confirmee != null && <><dt>Avis du client sur la solution</dt><dd>{t.resolution_confirmee ? 'Confirmée' : 'Non confirmée'}</dd></>}
            {t.satisfaction != null && <><dt>Satisfaction</dt><dd>{t.satisfaction}/5{t.satisfaction_commentaire ? ` · ${t.satisfaction_commentaire}` : ''}</dd></>}
          </dl>
          {peut('support_tickets.gerer') && t.statut !== 'ferme' && <Assignation t={t} d={d} onFait={() => { recharger(); onChange(); }} />}
          {traiter && (
            <div className="groupe-boutons">
              {t.statut === 'ouvert' && <Bouton onClick={() => changer('en_cours')}>Prendre en charge</Bouton>}
              {['ouvert', 'en_cours'].includes(t.statut) && <Bouton onClick={() => changer('attente_client')}>En attente du client</Bouton>}
              {t.statut === 'attente_client' && <Bouton onClick={() => changer('en_cours')}>Reprendre</Bouton>}
              {actif(t) && <Bouton variante="principal" onClick={() => setStatut('resolu')}>Résolu</Bouton>}
              {t.statut === 'resolu' && <Bouton variante="principal" onClick={() => agir(() => api.rpc('confirmer_resolution_ticket', { p_ticket_id: t.id, p_confirme: true, p_note: null }), 'Solution confirmée, ticket fermé')}>Le client confirme</Bouton>}
              {t.statut === 'resolu' && <Bouton onClick={() => setMotif('refus')}>Pas résolu pour le client</Bouton>}
              {t.statut === 'resolu' && <Bouton onClick={() => changer('ferme')}>Fermer sans réponse</Bouton>}
              {['resolu', 'ferme'].includes(t.statut) && <Bouton onClick={() => setStatut('ouvert')}>Rouvrir</Bouton>}
              {actif(t) && <Bouton onClick={() => setMotif('escalader')}>Escalader</Bouton>}
              {t.statut !== 'ferme' && moduleActif?.('agenda') && peut('agenda.gerer') && <Bouton onClick={() => setRdv(true)}>Prendre un rendez-vous</Bouton>}
            </div>
          )}
          {traiter && ['resolu', 'ferme'].includes(t.statut) && t.satisfaction == null && <Satisfaction t={t} agir={agir} />}
          {(similaires ?? []).length > 0 && (
            <div className="formulaire">
              <strong>Tickets proches</strong>
              <ul className="liste-simple">
                {similaires.map((x) => (
                  <li key={x.id}><a href={`#/support/${x.id}`}>{x.numero}</a> · {x.sujet} <Badge ton={STATUTS_TICKET[x.statut][1]}>{STATUTS_TICKET[x.statut][0]}</Badge>{x.meme_client ? ' · même client' : ''}</li>
                ))}
              </ul>
            </div>
          )}
          <PiecesJointes objetType="support_ticket" objetId={t.id} titre="Pièces jointes" peutAjouter={traiter} peutArchiver={peut('support_tickets.gerer')} />
        </Section>
      </div>
      {motif && (
        <ModaleMotif titre={actionsMotif[motif].titre} texte={actionsMotif[motif].texte} libelleAction="Valider"
          onFermer={() => setMotif(null)} onValider={(note) => { const m = motif; setMotif(null); actionsMotif[m].faire(note); }} />
      )}
      {rdv && <ModaleRdv t={t} d={d} onFermer={() => setRdv(false)} onFait={() => { setRdv(false); recharger(); onChange(); }} />}
      {statut && (
        <ModaleMotif titre={statut === 'resolu' ? 'Solution apportée' : 'Pourquoi rouvrir ?'} texte={statut === 'resolu' ? 'Ce qui a été fait (reste dans le ticket).' : 'Ex. la panne est revenue.'}
          libelleAction="Valider" onFermer={() => setStatut(null)} onValider={(note) => { const s = statut; setStatut(null); changer(s, note); }} />
      )}
    </div>
  );
}

function Assignation({ t, d, onFait }) {
  const { api, notifier } = useEspace();
  const [qui, setQui] = useState(t.assigne_a ?? '');
  const [priorite, setPriorite] = useState(t.priorite);
  const [erreur, setErreur] = useState('');
  const modifie = qui !== (t.assigne_a ?? '') || priorite !== t.priorite;
  return (
    <div className="formulaire">
      <div className="grille-champs">
        <Champ libelle="Assigner à">
          <select value={qui} onChange={(e) => setQui(e.target.value)}>
            <option value="">— Personne</option>
            {d.equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
          </select>
        </Champ>
        <Champ libelle="Priorité">
          <select value={priorite} onChange={(e) => setPriorite(e.target.value)}>{Object.entries(PRIORITES).map(([id, [l]]) => <option key={id} value={id}>{l}</option>)}</select>
        </Champ>
      </div>
      <Erreur message={erreur} />
      {modifie && (
        <div><Bouton onClick={async () => {
          setErreur('');
          try {
            await api.rpc('assigner_ticket_support', { p_ticket_id: t.id, p_assigne: qui || null, p_priorite: priorite });
            notifier('Ticket mis à jour');
            onFait();
          } catch (err) {
            setErreur(err.message);
          }
        }}>Enregistrer</Bouton></div>
      )}
    </div>
  );
}

function ModaleTicket({ d, onFermer, onFait }) {
  const { api, etablissement, peut } = useEspace();
  const [v, setV] = useState({ sujet: '', description: '', contact_id: '', nom_client: '', telephone: '', canal: 'telephone', priorite: 'normale', nature: 'demande', assigne_a: '' });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      const id = await api.rpc('ouvrir_ticket_support', { p_etablissement_id: etablissement.id, p: { ...v, assigne_a: peut('support_tickets.gerer') ? v.assigne_a : '' } });
      onFait(id);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Nouveau ticket" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Sujet"><input value={v.sujet} onChange={changer('sujet')} required maxLength={200} autoFocus placeholder="Ex. Imprimante de caisse muette" /></Champ>
        <div className="grille-champs">
          <Champ libelle="Client enregistré">
            <select value={v.contact_id} onChange={changer('contact_id')}>
              <option value="">— Autre client</option>
              {d.contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </Champ>
          {!v.contact_id && <Champ libelle="Nom du client"><input value={v.nom_client} onChange={changer('nom_client')} required maxLength={160} /></Champ>}
          {!v.contact_id && <Champ libelle="Téléphone"><input type="tel" value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>}
          <Champ libelle="Reçu par"><select value={v.canal} onChange={changer('canal')}>{Object.entries(CANAUX).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Champ>
          <Champ libelle="Priorité"><select value={v.priorite} onChange={changer('priorite')}>{Object.entries(PRIORITES).map(([id, [l]]) => <option key={id} value={id}>{l}</option>)}</select></Champ>
          <Champ libelle="Nature"><select value={v.nature} onChange={changer('nature')}>{Object.entries(NATURES).map(([id, [l]]) => <option key={id} value={id}>{l}</option>)}</select></Champ>
          {peut('support_tickets.gerer') && (
            <Champ libelle="Assigner à">
              <select value={v.assigne_a} onChange={changer('assigne_a')}>
                <option value="">— Plus tard</option>
                {d.equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
              </select>
            </Champ>
          )}
        </div>
        <Champ libelle="Description"><textarea rows={4} value={v.description} onChange={changer('description')} maxLength={5000} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Ouvrir le ticket</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function Satisfaction({ t, agir }) {
  const { api } = useEspace();
  const [note, setNote] = useState('');
  const [commentaire, setCommentaire] = useState('');
  return (
    <form className="formulaire" onSubmit={async (e) => {
      e.preventDefault();
      await agir(() => api.rpc('noter_satisfaction_ticket', { p_ticket_id: t.id, p_note: Number(note), p_commentaire: commentaire || null }), 'Satisfaction enregistrée');
    }}>
      <div className="grille-champs">
        <Champ libelle="Satisfaction du client">
          <select value={note} onChange={(e) => setNote(e.target.value)} required>
            <option value="">— Note donnée par le client</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}
          </select>
        </Champ>
        <Champ libelle="Commentaire (facultatif)"><input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} maxLength={1000} /></Champ>
      </div>
      <div><Bouton type="submit">Enregistrer la note</Bouton></div>
    </form>
  );
}

function ModaleRdv({ t, d, onFermer, onFait }) {
  const { api, notifier, utilisateur } = useEspace();
  const [debut, setDebut] = useState('');
  const [duree, setDuree] = useState(60);
  const [qui, setQui] = useState(t.assigne_a ?? utilisateur?.id ?? '');
  const [erreur, setErreur] = useState('');
  return (
    <Modale titre={`Rendez-vous pour ${t.nom_client ?? 'le client'}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={async (e) => {
        e.preventDefault();
        setErreur('');
        try {
          await api.rpc('rdv_depuis_ticket', { p_ticket_id: t.id, p_debut: new Date(debut).toISOString(), p_duree_minutes: Number(duree), p_responsable: qui || null });
          notifier('Rendez-vous pris');
          onFait();
        } catch (err) {
          setErreur(err.message);
        }
      }}>
        <div className="grille-champs">
          <Champ libelle="Date et heure"><input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} required /></Champ>
          <Champ libelle="Durée (minutes)"><input type="number" min={5} max={1440} value={duree} onChange={(e) => setDuree(e.target.value)} required /></Champ>
          <Champ libelle="Avec">
            <select value={qui} onChange={(e) => setQui(e.target.value)}>
              <option value="">— Personne en particulier</option>
              {d.equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
            </select>
          </Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Prendre le rendez-vous</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Bibliothèque : réponses types (insérées dans les tickets) et articles d'aide internes. Archivage, jamais de suppression.
function Bibliotheque({ d, onRetour, onChange }) {
  const { peut } = useEspace();
  const [edition, setEdition] = useState(null);
  const gerer = peut('support_tickets.gerer');
  return (
    <div className="page page-large">
      <PageHeader titre="Réponses et aide" sousTitre="Réponses types à insérer dans les tickets, articles d'aide pour l'équipe ou publiés aux clients (espace client)."
        actions={<>
          <Bouton onClick={onRetour}>Retour</Bouton>
          {gerer && <Bouton variante="principal" icone="plus" onClick={() => setEdition({ genre: 'reponse', titre: '', texte: '', categorie: '', actif: true })}>Ajouter</Bouton>}
        </>} />
      <Section>
        <DataTable lignes={d.bibliotheque} onLigne={gerer ? (b) => setEdition(b) : undefined}
          rechercher={(b) => `${b.titre} ${b.texte} ${b.categorie ?? ''}`} placeholder="Titre, mot du texte, catégorie…"
          filtres={[
            { id: 'genre', libelle: 'Type', options: Object.entries(GENRES), appliquer: (b, v) => b.genre === v },
            { id: 'etat', libelle: 'État', options: [['actifs', 'En service'], ['archives', 'Archivés']], appliquer: (b, v) => (v === 'actifs' ? b.actif : !b.actif) },
          ]}
          vide={<p className="texte-doux">Aucune réponse type ni article. {gerer ? 'Ajoutez les réponses que vous donnez souvent.' : ''}</p>}
          colonnes={[
            { id: 'titre', libelle: 'Titre', rendu: (b) => <><strong>{b.titre}</strong><br /><small className="texte-doux texte-multiligne">{b.texte.slice(0, 160)}{b.texte.length > 160 ? '…' : ''}</small></> },
            { id: 'genre', libelle: 'Type', rendu: (b) => <>{GENRES[b.genre]}{b.public && <> <Badge ton="bleu">Publié aux clients</Badge></>}</> },
            { id: 'categorie', libelle: 'Catégorie', rendu: (b) => b.categorie ?? '—' },
            { id: 'actif', libelle: 'État', rendu: (b) => (b.actif ? <Badge ton="vert">En service</Badge> : <Badge ton="neutre">Archivé</Badge>) },
          ]} />
      </Section>
      {edition && <ModaleElement element={edition} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); onChange(); }} />}
    </div>
  );
}

function ModaleElement({ element, onFermer, onFait }) {
  const { api, etablissement, notifier } = useEspace();
  const [v, setV] = useState({ ...element, categorie: element.categorie ?? '' });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <Modale titre={element.id ? 'Modifier' : 'Ajouter à la bibliothèque'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={async (e) => {
        e.preventDefault();
        setErreur('');
        try {
          await api.rpc('enregistrer_element_support', { p_etablissement_id: etablissement.id, p: { id: v.id, genre: v.genre, titre: v.titre, texte: v.texte, categorie: v.categorie, actif: v.actif, public: v.genre === 'article' && Boolean(v.public) } });
          notifier('Enregistré');
          onFait();
        } catch (err) {
          setErreur(err.message);
        }
      }}>
        <div className="grille-champs">
          <Champ libelle="Type">
            <select value={v.genre} onChange={changer('genre')} disabled={Boolean(element.id)}>{Object.entries(GENRES).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          </Champ>
          <Champ libelle="Catégorie (facultatif)"><input value={v.categorie} onChange={changer('categorie')} maxLength={80} placeholder="Ex. Caisse, Livraison" /></Champ>
        </div>
        <Champ libelle="Titre"><input value={v.titre} onChange={changer('titre')} required maxLength={160} autoFocus /></Champ>
        <Champ libelle="Texte"><textarea rows={8} value={v.texte} onChange={changer('texte')} required maxLength={8000} /></Champ>
        {v.genre === 'article' && <label className="case"><input type="checkbox" checked={Boolean(v.public)} onChange={changer('public')} /> Publier aux clients (rubrique « Aide » de l’espace client)</label>}
        {element.id && <label className="case"><input type="checkbox" checked={v.actif} onChange={changer('actif')} /> En service (décocher pour archiver)</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
