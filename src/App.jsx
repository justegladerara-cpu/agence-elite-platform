import React, { useCallback, useEffect, useState } from 'react';
import { demarrerDonnees } from './noyau/donnees/index.js';
import { FournisseurEspace, useEspace } from './noyau/espace.jsx';
import { ROLES } from './noyau/format.js';
import { pagesAccessibles } from './modules/index.js';
import { Bouton, Champ, Chargement, Erreur, Icone, Vide } from './ui/composants.jsx';

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

function ConnexionLocale({ donnees, onConnecte }) {
  const [comptes, setComptes] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    donnees.comptes().then(setComptes).catch((e) => setErreur(e.message));
  }, [donnees]);
  return (
    <div className="connexion">
      <div className="connexion-carte">
        <div className="marque"><span className="marque-logo">AE</span><span>Solution Commerce</span></div>
        <h1>Choisissez un profil de démonstration</h1>
        <p className="texte-doux">Mode local : la base tourne dans ce navigateur, avec des données fictives. Rien n’est envoyé sur Internet.</p>
        <Erreur message={erreur} />
        {!comptes && !erreur && <Chargement />}
        <div className="profils">
          {comptes?.map((c) => (
            <button key={c.id} className="profil" onClick={async () => { await donnees.connecter(c.id); onConnecte(); }}>
              <span className="avatar">{(c.nom ?? c.email)[0]}</span>
              <span>
                <strong>{c.nom ?? c.email}</strong>
                <small>{c.email}</small>
              </span>
            </button>
          ))}
        </div>
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
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  return (
    <div className="connexion">
      <form
        className="connexion-carte formulaire"
        onSubmit={async (e) => {
          e.preventDefault();
          setChargement(true);
          setErreur('');
          try {
            await donnees.connecterParMotDePasse(email, motDePasse);
            onConnecte();
          } catch (err) {
            setErreur(err.message);
            setChargement(false);
          }
        }}
      >
        <div className="marque"><span className="marque-logo">AE</span><span>Solution Commerce</span></div>
        <h1>Connexion</h1>
        <Champ libelle="E-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Champ>
        <Champ libelle="Mot de passe"><input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required /></Champ>
        <Erreur message={erreur} />
        <Bouton type="submit" variante="principal" chargement={chargement}>Se connecter</Bouton>
      </form>
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

function Coquille() {
  const espace = useEspace();
  const { etablissement, etablissements, utilisateur, choisirEtablissement, deconnecter } = espace;
  const [route, naviguer] = useRoute();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const pages = pagesAccessibles(espace);
  const page = pages.find((p) => p.id === route) ?? pages[0];

  useEffect(() => {
    if (page && route !== page.id) window.history.replaceState(null, '', `#/${page.id}`);
  }, [page, route]);

  const aller = (id) => {
    setMenuOuvert(false);
    naviguer(id);
  };
  const Page = page?.composant;
  return (
    <div className={`coquille ${page?.pleinEcran ? 'plein-ecran' : ''}`}>
      <aside className={`menu ${menuOuvert ? 'ouvert' : ''}`}>
        <div className="marque"><span className="marque-logo">AE</span><span>Commerce</span></div>
        {etablissements.length > 1 ? (
          <select className="choix-etablissement" value={etablissement.id} onChange={(e) => choisirEtablissement(e.target.value)} aria-label="Établissement">
            {etablissements.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        ) : <div className="choix-etablissement seul">{etablissement.nom}</div>}
        <nav>
          {pages.map((p) => (
            <button key={p.id} className={p.id === page?.id ? 'actif' : ''} onClick={() => aller(p.id)}>
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
              <small>{ROLES[etablissement.role]}</small>
            </span>
          </div>
          <button className="lien" onClick={deconnecter}><Icone nom="sortie" taille={16} /> Changer de profil</button>
        </div>
      </aside>
      {menuOuvert && <div className="voile-menu" onClick={() => setMenuOuvert(false)} />}
      <main className="contenu">
        <div className="barre-mobile">
          <button className="icone-bouton" onClick={() => setMenuOuvert(true)} aria-label="Menu"><Icone nom="menu" /></button>
          <strong>{page?.libelle}</strong>
          <span className="texte-doux">{etablissement.identite?.nom_commercial ?? etablissement.nom}</span>
        </div>
        {!etablissement.ecriture && (
          <div className="bandeau">Cet établissement est suspendu : consultation seule.</div>
        )}
        {Page ? <GardeErreur key={`${etablissement.id}-${page.id}`}><Page naviguer={aller} /></GardeErreur> : <Vide titre="Aucun module accessible" texte="Demandez à votre gérant d’ouvrir vos droits." />}
      </main>
    </div>
  );
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
  if (!contexte.etablissements.length) {
    return (
      <div className="ecran-centre">
        <Vide titre="Aucun établissement" texte="Votre compte n’est rattaché à aucun établissement actif." action={<Bouton onClick={deconnecter}>Se déconnecter</Bouton>} />
      </div>
    );
  }
  return (
    <FournisseurEspace api={donnees} contexte={contexte} onRecharger={recharger} onDeconnexion={deconnecter}>
      <Coquille />
    </FournisseurEspace>
  );
}
