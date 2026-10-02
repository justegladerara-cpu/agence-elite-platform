import React, { useCallback, useEffect, useRef, useState } from 'react';
import { demarrerDonnees } from './noyau/donnees/index.js';
import { FournisseurEspace, nomUtilisateur, useEspace } from './noyau/espace.jsx';
import { appliquerMarque } from './noyau/marque.js';
import { Marque } from './ui/Marque.jsx';
import { formatDate, ROLES, ROLES_PLATEFORME } from './noyau/format.js';
import { lireParametres, lireRoute, useRoute } from './noyau/routes.js';
import EspaceEditeur, { MENU_EDITEUR, routeEditeurActive } from './modules/editeur/EspaceEditeur.jsx';
import { groupesDuMenu, pagesAccessibles, pagesDuMenu } from './modules/index.js';
import {
  Avatar, Badge, Bouton, Champ, Chargement, Erreur, FilAriane, FournisseurFil, Icone, lireImageReduite, Modale, Onglets, useFilAriane, Vide,
} from './ui/composants.jsx';

const LIBELLES_ROLES = { ...ROLES, dirigeant: 'Dirigeant', support: 'Support Agence Elite' };

const CLE_ADRESSE_CONNEXION = 'ae-adresse-connexion';

// Écran de connexion à l'image d'un client : #/connexion/<adresse> (seuls nom, logo et couleur sont publics).
function useMarqueConnexion(donnees) {
  const [marque, setMarque] = useState(null);
  useEffect(() => {
    const [section, adresseRoute] = lireRoute().split('/');
    let adresse = section === 'connexion' ? adresseRoute : null;
    try {
      if (adresse) localStorage.setItem(CLE_ADRESSE_CONNEXION, adresse);
      else adresse = localStorage.getItem(CLE_ADRESSE_CONNEXION);
    } catch {
      // Préférence non mémorisée.
    }
    let actif = true;
    donnees.rpc('marque_connexion', { p_adresse: adresse ?? null })
      .then((m) => {
        if (!actif) return;
        setMarque(m);
        appliquerMarque(m, 'Connexion');
      })
      .catch(() => appliquerMarque(null, 'Connexion'));
    return () => {
      actif = false;
    };
  }, [donnees]);
  return marque;
}

function ChampMotDePasse({ libelle, valeur, onChange, aide, autoComplete = 'current-password', autoFocus, minLength }) {
  const [visible, setVisible] = useState(false);
  return (
    <Champ libelle={libelle} aide={aide}>
      <span className="champ-mot-de-passe">
        <input type={visible ? 'text' : 'password'} value={valeur} onChange={onChange} required autoComplete={autoComplete} autoFocus={autoFocus} minLength={minLength} />
        <button type="button" className="icone-bouton" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={visible}>
          <Icone nom="oeil" taille={16} />
        </button>
      </span>
    </Champ>
  );
}

// Formulaire commun : identifiant (ou e-mail) + mot de passe. Supabase Auth reste l'autorité.
function FormulaireConnexion({ donnees, onConnecte }) {
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  return (
    <form
      className="formulaire"
      onSubmit={async (e) => {
        e.preventDefault();
        setChargement(true);
        setErreur('');
        try {
          await donnees.connecterParMotDePasse(identifiant, motDePasse);
          onConnecte();
        } catch (err) {
          setErreur(err.message);
          setChargement(false);
        }
      }}
    >
      <Champ libelle="Identifiant ou e-mail">
        <input value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} />
      </Champ>
      <ChampMotDePasse libelle="Mot de passe" valeur={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
      <Erreur message={erreur} />
      <Bouton type="submit" variante="principal" chargement={chargement}>Se connecter</Bouton>
    </form>
  );
}

