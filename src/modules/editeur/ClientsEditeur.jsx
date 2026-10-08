import { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
import {
  Badge, Bouton, Confirmation, DataTable, EmptyState, Erreur, MenuActions, Modale, PageHeader, Section, Squelette, StatCard, StatusBadge, Tabs,
} from '../../ui/composants.jsx';
import { CopierTexte, messageInvitation } from '../etablissement/Equipe.jsx';
import { ApparenceClient } from './ApparenceEditeur.jsx';
import { BadgeLicence, FORMULES, FormulaireClient, FormulaireEtablissement, STATUTS, useAction } from './Editeur.jsx';

const fil = (...suite) => [{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Clients', href: '#/editeur/clients' }, ...suite];

export function useVueEditeur() {
  const { api } = useEspace();
  return useDonnees(() => api.rpc('editeur_vue'), []);
}

export function ListeClients({ naviguer }) {
  const parametres = lireParametres();
  const { donnees: vue, chargement, erreur, recharger } = useVueEditeur();
  const [archives, setArchives] = useState(false);
  const [nouveau, setNouveau] = useState(parametres.get('nouveau') === '1');
  const mois = parametres.get('mois');
  const formule = parametres.get('formule');

  const lignes = useMemo(() => (vue?.clients ?? [])
    .filter((c) => archives || c.statut !== 'archive')
    .filter((c) => !mois || (c.cree_le ?? '').startsWith(mois))
    .filter((c) => !formule || c.etablissements.some((e) => e.licence?.formule === formule))
    .map((c) => ({
      ...c,
      nb_etablissements: c.etablissements.length,
      nb_hubs: c.etablissements.reduce((s, e) => s + (e.hubs ?? 0), 0),
      utilisateurs: c.etablissements.reduce((s, e) => s + (e.membres_actifs ?? 0), 0),
      licence: c.etablissements.map((e) => e.licence).filter(Boolean).sort((a, b) => (a.jours_restants ?? 9999) - (b.jours_restants ?? 9999))[0] ?? null,
    })), [vue, archives, mois, formule]);
  const nbArchives = (vue?.clients ?? []).filter((c) => c.statut === 'archive').length;

  return (
    <div className="page">
      <PageHeader
        fil={fil()}
        titre="Clients"
        sousTitre="Chaque client possède un ou plusieurs établissements, chacun avec ses Hubs, sa licence et son équipe."
        actions={<Bouton variante="principal" icone="plus" onClick={() => setNouveau(true)}>Nouveau client</Bouton>}
      />
      {(mois || formule) && (
        <div className="bandeau info">
          Filtre : {mois ? `clients créés en ${mois}` : `licence ${FORMULES[formule] ?? formule}`}.{' '}
          <button type="button" className="lien" onClick={() => naviguer('editeur/clients')}>Retirer le filtre</button>
        </div>
      )}
      <Erreur message={erreur} />
      <DataTable
        chargement={chargement}
        lignes={vue ? lignes : null}
        rechercher={(c) => `${c.nom} ${c.pays ?? ''} ${c.contact?.responsable ?? ''} ${c.etablissements.map((e) => e.nom).join(' ')}`}
        placeholder="Client, établissement, responsable"
        triInitial={{ id: 'nom', sens: 'asc' }}
        onLigne={(c) => naviguer(`editeur/clients/${c.id}`)}
        filtres={[
          { id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS).filter(([s]) => archives || s !== 'archive'), appliquer: (c, v) => c.statut === v },
        ]}
        actions={nbArchives > 0 && (
          <label className="case compacte">
            <input type="checkbox" checked={archives} onChange={(e) => setArchives(e.target.checked)} />
            Afficher les archivés ({nbArchives})
          </label>
        )}
        vide={<EmptyState icone="clients" titre="Aucun client" texte="Créez votre premier client pour lui attribuer une solution." action={<Bouton variante="principal" onClick={() => setNouveau(true)}>Nouveau client</Bouton>} />}
        colonnes={[
          { id: 'nom', libelle: 'Client', tri: (c) => c.nom, rendu: (c) => <><strong>{c.nom}</strong><small className="texte-doux bloc">{[c.pays, c.contact?.responsable].filter(Boolean).join(' · ') || '—'}</small></> },
          { id: 'nb_etablissements', libelle: 'Établissements', classe: 'nombre', tri: (c) => c.nb_etablissements },
          { id: 'nb_hubs', libelle: 'Hubs', classe: 'nombre', tri: (c) => c.nb_hubs },
          { id: 'utilisateurs', libelle: 'Utilisateurs', classe: 'nombre', tri: (c) => c.utilisateurs },
          { id: 'licence', libelle: 'Licence', tri: (c) => c.licence?.jours_restants ?? 9999, rendu: (c) => (c.etablissements.length ? <BadgeLicence licence={c.licence} /> : <span className="texte-doux">—</span>) },
          { id: 'statut', libelle: 'Statut', tri: (c) => c.statut, rendu: (c) => <StatusBadge statut={c.statut} /> },
          { id: 'cree_le', libelle: 'Créé le', tri: (c) => c.cree_le, rendu: (c) => (c.cree_le ? formatDate(c.cree_le) : '—') },
        ]}
      />
      {nouveau && (
        <FormulaireClient
          onFermer={() => setNouveau(false)}
          onEnregistre={(id) => { setNouveau(false); recharger(); naviguer(`editeur/clients/${id}`); }}
        />
      )}
    </div>
  );
}

export function PageClient({ clientId, naviguer }) {
  const { api, notifier } = useEspace();
  const { donnees: vue, chargement, erreur, recharger } = useVueEditeur();
  const [onglet, setOnglet] = useState('apercu');
  const [modale, setModale] = useState(null);
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(null);
  const { erreur: erreurAction, enCours, agir } = useAction(recharger);
  const client = vue?.clients.find((c) => c.id === clientId);

  if (chargement && !vue) return <div className="page"><Squelette lignes={8} /></div>;
  if (vue && !client) {
    return <div className="page"><EmptyState titre="Client introuvable" action={<Bouton onClick={() => naviguer('editeur/clients')}>Retour aux clients</Bouton>} /></div>;
  }
  if (!client) return <div className="page"><Erreur message={erreur} /></div>;

  const contact = client.contact ?? {};
  const changerStatut = (statut, titre) => setModale({ type: 'statut', statut, titre });
  const hubs = client.etablissements.reduce((s, e) => s + (e.hubs ?? 0), 0);

  return (
    <div className="page">
      <PageHeader
        fil={fil({ libelle: client.nom })}
        titre={client.nom}
        badges={<StatusBadge statut={client.statut} />}
        sousTitre={[client.pays, contact.responsable, contact.telephone].filter(Boolean).join(' · ') || 'Coordonnées à compléter'}
        actions={(
          <>
            <Bouton variante="principal" icone="plus" onClick={() => setModale({ type: 'etablissement' })} disabled={client.statut !== 'actif'}>Nouvel établissement</Bouton>
            <MenuActions
              actions={[
                { libelle: 'Modifier le client', icone: 'parametres', onClick: () => setModale({ type: 'client' }) },
                client.statut !== 'actif' && { libelle: 'Réactiver', icone: 'activite', onClick: () => changerStatut('actif', 'Réactiver le client') },
                client.statut === 'actif' && { libelle: 'Suspendre', icone: 'alerte', onClick: () => changerStatut('suspendu', 'Suspendre le client') },
                client.statut !== 'archive' && { libelle: 'Archiver', icone: 'sortie', danger: true, onClick: () => changerStatut('archive', 'Archiver le client') },
              ]}
            />
          </>
        )}
      />
      <Erreur message={erreur || erreurAction} />
      <Tabs
        onglets={[['apercu', 'Vue d’ensemble'], ['etablissements', 'Établissements', client.etablissements.length], ['dirigeants', 'Dirigeants', client.dirigeants.length + client.invitations.length], ['licences', 'Licences'], ['apparence', 'Apparence']]}
        actif={onglet}
        onChange={setOnglet}
      />

      {onglet === 'apparence' && <ApparenceClient clientId={client.id} naviguer={naviguer} />}
      {onglet === 'apercu' && (
        <div className="pile">
          <div className="grille-stats">
            <StatCard icone="editeur" libelle="Établissements" valeur={client.etablissements.length} detail={`${client.etablissements.filter((e) => e.mis_en_service_le).length} en service`} onClick={() => setOnglet('etablissements')} />
            <StatCard icone="hub" libelle="Hubs" valeur={hubs} />
            <StatCard icone="membres" libelle="Utilisateurs actifs" valeur={client.etablissements.reduce((s, e) => s + (e.membres_actifs ?? 0), 0)} />
            <StatCard icone="cle" libelle="Licences valides" valeur={client.etablissements.filter((e) => e.licence?.valide).length} onClick={() => setOnglet('licences')} />
          </div>
          <Section titre="Coordonnées">
            <dl className="details">
              <dt>Responsable</dt><dd>{contact.responsable || '—'}</dd>
              <dt>Téléphone</dt><dd>{contact.telephone || '—'}</dd>
              <dt>E-mail</dt><dd>{contact.email || '—'}</dd>
              <dt>Adresse</dt><dd>{contact.adresse || '—'}</dd>
              <dt>Pays</dt><dd>{client.pays || '—'}</dd>
              <dt>Devise de facturation</dt><dd>{client.devise_facturation}</dd>
              <dt>Client depuis</dt><dd>{client.cree_le ? formatDate(client.cree_le) : '—'}</dd>
            </dl>
          </Section>
        </div>
      )}

      {onglet === 'etablissements' && (
        client.etablissements.length ? (
          <div className="cartes-etablissements">
            {client.etablissements.map((e) => (
              <button key={e.id} type="button" className="carte-etablissement" onClick={() => naviguer(`editeur/etablissements/${e.id}`)}>
                <strong>{e.nom}</strong>
                <small className="texte-doux">{[e.ville, e.solution_id === 'commerce' ? 'Commerce' : e.solution_id, `${e.hubs ?? 1} Hub(s)`].filter(Boolean).join(' · ')}</small>
                <span className="badges">
                  <BadgeLicence licence={e.licence} />
                  {e.statut !== 'actif' && <StatusBadge statut={e.statut} />}
                  {e.mis_en_service_le ? <Badge ton="vert">En service</Badge> : <Badge>À mettre en service</Badge>}
                </span>
                <small>{e.gerants.length ? `Responsable : ${e.gerants.join(', ')}` : e.invitations_en_attente ? `${e.invitations_en_attente} invitation(s) en attente` : 'Aucun responsable'}</small>
              </button>
            ))}
          </div>
        ) : <EmptyState icone="editeur" titre="Aucun établissement" texte="Créez le premier établissement de ce client." action={<Bouton variante="principal" onClick={() => setModale({ type: 'etablissement' })}>Nouvel établissement</Bouton>} />
      )}

      {onglet === 'dirigeants' && (
        <Section titre="Dirigeants" sousTitre="Un dirigeant consulte tous les établissements du client, sans modifier.">
          <div className="liste-simple">
            {client.dirigeants.map((d) => <div key={d.email} className="liste-ligne"><span>{d.nom || d.email}</span><span className="texte-doux">{d.email}</span></div>)}
            {client.invitations.map((i) => <div key={i.id} className="liste-ligne"><span>{i.email}</span><Badge ton="bleu">Invitation en attente</Badge></div>)}
            {!client.dirigeants.length && !client.invitations.length && <p className="texte-doux">Aucun dirigeant.</p>}
          </div>
          <form
            className="ligne-formulaire"
            onSubmit={(ev) => {
              ev.preventDefault();
              agir(() => api.rpc('inviter_dirigeant', { p_client_id: client.id, p_email: email }), 'Invitation créée')
                .then(() => { setInvite(email.trim().toLowerCase()); setEmail(''); })
                .catch(() => {});
            }}
          >
            <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="E-mail du dirigeant" required aria-label="E-mail du dirigeant" />
            <Bouton type="submit" chargement={enCours}>Inviter</Bouton>
          </form>
        </Section>
      )}

      {onglet === 'licences' && (
        <Section titre="Licences par établissement">
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead><tr><th>Établissement</th><th>Offre</th><th>Formule</th><th>Échéance</th><th>État</th></tr></thead>
              <tbody>
                {client.etablissements.map((e) => (
                  <tr key={e.id} className="cliquable" tabIndex={0} onClick={() => naviguer(`editeur/etablissements/${e.id}`)}>
                    <td><strong>{e.nom}</strong></td>
                    <td>{e.licence?.offre ?? '—'}</td>
                    <td>{e.licence ? FORMULES[e.licence.formule] : '—'}</td>
                    <td>{e.licence?.echeance ? formatDate(e.licence.echeance) : e.licence ? 'sans échéance' : '—'}</td>
                    <td><BadgeLicence licence={e.licence} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {modale?.type === 'client' && <FormulaireClient client={client} onFermer={() => setModale(null)} onEnregistre={() => { setModale(null); recharger(); }} />}
      {modale?.type === 'etablissement' && (
        <FormulaireEtablissement
          client={client}
          solutions={vue.solutions}
          onFermer={() => setModale(null)}
          onEnregistre={(id) => { setModale(null); recharger(); naviguer(`editeur/etablissements/${id}`); }}
        />
      )}
      {modale?.type === 'statut' && (
        <Confirmation
          titre={modale.titre}
          texte={modale.statut === 'actif' ? 'Le client et ses établissements retrouvent l’écriture (selon leur licence).' : 'Aucune donnée n’est supprimée : les établissements passent en consultation seule.'}
          libelleAction="Confirmer"
          danger={modale.statut !== 'actif'}
          onValider={async () => {
            await api.rpc('definir_statut_client', { p_client_id: client.id, p_statut: modale.statut });
            notifier(`Client : ${STATUTS[modale.statut].toLowerCase()}`);
            recharger();
          }}
          onFermer={() => setModale(null)}
        />
      )}
      {invite && (
        <Modale titre="Message pour le dirigeant" onFermer={() => setInvite(null)}>
          <CopierTexte texte={messageInvitation({ etablissement: client.nom, email: invite, role: 'Dirigeant' }).replace('en tant que Dirigeant', 'en tant que dirigeant (consultation de tous vos établissements)')} />
        </Modale>
      )}
    </div>
  );
}
