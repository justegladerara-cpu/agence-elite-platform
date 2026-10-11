import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { demarrerDonnees } from './noyau/donnees/index.js';
import { FournisseurEspace, nomUtilisateur, useEspace } from './noyau/espace.jsx';
import { appliquerMarque } from './noyau/marque.js';
import { configAuth, marqueAuth, texteAuth } from './noyau/pagesAuth.js';
import { Marque } from './ui/Marque.jsx';
import {
  ContexteAuth, EcranAuth, FormulaireNouveauMotDePasse, ParcoursConnexion, useConfigAuth, VueAccueil, VueNouveauMotDePasse, VueReinitialisation,
} from './auth/EcransAuth.jsx';
import { Cloche } from './ui/communs.jsx';
import { Palette, RACCOURCIS, useRaccourcis } from './ui/Palette.jsx';
import { CHOIX_AFFICHAGE, enregistrerAffichage, lireAffichage } from './noyau/affichage.js';

export { verifierNouveauMotDePasse } from './auth/EcransAuth.jsx';
import { formatDate, ROLES, ROLES_PLATEFORME } from './noyau/format.js';
import { lireParametres, lireRoute, useRoute } from './noyau/routes.js';
import { effacerBrouillons } from './noyau/brouillons.js';
import { AnnonceMiseAJour, BandeauConnexion } from './ui/Etat.jsx';
import { BoutiquePublique, SuiviCommande } from './public/BoutiquePublique.jsx';
import { SitePublic } from './public/RenduSite.jsx';
import { PartagePublic } from './public/Partage.jsx';
import { EspaceClientPublic } from './public/EspaceClient.jsx';
import { ActivationCle, ConnexionPartenaire, DemandePartenaire, EspacePartenaire } from './public/EspacePartenaire.jsx';
import { GardeAppareil } from './ui/GardeAppareil.jsx';
import EspaceEditeur, { MENU_EDITEUR, routeEditeurActive } from './modules/editeur/EspaceEditeur.jsx';
import { groupesDuMenu, pagesAccessibles, pagesDuMenu } from './modules/index.js';
import { filtrerModeSimple, useModeSimple } from './noyau/modeSimple.js';
import { AIDES, aidesFermees, fermerAide } from './noyau/aides.js';
import {
  Avatar, Badge, Bouton, Champ, Chargement, Erreur, FilAriane, FournisseurFil, Icone, lireImageReduite, Modale, Onglets, useFilAriane, Vide,
} from './ui/composants.jsx';

const LIBELLES_ROLES = { ...ROLES, dirigeant: 'Dirigeant' };
// Le nom de l'éditeur (« Support Agence Elite ») se règle dans les pages d'authentification.
const libelleRole = (role, editeur) => (role === 'support' ? `Support ${editeur}` : LIBELLES_ROLES[role] ?? role ?? '');

const CLE_ADRESSE_CONNEXION = 'ae-adresse-connexion';
const CLE_SESSION = 'ae-session-ouverte';

function lireStockage(cle) {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrireStockage(cle, valeur) {
  try {
    if (valeur == null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {
    // Préférence non mémorisée.
  }
}

// Pages d'authentification publiées pour l'adresse de connexion (#/connexion/<adresse>, mémorisée) :
// client ou établissement, sinon plateforme. Seul le contenu publié est lisible sans connexion.
function useConfigConnexion(donnees) {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    if (!donnees) return undefined;
    const [section, adresseRoute] = lireRoute().split('/');
    let adresse = section === 'connexion' && adresseRoute ? adresseRoute.toLowerCase() : null;
    if (adresse) ecrireStockage(CLE_ADRESSE_CONNEXION, adresse);
    else adresse = lireStockage(CLE_ADRESSE_CONNEXION);
    let actif = true;
    donnees.rpc('pages_connexion', { p_adresse: adresse ?? null })
      .then((r) => actif && setConfig(configAuth({ marque: r?.marque, contenu: r?.contenu })))
      .catch(() => actif && setConfig(configAuth()));
    return () => {
      actif = false;
    };
  }, [donnees]);
  return config;
}

function useTitreAuth(config, titre) {
  useEffect(() => appliquerMarque(marqueAuth(config), titre), [config, titre]);
}

function ConnexionLocale({ config, donnees, onConnecte, avis }) {
  const [comptes, setComptes] = useState(null);
  const [erreur, setErreur] = useState('');
  useTitreAuth(config, texteAuth(config, 'connexion_titre'));
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
    <EcranAuth config={config} large>
      <h2>Démonstration locale</h2>
      <p className="texte-doux">La base tourne dans ce navigateur, avec des données fictives. Rien n’est envoyé sur Internet.</p>
      <ParcoursConnexion config={config} donnees={donnees} onConnecte={onConnecte} avis={avis} />
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
    </EcranAuth>
  );
}