function ConnexionLocale({ donnees, onConnecte }) {
  const marque = useMarqueConnexion(donnees);
  const [comptes, setComptes] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    donnees.comptes().then(setComptes).catch((e) => setErreur(e.message));
  }, [donnees]);
  const connecter = async (action) => {
    setErreur('');
    try {
      await action();
      onConnecte();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <div className="connexion">
      <div className="connexion-carte large">
        <Marque marque={marque} />
        <h1>Démonstration locale</h1>
        <p className="texte-doux">La base tourne dans ce navigateur, avec des données fictives. Rien n’est envoyé sur Internet.</p>
        <FormulaireConnexion donnees={donnees} onConnecte={onConnecte} />
        <p className="separateur"><span>ou choisissez un profil</span></p>
        {!comptes && !erreur && <Chargement />}
        <div className="profils">
          {comptes?.map((c) => (
            <button key={c.id} className="profil" onClick={() => connecter(() => donnees.connecter(c.id))}>
              <Avatar nom={c.nom ?? c.email} />
              <span>
                <strong>{c.nom ?? c.email}</strong>
                <small>{c.identifiant ? `Identifiant ${c.identifiant}` : c.email}</small>
              </span>
            </button>
          ))}
        </div>
        <Erreur message={erreur} />
        <button
          className="lien"
          onClick={async () => {
            await donnees.reinitialiser();
            window.location.reload();
          }}
        >
          Réinitialiser la démo
        </button>
      </div>
    </div>
  );
}

function ConnexionSupabase({ donnees, onConnecte }) {
  const marque = useMarqueConnexion(donnees);
  // Lien d'invitation : #/invitation?email=… ouvre directement la création du compte, adresse remplie.
  const [mode, setMode] = useState(() => (lireRoute() === 'invitation' ? 'inscription' : 'connexion'));
  const [valeurs, setValeurs] = useState(() => ({ email: lireRoute() === 'invitation' ? lireParametres().get('email') ?? '' : '', motDePasse: '', nom: '' }));
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  return (
    <div className="connexion">
      <div className="connexion-carte">
        <Marque marque={marque} />
        <Onglets onglets={[['connexion', 'Connexion'], ['inscription', 'J’ai reçu une invitation']]} actif={mode} onChange={setMode} />
        {info && <p className="info">{info}</p>}
        {mode === 'connexion' ? <FormulaireConnexion donnees={donnees} onConnecte={onConnecte} /> : (
          <form
            className="formulaire"
            onSubmit={async (e) => {
              e.preventDefault();
              setChargement(true);
              setErreur('');
              try {
                if (await donnees.creerCompte(valeurs.email, valeurs.motDePasse, valeurs.nom)) onConnecte();
                else {
                  setInfo('Compte créé. Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.');
                  setMode('connexion');
                }
              } catch (err) {
                setErreur(err.message);
              } finally {
                setChargement(false);
              }
            }}
          >
            <p className="texte-doux">Utilisez l’adresse e-mail à laquelle vous avez été invité(e).</p>
            <Champ libelle="Votre nom"><input value={valeurs.nom} onChange={changer('nom')} required /></Champ>
            <Champ libelle="E-mail"><input type="email" value={valeurs.email} onChange={changer('email')} required autoComplete="email" /></Champ>
            <ChampMotDePasse libelle="Mot de passe" valeur={valeurs.motDePasse} onChange={changer('motDePasse')} autoComplete="new-password" minLength={8} aide="8 caractères au moins." />
            <Erreur message={erreur} />
            <Bouton type="submit" variante="principal" chargement={chargement}>Créer mon compte</Bouton>
          </form>
        )}
      </div>
    </div>
  );
}

const TROP_SIMPLES = ['1234', '12345', '123456', '1234567', '12345678', '123456789', '0000', '000000', '00000000', 'azerty', 'azerty123', 'motdepasse', 'password', 'password1', 'qwerty', 'admin', 'admin123'];

