import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure, ROLES, ROLES_PLATEFORME } from '../../noyau/format.js';
import { Avatar, Badge, Bouton, Champ, DataTable, Erreur, MenuActions, Modale, PageHeader } from '../../ui/composants.jsx';
import { useVueEditeur } from './ClientsEditeur.jsx';

const DOMAINE_IDENTIFIANTS = 'identifiants.agence-elite.fr';

function etatMotDePasse(c) {
  if (c.doit_changer_mot_de_passe && c.temporaire_expire_le && new Date(c.temporaire_expire_le) < new Date()) return <Badge ton="alerte">Temporaire expiré</Badge>;
  if (c.doit_changer_mot_de_passe) return <Badge ton="attention">Temporaire (à changer)</Badge>;
  return <Badge ton="vert">Personnel</Badge>;
}

function ModaleNouveauCompte({ etablissements, superAdmin, onFermer, onCree }) {
  const { api } = useEspace();
  const [v, setV] = useState({ identifiant: '', nom: '', email: '', mdp: '', jours: '30', etablissement: '', role: 'employe', equipe: '' });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (c) => (e) => setV((x) => ({ ...x, [c]: e.target.value }));
  const creer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    const email = (v.email.trim() || `${v.identifiant.trim().toLowerCase()}@${DOMAINE_IDENTIFIANTS}`).toLowerCase();
    try {
      // Avec un établissement : le compte rejoint directement l'équipe (aucune invitation à accepter).
      const id = v.etablissement
        ? (await api.rpc('creer_membre_sans_email', {
          p_etablissement_id: v.etablissement, p_identifiant: v.identifiant.trim(), p_nom: v.nom.trim() || v.identifiant.trim(),
          p_role_id: v.role, p_mot_de_passe_temporaire: v.mdp, p_email: email, p_expire_jours: Number(v.jours) || 30,
        })).user_id
        : await api.rpc('creer_compte', {
          p_email: email, p_identifiant: v.identifiant.trim(), p_nom: v.nom.trim() || null, p_mot_de_passe_temporaire: v.mdp, p_expire_jours: Number(v.jours) || 30,
        });
      if (v.equipe) await api.rpc('definir_admin_plateforme', { p_user_id: id, p_role: v.equipe, p_actif: true });
      onCree(v.identifiant.trim());
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Créer un compte" onFermer={onFermer}>
      <form className="formulaire" onSubmit={creer}>
        <p className="texte-doux">La personne se connecte avec son identifiant et le mot de passe temporaire, puis doit créer son propre mot de passe avant d’accéder à quoi que ce soit.</p>
        <div className="grille-champs">
          <Champ libelle="Identifiant de connexion" aide="3 à 40 caractères : lettres, chiffres, point, tiret.">
            <input value={v.identifiant} onChange={changer('identifiant')} required autoFocus pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,39}" autoComplete="off" />
          </Champ>
          <Champ libelle="Nom complet"><input value={v.nom} onChange={changer('nom')} placeholder="Prénom et nom" /></Champ>
          <Champ libelle="E-mail (facultatif)" aide="Sans e-mail, une adresse technique est utilisée.">
            <input type="email" value={v.email} onChange={changer('email')} autoComplete="off" />
          </Champ>
          <Champ libelle="Mot de passe temporaire" aide="4 caractères au moins. À transmettre de vive voix.">
            <input value={v.mdp} onChange={changer('mdp')} required minLength={4} autoComplete="new-password" />
          </Champ>
          <Champ libelle="Validité du mot de passe temporaire">
            <select value={v.jours} onChange={changer('jours')}>
              <option value="7">7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option>
            </select>
          </Champ>
        </div>
        <fieldset className="droits-module">
          <legend>Accès (facultatif)</legend>
          <div className="grille-champs">
            <Champ libelle="Établissement" aide="La personne fait partie de l’équipe dès sa première connexion.">
              <select value={v.etablissement} onChange={changer('etablissement')}>
                <option value="">Aucun pour l’instant</option>
                {etablissements.map((e) => <option key={e.id} value={e.id}>{e.nom} · {e.client}</option>)}
              </select>
            </Champ>
            {v.etablissement && (
              <Champ libelle="Rôle dans l’établissement">
                <select value={v.role} onChange={changer('role')}>
                  {Object.entries(ROLES).map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
                </select>
              </Champ>
            )}
            {superAdmin && (
              <Champ libelle="Équipe Agence Elite">
                <select value={v.equipe} onChange={changer('equipe')}>
                  <option value="">Non</option><option value="admin">Admin</option><option value="support">Support</option>
                </select>
              </Champ>
            )}
          </div>
        </fieldset>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Créer le compte</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleReinitialiser({ compte, onFermer, onFait }) {
  const { api } = useEspace();
  const [mdp, setMdp] = useState('');
  const [jours, setJours] = useState('7');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  return (
    <Modale titre={`Nouveau mot de passe temporaire · ${compte.identifiant ?? compte.email}`} onFermer={onFermer}>
      <form
        className="formulaire"
        onSubmit={async (e) => {
          e.preventDefault();
          setChargement(true);
          setErreur('');
          try {
            await api.rpc('reinitialiser_mot_de_passe_temporaire', { p_user_id: compte.id, p_mot_de_passe_temporaire: mdp, p_expire_jours: Number(jours) });
            onFait();
          } catch (err) {
            setErreur(err.message);
            setChargement(false);
          }
        }}
      >
        <p className="texte-doux">L’ancien mot de passe cesse de fonctionner. La personne devra en créer un nouveau à sa prochaine connexion.</p>
        <div className="grille-champs">
          <Champ libelle="Mot de passe temporaire"><input value={mdp} onChange={(e) => setMdp(e.target.value)} required minLength={4} autoFocus autoComplete="new-password" /></Champ>
          <Champ libelle="Validité">
            <select value={jours} onChange={(e) => setJours(e.target.value)}><option value="1">1 jour</option><option value="7">7 jours</option><option value="30">30 jours</option></select>
          </Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Réinitialiser</Bouton></div>
      </form>
    </Modale>
  );
}

function ModaleIdentifiant({ compte, onFermer, onFait }) {
  const { api } = useEspace();
  const [identifiant, setIdentifiant] = useState(compte.identifiant ?? '');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  return (
    <Modale titre={`Identifiant de ${compte.nom ?? compte.email}`} onFermer={onFermer}>
      <form
        className="formulaire"
        onSubmit={async (e) => {
          e.preventDefault();
          setChargement(true);
          setErreur('');
          try {
            await api.rpc('definir_identifiant', { p_user_id: compte.id, p_identifiant: identifiant });
            onFait();
          } catch (err) {
            setErreur(err.message);
            setChargement(false);
          }
        }}
      >
        <Champ libelle="Identifiant de connexion" aide="Unique, sans distinction majuscules/minuscules.">
          <input value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required autoFocus />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>
      </form>
    </Modale>
  );
}

export default function ComptesEditeur() {
  const { api, roleEditeur, utilisateur, notifier } = useEspace();
  const { donnees: comptes, chargement, erreur, recharger } = useDonnees(() => api.rpc('editeur_comptes'), []);
  const { donnees: vue } = useVueEditeur();
  const [modale, setModale] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const superAdmin = roleEditeur === 'super_admin';
  const etablissements = useMemo(
    () => (vue?.clients ?? []).filter((c) => c.statut !== 'archive').flatMap((c) => c.etablissements.filter((e) => e.statut !== 'archive').map((e) => ({ ...e, client: c.nom }))),
    [vue]
  );
  const fait = (message) => {
    setModale(null);
    notifier(message);
    recharger();
  };
  const definirRole = async (c, role, actif) => {
    setErreurAction('');
    try {
      await api.rpc('definir_admin_plateforme', { p_user_id: c.id, p_role: role, p_actif: actif });
      fait(actif ? `Rôle ${ROLES_PLATEFORME[role]} donné` : 'Accès Agence Elite retiré');
    } catch (err) {
      setErreurAction(err.message);
    }
  };

  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Comptes' }]}
        titre="Comptes"
        sousTitre="Comptes de connexion, identifiants, mots de passe temporaires et équipe Agence Elite."
        actions={<Bouton variante="principal" icone="plus" onClick={() => setModale({ type: 'nouveau' })}>Créer un compte</Bouton>}
      />
      <Erreur message={erreur || erreurAction} />
      <DataTable
        chargement={chargement}
        lignes={comptes}
        rechercher={(c) => `${c.nom ?? ''} ${c.identifiant ?? ''} ${c.email} ${c.acces.map((a) => a.etablissement).join(' ')}`}
        placeholder="Nom, identifiant, e-mail, établissement"
        triInitial={{ id: 'personne', sens: 'asc' }}
        filtres={[
          { id: 'equipe', libelle: 'Type', options: [['agence', 'Équipe Agence Elite'], ['client', 'Comptes clients']], appliquer: (c, v) => (v === 'agence' ? Boolean(c.role_plateforme) : !c.role_plateforme) },
          { id: 'mdp', libelle: 'Mot de passe', options: [['temporaire', 'Temporaire'], ['personnel', 'Personnel']], appliquer: (c, v) => (v === 'temporaire') === Boolean(c.doit_changer_mot_de_passe) },
        ]}
        colonnes={[
          {
            id: 'personne', libelle: 'Personne', tri: (c) => (c.nom ?? c.email).toLowerCase(),
            rendu: (c) => (
              <span className="cellule-personne">
                <Avatar nom={c.nom ?? c.email} taille="petit" />
                <span><strong>{c.nom ?? '—'}</strong><small className="texte-doux bloc">{c.identifiant ? `@${c.identifiant}` : 'sans identifiant'} · {c.email}</small></span>
              </span>
            ),
          },
          { id: 'role', libelle: 'Agence Elite', tri: (c) => c.role_plateforme ?? 'z', rendu: (c) => (c.role_plateforme ? <Badge ton="bleu">{ROLES_PLATEFORME[c.role_plateforme]}</Badge> : <span className="texte-doux">—</span>) },
          { id: 'acces', libelle: 'Accès', rendu: (c) => (c.acces.length ? c.acces.map((a) => `${a.etablissement} (${ROLES[a.role] ?? a.role}${a.actif ? '' : ', désactivé'})`).join(', ') : <span className="texte-doux">aucun établissement</span>) },
          { id: 'mdp', libelle: 'Mot de passe', tri: (c) => (c.doit_changer_mot_de_passe ? 0 : 1), rendu: (c) => <>{etatMotDePasse(c)}{c.doit_changer_mot_de_passe && c.temporaire_expire_le && <small className="texte-doux bloc">jusqu’au {formatDate(c.temporaire_expire_le)}</small>}</> },
          { id: 'connexion', libelle: 'Dernière connexion', tri: (c) => c.derniere_connexion ?? '', rendu: (c) => (c.derniere_connexion ? formatDateHeure(c.derniere_connexion) : <span className="texte-doux">jamais</span>) },
          {
            id: 'actions', libelle: '', classe: 'cellule-actions',
            rendu: (c) => {
              const protege = c.role_plateforme && ['super_admin', 'admin'].includes(c.role_plateforme) && !superAdmin;
              if (c.id === utilisateur.id) return <span className="texte-doux">vous</span>;
              return (
                <MenuActions
                  actions={[
                    !protege && { libelle: c.identifiant ? 'Changer l’identifiant' : 'Donner un identifiant', icone: 'comptes', onClick: () => setModale({ type: 'identifiant', compte: c }) },
                    !protege && { libelle: 'Mot de passe temporaire', icone: 'cle', onClick: () => setModale({ type: 'reinitialiser', compte: c }) },
                    superAdmin && c.role_plateforme !== 'admin' && c.role_plateforme !== 'super_admin' && { libelle: 'Rôle Admin Agence Elite', icone: 'editeur', onClick: () => definirRole(c, 'admin', true) },
                    superAdmin && !c.role_plateforme && { libelle: 'Rôle Support Agence Elite', icone: 'oeil', onClick: () => definirRole(c, 'support', true) },
                    superAdmin && c.role_plateforme && c.role_plateforme !== 'super_admin' && { libelle: 'Retirer de l’équipe Agence Elite', icone: 'sortie', danger: true, onClick: () => definirRole(c, c.role_plateforme, false) },
                  ]}
                />
              );
            },
          },
        ]}
      />
      {modale?.type === 'nouveau' && (
        <ModaleNouveauCompte etablissements={etablissements} superAdmin={superAdmin} onFermer={() => setModale(null)} onCree={(id) => fait(`Compte ${id} créé`)} />
      )}
      {modale?.type === 'reinitialiser' && <ModaleReinitialiser compte={modale.compte} onFermer={() => setModale(null)} onFait={() => fait('Mot de passe temporaire défini')} />}
      {modale?.type === 'identifiant' && <ModaleIdentifiant compte={modale.compte} onFermer={() => setModale(null)} onFait={() => fait('Identifiant enregistré')} />}
    </div>
  );
}
