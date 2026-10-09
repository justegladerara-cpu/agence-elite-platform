// Sites clients rattachés (ex. Express Congo) : état, comptes et accès, gérés par le Super Admin.
// Chaque appel part du navigateur vers le site, avec le jeton de session ; le site vérifie lui-même auprès de
// la base de la plateforme que la personne est Super Admin (voir noyau/sites.js).
import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { ACTIONS_JOURNAL_SITE, ROLES_SITE, SITES_CLIENTS, appelerSite, trouverSite } from '../../noyau/sites.js';
import {
  Badge, Bouton, Champ, DataTable, EmptyState, Erreur, MenuActions, Modale, PageHeader, Section, StatCard, Tabs,
} from '../../ui/composants.jsx';

const FIL = [{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Sites clients', href: '#/editeur/sites' }];

export default function SitesEditeur({ siteId, naviguer }) {
  const { roleEditeur, api } = useEspace();
  if (roleEditeur !== 'super_admin') return <div className="page"><EmptyState titre="Réservé à la direction (Super Admin)" /></div>;
  if (typeof api.jeton !== 'function')
    return <div className="page"><EmptyState titre="Disponible sur la plateforme en ligne uniquement" texte="Le mode démo local n’a pas de session à transmettre aux sites clients." /></div>;
  const site = siteId ? trouverSite(siteId) : null;
  if (siteId && !site) return <div className="page"><EmptyState titre="Site introuvable" /></div>;
  return site ? <PageSite key={site.id} site={site} naviguer={naviguer} /> : <ListeSites naviguer={naviguer} />;
}

function ListeSites({ naviguer }) {
  return (
    <div className="page">
      <PageHeader
        fil={[FIL[0], { libelle: 'Sites clients' }]}
        titre="Sites clients"
        sousTitre="Applications réalisées pour un client et hébergées à part. Vous gérez leurs accès d’ici, avec votre compte Super Admin."
      />
      <DataTable
        lignes={SITES_CLIENTS}
        onLigne={(s) => naviguer(`editeur/sites/${s.id}`)}
        vide="Aucun site rattaché"
        colonnes={[
          { id: 'nom', libelle: 'Site', rendu: (s) => <strong>{s.nom}</strong> },
          { id: 'client', libelle: 'Client' },
          { id: 'description', libelle: 'Description', classe: 'texte-doux' },
          { id: 'adresse', libelle: 'Adresse', rendu: (s) => <a href={s.adresse} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{s.adresse.replace('https://', '')}</a> },
        ]}
      />
    </div>
  );
}

function PageSite({ site, naviguer }) {
  const { api, notifier } = useEspace();
  const [onglet, setOnglet] = useState('comptes');
  const [lien, setLien] = useState(null);
  const [creation, setCreation] = useState(false);
  const [ouverture, setOuverture] = useState(false);
  const [erreurAction, setErreurAction] = useState(null);
  const appel = async (chemin, options = {}) => appelerSite(site, chemin, { ...options, jeton: await api.jeton() });

  const etat = useDonnees(() => appel('etat'), [site.id]);
  const comptes = useDonnees(() => appel('comptes'), [site.id]);
  const journal = useDonnees(() => (onglet === 'journal' ? appel('journal') : Promise.resolve(null)), [site.id, onglet]);

  const agir = async (corps, message) => {
    setErreurAction(null);
    try {
      const r = await appel('comptes', { methode: 'POST', corps });
      if (r.link) setLien({ titre: corps.action === 'create' ? 'Compte créé' : 'Lien de mot de passe', ...r, email: corps.email });
      else notifier(message);
      comptes.recharger();
      etat.recharger();
    } catch (e) {
      setErreurAction(e.message);
    }
  };
  const basculerDemo = async (ouvert) => {
    setErreurAction(null);
    try {
      await appel('acces', { methode: 'POST', corps: { demoPublic: ouvert } });
      notifier(ouvert ? 'Démo publique ouverte' : 'Démo publique fermée : les comptes publics sont refusés');
      etat.recharger();
      comptes.recharger();
    } catch (e) {
      setErreurAction(e.message);
    }
  };
  // Ouvre la gestion du site connecté en administrateur, avec un lien valable 60 secondes.
  const ouvrir = async () => {
    setOuverture(true);
    setErreurAction(null);
    const fenetre = window.open('', '_blank');
    try {
      const r = await appel('session', { methode: 'POST', corps: {} });
      if (fenetre) fenetre.location.href = r.url;
      else window.location.href = r.url;
    } catch (e) {
      fenetre?.close();
      setErreurAction(e.message);
    } finally {
      setOuverture(false);
    }
  };

  const e = etat.donnees;
  const liste = comptes.donnees?.comptes ?? null;
  const equipe = (liste ?? []).filter((c) => c.role !== 'client' && !c.publicDemo && !c.platform);
  const injoignable = etat.erreur && !e;

  return (
    <div className="page">
      <PageHeader
        fil={[...FIL, { libelle: site.nom }]}
        titre={site.nom}
        sousTitre={site.description}
        badges={e ? <Badge ton="vert">En ligne</Badge> : injoignable ? <Badge ton="rouge">Injoignable</Badge> : null}
        actions={(
          <>
            <Bouton icone="globe" onClick={() => window.open(site.adresse, '_blank', 'noopener')}>Voir le site</Bouton>
            <Bouton variante="principal" icone="editeur" chargement={ouverture} disabled={!e} onClick={ouvrir}>Ouvrir la gestion</Bouton>
          </>
        )}
      />
      {injoignable && (
        <Section titre="Le site ne répond pas">
          <p>{etat.erreur}</p>
          <p className="texte-doux">
            Vérifiez qu’il est publié sur Cloudflare à l’adresse {site.adresse}. Vous restez Super Admin : rien n’est perdu.
          </p>
          <Bouton icone="repeter" onClick={() => { etat.recharger(); comptes.recharger(); }}>Réessayer</Bouton>
        </Section>
      )}
      <Erreur message={erreurAction} />
      {e && (
        <div className="grille-stats">
          <StatCard icone="membres" libelle="Comptes" valeur={e.counts.accounts} detail={`${e.counts.activeSessions} session(s) ouverte(s)`} onClick={() => setOnglet('comptes')} />
          <StatCard icone="camion" libelle="Expéditions" valeur={e.counts.shipment ?? 0} detail={`${e.counts.parcel ?? 0} colis · ${e.counts.departure ?? 0} départ(s)`} />
          <StatCard icone="document" libelle="Demandes de devis" valeur={e.counts.quotes} detail={`${e.counts.proposal ?? 0} proposition(s)`} />
          <StatCard
            icone="facture"
            libelle="Paiements"
            valeur={e.payments.methods.length}
            detail={e.payments.methods.length ? 'moyen(s) proposé(s) aux clients' : 'Aucun moyen configuré'}
            ton={e.payments.methods.length ? '' : 'attention'}
          />
          <StatCard
            icone="cle"
            libelle="Démo publique"
            valeur={e.access.demoPublic ? 'Ouverte' : 'Fermée'}
            detail={e.access.demoPublic ? 'Comptes de démonstration accessibles à tous' : 'Seuls les vrais comptes se connectent'}
            ton={e.access.demoPublic ? 'attention' : ''}
            onClick={() => setOnglet('acces')}
          />
          <StatCard icone="horloge" libelle="Dernière activité" valeur={e.lastActivity ? formatDateHeure(e.lastActivity) : '—'} detail={e.environment === 'demo' ? 'Environnement de démonstration' : e.environment} />
        </div>
      )}

      <Tabs
        onglets={[
          ['comptes', 'Comptes et rôles', liste?.length],
          ['acces', 'Accès'],
          ['journal', 'Journal'],
        ]}
        actif={onglet}
        onChange={setOnglet}
      />

      {onglet === 'comptes' && (
        <Section
          titre="Comptes"
          sousTitre="Créez un compte : vous recevez un lien à transmettre, la personne y choisit son mot de passe (valable 72 h). Un changement de rôle ou une désactivation ferme ses sessions."
          action={<Bouton variante="principal" icone="plus" disabled={!e} onClick={() => setCreation(true)}>Nouveau compte</Bouton>}
        >
          <Erreur message={comptes.erreur} />
          <DataTable
            chargement={comptes.chargement}
            lignes={liste ?? (comptes.erreur ? [] : null)}
            rechercher={(c) => `${c.email} ${ROLES_SITE[c.role] ?? c.role} ${site.agences[c.agency] ?? ''}`}
            placeholder="Rechercher un compte…"
            filtres={[
              { id: 'role', libelle: 'Rôle', options: Object.entries(ROLES_SITE), appliquer: (c, v) => c.role === v },
            ]}
            vide="Aucun compte"
            colonnes={[
              {
                id: 'email', libelle: 'Compte', tri: (c) => c.email,
                rendu: (c) => (
                  <div>
                    <strong>{c.platform ? 'Super Admin (plateforme)' : c.email}</strong>
                    {c.publicDemo && <div className="texte-doux">Compte public de démonstration</div>}
                    {c.platform && <div className="texte-doux">{c.email.replace('plateforme:', '')}</div>}
                  </div>
                ),
              },
              { id: 'role', libelle: 'Rôle', tri: (c) => c.role, rendu: (c) => ROLES_SITE[c.role] ?? c.role },
              { id: 'agency', libelle: 'Agence', rendu: (c) => site.agences[c.agency] ?? c.agency },
              {
                id: 'etat', libelle: 'État',
                rendu: (c) => (c.disabled
                  ? <Badge ton="rouge">Désactivé</Badge>
                  : c.publicDemo && e && !e.access.demoPublic
                    ? <Badge>Démo fermée</Badge>
                    : !c.verified
                      ? <Badge ton="orange">En attente d’activation</Badge>
                      : <Badge ton="vert">Actif</Badge>),
              },
              { id: 'sessions', libelle: 'Sessions', rendu: (c) => c.activeSessions || '—' },
              {
                id: 'actions', libelle: '', classe: 'cellule-actions',
                rendu: (c) => (
                  <MenuActions
                    actions={[
                      !c.publicDemo && !c.platform && { libelle: 'Changer le rôle ou l’agence', icone: 'membres', onClick: () => setCreation({ modification: c }) },
                      !c.publicDemo && !c.platform && { libelle: c.verified ? 'Créer un lien de nouveau mot de passe' : 'Renvoyer un lien d’activation', icone: 'cle', onClick: () => agir({ action: 'reset', id: c.id, email: c.email }) },
                      c.activeSessions > 0 && { libelle: 'Fermer ses sessions', icone: 'sortie', onClick: () => agir({ action: 'revoke', id: c.id }, 'Sessions fermées') },
                      c.disabled
                        ? { libelle: 'Réactiver', icone: 'coche', onClick: () => agir({ action: 'enable', id: c.id }, 'Compte réactivé') }
                        : { libelle: 'Désactiver', icone: 'fermer', danger: true, onClick: () => agir({ action: 'disable', id: c.id }, 'Compte désactivé : accès coupé immédiatement') },
                    ]}
                  />
                ),
              },
            ]}
          />
          {liste && <p className="texte-doux">{equipe.length} membre(s) de l’équipe, {liste.filter((c) => c.role === 'client' && !c.publicDemo).length} client(s) inscrit(s).</p>}
        </Section>
      )}

      {onglet === 'acces' && e && (
        <Section titre="Démonstration publique" sousTitre="Les comptes de démonstration (mot de passe affiché sur l’écran de connexion) servent à présenter le logiciel. Fermez-les dès que de vrais utilisateurs travaillent dessus.">
          <div className="pile">
            <p>
              État actuel : <strong>{e.access.demoPublic ? 'ouverte' : 'fermée'}</strong>.{' '}
              {e.access.demoPublic
                ? 'N’importe qui peut se connecter comme administrateur de démonstration.'
                : 'Les comptes publics sont refusés et leurs identifiants ne sont plus affichés.'}
            </p>
            <div>
              {e.access.demoPublic
                ? <Bouton variante="principal" icone="cle" onClick={() => basculerDemo(false)}>Fermer la démo publique</Bouton>
                : <Bouton icone="cle" onClick={() => basculerDemo(true)}>Rouvrir la démo publique</Bouton>}
            </div>
          </div>
        </Section>
      )}

      {onglet === 'journal' && (
        <Section titre="Journal d’activité" sousTitre="Les 60 dernières actions enregistrées par le site, sans contenu personnel.">
          <Erreur message={journal.erreur} />
          <DataTable
            chargement={journal.chargement}
            lignes={journal.donnees?.journal ?? (journal.erreur ? [] : null)}
            vide="Aucune action"
            colonnes={[
              { id: 'createdAt', libelle: 'Date', rendu: (j) => formatDateHeure(j.createdAt) },
              { id: 'action', libelle: 'Action', rendu: (j) => ACTIONS_JOURNAL_SITE[j.action] ?? j.action },
              { id: 'actor', libelle: 'Par', rendu: (j) => (j.actor.startsWith('plateforme:') ? `${j.actor.slice(11)} (plateforme)` : j.actor) },
            ]}
          />
        </Section>
      )}

      {creation && (
        <ModaleCompte
          site={site}
          modification={creation.modification}
          onFermer={() => setCreation(false)}
          onValider={async (corps) => {
            await agir(corps, 'Rôle mis à jour : appliqué à la prochaine connexion');
            setCreation(false);
          }}
        />
      )}
      {lien && <ModaleLien lien={lien} onFermer={() => setLien(null)} />}
      <p className="texte-doux">
        <a href="#/editeur/sites" onClick={(ev) => { ev.preventDefault(); naviguer('editeur/sites'); }}>← Tous les sites clients</a>
      </p>
    </div>
  );
}

function ModaleCompte({ site, modification, onFermer, onValider }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(modification?.role ?? 'agent');
  const [agence, setAgence] = useState(modification?.agency ?? 'paris');
  const [envoi, setEnvoi] = useState(false);
  const valide = modification || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const envoyer = async (ev) => {
    ev.preventDefault();
    setEnvoi(true);
    await onValider(modification
      ? { action: 'update', id: modification.id, role, agency: agence }
      : { action: 'create', email: email.trim(), role, agency: agence });
    setEnvoi(false);
  };
  return (
    <Modale
      titre={modification ? `Modifier ${modification.email}` : `Nouveau compte ${site.nom}`}
      onFermer={onFermer}
      pied={(
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" type="submit" form="form-compte-site" disabled={!valide} chargement={envoi}>
            {modification ? 'Enregistrer' : 'Créer et obtenir le lien'}
          </Bouton>
        </>
      )}
    >
      <form id="form-compte-site" className="pile" onSubmit={envoyer}>
        {!modification && (
          <Champ libelle="Adresse e-mail" aide="Sert d’identifiant de connexion sur le site.">
            <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} autoComplete="off" required />
          </Champ>
        )}
        <Champ libelle="Rôle">
          <select value={role} onChange={(ev) => setRole(ev.target.value)}>
            {Object.entries(ROLES_SITE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Champ>
        <Champ libelle="Agence de rattachement">
          <select value={agence} onChange={(ev) => setAgence(ev.target.value)}>
            {Object.entries(site.agences).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Champ>
      </form>
    </Modale>
  );
}

function ModaleLien({ lien, onFermer }) {
  const [copie, setCopie] = useState(false);
  return (
    <Modale titre={lien.titre} onFermer={onFermer} pied={<Bouton variante="principal" onClick={onFermer}>Terminé</Bouton>}>
      <div className="pile">
        <p>
          Transmettez ce lien {lien.email ? <>à <strong>{lien.email}</strong> </> : ''}(WhatsApp, e-mail…). Il permet de choisir un mot de passe,
          sert une seule fois et expire dans {lien.expiresInHours} heures. Il ne sera plus affiché ensuite.
        </p>
        <input readOnly value={lien.link} onFocus={(ev) => ev.target.select()} aria-label="Lien à transmettre" />
        <div>
          <Bouton
            icone="document"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(lien.link);
                setCopie(true);
              } catch {
                setCopie(false);
              }
            }}
          >
            {copie ? 'Copié' : 'Copier le lien'}
          </Bouton>
        </div>
      </div>
    </Modale>
  );
}