export function verifierNouveauMotDePasse(nouveau, confirmation) {
  if (nouveau.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
  if (TROP_SIMPLES.includes(nouveau.toLowerCase())) return 'Ce mot de passe est trop simple';
  if (!/[A-Za-z]/.test(nouveau) || !/\d/.test(nouveau)) return 'Utilisez au moins une lettre et un chiffre';
  if (nouveau !== confirmation) return 'Les deux mots de passe ne sont pas identiques';
  return '';
}

function FormulaireNouveauMotDePasse({ donnees, onFait, libelleAction = 'Enregistrer mon mot de passe' }) {
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  return (
    <form
      className="formulaire"
      onSubmit={async (e) => {
        e.preventDefault();
        const probleme = verifierNouveauMotDePasse(nouveau, confirmation);
        if (probleme) {
          setErreur(probleme);
          return;
        }
        setChargement(true);
        setErreur('');
        try {
          await donnees.changerMotDePasse(nouveau);
          await onFait();
        } catch (err) {
          setErreur(err.message);
          setChargement(false);
        }
      }}
    >
      <ChampMotDePasse libelle="Nouveau mot de passe" valeur={nouveau} onChange={(e) => setNouveau(e.target.value)} autoComplete="new-password" autoFocus aide="8 caractères au moins, avec une lettre et un chiffre." />
      <ChampMotDePasse libelle="Confirmer le mot de passe" valeur={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
      <Erreur message={erreur} />
      <Bouton type="submit" variante="principal" chargement={chargement}>{libelleAction}</Bouton>
    </form>
  );
}

// Premier accès avec un mot de passe temporaire : rien d'autre n'est accessible (la base le garantit aussi).
function NouveauMotDePasse({ donnees, contexte, onFait, onDeconnexion }) {
  const expire = contexte.compte?.temporaire_expire;
  useEffect(() => appliquerMarque(contexte.plateforme, 'Nouveau mot de passe'), [contexte.plateforme]);
  return (
    <div className="connexion">
      <div className="connexion-carte">
        <Marque marque={contexte.plateforme} />
        {expire ? (
          <>
            <h1>Mot de passe temporaire expiré</h1>
            <p className="texte-doux">Le mot de passe temporaire de ce compte n’est plus valable. Demandez-en un nouveau à Agence Elite ou à votre responsable.</p>
          </>
        ) : (
          <>
            <h1>Créer votre nouveau mot de passe</h1>
            <p className="texte-doux">
              Bonjour {nomUtilisateur(contexte.utilisateur, contexte.compte?.identifiant ?? '')}. Vous vous êtes connecté(e) avec un mot de passe temporaire.
              Choisissez votre mot de passe personnel pour continuer ; l’ancien ne fonctionnera plus.
            </p>
            <FormulaireNouveauMotDePasse donnees={donnees} onFait={onFait} />
          </>
        )}
        <button className="lien" onClick={onDeconnexion}><Icone nom="sortie" taille={16} /> Se déconnecter</button>
      </div>
    </div>
  );
}

// Invitations en attente : le compte connecté rejoint l'établissement.
function Invitations({ api, contexte, onAccepte, compact }) {
  const [nom, setNom] = useState(contexte.utilisateur.nom ?? '');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(null);
  const accepter = async (id) => {
    setErreur('');
    setEnCours(id);
    try {
      if (nom.trim() && nom.trim() !== contexte.utilisateur.nom) await api.rpc('enregistrer_profil', { p_nom: nom.trim() });
      await api.rpc('accepter_invitation', { p_invitation_id: id });
      await onAccepte();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(null);
    }
  };
  return (
    <div className={compact ? 'carte' : 'formulaire'}>
      {!contexte.utilisateur.nom && (
        <Champ libelle="Votre nom (affiché à votre équipe et sur les reçus)">
          <input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Prénom et nom" />
        </Champ>
      )}
      <div className="liste-simple">
        {contexte.invitations.map((i) => (
          <div key={i.id} className="liste-ligne">
            <span>
              <strong>{i.etablissement ?? i.client}</strong>
              <small className="texte-doux bloc">{i.client} · {LIBELLES_ROLES[i.role] ?? i.role} · jusqu’au {formatDate(i.expire_le)}</small>
            </span>
            <Bouton variante="principal" chargement={enCours === i.id} disabled={!contexte.utilisateur.nom && !nom.trim()} onClick={() => accepter(i.id)}>
              Rejoindre
            </Bouton>
          </div>
        ))}
      </div>
      <Erreur message={erreur} />
    </div>
  );
}

function Accueil({ api, contexte, onRecharger, onDeconnexion }) {
  useEffect(() => appliquerMarque(contexte.plateforme, 'Bienvenue'), [contexte.plateforme]);
  return (
    <div className="connexion">
      <div className="connexion-carte">
        <Marque marque={contexte.plateforme} />
        {contexte.invitations.length ? (
          <>
            <h1>Bienvenue {nomUtilisateur(contexte.utilisateur, '')}</h1>
            <p className="texte-doux">Vous êtes invité(e) à rejoindre :</p>
            <Invitations api={api} contexte={contexte} onAccepte={onRecharger} />
          </>
        ) : (
          <Vide
            titre="Aucun établissement pour ce compte"
            texte={`Connecté avec ${contexte.compte?.identifiant ?? contexte.utilisateur.email}. Demandez à votre responsable ou à Agence Elite de vous donner un accès.`}
          />
        )}
        <button className="lien" onClick={onDeconnexion}><Icone nom="sortie" taille={16} /> Changer de compte</button>
      </div>
    </div>
  );
}

function Bandeaux({ naviguer }) {
  const { etablissement, editeur } = useEspace();
  if (!etablissement) return null;
  const l = etablissement.licence;
  const bandeaux = [];
  if (etablissement.role === 'support') {
    bandeaux.push(
      <div key="support" className="bandeau info">
        Mode support : consultation seule de {etablissement.nom}.
        {editeur && <button className="lien" onClick={() => naviguer('editeur')}>Retour à l’espace Agence Elite</button>}
      </div>
    );
  } else if (etablissement.role === 'dirigeant') {
    bandeaux.push(<div key="dirigeant" className="bandeau info">Vous consultez {etablissement.nom} en tant que dirigeant.</div>);
  } else if (etablissement.statut !== 'actif' || etablissement.client_statut !== 'actif') {
    bandeaux.push(<div key="statut" className="bandeau">Cet établissement est suspendu : consultation seule. Contactez Agence Elite.</div>);
  } else if (!l || !l.valide) {
    bandeaux.push(
      <div key="licence" className="bandeau">
        {l?.statut === 'suspendue' ? 'Licence suspendue' : 'Licence expirée'} : consultation seule. Vos données restent intactes. Contactez Agence Elite pour la renouveler.
      </div>
    );
  } else if (l.jours_restants != null && l.jours_restants <= 7) {
    bandeaux.push(
      <div key="echeance" className="bandeau attention">
        {l.jours_restants < 0
          ? `Licence échue le ${formatDate(l.echeance)} : délai de grâce de ${7 + l.jours_restants} jour(s) avant blocage.`
          : `${l.formule === 'essai' ? 'Essai gratuit' : 'Licence'} : échéance le ${formatDate(l.echeance)} (${l.jours_restants} jour(s)).`}
      </div>
    );
  }
  return bandeaux;
}

// Mon profil : ce que la personne règle elle-même. Le rôle, les droits et les Hubs ne se modifient jamais ici.
function MonCompte({ onFermer }) {
  const espace = useEspace();
  const { api, utilisateur, compte, notifier, roleEditeur, etablissement, recharger } = espace;
  const [onglet, setOnglet] = useState('profil');
  const [valeurs, setValeurs] = useState(() => ({
    prenom: utilisateur.prenom ?? '',
    nom: utilisateur.nom_famille ?? '',
    nom_affiche: utilisateur.nom_affiche ?? (utilisateur.prenom || utilisateur.nom_famille ? '' : utilisateur.nom ?? ''),
    initiales: utilisateur.initiales ?? '',
    avatar_url: utilisateur.avatar_url ?? '',
    telephone: utilisateur.telephone ?? '',
    fonction: utilisateur.fonction ?? '',
    page_accueil: utilisateur.preferences?.page_accueil ?? '',
  }));
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  const pages = etablissement ? pagesAccessibles(espace) : [];
  const role = roleEditeur ? ROLES_PLATEFORME[roleEditeur] : LIBELLES_ROLES[etablissement?.role] ?? '';
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const { page_accueil: pageAccueil, ...profil } = valeurs;
      await api.rpc('enregistrer_mon_profil', { p: { ...profil, preferences: pageAccueil ? { page_accueil: pageAccueil } : {} } });
      notifier('Profil enregistré');
      await recharger();
      onFermer();
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  const apercu = valeurs.nom_affiche || [valeurs.prenom, valeurs.nom].filter(Boolean).join(' ') || utilisateur.email;
  return (
    <Modale titre="Mon profil" onFermer={onFermer} large>
      <div className="pile">
        <div className="cellule-personne grande">
          <Avatar nom={apercu} image={valeurs.avatar_url || null} initiales={valeurs.initiales.toUpperCase() || null} taille="grand" />
          <span>
            <strong>{apercu}</strong>
            <small className="texte-doux bloc">{[valeurs.fonction, role].filter(Boolean).join(' · ')}</small>
          </span>
        </div>
        <Onglets onglets={[['profil', 'Profil'], ['preferences', 'Préférences'], ['securite', 'Sécurité']]} actif={onglet} onChange={setOnglet} />
        {onglet !== 'securite' && (
          <form className="formulaire" onSubmit={enregistrer}>
            {onglet === 'profil' && (
              <>
                <div className="actions-gauche">
                  <label className="bouton secondaire">
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const fichier = e.target.files?.[0];
                        if (!fichier) return;
                        try {
                          const image = await lireImageReduite(fichier, 160);
                          setValeurs((v) => ({ ...v, avatar_url: image }));
                        } catch (err) {
                          setErreur(err.message);
                        }
                      }}
                    />
                    Choisir une photo
                  </label>
                  {valeurs.avatar_url && <button type="button" className="lien" onClick={() => setValeurs((v) => ({ ...v, avatar_url: '' }))}>Retirer la photo</button>}
                </div>
                <div className="grille-champs">
                  <Champ libelle="Prénom"><input value={valeurs.prenom} onChange={changer('prenom')} maxLength={60} autoComplete="given-name" /></Champ>
                  <Champ libelle="Nom"><input value={valeurs.nom} onChange={changer('nom')} maxLength={60} autoComplete="family-name" /></Champ>
                  <Champ libelle="Nom affiché" aide="Vide : prénom et nom."><input value={valeurs.nom_affiche} onChange={changer('nom_affiche')} maxLength={80} /></Champ>
                  <Champ libelle="Initiales" aide="1 à 3 lettres, sans photo."><input value={valeurs.initiales} onChange={(e) => setValeurs((v) => ({ ...v, initiales: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) }))} /></Champ>
                  <Champ libelle="Téléphone"><input value={valeurs.telephone} onChange={changer('telephone')} autoComplete="tel" /></Champ>
                  <Champ libelle="Fonction"><input value={valeurs.fonction} onChange={changer('fonction')} maxLength={80} placeholder="Ex. Caissière, Gérant" /></Champ>
                </div>
                <dl className="details">
                  <dt>Identifiant</dt><dd>{compte?.identifiant ?? '—'}</dd>
                  <dt>E-mail</dt><dd>{utilisateur.email}</dd>
                  <dt>Rôle</dt><dd>{role || '—'} <small className="texte-doux bloc">Attribué par votre responsable ou Agence Elite : il ne se modifie pas depuis le profil.</small></dd>
                </dl>
              </>
            )}
            {onglet === 'preferences' && (
              <Champ libelle="Page d’accueil" aide="L’écran ouvert à la connexion.">
                <select value={valeurs.page_accueil} onChange={changer('page_accueil')}>
                  <option value="">Par défaut</option>
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
                </select>
              </Champ>
            )}
            <Erreur message={erreur} />
            <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>
          </form>
        )}
        {onglet === 'securite' && (api.changerMotDePasse ? (
          <FormulaireNouveauMotDePasse
            donnees={api}
            libelleAction="Changer mon mot de passe"
            onFait={() => {
              notifier('Mot de passe changé');
              onFermer();
            }}
          />
        ) : <p className="texte-doux">Démonstration locale : le mot de passe ne se change pas ici.</p>)}
      </div>
    </Modale>
  );
}

