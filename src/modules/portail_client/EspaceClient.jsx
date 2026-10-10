import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDate, formatDateHeure } from '../../noyau/format.js';
import { tailleLisible, telecharger } from '../../ui/communs.jsx';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, PageHeader, Squelette, Tabs } from '../../ui/composants.jsx';

// Espace client (Bêta), côté équipe : liens d'accès des clients, leurs messages, fichiers déposés, réponses aux
// devis et décisions sur les livrables, projets partagés. Le client, lui, ouvre #/espace/<jeton> sans compte.
export const EVENEMENTS = {
  ouverture: 'A ouvert son espace', document_vu: 'A consulté un document', devis_accepte: 'A accepté un devis', devis_refuse: 'A refusé un devis',
  devis_modification: 'A demandé une modification de devis', livrable_valide: 'A validé un livrable', livrable_a_corriger: 'A demandé une correction',
  message: 'A envoyé un message', depot: 'A déposé un fichier', rdv_demande: 'A pris rendez-vous', rdv_confirme: 'A confirmé un rendez-vous',
  rdv_annule: 'A annulé un rendez-vous', rdv_deplace: 'A déplacé un rendez-vous',
};
export const lienEspace = (jeton) => `${window.location.origin}${window.location.pathname}#/espace/${jeton}`;
const nomContact = (c) => (c ? c.societe || c.nom : 'Contact');
const etatAcces = (a) => (a.revoque_le ? ['Révoqué', 'neutre'] : new Date(a.expire_le) <= new Date() ? ['Expiré', 'neutre'] : ['Actif', 'vert']);

