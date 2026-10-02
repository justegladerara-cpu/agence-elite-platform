import React, { useCallback, useEffect, useState } from 'react';
import { demarrerDonnees } from './noyau/donnees/index.js';
import { FournisseurEspace, useEspace } from './noyau/espace.jsx';
import { formatDate, ROLES } from './noyau/format.js';
import Editeur from './modules/editeur/Editeur.jsx';
import { pagesAccessibles, pagesDuMenu } from './modules/index.js';
import { Badge, Bouton, Champ, Chargement, Erreur, Icone, Onglets, Vide } from './ui/composants.jsx';

const LIBELLES_ROLES = { ...ROLES, dirigeant: 'Dirigeant', support: 'Support Agence Elite' };

function lireRoute() {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0];
}

function useRoute() {
  const [route, setRoute] = useState(lireRoute);
  useEffect(() => {
    const ecouter = () => setRoute(lireRoute());
    window.addEventListener('hashchange', ecouter);
    return () => window.removeEventListener('hashchange', ecouter);
  }, []);
  const naviguer = useCallback((id) => {
    window.location.hash = `/${id}`;
  }, []);
  return [route, naviguer];
}

function Marque() {
  return <div className="marque"><span className="marque-logo">AE</span><span>Solution Commerce</span></div>;
}