function ProfilUtilisateur({ libelleRole, onCompte }) {
  const { utilisateur, deconnecter } = useEspace();
  const [ouvert, setOuvert] = useState(false);
  const zone = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !zone.current?.contains(e.target)) setOuvert(false);
    };
    window.addEventListener('mousedown', fermer);
    window.addEventListener('keydown', fermer);
    return () => {
      window.removeEventListener('mousedown', fermer);
      window.removeEventListener('keydown', fermer);
    };
  }, [ouvert]);
  const nom = nomUtilisateur(utilisateur);
  return (
    <div className="profil-chip" ref={zone}>
      <button type="button" className="profil-chip-bouton" aria-haspopup="menu" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <Avatar nom={nom} image={utilisateur.avatar_url} initiales={utilisateur.initiales} taille="petit" />
        <span className="profil-chip-texte">
          <strong>{nom}</strong>
          <small>{libelleRole}</small>
        </span>
        <Icone nom="bas" taille={14} />
      </button>
      {ouvert && (
        <div className="menu-actions-liste profil-chip-menu" role="menu">
          <div className="profil-chip-entete"><strong>{nom}</strong><small className="texte-doux">{utilisateur.email}</small></div>
          <button type="button" role="menuitem" onClick={() => { setOuvert(false); onCompte(); }}><Icone nom="comptes" taille={16} /> Mon profil</button>
          <button type="button" role="menuitem" onClick={deconnecter}><Icone nom="sortie" taille={16} /> Se déconnecter</button>
        </div>
      )}
    </div>
  );
}

