import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, ROLES } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Modale, Vide } from '../../ui/composants.jsx';

export function messageInvitation({ etablissement, email, role }) {
  const lien = `${window.location.origin}${window.location.pathname}#/invitation?email=${encodeURIComponent(email)}`;
  return `Bonjour, vous êtes invité(e) à rejoindre « ${etablissement} » sur Solution Commerce (Agence Elite), en tant que ${ROLES[role] ?? role}.\n\n`
    + `1. Ouvrez ce lien : ${lien}\n`
    + `2. Saisissez votre nom et choisissez votre mot de passe (8 caractères au moins, avec une lettre et un chiffre). L’adresse ${email} est déjà remplie.\n`
    + '3. Confirmez votre adresse avec le lien reçu par e-mail, puis connectez-vous et cliquez sur « Rejoindre ».\n\n'
    + 'L’invitation est valable 7 jours.';
}

export function CopierTexte({ texte }) {
  const [copie, setCopie] = useState(false);
  return (
    <div className="message-copie">
      <textarea readOnly value={texte} rows={8} onFocus={(e) => e.target.select()} aria-label="Message à envoyer" />
      <Bouton
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texte);
            setCopie(true);
          } catch {
            setCopie(false);
          }
        }}
      >
        {copie ? 'Copié' : 'Copier le message'}
      </Bouton>
    </div>
  );
}

export function messageIdentifiants({ etablissement, identifiant, motDePasse }) {
  const lien = `${window.location.origin}${window.location.pathname}`;
  return `Bonjour, votre accès à « ${etablissement} » sur Solution Commerce (Agence Elite) est prêt.\n\n`
    + `Site : ${lien}\n`
    + `Identifiant : ${identifiant}\n`
    + `Mot de passe provisoire : ${motDePasse}\n\n`
    + 'À la première connexion, vous choisirez votre propre mot de passe.';
}

export const identifiantDepuisEmail = (email) => (email?.endsWith('@identifiants.agence-elite.fr') ? email.split('@')[0] : null);

function ModaleCompteDirect({ etablissementId, nomEtablissement, roles, hubs, onFermer, onCree }) {
  const { api } = useEspace();
  const [v, setV] = useState({ nom: '', identifiant: '', mdp: '', role: roles.includes('employe') ? 'employe' : roles[0], hubs: [] });
  const [cree, setCree] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (c) => (e) => setV((x) => ({ ...x, [c]: e.target.value }));
  const creer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const r = await api.rpc('creer_membre_sans_email', {
        p_etablissement_id: etablissementId, p_identifiant: v.identifiant.trim(), p_nom: v.nom.trim(), p_role_id: v.role,
        p_mot_de_passe_temporaire: v.mdp, p_hubs: v.hubs.length ? v.hubs : null,
      });
      setCree({ identifiant: r.identifiant, motDePasse: v.mdp });
      onCree();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  return (
    <Modale titre="Créer un compte" onFermer={onFermer}>
      {cree ? (
        <div className="formulaire">
          <p>Le compte <strong>{cree.identifiant}</strong> est prêt et fait déjà partie de l’équipe. Envoyez-lui ce message :</p>
          <CopierTexte texte={messageIdentifiants({ etablissement: nomEtablissement, identifiant: cree.identifiant, motDePasse: cree.motDePasse })} />
          <div className="actions"><Bouton variante="principal" onClick={onFermer}>Terminé</Bouton></div>
        </div>
      ) : (
        <form className="formulaire" onSubmit={creer}>
          <p className="texte-doux">Sans e-mail ni confirmation : la personne se connecte avec son identifiant et choisit son mot de passe à la première connexion.</p>
          <Champ libelle="Nom"><input value={v.nom} onChange={changer('nom')} required autoFocus placeholder="Prénom et nom" /></Champ>
          <Champ libelle="Identifiant" aide="3 à 40 caractères : lettres, chiffres, point ou tiret (ex. awa.caisse).">
            <input value={v.identifiant} onChange={changer('identifiant')} required pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,39}" autoComplete="off" />
          </Champ>
          <Champ libelle="Mot de passe provisoire" aide="4 caractères au moins. Il devra être changé à la première connexion.">
            <input value={v.mdp} onChange={changer('mdp')} required minLength={4} autoComplete="off" />
          </Champ>
          <Champ libelle="Rôle">
            <select value={v.role} onChange={changer('role')}>
              {roles.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select>
          </Champ>
          {hubs.length > 1 && (
            <fieldset className="droits-module">
              <legend>Hubs (aucune case = tous)</legend>
              {hubs.map((h) => (
                <label key={h.id} className="case">
                  <input
                    type="checkbox"
                    checked={v.hubs.includes(h.id)}
                    onChange={(e) => setV((x) => ({ ...x, hubs: e.target.checked ? [...x.hubs, h.id] : x.hubs.filter((id) => id !== h.id) }))}
                  />
                  {h.nom}
                </label>
              ))}
            </fieldset>
          )}
          <Erreur message={erreur} />
          <div className="actions">
            <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
            <Bouton type="submit" variante="principal" chargement={chargement}>Créer le compte</Bouton>
          </div>
        </form>
      )}
    </Modale>
  );
}

