// Super Admin › Identité et apparence : identité de la plateforme et pages d'authentification.
// Éditeur sans code : chaque réglage est un champ simple, vide = valeur héritée (niveau au-dessus, puis code).
// Brouillon → aperçu → publication ; historique avec restauration ; retour aux valeurs par défaut.
// Aucun réglage ne touche à l'authentification elle-même (droits, mots de passe, redirections) : la base refuse
// toute clé qui n'est pas au catalogue.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApercuPageAuth } from '../../auth/EcransAuth.jsx';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure } from '../../noyau/format.js';
import { CHAMPS_PAGES_AUTH, configAuth, COULEURS_FOND_AUTH, PAGES_AUTH, SECTIONS_AUTH } from '../../noyau/pagesAuth.js';
import { ChoixCouleur } from '../../ui/Marque.jsx';
import { Badge, Bouton, Champ, Erreur, lireImageReduite, Onglets, Section, Squelette } from '../../ui/composants.jsx';
import { IdentitePlateforme } from './ApparenceEditeur.jsx';

const LIBELLES_ACTIONS = {
  brouillon: 'Brouillon enregistré',
  publication: 'Publication',
  restauration: 'Version remise dans le brouillon',
  retour_defaut: 'Retour aux valeurs par défaut (brouillon)',
  abandon: 'Brouillon abandonné',
};

const libelleChoix = (champ, valeur) => champ.choix?.find(([v]) => v === valeur)?.[1] ?? valeur;
const apercuValeur = (cle, valeur) => {
  const champ = CHAMPS_PAGES_AUTH[cle];
  if (valeur == null || valeur === '') return '(hérité)';
  if (champ?.type === 'image') return '[image]';
  if (champ?.type === 'choix') return libelleChoix(champ, valeur);
  return String(valeur).length > 80 ? `${String(valeur).slice(0, 80)}…` : String(valeur);
};

// #/editeur/identite[/auth[/<niveau>/<id>]]
export default function IdentiteEditeur({ route, naviguer }) {
  const [, , onglet, niveau, cible] = route.split('/');
  return (
    <div className="page pile">
      <div className="entete-page">
        <div>
          <h1>Identité et apparence</h1>
          <p className="texte-doux">L’identité générale de la plateforme et les pages que voient les utilisateurs avant d’entrer dans leur espace.</p>
        </div>
      </div>
      <Onglets
        onglets={[['identite', 'Identité de la plateforme'], ['auth', 'Pages d’authentification']]}
        actif={onglet === 'auth' ? 'auth' : 'identite'}
        onChange={(o) => naviguer(o === 'auth' ? 'editeur/identite/auth' : 'editeur/identite')}
      />
      {onglet === 'auth'
        ? <PagesAuthentification niveau={niveau || 'plateforme'} cible={cible || null} naviguer={naviguer} />
        : <IdentitePlateforme />}
    </div>
  );
}

