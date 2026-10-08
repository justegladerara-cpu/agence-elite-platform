// Écrans d'authentification : leur contenu (textes, identité, apparence) vient des pages administrables
// (Super Admin › Identité et apparence › Pages d'authentification). Leur fonctionnement reste dans le code :
// Supabase Auth, politique des mots de passe, changement obligatoire, redirections.
// Le même composant sert à l'écran réel et à l'aperçu de l'éditeur (apercu = aucun envoi).
import { createContext, useContext, useState } from 'react';
import { Marque } from '../ui/Marque.jsx';
import { Bouton, Champ, Erreur, Icone, Onglets } from '../ui/composants.jsx';
import { configAuth, liensAuth, marqueAuth, texteAuth, variablesAccent } from '../noyau/pagesAuth.js';

const CONFIG_DEFAUT = configAuth();
export const ContexteAuth = createContext(null);
export const useConfigAuth = () => useContext(ContexteAuth) ?? CONFIG_DEFAUT;

// Défense en profondeur : la base n'accepte déjà que ces deux formes d'image.
const imageSure = (v) => typeof v === 'string' && /^(data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s"'()<>\\]+)$/.test(v);

// Message d'erreur de connexion : les états connus (bloqué, désactivé) prennent le texte réglé.
export function messageConnexion(config, erreur) {
  const message = erreur?.message ?? String(erreur ?? '');
  if (/trop de tentatives/i.test(message)) return texteAuth(config, 'bloque_texte');
  if (/banned|désactivé/i.test(message)) return texteAuth(config, 'desactive_texte');
  return message;
}

function PiedAuth({ config }) {
  const liens = liensAuth(config);
  const pied = texteAuth(config, 'pied');
  const droits = texteAuth(config, 'copyright');
  if (!liens.length && !pied && !droits) return null;
  return (
    <footer className="auth-pied">
      {pied && <p className="texte-multiligne">{pied}</p>}
      {liens.length > 0 && (
        <nav className="auth-liens" aria-label="Liens utiles">
          {liens.map((l) => (
            <a key={l.url + l.libelle} href={l.url} {...(l.url.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{l.libelle}</a>
          ))}
        </nav>
      )}
      {droits && <small>{droits}</small>}
    </footer>
  );
}

// Cadre commun : fond, disposition, carte, identité, pied de page.
export function EcranAuth({ config, large, children }) {
  const image = imageSure(config.image_fond) ? `url("${config.image_fond}")` : null;
  const style = { ...variablesAccent(config.couleur_accent) };
  let fond = config.fond;
  if (fond === 'image' && !image) fond = 'degrade';
  if (fond === 'uni') style.background = config.couleur_fond;
  if (fond === 'image') style.backgroundImage = image;
  const marque = marqueAuth(config);
  return (
    <div className={`connexion auth auth-${config.disposition} auth-fond-${fond} auth-texte-${config.alignement}`} style={style}>
      <div className="auth-grille">
        {config.disposition === 'partagee' && (
          <aside className="auth-panneau" style={image ? { backgroundImage: image } : undefined}>
            <div className="auth-panneau-contenu">
              <Marque marque={marque} />
              {config.accroche && <p className="texte-multiligne">{config.accroche}</p>}
            </div>
          </aside>
        )}
        <div className="auth-zone">
          <div className={`connexion-carte ${large ? 'large' : ''}`}>
            <Marque marque={marque} />
            {children}
            <PiedAuth config={config} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Titre({ config, cle, variables, intro }) {
  const titre = texteAuth(config, cle, variables);
  const texte = intro ? texteAuth(config, intro, variables) : '';
  return (
    <>
      {titre && <h1>{titre}</h1>}
      {texte && <p className="texte-doux texte-multiligne">{texte}</p>}
    </>
  );
}

export function ChampMotDePasse({ libelle, valeur, onChange, aide, autoComplete = 'current-password', autoFocus, minLength }) {
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

// Envoi d'un formulaire : chargement, erreur, aucun envoi en aperçu.
function useEnvoi(apercu) {
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const envoyer = (action) => async (e) => {
    e.preventDefault();
    if (apercu) return;
    setChargement(true);
    setErreur('');
    try {
      await action();
    } catch (err) {
      setErreur(err.message ?? String(err));
    } finally {
      setChargement(false);
    }
  };
  return { erreur, setErreur, chargement, envoyer };
}

// Formulaire commun : identifiant (ou e-mail) + mot de passe. Supabase Auth reste l'autorité.
export function FormulaireConnexion({ config, donnees, onConnecte, apercu, erreurInitiale = '' }) {
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const { erreur, chargement, envoyer } = useEnvoi(apercu);
  return (
    <form
      className="formulaire"
      onSubmit={envoyer(async () => {
        try {
          await donnees.connecterParMotDePasse(identifiant, motDePasse);
        } catch (err) {
          throw new Error(messageConnexion(config, err));
        }
        onConnecte();
      })}
    >
      <Champ libelle={texteAuth(config, 'champ_identifiant')}>
        <input value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required autoFocus={!apercu} autoComplete="username" autoCapitalize="none" spellCheck={false} />
      </Champ>
      <ChampMotDePasse libelle={texteAuth(config, 'champ_mot_de_passe')} valeur={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
      <Erreur message={erreur || erreurInitiale} />
      <Bouton type="submit" variante="principal" chargement={chargement}>{texteAuth(config, 'bouton_connexion')}</Bouton>
    </form>
  );
}

function FormulaireInvitation({ config, donnees, emailInitial, onConnecte, onCree, apercu }) {
  const [valeurs, setValeurs] = useState({ email: emailInitial ?? '', motDePasse: '', nom: '' });
  const { erreur, chargement, envoyer } = useEnvoi(apercu);
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  return (
    <form
      className="formulaire"
      onSubmit={envoyer(async () => {
        if (await donnees.creerCompte(valeurs.email, valeurs.motDePasse, valeurs.nom)) onConnecte();
        else onCree();
      })}
    >
      {texteAuth(config, 'invitation_intro') && <p className="texte-doux texte-multiligne">{texteAuth(config, 'invitation_intro')}</p>}
      <Champ libelle={texteAuth(config, 'champ_nom')}><input value={valeurs.nom} onChange={changer('nom')} required /></Champ>
      <Champ libelle={texteAuth(config, 'champ_email')}><input type="email" value={valeurs.email} onChange={changer('email')} required autoComplete="email" /></Champ>
      <ChampMotDePasse libelle={texteAuth(config, 'champ_mot_de_passe')} valeur={valeurs.motDePasse} onChange={changer('motDePasse')} autoComplete="new-password" minLength={8} aide="8 caractères au moins." />
      <Erreur message={erreur} />
      <Bouton type="submit" variante="principal" chargement={chargement}>{texteAuth(config, 'bouton_invitation')}</Bouton>
    </form>
  );
}

function FormulaireOubli({ config, donnees, onEnvoye, apercu }) {
  const [email, setEmail] = useState('');
  const { erreur, chargement, envoyer } = useEnvoi(apercu);
  return (
    <form className="formulaire" onSubmit={envoyer(async () => { await donnees.demanderReinitialisation(email); onEnvoye(); })}>
      <Champ libelle={texteAuth(config, 'champ_email')}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!apercu} autoComplete="email" />
      </Champ>
      <Erreur message={erreur} />
      <Bouton type="submit" variante="principal" chargement={chargement}>{texteAuth(config, 'bouton_oubli')}</Bouton>
    </form>
  );
}

function Avis({ titre, texte }) {
  if (!titre && !texte) return null;
  return (
    <div className="info auth-avis" role="status">
      {titre && <strong>{titre}</strong>}
      {texte && <span className="texte-multiligne">{texte}</span>}
    </div>
  );
}

// Connexion, invitation et mot de passe oublié. avis : 'expiree' (session terminée) ou 'lien' (lien reçu expiré).
export function ParcoursConnexion({ config, donnees, onConnecte, apercu, vueInitiale = 'connexion', invitationPossible, emailInvitation, avis, erreurInitiale }) {
  const [vue, setVue] = useState(vueInitiale);
  const [info, setInfo] = useState('');
  const oubliPossible = apercu || Boolean(donnees?.demanderReinitialisation);
  const aller = (v) => {
    setInfo('');
    setVue(v);
  };
  if (vue === 'oubli') {
    return (
      <>
        <Titre config={config} cle="oubli_titre" intro={info ? null : 'oubli_intro'} />
        {avis === 'lien' && <Avis texte={texteAuth(config, 'lien_expire')} />}
        {info ? <p className="info texte-multiligne" role="status">{info}</p> : (
          <FormulaireOubli config={config} donnees={donnees} apercu={apercu} onEnvoye={() => setInfo(texteAuth(config, 'oubli_envoye'))} />
        )}
        <button type="button" className="lien" onClick={() => aller('connexion')}>{texteAuth(config, 'lien_retour')}</button>
      </>
    );
  }
  return (
    <>
      <Titre config={config} cle="connexion_titre" intro="connexion_intro" />
      {avis === 'expiree' && <Avis titre={texteAuth(config, 'expiree_titre')} texte={texteAuth(config, 'expiree_texte')} />}
      {avis === 'lien' && <Avis texte={texteAuth(config, 'lien_expire')} />}
      {invitationPossible && (
        <Onglets onglets={[['connexion', texteAuth(config, 'onglet_connexion')], ['inscription', texteAuth(config, 'onglet_invitation')]]} actif={vue} onChange={aller} />
      )}
      {info && <p className="info texte-multiligne" role="status">{info}</p>}
      {vue === 'inscription' ? (
        <FormulaireInvitation
          config={config}
          donnees={donnees}
          apercu={apercu}
          emailInitial={emailInvitation}
          onConnecte={onConnecte}
          onCree={() => { setVue('connexion'); setInfo(texteAuth(config, 'invitation_succes')); }}
        />
      ) : (
        <>
          <FormulaireConnexion config={config} donnees={donnees} onConnecte={onConnecte} apercu={apercu} erreurInitiale={erreurInitiale} />
          {oubliPossible && <button type="button" className="lien" onClick={() => aller('oubli')}>{texteAuth(config, 'lien_oubli')}</button>}
        </>
      )}
    </>
  );
}

const TROP_SIMPLES = ['1234', '12345', '123456', '1234567', '12345678', '123456789', '0000', '000000', '00000000', 'azerty', 'azerty123', 'motdepasse', 'password', 'password1', 'qwerty', 'admin', 'admin123'];

// Politique des mots de passe : dans le code, jamais réglable depuis l'éditeur (la base et Supabase Auth la vérifient aussi).
export function verifierNouveauMotDePasse(nouveau, confirmation) {
  if (nouveau.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
  if (TROP_SIMPLES.includes(nouveau.toLowerCase())) return 'Ce mot de passe est trop simple';
  if (!/[A-Za-z]/.test(nouveau) || !/\d/.test(nouveau)) return 'Utilisez au moins une lettre et un chiffre';
  if (nouveau !== confirmation) return 'Les deux mots de passe ne sont pas identiques';
  return '';
}

export function FormulaireNouveauMotDePasse({ donnees, onFait, libelleAction, apercu }) {
  const config = useConfigAuth();
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const { erreur, setErreur, chargement, envoyer } = useEnvoi(apercu);
  return (
    <form
      className="formulaire"
      onSubmit={(e) => {
        const probleme = verifierNouveauMotDePasse(nouveau, confirmation);
        if (probleme && !apercu) {
          e.preventDefault();
          setErreur(probleme);
          return undefined;
        }
        return envoyer(async () => {
          await donnees.changerMotDePasse(nouveau);
          await onFait();
        })(e);
      }}
    >
      <ChampMotDePasse libelle={texteAuth(config, 'champ_nouveau')} valeur={nouveau} onChange={(e) => setNouveau(e.target.value)} autoComplete="new-password" autoFocus={!apercu} aide="8 caractères au moins, avec une lettre et un chiffre." />
      <ChampMotDePasse libelle={texteAuth(config, 'champ_confirmation')} valeur={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
      <Erreur message={erreur} />
      <Bouton type="submit" variante="principal" chargement={chargement}>{libelleAction ?? texteAuth(config, 'bouton_mot_de_passe')}</Bouton>
    </form>
  );
}

function LienSortie({ config, cle, onClick }) {
  return <button type="button" className="lien" onClick={onClick}><Icone nom="sortie" taille={16} /> {texteAuth(config, cle)}</button>;
}

// Premier accès avec un mot de passe temporaire (ou mot de passe temporaire expiré).
export function VueNouveauMotDePasse({ config, nom, expire, donnees, onFait, onDeconnexion, apercu }) {
  return (
    <>
      {expire
        ? <Titre config={config} cle="expire_titre" intro="expire_texte" />
        : (
          <>
            <Titre config={config} cle="premiere_titre" intro="premiere_intro" variables={{ nom }} />
            <FormulaireNouveauMotDePasse donnees={donnees} onFait={onFait} apercu={apercu} />
          </>
        )}
      <LienSortie config={config} cle="lien_deconnexion" onClick={onDeconnexion} />
    </>
  );
}

// Arrivée par le lien « mot de passe oublié » : la session de récupération ne sert qu'à choisir le nouveau mot de passe.
export function VueReinitialisation({ config, donnees, onFait, onDeconnexion, apercu }) {
  return (
    <>
      <Titre config={config} cle="reinit_titre" intro="reinit_intro" />
      <FormulaireNouveauMotDePasse donnees={donnees} onFait={onFait} apercu={apercu} libelleAction={texteAuth(config, 'bouton_reinit')} />
      <LienSortie config={config} cle="lien_deconnexion" onClick={onDeconnexion} />
    </>
  );
}

// Compte connecté sans établissement : invitations en attente, sinon accès refusé.
export function VueAccueil({ config, nom, compte, invitations, onDeconnexion }) {
  const contact = config.contact_support;
  return (
    <>
      {invitations ? (
        <>
          <Titre config={config} cle="bienvenue_titre" intro="bienvenue_intro" variables={{ nom }} />
          {invitations}
        </>
      ) : (
        <div className="vide">
          <Titre config={config} cle="refuse_titre" intro="refuse_texte" variables={{ nom, compte }} />
          {contact && <p className="texte-doux">{contact}</p>}
        </div>
      )}
      <LienSortie config={config} cle="lien_changer_compte" onClick={onDeconnexion} />
    </>
  );
}

// Aperçu fidèle d'une page, avec des données fictives (aucun appel, aucun envoi).
export function ApercuPageAuth({ page, config }) {
  const fictif = { nom: 'Awa Diallo', compte: 'awa.diallo' };
  const rien = () => {};
  let contenu;
  switch (page) {
    case 'invitation':
      contenu = <ParcoursConnexion config={config} apercu invitationPossible vueInitiale="inscription" />;
      break;
    case 'oubli':
      contenu = <ParcoursConnexion config={config} apercu vueInitiale="oubli" />;
      break;
    case 'bloque':
      contenu = <ParcoursConnexion config={config} apercu invitationPossible erreurInitiale={texteAuth(config, 'bloque_texte')} />;
      break;
    case 'expiree':
      contenu = <ParcoursConnexion config={config} apercu invitationPossible avis="expiree" />;
      break;
    case 'premiere':
      contenu = <VueNouveauMotDePasse config={config} nom={fictif.nom} apercu onDeconnexion={rien} />;
      break;
    case 'expire':
      contenu = <VueNouveauMotDePasse config={config} nom={fictif.nom} expire apercu onDeconnexion={rien} />;
      break;
    case 'reinitialisation':
      contenu = <VueReinitialisation config={config} apercu onDeconnexion={rien} />;
      break;
    case 'refuse':
      contenu = <VueAccueil config={config} {...fictif} onDeconnexion={rien} />;
      break;
    case 'bienvenue':
      contenu = (
        <VueAccueil
          config={config}
          {...fictif}
          onDeconnexion={rien}
          invitations={(
            <div className="liste-simple">
              <div className="liste-ligne">
                <span><strong>Boutique du centre</strong><small className="texte-doux bloc">Exemple · Caissier</small></span>
                <Bouton variante="principal">Rejoindre</Bouton>
              </div>
            </div>
          )}
        />
      );
      break;
    default:
      contenu = <ParcoursConnexion config={config} apercu invitationPossible />;
  }
  return (
    <ContexteAuth.Provider value={config}>
      <EcranAuth config={config}>{contenu}</EcranAuth>
    </ContexteAuth.Provider>
  );
}