function BarreHaut({ filDefaut, surEditeur, onMenu, libelleRole, onCompte }) {
  const { etablissement, etablissements, choisirEtablissement, hubs, hub, multiHub, choisirHub } = useEspace();
  const contexteFil = useFilAriane();
  const fil = contexteFil?.fil ?? filDefaut;
  return (
    <header className="barre-haut">
      <button className="icone-bouton bouton-menu" onClick={onMenu} aria-label="Ouvrir le menu"><Icone nom="menu" /></button>
      <FilAriane elements={fil} />
      <div className="barre-haut-outils">
        {!surEditeur && etablissements.length > 1 && (
          <label className="selecteur">
            <Icone nom="editeur" taille={16} />
            <select value={etablissement?.id} onChange={(e) => choisirEtablissement(e.target.value)} aria-label="Établissement">
              {etablissements.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.role === 'support' ? ' (support)' : ''}</option>)}
            </select>
          </label>
        )}
        {!surEditeur && multiHub && (
          <label className="selecteur">
            <Icone nom="hub" taille={16} />
            <select value={hub?.id ?? ''} onChange={(e) => choisirHub(e.target.value || null)} aria-label="Hub">
              <option value="">Tous les Hubs</option>
              {hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
            </select>
          </label>
        )}
        <ProfilUtilisateur libelleRole={libelleRole} onCompte={onCompte} />
      </div>
    </header>
  );
}