function PagesAuthentification({ niveau, cible, naviguer }) {
  const { api } = useEspace();
  const liste = useDonnees(() => api.rpc('editeur_liste_pages_auth'), []);
  const fiche = useDonnees(() => api.rpc('editeur_pages_auth', { p_niveau: niveau, p_cible: cible }), [niveau, cible]);
  const valeurCible = niveau === 'plateforme' ? 'plateforme' : `${niveau}/${cible}`;
  const rechargerTout = async () => {
    await fiche.recharger();
    await liste.recharger();
  };
  return (
    <div className="pile">
      <Section titre="Pages à modifier" sousTitre="Plateforme : pages par défaut de tous. Client ou établissement : seulement ce qui doit être différent, le reste est hérité.">
        <Champ libelle="Niveau">
          <select value={valeurCible} onChange={(e) => naviguer(e.target.value === 'plateforme' ? 'editeur/identite/auth' : `editeur/identite/auth/${e.target.value}`)}>
            <option value="plateforme">Plateforme (toutes les pages par défaut)</option>
            {liste.donnees?.clients.map((c) => (
              <optgroup key={c.id} label={c.nom}>
                <option value={`client/${c.id}`}>{c.nom} : tout le client{c.personnalise ? ' (personnalisé)' : ''}</option>
                {c.etablissements.map((e) => (
                  <option key={e.id} value={`etablissement/${e.id}`}>{'   '}{e.nom}{e.personnalise ? ' (personnalisé)' : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Champ>
      </Section>
      {fiche.chargement && !fiche.donnees && <Squelette lignes={8} />}
      {!fiche.chargement && !fiche.donnees && <Erreur message={fiche.erreur} />}
      {fiche.donnees && (
        <EditeurPages
          key={`${valeurCible}-${fiche.donnees.brouillon_modifie_le ?? ''}-${fiche.donnees.version}`}
          fiche={fiche.donnees}
          recharger={rechargerTout}
        />
      )}
    </div>
  );
}

function ChampReglage({ cle, valeur, herite, onChange, onFocus, onErreur }) {
  const champ = CHAMPS_PAGES_AUTH[cle];
  const indication = herite ? `Hérité : ${apercuValeur(cle, herite)}` : 'Vide : rien n’est affiché';
  const commun = { onFocus };
  let saisie;
  switch (champ.type) {
    case 'long':
      saisie = <textarea rows={3} maxLength={champ.max} value={valeur} placeholder={herite} onChange={(e) => onChange(e.target.value)} {...commun} />;
      break;
    case 'image':
      saisie = (
        <span className="actions-gauche">
          {valeur || herite ? <img className="vignette" src={valeur || herite} alt="" /> : <span className="vignette vide-logo">—</span>}
          <label className="bouton secondaire">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={async (e) => {
                const fichier = e.target.files?.[0];
                if (!fichier) return;
                try {
                  onChange(await lireImageReduite(fichier, cle === 'logo_url' ? 320 : 1600));
                } catch (err) {
                  onErreur(err.message);
                }
              }}
            />
            Choisir une image
          </label>
          {valeur && <button type="button" className="lien" onClick={() => onChange('')}>{herite ? 'Reprendre l’image héritée' : 'Retirer'}</button>}
        </span>
      );
      break;
    case 'couleur':
      saisie = <ChoixCouleur valeur={valeur} heritee={herite} onChange={onChange} />;
      break;
    case 'fond':
      saisie = (
        <div className="choix-fond" role="group" aria-label={champ.libelle}>
          {COULEURS_FOND_AUTH.map(([c, nom]) => (
            <button key={c} type="button" title={nom} aria-label={nom} aria-pressed={(valeur || herite) === c} onClick={() => onChange(c === herite ? '' : c)} style={{ background: c }} />
          ))}
        </div>
      );
      break;
    case 'choix':
      saisie = (
        <select value={valeur} onChange={(e) => onChange(e.target.value)} {...commun}>
          <option value="">Hérité ({libelleChoix(champ, herite)})</option>
          {champ.choix.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      );
      break;
    case 'lien':
      saisie = <input value={valeur} maxLength={300} placeholder={herite || 'https://…, mailto:… ou tel:…'} onChange={(e) => onChange(e.target.value.trim())} inputMode="url" {...commun} />;
      break;
    default:
      saisie = <input value={valeur} maxLength={champ.max} placeholder={herite} onChange={(e) => onChange(e.target.value.replace(/[\r\n]/g, ' '))} {...commun} />;
  }
  return (
    <Champ libelle={champ.libelle} aide={champ.aide} className={champ.type === 'long' || champ.type === 'image' ? 'large' : ''}>
      {saisie}
      {!valeur && champ.type !== 'image' && champ.type !== 'choix' && <span className="champ-herite">{indication}</span>}
    </Champ>
  );
}

function EditeurPages({ fiche, recharger }) {
  const { api, notifier } = useEspace();
  const [valeurs, setValeurs] = useState(() => ({ ...fiche.brouillon }));
  const [section, setSection] = useState('identite');
  const [pageTextes, setPageTextes] = useState('connexion');
  const [page, setPage] = useState('connexion');
  const [ecran, setEcran] = useState('ordinateur');
  const [source, setSource] = useState('brouillon');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState('');
  const modifiable = fiche.modifiable;
  const modifie = JSON.stringify(nettoyerVides(valeurs)) !== JSON.stringify(nettoyerVides(fiche.brouillon));
  // Valeurs héritées : code, identité générale, niveaux au-dessus (publiés).
  const herite = useMemo(() => configAuth({ marque: fiche.marque, contenu: fiche.herite }), [fiche]);
  const config = useMemo(
    () => configAuth({ marque: fiche.marque, contenu: { ...fiche.herite, ...(source === 'publie' ? fiche.publie : valeurs) } }),
    [fiche, valeurs, source],
  );
  const changer = (cle) => (v) => {
    setSource('brouillon');
    setValeurs((anciennes) => ({ ...anciennes, [cle]: v }));
  };
  const montrer = (cle) => () => {
    const p = CHAMPS_PAGES_AUTH[cle].page;
    if (p) setPage(p);
  };
  const executer = async (nom, action, message) => {
    setEnCours(nom);
    setErreur('');
    try {
      await action();
      if (message) notifier(message);
      await recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours('');
    }
  };
  const cibleRpc = { p_niveau: fiche.niveau, p_cible: fiche.cible };
  const enregistrer = () => api.rpc('enregistrer_brouillon_pages_auth', { ...cibleRpc, p_contenu: nettoyerVides(valeurs) });
  const champs = (filtre) => Object.entries(CHAMPS_PAGES_AUTH).filter(([, c]) => filtre(c)).map(([cle]) => (
    <ChampReglage
      key={cle}
      cle={cle}
      valeur={valeurs[cle] ?? ''}
      herite={herite[cle] || ''}
      onChange={changer(cle)}
      onFocus={montrer(cle)}
      onErreur={setErreur}
    />
  ));
  const pagesTextes = [...PAGES_AUTH.map((p) => [p.id, p.libelle]), ['commun', 'Bas de page (toutes les pages)']];

  return (
    <div className="editeur-auth">
      <div className="pile">
        <Section
          titre={fiche.nom}
          sousTitre={fiche.niveau === 'plateforme' ? 'Pages par défaut de toute la plateforme.' : 'Vide = repris du niveau au-dessus.'}
          action={(
            <span className="actions-gauche">
              {fiche.version > 0 ? <Badge ton="vert">Publié v{fiche.version}</Badge> : <Badge>Jamais publié</Badge>}
              {(fiche.en_attente || modifie) && <Badge ton="orange">Brouillon non publié</Badge>}
            </span>
          )}
        >
          {!modifiable && <p className="info">Lecture seule : seul le Super Admin modifie les pages de la plateforme.</p>}
          {fiche.adresse_connexion && (
            <p className="texte-doux">Lien de connexion : <code>{`${window.location.origin}${window.location.pathname}#/connexion/${fiche.adresse_connexion}`}</code></p>
          )}
          {fiche.niveau === 'etablissement' && modifiable && <AdresseEtablissement fiche={fiche} recharger={recharger} />}
          <Onglets onglets={[...SECTIONS_AUTH, ['pages', 'Pages'], ['publication', 'Publication']]} actif={section} onChange={setSection} />
          <fieldset disabled={!modifiable} className="pile sans-bordure">
            {section === 'identite' && <div className="grille-champs">{champs((c) => c.section === 'identite')}</div>}
            {section === 'apparence' && <div className="grille-champs">{champs((c) => c.section === 'apparence')}</div>}
            {section === 'textes' && (
              <>
                <Champ libelle="Page">
                  <select value={pageTextes} onChange={(e) => { setPageTextes(e.target.value); if (e.target.value !== 'commun') setPage(e.target.value); }}>
                    {pagesTextes.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                  </select>
                </Champ>
                <div className="grille-champs">
                  {champs((c) => c.section === 'textes' && (pageTextes === 'commun' ? c.groupe === 'commun' : c.page === pageTextes && c.groupe !== 'commun'))}
                </div>
                <p className="texte-doux">Mots remplacés automatiquement : {'{nom}'} (nom de la personne), {'{compte}'}, {'{editeur}'}, {'{logiciel}'}, {'{annee}'}.</p>
              </>
            )}
            {section === 'liens' && (
              <>
                <h3>Boutons et liens des pages</h3>
                <div className="grille-champs">{champs((c) => c.section === 'liens' && c.groupe !== 'pied')}</div>
                <h3>Liens du bas de page</h3>
                <p className="texte-doux">Adresse en https://, mailto: ou tel: uniquement. Un lien sans texte n’est pas affiché.</p>
                <div className="grille-champs">{champs((c) => c.groupe === 'pied')}</div>
              </>
            )}
          </fieldset>
          {section === 'pages' && (
            <div className="liste-simple">
              {PAGES_AUTH.map((p) => (
                <div key={p.id} className="liste-ligne">
                  <span><strong>{p.libelle}</strong><small className="texte-doux bloc">{p.description}</small></span>
                  <span className="actions-gauche">
                    <button type="button" className="lien" onClick={() => setPage(p.id)}>Aperçu</button>
                    <button type="button" className="lien" onClick={() => { setPage(p.id); setPageTextes(p.id); setSection('textes'); }}>Textes</button>
                  </span>
                </div>
              ))}
              <p className="texte-doux">La double authentification n’est pas activée sur la plateforme : aucune page à régler. Le fonctionnement (mots de passe, droits, redirections) ne se règle pas ici.</p>
            </div>
          )}
          {section === 'publication' && <Publication fiche={fiche} modifiable={modifiable} executer={executer} enCours={enCours} cibleRpc={cibleRpc} />}
          <Erreur message={erreur} />
          {modifiable && (
            <div className="actions">
              <Bouton type="button" disabled={!modifie} chargement={enCours === 'brouillon'} onClick={() => executer('brouillon', enregistrer, 'Brouillon enregistré')}>Enregistrer le brouillon</Bouton>
              <Bouton
                type="button"
                variante="principal"
                disabled={!modifie && !fiche.en_attente}
                chargement={enCours === 'publier'}
                onClick={() => executer('publier', async () => {
                  if (modifie) await enregistrer();
                  await api.rpc('publier_pages_auth', cibleRpc);
                }, 'Pages publiées : visibles immédiatement')}
              >
                Publier
              </Bouton>
            </div>
          )}
        </Section>
      </div>
      <div className="editeur-auth-apercu">
        <div className="actions-gauche">
          <select value={page} onChange={(e) => setPage(e.target.value)} aria-label="Page affichée">
            {PAGES_AUTH.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
          </select>
          <Onglets onglets={[['ordinateur', 'Ordinateur'], ['telephone', 'Téléphone']]} actif={ecran} onChange={setEcran} />
          <Onglets onglets={[['brouillon', 'Brouillon'], ['publie', 'Publié']]} actif={source} onChange={setSource} />
        </div>
        <CadreApercu ecran={ecran}>
          <ApercuPageAuth key={page} page={page} config={config} />
        </CadreApercu>
        <p className="texte-doux">Aperçu avec des données fictives : les formulaires n’envoient rien.</p>
      </div>
    </div>
  );
}

// Ordinateur : la page est rendue à 1180 px puis réduite pour tenir dans le cadre (rendu fidèle).
// Téléphone : rendue à 390 px de large.
const LARGEUR_ORDINATEUR = 1180;
const HAUTEUR_CADRE = 620;
function CadreApercu({ ecran, children }) {
  const cadre = useRef(null);
  const [echelle, setEchelle] = useState(0.5);
  useEffect(() => {
    if (ecran !== 'ordinateur' || !cadre.current) return undefined;
    const mesurer = () => setEchelle(Math.min(1, (cadre.current?.clientWidth || LARGEUR_ORDINATEUR) / LARGEUR_ORDINATEUR));
    mesurer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(cadre.current);
    return () => observateur.disconnect();
  }, [ecran]);
  if (ecran === 'telephone') return <div className="apercu-auth-cadre mobile" aria-label="Aperçu de la page">{children}</div>;
  return (
    <div ref={cadre} className="apercu-auth-cadre ordinateur" style={{ height: HAUTEUR_CADRE }} aria-label="Aperçu de la page">
      <div className="apercu-echelle" style={{ height: HAUTEUR_CADRE / echelle, transform: `scale(${echelle})` }}>{children}</div>
    </div>
  );
}

function nettoyerVides(o) {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => typeof v === 'string' && v.trim() !== '').sort(([a], [b]) => a.localeCompare(b)));
}

function Publication({ fiche, modifiable, executer, enCours, cibleRpc }) {
  const { api } = useEspace();
  return (
    <div className="pile">
      <p className="texte-doux">
        {fiche.version > 0 ? `Version ${fiche.version} publiée le ${formatDate(fiche.publie_le)}.` : 'Rien n’est encore publié à ce niveau : les pages héritées s’affichent.'}
        {' '}Une publication s’applique tout de suite, sans redéploiement.
      </p>
      {modifiable && (
        <div className="actions-gauche">
          <Bouton type="button" chargement={enCours === 'abandon'} disabled={!fiche.en_attente} onClick={() => executer('abandon', () => api.rpc('reinitialiser_pages_auth', { ...cibleRpc, p_mode: 'publie' }), 'Brouillon abandonné')}>Abandonner le brouillon</Bouton>
          <Bouton type="button" chargement={enCours === 'defaut'} onClick={() => executer('defaut', () => api.rpc('reinitialiser_pages_auth', { ...cibleRpc, p_mode: 'defaut' }), 'Brouillon remis aux valeurs par défaut : publiez pour l’appliquer')}>Revenir aux valeurs par défaut</Bouton>
        </div>
      )}
      <h3>Historique</h3>
      {!fiche.journal.length && <p className="texte-doux">Aucune modification pour l’instant.</p>}
      <div className="journal-auth">
        {fiche.journal.map((j) => (
          <details key={j.id}>
            <summary>
              <strong>{LIBELLES_ACTIONS[j.action] ?? j.action}{j.version ? ` (v${j.version})` : ''}</strong>
              {' · '}{formatDateHeure(j.cree_le)} · {j.auteur ?? '—'} · {j.changements.length} changement(s)
            </summary>
            <ul>
              {j.changements.map((c) => (
                <li key={c.cle}>{CHAMPS_PAGES_AUTH[c.cle]?.libelle ?? c.cle} : {apercuValeur(c.cle, c.avant)} → {apercuValeur(c.cle, c.apres)}</li>
              ))}
            </ul>
            {modifiable && j.action === 'publication' && (
              <Bouton type="button" chargement={enCours === j.id} onClick={() => executer(j.id, () => api.rpc('restaurer_pages_auth', { ...cibleRpc, p_entree_id: j.id }), `Version ${j.version} remise dans le brouillon : vérifiez l’aperçu, puis publiez`)}>
                Remettre cette version dans le brouillon
              </Bouton>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}

function AdresseEtablissement({ fiche, recharger }) {
  const { api, notifier } = useEspace();
  const [adresse, setAdresse] = useState(fiche.adresse_connexion ?? '');
  const [erreur, setErreur] = useState('');
  return (
    <form
      className="actions-gauche"
      onSubmit={async (e) => {
        e.preventDefault();
        setErreur('');
        try {
          await api.rpc('enregistrer_adresse_connexion_etablissement', { p_etablissement_id: fiche.cible, p_adresse: adresse });
          notifier('Adresse de connexion enregistrée');
          await recharger();
        } catch (err) {
          setErreur(err.message);
        }
      }}
    >
      <Champ libelle="Adresse de connexion propre à cet établissement" aide="Facultatif. 3 à 40 caractères : minuscules, chiffres, tirets.">
        <input value={adresse} onChange={(e) => setAdresse(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="ex. boutique-centre" />
      </Champ>
      <Bouton type="submit">Enregistrer l’adresse</Bouton>
      <Erreur message={erreur} />
    </form>
  );
}