function ModaleInvitation({ etablissementId, nomEtablissement, roles, onFermer, onInvite }) {
  const { api } = useEspace();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roles.includes('employe') ? 'employe' : roles[0]);
  const [envoyee, setEnvoyee] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const inviter = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const invitation = await api.rpc('inviter_membre', { p_etablissement_id: etablissementId, p_email: email, p_role_id: role });
      setEnvoyee(invitation);
      onInvite();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  return (
    <Modale titre="Inviter une personne" onFermer={onFermer}>
      {envoyee ? (
        <div className="formulaire">
          <p>Invitation créée pour <strong>{envoyee.email}</strong>. Envoyez-lui ce message (WhatsApp, SMS ou e-mail) :</p>
          <CopierTexte texte={messageInvitation({ etablissement: nomEtablissement, email: envoyee.email, role: envoyee.role_id })} />
          <div className="actions"><Bouton variante="principal" onClick={onFermer}>Terminé</Bouton></div>
        </div>
      ) : (
        <form className="formulaire" onSubmit={inviter}>
          <Champ libelle="Adresse e-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Champ>
          <Champ libelle="Rôle" aide="Les droits du rôle s’ajustent ensuite personne par personne.">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select>
          </Champ>
          <Erreur message={erreur} />
          <div className="actions">
            <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
            <Bouton type="submit" variante="principal" chargement={chargement}>Créer l’invitation</Bouton>
          </div>
        </form>
      )}
    </Modale>
  );
}