function Coquille() {
  const espace = useEspace();
  const { api, contexte, etablissement, editeur, roleEditeur, recharger } = espace;
  const [route, naviguer] = useRoute();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [compte, setCompte] = useState(false);
  const pages = etablissement ? pagesAccessibles(espace) : [];
  const menu = etablissement ? pagesDuMenu(espace) : [];
  const surEditeur = editeur && (route.startsWith('editeur') || !etablissement);
  const premier = route.split('/')[0];
  // Tant que l'établissement n'est pas en service, son responsable arrive sur la liste de démarrage.
  // Sinon : la page d'accueil choisie dans son profil, si elle lui est accessible.
  const pageParDefaut = pages.find((p) => p.id === 'mise-en-service' && !etablissement?.mis_en_service_le)
    ?? pages.find((p) => p.id === contexte.utilisateur?.preferences?.page_accueil)
    ?? pages[0];
  const page = surEditeur ? null : pages.find((p) => p.id === premier) ?? pageParDefaut;
  const routeAttendue = surEditeur ? (route.startsWith('editeur') ? route : 'editeur') : page?.id;

  useEffect(() => {
    if (routeAttendue && route !== routeAttendue) window.history.replaceState(null, '', `#/${routeAttendue}`);
  }, [routeAttendue, route]);

  const aller = (id) => {
    setMenuOuvert(false);
    naviguer(id);
  };
  const Page = page?.composant;
  const actifEditeur = surEditeur ? routeEditeurActive(route) : null;
  const libelleRole = surEditeur || !etablissement ? ROLES_PLATEFORME[roleEditeur] ?? '' : LIBELLES_ROLES[etablissement.role] ?? '';
  const nomEtablissement = etablissement?.identite?.nom_commercial ?? etablissement?.nom;
  // Identité affichée : celle de la plateforme dans l'espace Agence Elite, celle de l'établissement ailleurs.
  const marque = surEditeur ? contexte.plateforme : etablissement?.marque ?? contexte.plateforme;
  const titrePage = surEditeur ? 'Agence Elite' : page?.libelle;
  useEffect(() => appliquerMarque(marque, titrePage), [marque, titrePage]);
  const filDefaut = surEditeur
    ? [{ libelle: 'Agence Elite' }]
    : [{ libelle: nomEtablissement ?? '' }, ...(espace.hub && espace.multiHub ? [{ libelle: espace.hub.nom }] : []), { libelle: page?.libelle ?? '' }];

  return (
    <FournisseurFil>
      <div className={`coquille ${page?.pleinEcran ? 'plein-ecran' : ''}`}>
        <aside className={`menu ${menuOuvert ? 'ouvert' : ''}`} aria-label="Navigation principale">
          <Marque marque={marque} sousTitre={surEditeur ? 'Espace éditeur' : undefined} />
          <nav>
            {editeur && (
              <div className="menu-groupe">
                <span className="menu-groupe-titre">Agence Elite</span>
                {MENU_EDITEUR.map((m) => (
                  <button key={m.id} className={actifEditeur === m.id ? 'actif' : ''} aria-current={actifEditeur === m.id ? 'page' : undefined} onClick={() => aller(m.id)}>
                    <Icone nom={m.icone} />
                    <span>{m.libelle}</span>
                  </button>
                ))}
              </div>
            )}
            {etablissement && (
              <>
                {editeur && (
                  <div className="menu-etablissement">
                    <span className="menu-groupe-titre">Établissement consulté</span>
                    <strong>{nomEtablissement}</strong>
                  </div>
                )}
                {groupesDuMenu(menu).map((groupe) => {
                  const liens = menu.filter((p) => p.groupe === groupe);
                  if (!liens.length) return null;
                  return (
                    <div key={groupe} className="menu-groupe">
                      <span className="menu-groupe-titre">{groupe}</span>
                      {liens.map((p) => (
                        <button key={p.id} className={!surEditeur && p.id === page?.id ? 'actif' : ''} aria-current={!surEditeur && p.id === page?.id ? 'page' : undefined} onClick={() => aller(p.id)}>
                          <Icone nom={p.icone} />
                          <span>{p.libelle}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </nav>
          {!editeur && etablissement && (
            <div className="menu-pied">
              <small className="texte-faible">{etablissement.client}</small>
            </div>
          )}
        </aside>
        {menuOuvert && <div className="voile-menu" onClick={() => setMenuOuvert(false)} />}
        <div className="colonne">
          <BarreHaut filDefaut={filDefaut} surEditeur={surEditeur} onMenu={() => setMenuOuvert(true)} libelleRole={libelleRole} onCompte={() => setCompte(true)} />
          <main className="contenu">
            {!surEditeur && <Bandeaux naviguer={aller} />}
            {contexte.invitations.length > 0 && (
              <div className="bandeau-invitations">
                <Badge ton="bleu">Invitation</Badge>
                <Invitations api={api} contexte={contexte} onAccepte={recharger} compact />
              </div>
            )}
            {surEditeur && (
              <GardeErreur key={route}>
                <EspaceEditeur route={route} naviguer={aller} />
              </GardeErreur>
            )}
            {!surEditeur && (Page
              ? <GardeErreur key={`${etablissement.id}-${page.id}`}><Page naviguer={aller} /></GardeErreur>
              : <Vide titre="Aucun module accessible" texte="Demandez à votre responsable d’ouvrir vos droits." />)}
          </main>
        </div>
        {compte && <MonCompte onFermer={() => setCompte(false)} />}
      </div>
    </FournisseurFil>
  );
}

class GardeErreur extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div className="page">
        <Erreur message={`Cet écran a rencontré un problème : ${this.state.erreur.message}`} />
        <Bouton onClick={() => this.setState({ erreur: null })}>Réessayer</Bouton>
      </div>
    );
  }
}

export default function App({ demarrer = demarrerDonnees }) {
  const [donnees, setDonnees] = useState(null);
  const [contexte, setContexte] = useState(null);
  const [erreur, setErreur] = useState('');
  const [etape, setEtape] = useState('demarrage');

  const chargerContexte = useCallback(async (source) => {
    if (!source.utilisateur()) {
      setEtape('connexion');
      return;
    }
    try {
      const resultat = await source.rpc('mon_contexte');
      setContexte(resultat);
      setEtape('espace');
    } catch (err) {
      setErreur(err.message);
      setEtape('connexion');
    }
  }, []);

  useEffect(() => {
    demarrer()
      .then(async (source) => {
        if (!source) throw new Error('Aucune source de données configurée.');
        setDonnees(source);
        await chargerContexte(source);
      })
      .catch((err) => {
        setErreur(err.message);
        setEtape('erreur');
      });
  }, [demarrer, chargerContexte]);

  const recharger = useCallback(() => chargerContexte(donnees), [chargerContexte, donnees]);
  const deconnecter = useCallback(async () => {
    await donnees.deconnecter();
    setContexte(null);
    setEtape('connexion');
  }, [donnees]);

  if (etape === 'demarrage') return <div className="ecran-centre"><Chargement texte="Préparation de la base…" /></div>;
  if (etape === 'erreur') return <div className="ecran-centre"><Erreur message={erreur} /></div>;
  if (etape === 'connexion') {
    return donnees.mode === 'local'
      ? <ConnexionLocale donnees={donnees} onConnecte={() => chargerContexte(donnees)} />
      : <ConnexionSupabase donnees={donnees} onConnecte={() => chargerContexte(donnees)} />;
  }
  if (contexte.compte?.doit_changer_mot_de_passe) {
    return <NouveauMotDePasse donnees={donnees} contexte={contexte} onFait={recharger} onDeconnexion={deconnecter} />;
  }
  if (!contexte.etablissements.length && !contexte.editeur) {
    return <Accueil api={donnees} contexte={contexte} onRecharger={recharger} onDeconnexion={deconnecter} />;
  }
  return (
    <FournisseurEspace api={donnees} contexte={contexte} onRecharger={recharger} onDeconnexion={deconnecter}>
      <Coquille />
    </FournisseurEspace>
  );
}