function ConnexionSupabase({ config, donnees, onConnecte, avis }) {
  useTitreAuth(config, texteAuth(config, 'connexion_titre'));
  // Lien d'invitation : #/invitation?email=… ouvre directement la création du compte, adresse remplie.
  const invitation = lireRoute() === 'invitation';
  return (
    <EcranAuth config={config}>
      <ParcoursConnexion
        config={config}
        donnees={donnees}
        onConnecte={onConnecte}
        avis={avis}
        invitationPossible
        vueInitiale={invitation ? 'inscription' : avis === 'lien' ? 'oubli' : 'connexion'}
        emailInvitation={invitation ? lireParametres().get('email') ?? '' : ''}
      />
    </EcranAuth>
  );
}

// Premier accès avec un mot de passe temporaire : rien d'autre n'est accessible (la base le garantit aussi).
function NouveauMotDePasse({ config, donnees, contexte, onFait, onDeconnexion }) {
  useTitreAuth(config, texteAuth(config, contexte.compte?.temporaire_expire ? 'expire_titre' : 'premiere_titre'));
  return (
    <EcranAuth config={config}>
      <VueNouveauMotDePasse
        config={config}
        nom={nomUtilisateur(contexte.utilisateur, contexte.compte?.identifiant ?? '')}
        expire={contexte.compte?.temporaire_expire}
        donnees={donnees}
        onFait={onFait}
        onDeconnexion={onDeconnexion}
      />
    </EcranAuth>
  );
}

function Reinitialisation({ config, donnees, onFait, onDeconnexion }) {
  useTitreAuth(config, texteAuth(config, 'reinit_titre'));
  return (
    <EcranAuth config={config}>
      <VueReinitialisation config={config} donnees={donnees} onFait={onFait} onDeconnexion={onDeconnexion} />
    </EcranAuth>
  );
}