function ModaleAcces({ contacts, contactId, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [choix, setChoix] = useState(contactId ?? '');
  const [libelle, setLibelle] = useState('');
  const [jours, setJours] = useState('');
  const [cree, setCree] = useState(null);
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState('');
  const creer = async () => {
    setErreur('');
    try {
      setCree(await api.rpc('creer_acces_portail', { p_etablissement_id: etablissement.id, p_contact_id: choix, p_libelle: libelle || null, p_jours: jours ? Number(jours) : null }));
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const adresse = cree ? lienEspace(cree.jeton) : '';
  return (
    <Modale titre="Ouvrir l’espace d’un client" onFermer={onFermer}>
      <div className="formulaire">
        <p className="texte-doux">Le client ouvre son espace avec ce lien, sans compte : ses devis et factures, les projets partagés, les messages et l’envoi de fichiers. Envoyez-le seulement à la bonne personne.</p>
        {!cree && (
          <>
            <Champ libelle="Client">
              <select value={choix} onChange={(e) => setChoix(e.target.value)} disabled={Boolean(contactId)}>
                <option value="">— Choisir</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{nomContact(c)}</option>)}
              </select>
            </Champ>
            <Champ libelle="Pour qui (facultatif)" aide="Par exemple : Mme Okemba, direction"><input value={libelle} onChange={(e) => setLibelle(e.target.value)} maxLength={80} /></Champ>
            <Champ libelle="Valable (jours)" aide="Vide : durée réglée pour l’établissement (30 jours par défaut)"><input type="number" min={1} max={365} value={jours} onChange={(e) => setJours(e.target.value)} /></Champ>
            <Bouton variante="principal" icone="globe" onClick={creer} disabled={!choix}>Créer le lien</Bouton>
          </>
        )}
        {cree && (
          <div className="encart" role="status">
            <p>Lien valable jusqu’au {formatDateHeure(cree.expire_le)}. Copiez-le maintenant : il ne sera plus affiché.</p>
            <input readOnly value={adresse} aria-label="Lien de l’espace client" onFocus={(e) => e.target.select()} />
            <div className="groupe-boutons">
              <Bouton onClick={async () => { try { await navigator.clipboard.writeText(adresse); setCopie(true); } catch { setCopie(false); } }}>{copie ? 'Copié' : 'Copier le lien'}</Bouton>
              <a className="bouton" href={`https://wa.me/?text=${encodeURIComponent(adresse)}`} target="_blank" rel="noreferrer">Envoyer par WhatsApp</a>
            </div>
          </div>
        )}
        <Erreur message={erreur} />
      </div>
    </Modale>
  );
}

function FicheClient({ contact, naviguer }) {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const gerer = peut('portail_client.gerer');
  const [onglet, setOnglet] = useState('messages');
  const [reponse, setReponse] = useState('');
  const [nouveau, setNouveau] = useState(false);
  const [erreur, setErreur] = useState('');
  const { donnees: d, chargement, erreur: erreurChargement, recharger } = useDonnees(async () => {
    const eq = { etablissement_id: etab, contact_id: contact.id };
    const [acces, messages, depots, evenements, projets] = await Promise.all([
      api.lire('portail_acces', { eq, ordre: ['cree_le', 'desc'], colonnes: ['id', 'libelle', 'expire_le', 'revoque_le', 'ouvertures', 'derniere_ouverture', 'cree_le'] }),
      api.lire('portail_messages', { eq, ordre: ['cree_le'] }),
      api.lire('portail_depots', { eq, ordre: ['cree_le', 'desc'], colonnes: ['id', 'nom', 'type_mime', 'taille', 'note', 'statut', 'traite_le', 'cree_le'] }),
      api.lire('portail_evenements', { eq, ordre: ['cree_le', 'desc'], limite: 200 }),
      peut('projets.lire') ? api.lire('projets', { eq, ordre: ['cree_le', 'desc'] }).catch(() => []) : [],
    ]);
    if (messages.some((m) => m.auteur === 'client' && !m.lu_le)) {
      await api.rpc('marquer_messages_portail_lus', { p_etablissement_id: etab, p_contact_id: contact.id }).catch(() => {});
    }
    return { acces, messages, depots, evenements, projets };
  }, [etab, contact.id]);
  const agir = async (fn, message) => {
    setErreur('');
    try {
      await fn();
      if (message) notifier(message);
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  if (!d) return <div className="page">{chargement ? <Squelette lignes={6} /> : <Erreur message={erreurChargement} />}</div>;
  const recus = d.depots.filter((x) => x.statut === 'recu').length;
  return (
    <div className="page">
      <PageHeader titre={`Espace de ${nomContact(contact)}`} fil={[{ libelle: 'Espace client', href: '#/espace-client' }, { libelle: nomContact(contact) }]}
        actions={gerer && <Bouton variante="principal" icone="globe" onClick={() => setNouveau(true)}>Nouveau lien</Bouton>} />
      <Tabs actif={onglet} onChange={setOnglet} onglets={[
        ['messages', 'Messages', d.messages.length || null], ['fichiers', 'Fichiers déposés', recus || null],
        ['acces', 'Liens d’accès', d.acces.filter((a) => etatAcces(a)[0] === 'Actif').length || null],
        ...(d.projets.length ? [['projets', 'Projets partagés']] : []), ['journal', 'Journal'],
      ]} />
      <Erreur message={erreur} />
      {onglet === 'messages' && (
        <div className="pile">
          {d.messages.length === 0 && <p className="texte-doux">Aucun message échangé.</p>}
          {d.messages.map((m) => (
            <div key={m.id} className="carte">
              <small className="texte-doux">{m.auteur === 'client' ? nomContact(contact) : 'Équipe'} · {formatDateHeure(m.cree_le)}{m.objet_type === 'document_vente' ? ' · à propos d’un devis ou d’une facture' : m.objet_type === 'projet' ? ' · à propos d’un projet' : ''}</small>
              <p>{m.texte}</p>
            </div>
          ))}
          {gerer && (
            <>
              <Champ libelle="Répondre (visible dans l’espace du client)"><textarea rows={3} value={reponse} onChange={(e) => setReponse(e.target.value)} maxLength={2000} /></Champ>
              <Bouton variante="principal" icone="message" disabled={!reponse.trim()} onClick={() => agir(async () => {
                await api.rpc('repondre_client_portail', { p_etablissement_id: etab, p_contact_id: contact.id, p_texte: reponse });
                setReponse('');
              }, 'Réponse envoyée')}>Envoyer la réponse</Bouton>
            </>
          )}
        </div>
      )}
      {onglet === 'fichiers' && (
        <DataTable lignes={d.depots} exportable={false} vide={<p className="texte-doux">Aucun fichier déposé.</p>} colonnes={[
          { id: 'nom', libelle: 'Fichier', rendu: (x) => x.nom },
          { id: 'note', libelle: 'Note du client', rendu: (x) => x.note ?? '' },
          { id: 'taille', libelle: 'Taille', rendu: (x) => tailleLisible(x.taille) },
          { id: 'cree_le', libelle: 'Reçu le', rendu: (x) => formatDateHeure(x.cree_le), tri: (x) => x.cree_le },
          { id: 'statut', libelle: 'État', rendu: (x) => <Badge ton={x.statut === 'recu' ? 'orange' : 'vert'}>{x.statut === 'recu' ? 'À traiter' : 'Traité'}</Badge> },
          { id: 'actions', libelle: '', rendu: (x) => (
            <span className="groupe-boutons">
              <Bouton icone="telecharger" onClick={() => agir(async () => { const f = await api.rpc('telecharger_depot_portail', { p_depot_id: x.id }); telecharger(f.nom, f.contenu); })}>Télécharger</Bouton>
              {gerer && x.statut === 'recu' && <Bouton onClick={() => agir(() => api.rpc('traiter_depot_portail', { p_depot_id: x.id }), 'Fichier marqué traité')}>Marquer traité</Bouton>}
            </span>
          ) },
        ]} />
      )}
      {onglet === 'acces' && (
        <DataTable lignes={d.acces} exportable={false} vide={<p className="texte-doux">Aucun lien créé pour ce client.</p>} colonnes={[
          { id: 'libelle', libelle: 'Pour', rendu: (a) => a.libelle ?? '—' },
          { id: 'cree_le', libelle: 'Créé le', rendu: (a) => formatDate(a.cree_le) },
          { id: 'expire_le', libelle: 'Valable jusqu’au', rendu: (a) => formatDate(a.expire_le) },
          { id: 'ouvertures', libelle: 'Visites', classe: 'nombre', rendu: (a) => a.ouvertures },
          { id: 'derniere', libelle: 'Dernière visite', rendu: (a) => (a.derniere_ouverture ? formatDateHeure(a.derniere_ouverture) : 'jamais') },
          { id: 'etat', libelle: 'État', rendu: (a) => { const [l, t] = etatAcces(a); return <Badge ton={t}>{l}</Badge>; } },
          { id: 'actions', libelle: '', rendu: (a) => gerer && etatAcces(a)[0] === 'Actif' && <Bouton onClick={() => agir(() => api.rpc('revoquer_acces_portail', { p_acces_id: a.id }), 'Lien révoqué')}>Révoquer</Bouton> },
        ]} />
      )}
      {onglet === 'projets' && (
        <DataTable lignes={d.projets} exportable={false} colonnes={[
          { id: 'nom', libelle: 'Projet', rendu: (p) => <button type="button" className="lien" onClick={() => naviguer(`projets/${p.id}`)}>{p.numero} · {p.nom}</button> },
          { id: 'partage', libelle: 'Visible par le client', rendu: (p) => <Badge ton={p.partage_client ? 'vert' : 'neutre'}>{p.partage_client ? 'Oui' : 'Non'}</Badge> },
          { id: 'actions', libelle: '', rendu: (p) => gerer && peut('projets.gerer') && (
            <Bouton onClick={() => agir(() => api.rpc('partager_projet_client', { p_projet_id: p.id, p_partage: !p.partage_client }), p.partage_client ? 'Projet retiré de l’espace client' : 'Projet partagé avec le client')}>
              {p.partage_client ? 'Ne plus partager' : 'Partager avec le client'}
            </Bouton>
          ) },
        ]} />
      )}
      {onglet === 'journal' && (
        <DataTable lignes={d.evenements} exportable titreExport={`Journal espace client ${nomContact(contact)}`} vide={<p className="texte-doux">Le client n’a encore rien fait dans son espace.</p>} colonnes={[
          { id: 'cree_le', libelle: 'Quand', rendu: (e) => formatDateHeure(e.cree_le), tri: (e) => e.cree_le },
          { id: 'type', libelle: 'Geste', rendu: (e) => EVENEMENTS[e.type] ?? e.type },
          { id: 'nom', libelle: 'Nom écrit', rendu: (e) => e.nom_signataire ?? '' },
          { id: 'note', libelle: 'Détail', rendu: (e) => e.note ?? '' },
        ]} />
      )}
      {nouveau && <ModaleAcces contacts={[contact]} contactId={contact.id} onFermer={() => setNouveau(false)} onFait={recharger} />}
    </div>
  );
}

function Liste({ naviguer }) {
  const { api, etablissement, peut } = useEspace();
  const etab = etablissement.id;
  const [nouveau, setNouveau] = useState(false);
  const [filtre, setFiltre] = useState(() => lireParametres().get('filtre') ?? '');
  const { donnees: d, chargement, erreur: erreurChargement, recharger } = useDonnees(async () => {
    const eq = { etablissement_id: etab };
    const [contacts, acces, messages, depots] = await Promise.all([
      api.lire('contacts', { eq, ordre: ['nom'], colonnes: ['id', 'nom', 'societe', 'type', 'actif', 'anonymise_le'] }),
      api.lire('portail_acces', { eq, colonnes: ['id', 'contact_id', 'expire_le', 'revoque_le', 'derniere_ouverture'] }),
      api.lire('portail_messages', { eq, colonnes: ['id', 'contact_id', 'auteur', 'lu_le', 'cree_le'] }),
      api.lire('portail_depots', { eq, colonnes: ['id', 'contact_id', 'statut'] }),
    ]);
    return { contacts, acces, messages, depots };
  }, [etab]);
  const lignes = useMemo(() => {
    if (!d) return [];
    const parContact = new Map();
    const ligne = (id) => {
      if (!parContact.has(id)) parContact.set(id, { id, liens: 0, derniere: null, non_lus: 0, recus: 0, dernier_message: null });
      return parContact.get(id);
    };
    for (const a of d.acces) {
      const l = ligne(a.contact_id);
      if (!a.revoque_le && new Date(a.expire_le) > new Date()) l.liens += 1;
      if (a.derniere_ouverture && (!l.derniere || a.derniere_ouverture > l.derniere)) l.derniere = a.derniere_ouverture;
    }
    for (const m of d.messages) {
      const l = ligne(m.contact_id);
      if (m.auteur === 'client' && !m.lu_le) l.non_lus += 1;
      if (!l.dernier_message || m.cree_le > l.dernier_message) l.dernier_message = m.cree_le;
    }
    for (const x of d.depots) if (x.statut === 'recu') ligne(x.contact_id).recus += 1;
    const contacts = new Map(d.contacts.map((c) => [c.id, c]));
    return [...parContact.values()].map((l) => ({ ...l, contact: contacts.get(l.id) })).filter((l) => l.contact);
  }, [d]);
  if (!d) return <div className="page">{chargement ? <Squelette lignes={6} /> : <Erreur message={erreurChargement} />}</div>;
  const visibles = lignes.filter((l) => (filtre === 'messages' ? l.non_lus > 0 : filtre === 'depots' ? l.recus > 0 : true));
  const proposables = d.contacts.filter((c) => c.actif && !c.anonymise_le && c.type !== 'fournisseur');
  return (
    <div className="page page-large">
      <PageHeader titre="Espace client" sousTitre="Un lien personnel par client : devis à accepter, factures, projets partagés, messages et fichiers. Bêta."
        actions={peut('portail_client.gerer') && <Bouton variante="principal" icone="globe" onClick={() => setNouveau(true)}>Ouvrir l’espace d’un client</Bouton>} />
      <div className="barre-filtres">
        <select aria-label="Afficher" value={filtre} onChange={(e) => setFiltre(e.target.value)}>
          <option value="">Tous les clients avec un espace</option>
          <option value="messages">Messages non lus</option>
          <option value="depots">Fichiers à traiter</option>
        </select>
      </div>
      {visibles.length === 0 ? (
        <EmptyState titre={filtre ? 'Rien à traiter' : 'Aucun espace client ouvert'} icone="globe"
          texte="Créez un lien pour un client : il pourra accepter ses devis, suivre ses projets et vous écrire sans créer de compte." />
      ) : (
        <DataTable lignes={visibles} titreExport="Espaces clients" rechercher={(l) => nomContact(l.contact)} onLigne={(l) => naviguer(`espace-client/${l.id}`)}
          triInitial={{ id: 'non_lus', sens: 'desc' }} colonnes={[
            { id: 'nom', libelle: 'Client', rendu: (l) => nomContact(l.contact), tri: (l) => nomContact(l.contact) },
            { id: 'liens', libelle: 'Liens actifs', classe: 'nombre', rendu: (l) => l.liens, tri: (l) => l.liens },
            { id: 'derniere', libelle: 'Dernière visite', rendu: (l) => (l.derniere ? formatDateHeure(l.derniere) : 'jamais'), tri: (l) => l.derniere ?? '' },
            { id: 'non_lus', libelle: 'Messages non lus', classe: 'nombre', rendu: (l) => (l.non_lus ? <Badge ton="orange">{l.non_lus}</Badge> : 0), tri: (l) => l.non_lus },
            { id: 'recus', libelle: 'Fichiers à traiter', classe: 'nombre', rendu: (l) => (l.recus ? <Badge ton="orange">{l.recus}</Badge> : 0), tri: (l) => l.recus },
          ]} />
      )}
      {nouveau && <ModaleAcces contacts={proposables} onFermer={() => setNouveau(false)} onFait={recharger} />}
    </div>
  );
}

export default function EspaceClient({ naviguer, sousRoute }) {
  const { api, etablissement } = useEspace();
  const [id] = (sousRoute ?? '').split('/');
  const { donnees: contact, chargement } = useDonnees(
    () => (id ? api.lire('contacts', { eq: { id, etablissement_id: etablissement.id }, colonnes: ['id', 'nom', 'societe'] }).then((r) => r[0] ?? null) : Promise.resolve(null)),
    [id, etablissement.id],
  );
  if (!id) return <Liste naviguer={naviguer} />;
  if (chargement && !contact) return <div className="page"><Squelette lignes={6} /></div>;
  if (!contact) return <div className="page"><EmptyState titre="Client introuvable" action={<Bouton onClick={() => naviguer('espace-client')}>Retour</Bouton>} /></div>;
  return <FicheClient key={id} contact={contact} naviguer={naviguer} />;
}