function ConnexionLocale({ donnees, onConnecte }) {
  const [comptes, setComptes] = useState(null);
  const [email, setEmail] = useState('');
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
      <div className="connexion-carte">
        <Marque />
        <h1>Choisissez un profil de démonstration</h1>
        <p className="texte-doux">Mode local : la base tourne dans ce navigateur, avec des données fictives. Rien n’est envoyé sur Internet.</p>
        {!comptes && !erreur && <Chargement />}
        <div className="profils">
          {comptes?.map((c) => (
            <button key={c.id} className="profil" onClick={() => connecter(() => donnees.connecter(c.id))}>
              <span className="avatar">{(c.nom ?? c.email)[0]}</span>
              <span>
                <strong>{c.nom ?? c.email}</strong>
                <small>{c.email}</small>
              </span>
            </button>
          ))}
        </div>
        <form
          className="formulaire connexion-email"
          onSubmit={(e) => {
            e.preventDefault();
            connecter(() => donnees.connecterParEmail(email));
          }}
        >
          <Champ libelle="Vous avez reçu une invitation ? Entrez votre adresse e-mail" aide="En mode local, le compte est créé à la première connexion.">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="vous@exemple.com" />
          </Champ>
          <Bouton type="submit">Se connecter</Bouton>
        </form>
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
  const [mode, setMode] = useState('connexion');
  const [valeurs, setValeurs] = useState({ email: '', motDePasse: '', nom: '' });
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  return (
    <div className="connexion">
      <form
        className="connexion-carte formulaire"
        onSubmit={async (e) => {
          e.preventDefault();
          setChargement(true);
          setErreur('');
          setInfo('');
          try {
            if (mode === 'connexion') {
              await donnees.connecterParMotDePasse(valeurs.email, valeurs.motDePasse);
              onConnecte();
            } else if (await donnees.creerCompte(valeurs.email, valeurs.motDePasse, valeurs.nom)) {
              onConnecte();
            } else {
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
        <Marque />
        <Onglets onglets={[['connexion', 'Connexion'], ['inscription', 'Créer mon compte']]} actif={mode} onChange={setMode} />
        {mode === 'inscription' && (
          <>
            <p className="texte-doux">Utilisez l’adresse e-mail à laquelle vous avez été invité(e).</p>
            <Champ libelle="Votre nom"><input value={valeurs.nom} onChange={changer('nom')} required /></Champ>
          </>
        )}
        <Champ libelle="E-mail"><input type="email" value={valeurs.email} onChange={changer('email')} required autoFocus /></Champ>
        <Champ libelle="Mot de passe"><input type="password" value={valeurs.motDePasse} onChange={changer('motDePasse')} required minLength={mode === 'inscription' ? 8 : undefined} /></Champ>
        {info && <p className="info">{info}</p>}
        <Erreur message={erreur} />
        <Bouton type="submit" variante="principal" chargement={chargement}>{mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}</Bouton>
      </form>
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
              <small className="texte-doux bloc">{i.client} · {i.role} · jusqu’au {formatDate(i.expire_le)}</small>
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
  return (
    <div className="connexion">
      <div className="connexion-carte">
        <Marque />
        {contexte.invitations.length ? (
          <>
            <h1>Bienvenue {contexte.utilisateur.nom ?? ''}</h1>
            <p className="texte-doux">Vous êtes invité(e) à rejoindre :</p>
            <Invitations api={api} contexte={contexte} onAccepte={onRecharger} />
          </>
        ) : (
          <Vide
            titre="Aucun établissement pour ce compte"
            texte={`Connecté avec ${contexte.utilisateur.email}. Demandez à votre gérant ou à Agence Elite de vous inviter avec cette adresse.`}
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
        {l?.statut === 'suspendue' ? 'Licence suspendue' : 'Licence expirée'} : consultation seule. Contactez Agence Elite pour la renouveler.
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

function Coquille() {
  const espace = useEspace();
  const { api, contexte, etablissement, etablissements, utilisateur, choisirEtablissement, deconnecter, editeur, recharger } = espace;
  const [route, naviguer] = useRoute();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const pages = etablissement ? pagesAccessibles(espace) : [];
  const menu = etablissement ? pagesDuMenu(espace) : [];
  const surEditeur = editeur && (route === 'editeur' || !etablissement);
  // Tant que l'établissement n'est pas en service, son gérant arrive sur la liste de démarrage.
  const pageParDefaut = pages.find((p) => p.id === 'mise-en-service' && !etablissement?.mis_en_service_le) ?? pages[0];
  const page = surEditeur ? null : pages.find((p) => p.id === route) ?? pageParDefaut;
  const routeAttendue = surEditeur ? 'editeur' : page?.id;

  useEffect(() => {
    if (routeAttendue && route !== routeAttendue) window.history.replaceState(null, '', `#/${routeAttendue}`);
  }, [routeAttendue, route]);

  const aller = (id) => {
    setMenuOuvert(false);
    naviguer(id);
  };
  const Page = page?.composant;
  return (
    <div className={`coquille ${page?.pleinEcran ? 'plein-ecran' : ''}`}>
      <aside className={`menu ${menuOuvert ? 'ouvert' : ''}`}>
        <div className="marque"><span className="marque-logo">AE</span><span>Commerce</span></div>
        {editeur && (
          <nav className="nav-editeur">
            <button className={surEditeur ? 'actif' : ''} onClick={() => aller('editeur')}>
              <Icone nom="editeur" />
              <span>Agence Elite</span>
            </button>
          </nav>
        )}
        {etablissements.length > 1 && (
          <select className="choix-etablissement" value={etablissement?.id} onChange={(e) => { choisirEtablissement(e.target.value); if (surEditeur) aller('tableau-de-bord'); }} aria-label="Établissement">
            {etablissements.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.role === 'support' ? ' (support)' : ''}</option>)}
          </select>
        )}
        {etablissements.length === 1 && <div className="choix-etablissement seul">{etablissement.nom}</div>}
        <nav>
          {menu.map((p) => (
            <button key={p.id} className={!surEditeur && p.id === page?.id ? 'actif' : ''} onClick={() => aller(p.id)}>
              <Icone nom={p.icone} />
              <span>{p.libelle}</span>
            </button>
          ))}
        </nav>
        <div className="menu-pied">
          <div className="utilisateur">
            <span className="avatar">{(utilisateur.nom ?? utilisateur.email ?? '?')[0]}</span>
            <span>
              <strong>{utilisateur.nom ?? utilisateur.email}</strong>
              <small>{surEditeur ? 'Agence Elite' : LIBELLES_ROLES[etablissement?.role]}</small>
            </span>
          </div>
          <button className="lien" onClick={deconnecter}><Icone nom="sortie" taille={16} /> Changer de profil</button>
        </div>
      </aside>
      {menuOuvert && <div className="voile-menu" onClick={() => setMenuOuvert(false)} />}
      <main className="contenu">
        <div className="barre-mobile">
          <button className="icone-bouton" onClick={() => setMenuOuvert(true)} aria-label="Menu"><Icone nom="menu" /></button>
          <strong>{surEditeur ? 'Agence Elite' : page?.libelle}</strong>
          <span className="texte-doux">{surEditeur ? '' : etablissement?.identite?.nom_commercial ?? etablissement?.nom}</span>
        </div>
        {!surEditeur && <Bandeaux naviguer={aller} />}
        {contexte.invitations.length > 0 && (
          <div className="bandeau-invitations">
            <Badge ton="bleu">Invitation</Badge>
            <Invitations api={api} contexte={contexte} onAccepte={recharger} compact />
          </div>
        )}
        {surEditeur && <GardeErreur key="editeur"><Editeur naviguer={aller} /></GardeErreur>}
        {!surEditeur && (Page
          ? <GardeErreur key={`${etablissement.id}-${page.id}`}><Page naviguer={aller} /></GardeErreur>
          : <Vide titre="Aucun module accessible" texte="Demandez à votre gérant d’ouvrir vos droits." />)}
      </main>
    </div>
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
  if (!contexte.etablissements.length && !contexte.editeur) {
    return <Accueil api={donnees} contexte={contexte} onRecharger={recharger} onDeconnexion={deconnecter} />;
  }
  return (
    <FournisseurEspace api={donnees} contexte={contexte} onRecharger={recharger} onDeconnexion={deconnecter}>
      <Coquille />
    </FournisseurEspace>
  );
}