// Invitations en attente : le compte connecté rejoint l'établissement.
function Invitations({ api, contexte, onAccepte, compact }) {
  const { nom_editeur: editeur } = useConfigAuth();
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
              <small className="texte-doux bloc">{i.client} · {libelleRole(i.role, editeur)} · jusqu’au {formatDate(i.expire_le)}</small>
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

function Accueil({ config, api, contexte, onRecharger, onDeconnexion }) {
  useTitreAuth(config, texteAuth(config, contexte.invitations.length ? 'bienvenue_titre' : 'refuse_titre', { nom: nomUtilisateur(contexte.utilisateur, '') }));
  return (
    <EcranAuth config={config}>
      <VueAccueil
        config={config}
        nom={nomUtilisateur(contexte.utilisateur, '')}
        compte={contexte.compte?.identifiant ?? contexte.utilisateur.email}
        invitations={contexte.invitations.length ? <Invitations api={api} contexte={contexte} onAccepte={onRecharger} /> : null}
        onDeconnexion={onDeconnexion}
      />
    </EcranAuth>
  );
}

// Bulle d'aide d'un écran (une phrase), fermable une fois pour toutes sur cet appareil.
function BulleAide({ id }) {
  const [fermees, setFermees] = useState(aidesFermees);
  if (!AIDES[id] || fermees.includes(id)) return null;
  return (
    <div className="bulle-aide" role="note">
      <Icone nom="message" taille={16} />
      <span>{AIDES[id]}</span>
      <button type="button" className="icone-bouton" aria-label="Fermer l’aide" onClick={() => { fermerAide(id); setFermees(aidesFermees()); }}>
        <Icone nom="fermer" taille={14} />
      </button>
    </div>
  );
}

function Bandeaux({ naviguer }) {
  const { etablissement, editeur } = useEspace();
  const { nom_editeur: nomEditeur, contact_support: contactSupport } = useConfigAuth();
  const contactez = `Contactez ${nomEditeur}${contactSupport ? ` (${contactSupport})` : ''}`;
  if (!etablissement) return null;
  const l = etablissement.licence;
  const bandeaux = [];
  if (etablissement.role === 'support') {
    bandeaux.push(
      <div key="support" className="bandeau info">
        Mode support : consultation seule de {etablissement.nom}.
        {editeur && <button className="lien" onClick={() => naviguer('editeur')}>Retour à l’espace {nomEditeur}</button>}
      </div>
    );
  } else if (etablissement.role === 'dirigeant') {
    bandeaux.push(<div key="dirigeant" className="bandeau info">Vous consultez {etablissement.nom} en tant que dirigeant.</div>);
  } else if (etablissement.statut !== 'actif' || etablissement.client_statut !== 'actif') {
    bandeaux.push(<div key="statut" className="bandeau">Cet établissement est suspendu : consultation seule. {contactez}.</div>);
  } else if (!l || !l.valide) {
    bandeaux.push(
      <div key="licence" className="bandeau">
        {l?.statut === 'suspendue' ? 'Licence suspendue' : 'Licence expirée'} : consultation seule. Vos données restent intactes. {contactez} pour la renouveler.
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

// Affichage sur cet appareil : appliqué tout de suite, mémorisé dans ce navigateur seulement.
function ReglagesAffichage() {
  const [affichage, setAffichage] = useState(lireAffichage);
  const regler = (cle) => (e) => setAffichage(enregistrerAffichage({ [cle]: e.target.value }));
  const libelles = { theme: 'Thème', texte: 'Taille du texte', contraste: 'Contraste', tactile: 'Boutons' };
  return (
    <fieldset className="groupe-champs">
      <legend>Affichage sur cet appareil</legend>
      <p className="texte-doux">Appliqué tout de suite, sans enregistrer. Chaque appareil garde ses propres réglages (caisse tactile, téléphone…).</p>
      <div className="grille-champs">
        {Object.entries(CHOIX_AFFICHAGE).map(([cle, choix]) => (
          <Champ key={cle} libelle={libelles[cle]}>
            <select value={affichage[cle]} onChange={regler(cle)}>
              {choix.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Champ>
        ))}
      </div>
    </fieldset>
  );
}

function AideRaccourcis({ onFermer }) {
  return (
    <Modale titre="Raccourcis clavier" onFermer={onFermer}>
      <dl className="liste-raccourcis">
        {RACCOURCIS.map(([touches, texte]) => (
          <div key={texte}>
            <dt>{touches.map((t) => <kbd key={t}>{t}</kbd>)}</dt>
            <dd>{texte}</dd>
          </div>
        ))}
      </dl>
    </Modale>
  );
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
  const { nom_editeur: nomEditeur } = useConfigAuth();
  const role = roleEditeur ? ROLES_PLATEFORME[roleEditeur] : libelleRole(etablissement?.role, nomEditeur);
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
                  <dt>Rôle</dt><dd>{role || '—'} <small className="texte-doux bloc">Attribué par votre responsable ou {nomEditeur} : il ne se modifie pas depuis le profil.</small></dd>
                </dl>
              </>
            )}
            {onglet === 'preferences' && (
              <>
                <Champ libelle="Page d’accueil" aide="L’écran ouvert à la connexion.">
                  <select value={valeurs.page_accueil} onChange={changer('page_accueil')}>
                    <option value="">Par défaut</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
                  </select>
                </Champ>
                <ReglagesAffichage />
              </>
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

function BarreHaut({ filDefaut, surEditeur, onMenu, libelleRole, onCompte, naviguer, onRecherche, onCreer }) {
  const { etablissement, etablissements, choisirEtablissement, hubs, hub, multiHub, choisirHub } = useEspace();
  const contexteFil = useFilAriane();
  const fil = contexteFil?.fil ?? filDefaut;
  return (
    <header className="barre-haut">
      <button className="icone-bouton bouton-menu" onClick={onMenu} aria-label="Ouvrir le menu"><Icone nom="menu" /></button>
      <FilAriane elements={fil} />
      <div className="barre-haut-outils">
        {!surEditeur && etablissement && (
          <>
            <button type="button" className="barre-haut-recherche" onClick={onRecherche} aria-label="Rechercher partout (Ctrl+K)" title="Rechercher partout (Ctrl+K)">
              <Icone nom="recherche" taille={16} />
              <span>Rechercher…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button type="button" className="icone-bouton" onClick={onCreer} aria-label="Créer" title="Créer (touche N)"><Icone nom="plus" /></button>
          </>
        )}
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
        <Cloche naviguer={naviguer} />
        <ProfilUtilisateur libelleRole={libelleRole} onCompte={onCompte} />
      </div>
    </header>
  );
}

function Coquille() {
  const espace = useEspace();
  const { api, contexte, etablissement, editeur, roleEditeur, recharger } = espace;
  const [route, naviguer, requete] = useRoute();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [compte, setCompte] = useState(false);
  // Palette : null (fermée), 'tout' (rechercher) ou 'creer' ; aide des raccourcis.
  const [palette, setPalette] = useState(null);
  const [aide, setAide] = useState(false);
  const ouvrirRecherche = useCallback(() => setPalette('tout'), []);
  const ouvrirCreation = useCallback(() => setPalette('creer'), []);
  const ouvrirAide = useCallback(() => setAide(true), []);
  useRaccourcis({ ouvrirRecherche, ouvrirCreation, ouvrirAide, actif: Boolean(etablissement) && !palette });
  const pages = etablissement ? pagesAccessibles(espace) : [];
  const modeSimple = useModeSimple();
  const menu = etablissement ? filtrerModeSimple(pagesDuMenu(espace), modeSimple) : [];
  const surEditeur = editeur && (route.startsWith('editeur') || !etablissement);
  const premier = route.split('/')[0];
  // Tant que l'établissement n'est pas en service, son responsable arrive sur la liste de démarrage.
  // Sinon : la page d'accueil choisie dans son profil, si elle lui est accessible.
  const pageParDefaut = pages.find((p) => p.id === 'mise-en-service' && !etablissement?.mis_en_service_le)
    ?? pages.find((p) => p.id === contexte.utilisateur?.preferences?.page_accueil)
    ?? pages[0];
  const page = surEditeur ? null : pages.find((p) => p.id === premier) ?? pageParDefaut;
  // Sous-pages : #/<page>/<suite> (ex. #/employes/<id>) ; la suite est transmise à la page.
  const sousRoute = page && premier === page.id ? route.slice(page.id.length + 1) : '';
  const routeAttendue = surEditeur ? (route.startsWith('editeur') ? route : 'editeur') : page && (sousRoute ? `${page.id}/${sousRoute}` : page.id);

  useEffect(() => {
    if (routeAttendue && route !== routeAttendue) window.history.replaceState(null, '', `#/${routeAttendue}`);
  }, [routeAttendue, route]);

  const aller = (id) => {
    setMenuOuvert(false);
    naviguer(id);
  };
  const Page = page?.composant;
  const actifEditeur = surEditeur ? routeEditeurActive(route) : null;
  const { nom_editeur: nomEditeur } = useConfigAuth();
  const roleAffiche = surEditeur || !etablissement ? ROLES_PLATEFORME[roleEditeur] ?? '' : libelleRole(etablissement.role, nomEditeur);
  const nomEtablissement = etablissement?.identite?.nom_commercial ?? etablissement?.nom;
  // Identité affichée : celle de la plateforme dans l'espace Agence Elite, celle de l'établissement ailleurs.
  const marque = surEditeur ? contexte.plateforme : etablissement?.marque ?? contexte.plateforme;
  const titrePage = surEditeur ? nomEditeur : page?.libelle;
  useEffect(() => appliquerMarque(marque, titrePage), [marque, titrePage]);
  const filDefaut = surEditeur
    ? [{ libelle: nomEditeur }]
    : [{ libelle: nomEtablissement ?? '' }, ...(espace.hub && espace.multiHub ? [{ libelle: espace.hub.nom }] : []), { libelle: page?.libelle ?? '' }];

  return (
    <FournisseurFil>
      <div className={`coquille ${page?.pleinEcran ? 'plein-ecran' : ''}`}>
        <aside className={`menu ${menuOuvert ? 'ouvert' : ''}`} aria-label="Navigation principale">
          <Marque marque={marque} sousTitre={surEditeur ? 'Espace éditeur' : undefined} />
          <nav>
            {editeur && (
              <div className="menu-groupe">
                <span className="menu-groupe-titre">{nomEditeur}</span>
                {MENU_EDITEUR.filter((m) => !m.superAdmin || roleEditeur === 'super_admin').map((m) => (
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
          <BarreHaut filDefaut={filDefaut} surEditeur={surEditeur} onMenu={() => setMenuOuvert(true)} libelleRole={roleAffiche} onCompte={() => setCompte(true)} naviguer={aller} onRecherche={ouvrirRecherche} onCreer={ouvrirCreation} />
          <main className="contenu">
            <BandeauConnexion />
            <AnnonceMiseAJour />
            {!surEditeur && <Bandeaux naviguer={aller} />}
            {!surEditeur && page && <BulleAide id={page.id} />}
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
              ? <GardeAppareil key={etablissement.id}><GardeErreur key={`${etablissement.id}-${page.id}-${requete}`}><Suspense fallback={<Chargement texte="Ouverture de l’écran…" />}><Page naviguer={aller} sousRoute={sousRoute} /></Suspense></GardeErreur></GardeAppareil>
              : <Vide titre="Aucun module accessible" texte="Demandez à votre responsable d’ouvrir vos droits." />)}
          </main>
        </div>
        {compte && <MonCompte onFermer={() => setCompte(false)} />}
        {palette && etablissement && <Palette mode={palette} onFermer={() => setPalette(null)} naviguer={aller} />}
        {aide && <AideRaccourcis onFermer={() => setAide(false)} />}
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
  // Message affiché sur l'écran de connexion : 'expiree' (session terminée) ou 'lien' (lien reçu expiré).
  const [avis, setAvis] = useState(null);
  const [route] = useRoute();
  const config = useConfigConnexion(donnees);

  const chargerContexte = useCallback(async (source) => {
    if (!source.utilisateur()) {
      // Une session était ouverte et n'existe plus : elle a expiré entre-temps.
      if (lireStockage(CLE_SESSION)) setAvis((a) => a ?? 'expiree');
      ecrireStockage(CLE_SESSION, null);
      setEtape('connexion');
      return;
    }
    try {
      const resultat = await source.rpc('mon_contexte');
      setContexte(resultat);
      setAvis(null);
      ecrireStockage(CLE_SESSION, '1');
      setEtape('espace');
    } catch (err) {
      setErreur(err.message);
      setEtape('connexion');
    }
  }, []);

  useEffect(() => {
    let arret;
    demarrer()
      .then(async (source) => {
        if (!source) throw new Error('Aucune source de données configurée.');
        setDonnees(source);
        arret = source.surFinDeSession?.(() => {
          ecrireStockage(CLE_SESSION, null);
          setContexte(null);
          setAvis('expiree');
          setEtape('connexion');
        });
        if (source.lienInvalide) setAvis('lien');
        if (source.recuperation) {
          ecrireStockage(CLE_SESSION, '1');
          setEtape('reinitialisation');
          return;
        }
        await chargerContexte(source);
      })
      .catch((err) => {
        setErreur(err.message);
        setEtape('erreur');
      });
    return () => arret?.();
  }, [demarrer, chargerContexte]);

  const recharger = useCallback(() => chargerContexte(donnees), [chargerContexte, donnees]);
  const deconnecter = useCallback(async () => {
    ecrireStockage(CLE_SESSION, null);
    // Les brouillons de formulaires peuvent contenir des données de clients : ils ne restent pas après la déconnexion.
    try { effacerBrouillons(window.localStorage); } catch { /* stockage indisponible */ }
    await donnees.deconnecter();
    setContexte(null);
    setAvis(null);
    setEtape('connexion');
  }, [donnees]);

  if (etape === 'demarrage' || (etape !== 'erreur' && !config)) return <div className="ecran-centre"><Chargement texte="Préparation de la base…" /></div>;
  if (etape === 'erreur') return <div className="ecran-centre"><Erreur message={erreur} /></div>;
  // Pages publiques (sans compte) : site web, boutique en ligne, suivi de commande, document partagé par lien et espace client.
  const [publique, cle, sousPage] = route.split('/');
  if (publique === 'site' && cle) return <SitePublic donnees={donnees} adresse={cle.toLowerCase()} slug={sousPage} />;
  if (publique === 'commander' && cle) return <BoutiquePublique key={cle} donnees={donnees} adresse={cle.toLowerCase()} />;
  if (publique === 'suivi' && cle) return <SuiviCommande key={cle} donnees={donnees} suivi={cle} />;
  if (publique === 'partage' && cle) return <PartagePublic key={cle} donnees={donnees} jeton={cle} />;
  if (publique === 'espace' && cle) return <EspaceClientPublic key={cle} donnees={donnees} jeton={cle} />;
  if (publique === 'partenaire' && cle === 'demande' && sousPage) return <DemandePartenaire key={sousPage} donnees={donnees} code={sousPage} />;
  // Elite Partners : espace partenaire (#/partenaire) et activation d'une clé (#/activer), avec ou sans compte.
  const pagePartenaire = publique === 'partenaire' || publique === 'activer';
  let ecran;
  if (etape === 'reinitialisation') {
    ecran = <Reinitialisation config={config} donnees={donnees} onFait={recharger} onDeconnexion={deconnecter} />;
  } else if (etape === 'connexion' && pagePartenaire) {
    ecran = <ConnexionPartenaire config={config} donnees={donnees} mode={publique} onConnecte={() => chargerContexte(donnees)} />;
  } else if (etape === 'connexion') {
    ecran = donnees.mode === 'local'
      ? <ConnexionLocale config={config} donnees={donnees} avis={avis} onConnecte={() => chargerContexte(donnees)} />
      : <ConnexionSupabase config={config} donnees={donnees} avis={avis} onConnecte={() => chargerContexte(donnees)} />;
  } else if (contexte.compte?.doit_changer_mot_de_passe) {
    ecran = <NouveauMotDePasse config={config} donnees={donnees} contexte={contexte} onFait={recharger} onDeconnexion={deconnecter} />;
  } else if (publique === 'activer') {
    ecran = <ActivationCle donnees={donnees} contexte={contexte} onRecharger={recharger} onDeconnexion={deconnecter} />;
  } else if (publique === 'partenaire') {
    ecran = <EspacePartenaire donnees={donnees} contexte={contexte} onDeconnexion={deconnecter} />;
  } else if (!contexte.etablissements.length && !contexte.editeur) {
    // Sans établissement : l'espace Elite Partners si la personne est partenaire, sinon l'accueil habituel.
    ecran = (
      <EspacePartenaire
        donnees={donnees}
        contexte={contexte}
        onDeconnexion={deconnecter}
        sinon={<Accueil config={config} api={donnees} contexte={contexte} onRecharger={recharger} onDeconnexion={deconnecter} />}
      />
    );
  } else {
    ecran = (
      <FournisseurEspace api={donnees} contexte={contexte} onRecharger={recharger} onDeconnexion={deconnecter}>
        <Coquille />
      </FournisseurEspace>
    );
  }
  return <ContexteAuth.Provider value={config}>{ecran}</ContexteAuth.Provider>;
}
