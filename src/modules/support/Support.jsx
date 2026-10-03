import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, ModaleMotif, PageHeader, Section, Squelette } from '../../ui/composants.jsx';
import { PiecesJointes } from '../../ui/communs.jsx';

export const STATUTS_TICKET = {
  ouvert: ['Ouvert', 'bleu'], en_cours: ['En cours', 'violet'], attente_client: ['En attente du client', 'orange'], resolu: ['Résolu', 'vert'], ferme: ['Fermé', 'neutre'],
};
export const PRIORITES = { basse: ['Basse', 'neutre'], normale: ['Normale', 'bleu'], haute: ['Haute', 'orange'], urgente: ['Urgente', 'rouge'] };
const CANAUX = { telephone: 'Téléphone', whatsapp: 'WhatsApp', email: 'E-mail', sur_place: 'Sur place', site_web: 'Site web', autre: 'Autre' };
const actif = (t) => ['ouvert', 'en_cours', 'attente_client'].includes(t.statut);
const enRetard = (t) => ['ouvert', 'en_cours'].includes(t.statut) && new Date(t.echeance) < new Date();

// Support : tickets des clients, échanges, statuts, assignation.
export default function Support({ naviguer, sousRoute }) {
  const { api, etablissement, peut, utilisateur } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [tickets, equipe, contacts] = await Promise.all([
      api.lire('support_tickets', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 3000 }),
      api.rpc('support_equipe', { p_etablissement_id: etab }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
    ]);
    return { tickets, equipe, contacts: contacts.filter((c) => c.type !== 'fournisseur'), membre: Object.fromEntries(equipe.map((m) => [m.user_id, m])) };
  }, [etab]);
  const [nouveau, setNouveau] = useState(false);
  const [ticketId] = (sousRoute ?? '').split('/');
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const ouvert = ticketId && d.tickets.find((t) => t.id === ticketId);
  if (ouvert) return <Ticket t={ouvert} d={d} onRetour={() => naviguer('support')} onChange={recharger} />;
  return (
    <div className="page page-large">
      <PageHeader titre="Support" sousTitre="Demandes des clients : pannes, réclamations, questions, service après-vente."
        actions={peut('support_tickets.traiter') && <Bouton variante="principal" icone="plus" onClick={() => setNouveau(true)}>Ticket</Bouton>} />
      <Section>
        <DataTable lignes={d.tickets} onLigne={(t) => naviguer(`support/${t.id}`)}
          rechercher={(t) => `${t.numero} ${t.sujet} ${t.nom_client} ${t.telephone ?? ''}`} placeholder="Numéro, sujet, client…"
          filtres={[
            { id: 'etat', libelle: 'État', options: [['actifs', 'À traiter'], ['retard', 'En retard'], ['moi', 'Mes tickets'], ...Object.entries(STATUTS_TICKET).map(([id, [l]]) => [id, l])],
              appliquer: (t, v) => (v === 'actifs' ? actif(t) : v === 'retard' ? enRetard(t) : v === 'moi' ? t.assigne_a === utilisateur?.id && actif(t) : t.statut === v) },
            { id: 'priorite', libelle: 'Priorité', options: Object.entries(PRIORITES).map(([id, [l]]) => [id, l]), appliquer: (t, v) => t.priorite === v },
          ]}
          vide={<p className="texte-doux">Aucun ticket.</p>}
          colonnes={[
            { id: 'numero', libelle: 'Ticket', rendu: (t) => <><strong>{t.numero}</strong><br /><small className="texte-doux">{formatDateHeure(t.cree_le)}</small></>, tri: (t) => t.cree_le },
            { id: 'sujet', libelle: 'Sujet', rendu: (t) => <>{t.sujet}<br /><small className="texte-doux">{t.nom_client}</small></> },
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
  const { api, peut, notifier } = useEspace();
  const { donnees: messages, recharger } = useDonnees(() => api.lire('support_messages', { eq: { ticket_id: t.id }, ordre: ['cree_le'] }), [t.id, t.modifie_le]);
  const [texte, setTexte] = useState('');
  const [interne, setInterne] = useState(false);
  const [statut, setStatut] = useState(null);
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
  return (
    <div className="page page-large">
      <PageHeader titre={`${t.numero} · ${t.sujet}`} sousTitre={`${t.nom_client}${t.telephone ? ` · ${t.telephone}` : ''} · ${CANAUX[t.canal]}`}
        badges={<><Badge ton={STATUTS_TICKET[t.statut][1]}>{STATUTS_TICKET[t.statut][0]}</Badge> <Badge ton={PRIORITES[t.priorite][1]}>{PRIORITES[t.priorite][0]}</Badge></>}
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
              <Champ libelle={interne ? 'Note interne (invisible pour le client)' : 'Réponse donnée au client'}>
                <textarea rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} required maxLength={5000} />
              </Champ>
              <label className="case"><input type="checkbox" checked={interne} onChange={(e) => setInterne(e.target.checked)} /> Note interne</label>
              <div><Bouton type="submit" variante="principal">Ajouter</Bouton></div>
            </form>
          )}
        </Section>
        <Section titre="Suivi">
          <dl className="fiche">
            <dt>Répondre avant</dt><dd>{formatDateHeure(t.echeance)}</dd>
            <dt>Assigné à</dt><dd>{d.membre[t.assigne_a]?.nom ?? 'Personne'}</dd>
            {t.resolu_le && <><dt>Résolu le</dt><dd>{formatDateHeure(t.resolu_le)}</dd></>}
          </dl>
          {peut('support_tickets.gerer') && t.statut !== 'ferme' && <Assignation t={t} d={d} onFait={() => { recharger(); onChange(); }} />}
          {traiter && (
            <div className="groupe-boutons">
              {t.statut === 'ouvert' && <Bouton onClick={() => changer('en_cours')}>Prendre en charge</Bouton>}
              {['ouvert', 'en_cours'].includes(t.statut) && <Bouton onClick={() => changer('attente_client')}>En attente du client</Bouton>}
              {t.statut === 'attente_client' && <Bouton onClick={() => changer('en_cours')}>Reprendre</Bouton>}
              {actif(t) && <Bouton variante="principal" onClick={() => setStatut('resolu')}>Résolu</Bouton>}
              {t.statut === 'resolu' && <Bouton variante="principal" onClick={() => changer('ferme')}>Fermer</Bouton>}
              {['resolu', 'ferme'].includes(t.statut) && <Bouton onClick={() => setStatut('ouvert')}>Rouvrir</Bouton>}
            </div>
          )}
          <PiecesJointes objetType="support_ticket" objetId={t.id} titre="Pièces jointes" peutAjouter={traiter} peutArchiver={peut('support_tickets.gerer')} />
        </Section>
      </div>
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
  const [v, setV] = useState({ sujet: '', description: '', contact_id: '', nom_client: '', telephone: '', canal: 'telephone', priorite: 'normale', assigne_a: '' });
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