function ModaleMembre({ etablissementId, membre, catalogue, modulesActifs, roles, hubs = [], hubsMembre = [], onFermer, onEnregistre }) {
  const { api } = useEspace();
  const [role, setRole] = useState(membre.role_id);
  const [restreint, setRestreint] = useState(hubsMembre.length > 0);
  const [hubsChoisis, setHubsChoisis] = useState(hubsMembre);
  const [ajustements, setAjustements] = useState(membre.permissions_ajustees ?? {});
  const [actif, setActif] = useState(membre.actif);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const parDefaut = (permission) => catalogue.rolePermissions.has(`${role}|${permission}`);
  const effectif = (permission) => ajustements[permission] ?? parDefaut(permission);
  const basculer = (permission) => {
    const voulu = !effectif(permission);
    setAjustements((a) => {
      const suite = { ...a };
      if (voulu === parDefaut(permission)) delete suite[permission];
      else suite[permission] = voulu;
      return suite;
    });
  };
  const enregistrer = async () => {
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('modifier_membre', {
        p_etablissement_id: etablissementId, p_user_id: membre.user_id, p_role_id: role, p_permissions_ajustees: ajustements, p_actif: actif,
      });
      const voulus = restreint ? hubsChoisis : [];
      if (hubs.length > 1 && [...voulus].sort().join() !== [...hubsMembre].sort().join()) {
        if (restreint && !voulus.length) throw new Error('Choisissez au moins un Hub, ou donnez accès à tous les Hubs');
        await api.rpc('definir_hubs_membre', { p_etablissement_id: etablissementId, p_user_id: membre.user_id, p_hubs: voulus });
      }
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  const modules = catalogue.modules.filter((m) => modulesActifs.includes(m.id));
  return (
    <Modale
      titre={membre.nom || membre.email}
      onFermer={onFermer}
      large
      pied={(
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" chargement={chargement} onClick={enregistrer}>Enregistrer</Bouton>
        </>
      )}
    >
      <div className="formulaire">
        <div className="grille-champs">
          <Champ libelle="Rôle">
            <select value={role} onChange={(e) => { setRole(e.target.value); setAjustements({}); }}>
              {roles.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select>
          </Champ>
          <label className="case">
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
            Accès actif
          </label>
        </div>
        {hubs.length > 1 && (
          <fieldset className="droits-module">
            <legend>Hubs accessibles</legend>
            <label className="case">
              <input type="radio" name="portee-hubs" checked={!restreint} onChange={() => setRestreint(false)} />
              Tous les Hubs de l’établissement
            </label>
            <label className="case">
              <input type="radio" name="portee-hubs" checked={restreint} onChange={() => setRestreint(true)} />
              Seulement certains Hubs
            </label>
            {restreint && hubs.map((h) => (
              <label key={h.id} className="case retrait">
                <input
                  type="checkbox"
                  checked={hubsChoisis.includes(h.id)}
                  onChange={(e) => setHubsChoisis((l) => (e.target.checked ? [...l, h.id] : l.filter((x) => x !== h.id)))}
                />
                {h.nom}{h.principal ? ' (principal)' : ''}
              </label>
            ))}
            <small className="champ-aide">Contrôlé par la base : ventes, caisses et stock des autres Hubs restent invisibles pour cette personne.</small>
          </fieldset>
        )}
        <p className="texte-doux">Cochez ou décochez pour ajuster les droits de cette personne. Un droit différent de son rôle est marqué « ajusté ».</p>
        <div className="grille-droits">
          {modules.map((m) => (
            <fieldset key={m.id} className="droits-module">
              <legend>{m.nom}</legend>
              {catalogue.permissions.filter((p) => p.module_id === m.id).map((p) => (
                <label key={p.id} className="case">
                  <input type="checkbox" checked={effectif(p.id)} onChange={() => basculer(p.id)} />
                  <span>{p.description || p.id}</span>
                  {p.id in ajustements && <Badge ton="bleu">ajusté</Badge>}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <Erreur message={erreur} />
      </div>
    </Modale>
  );
}

// Gestion d'équipe, utilisée par le gérant et par l'espace éditeur.
export function GestionEquipe({ etablissementId, nomEtablissement, modulesActifs, peutGerer, roleActuel, hubs = [] }) {
  const { api, notifier } = useEspace();
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [equipe, permissions, rolePermissions, modules, restrictions, catalogueRoles] = await Promise.all([
      api.rpc('equipe_etablissement', { p_etablissement_id: etablissementId }),
      api.lire('permissions', { ordre: ['id'] }),
      api.lire('role_permissions'),
      api.lire('modules', { ordre: ['nom'] }),
      api.lire('membre_hubs', { eq: { etablissement_id: etablissementId } }).catch(() => []),
      api.lire('roles', { ordre: ['ordre'] }),
    ]);
    const hubsParMembre = {};
    for (const r of restrictions) (hubsParMembre[r.user_id] ??= []).push(r.hub_id);
    return {
      equipe,
      hubsParMembre,
      roles: catalogueRoles,
      catalogue: { permissions, modules, rolePermissions: new Set(rolePermissions.map((r) => `${r.role_id}|${r.permission_id}`)) },
    };
  }, [etablissementId]);
  const [invitation, setInvitation] = useState(false);
  const [compteDirect, setCompteDirect] = useState(false);
  const [membre, setMembre] = useState(null);
  const [partage, setPartage] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  // Rôles proposés : lus en base, limités à ceux dont les modules requis sont actifs
  // et, pour un membre, à son rang ou en dessous (la base le vérifie aussi).
  const rangActuel = donnees?.roles.find((r) => r.id === roleActuel)?.ordre;
  const roles = donnees
    ? donnees.roles
      .filter((r) => (r.modules_requis ?? []).every((m) => modulesActifs?.includes(m)))
      .filter((r) => rangActuel == null || r.ordre >= rangActuel)
      .map((r) => r.id)
    : [];

  if (chargement && !donnees) return <Chargement />;
  return (
    <div className="pile">
      <Erreur message={erreur || erreurAction} />
      {peutGerer && (
        <div className="actions-gauche">
          <Bouton variante="principal" icone="plus" onClick={() => setCompteDirect(true)}>Créer un compte</Bouton>
          <Bouton icone="plus" onClick={() => setInvitation(true)}>Inviter par e-mail</Bouton>
        </div>
      )}
      {donnees && !donnees.equipe.membres.length && !donnees.equipe.invitations.length && (
        <Vide titre="Personne pour l’instant" texte="Créez le compte du responsable de l’établissement pour commencer." />
      )}
      {donnees?.equipe.membres.length > 0 && (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Personne</th><th>Rôle</th>{hubs.length > 1 && <th>Hubs</th>}<th>État</th><th /></tr></thead>
            <tbody>
              {donnees.equipe.membres.map((m) => (
                <tr key={m.user_id} className={m.actif ? '' : 'barre'}>
                  <td>
                    <strong>{m.nom || 'Sans nom'}</strong>
                    <small className="texte-doux bloc">{identifiantDepuisEmail(m.email) ? `Identifiant : ${identifiantDepuisEmail(m.email)}` : m.email}</small>
                  </td>
                  <td>
                    <Badge ton="bleu">{ROLES[m.role_id]}</Badge>
                    {Object.keys(m.permissions_ajustees ?? {}).length > 0 && <Badge>droits ajustés</Badge>}
                  </td>
                  {hubs.length > 1 && (
                    <td>
                      {donnees.hubsParMembre[m.user_id]
                        ? donnees.hubsParMembre[m.user_id].map((id) => hubs.find((h) => h.id === id)?.nom).filter(Boolean).join(', ')
                        : <span className="texte-doux">Tous</span>}
                    </td>
                  )}
                  <td>{m.actif ? <Badge ton="vert">Actif</Badge> : <Badge>Désactivé</Badge>}</td>
                  <td className="actions-ligne">
                    {peutGerer && !m.moi && <button className="lien" onClick={() => setMembre(m)}>Modifier</button>}
                    {m.moi && <span className="texte-doux">vous</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {donnees?.equipe.invitations.length > 0 && (
        <section className="carte">
          <h2>Invitations en attente</h2>
          <div className="liste-simple">
            {donnees.equipe.invitations.map((i) => (
              <div key={i.id} className="liste-ligne">
                <span>{i.email}</span>
                <Badge ton="bleu">{ROLES[i.role_id]}</Badge>
                <span className="texte-doux">jusqu’au {formatDate(i.expire_le)}</span>
                {peutGerer && (
                  <span className="actions-ligne">
                    <button className="lien" onClick={() => setPartage(i)}>Message</button>
                    <button
                      className="lien danger"
                      onClick={async () => {
                        setErreurAction('');
                        try {
                          await api.rpc('annuler_invitation', { p_invitation_id: i.id });
                          notifier('Invitation annulée');
                          recharger();
                        } catch (err) {
                          setErreurAction(err.message);
                        }
                      }}
                    >
                      Annuler
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {compteDirect && (
        <ModaleCompteDirect
          etablissementId={etablissementId}
          nomEtablissement={nomEtablissement}
          roles={roles}
          hubs={hubs}
          onFermer={() => setCompteDirect(false)}
          onCree={recharger}
        />
      )}
      {invitation && (
        <ModaleInvitation
          etablissementId={etablissementId}
          nomEtablissement={nomEtablissement}
          roles={roles}
          onFermer={() => setInvitation(false)}
          onInvite={recharger}
        />
      )}
      {partage && (
        <Modale titre={`Invitation de ${partage.email}`} onFermer={() => setPartage(null)}>
          <CopierTexte texte={messageInvitation({ etablissement: nomEtablissement, email: partage.email, role: partage.role_id })} />
        </Modale>
      )}
      {membre && donnees && (
        <ModaleMembre
          etablissementId={etablissementId}
          membre={membre}
          catalogue={donnees.catalogue}
          modulesActifs={modulesActifs}
          roles={roles}
          hubs={hubs}
          hubsMembre={donnees.hubsParMembre[membre.user_id] ?? []}
          onFermer={() => setMembre(null)}
          onEnregistre={() => {
            setMembre(null);
            notifier('Accès mis à jour');
            recharger();
          }}
        />
      )}
    </div>
  );
}

export default function Equipe() {
  const { etablissement, peut } = useEspace();
  return (
    <div className="page">
      <EnTete titre="Équipe" sousTitre="Qui a accès à l’établissement, avec quels droits" />
      <GestionEquipe
        etablissementId={etablissement.id}
        nomEtablissement={etablissement.identite?.nom_commercial ?? etablissement.nom}
        modulesActifs={etablissement.modules}
        peutGerer={peut('membres.gerer')}
        roleActuel={etablissement.role}
        hubs={(etablissement.hubs ?? []).filter((h) => h.actif)}
      />
    </div>
  );
}
