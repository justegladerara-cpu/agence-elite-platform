import React, { useState } from 'react';
import { fonctionActive, PAGES_TOUJOURS_VISIBLES, reglagesApresBascule } from '../../noyau/fonctions.js';
import { pagesAccessibles } from '../index.js';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { STATUTS_MODULE } from '../../noyau/format.js';
import { Badge, Erreur, Icone, PageHeader, Section, Squelette } from '../../ui/composants.jsx';

// Cinq niveaux distincts, jamais confondus : la base les calcule (mes_applications).
const NIVEAUX = [
  ['disponible', 'Disponible', 'Le module existe et fonctionne dans la plateforme.'],
  ['inclus_offre', 'Dans l’offre', 'Votre offre commerciale le comprend.'],
  ['accorde', 'Accordé', 'Votre licence le couvre (offre ou ajout d’Agence Elite).'],
  ['active', 'Activé', 'Il est en service dans cet établissement.'],
  ['autorise', 'Pour vous', 'Votre rôle vous donne au moins un droit dessus.'],
];

function Niveau({ actif, libelle }) {
  return (
    <span className={`niveau-app ${actif ? 'oui' : 'non'}`} title={actif ? libelle : `${libelle} : non`}>
      <Icone nom={actif ? 'coche' : 'fermer'} taille={13} /> {libelle}
    </span>
  );
}

// Un interrupteur par écran du menu (demande de Juste, 2026-10-23) : caché = disparaît du menu pour tout le monde.
function FonctionsAffichees() {
  const espace = useEspace();
  const { api, etablissement, peut, notifier, reglagesFonctions, relireFonctions } = espace;
  const [enCours, setEnCours] = useState(null);
  const pages = pagesAccessibles(espace).filter((p) => !PAGES_TOUJOURS_VISIBLES.includes(p.id) && !p.horsMenuSi?.(etablissement, espace));
  // Les écrans cachés restent listés (pagesAccessibles ne tient pas compte du réglage) : on peut les rallumer.
  if (!pages.length) return null;
  const groupes = [...new Set(pages.map((p) => p.groupe))];
  const modifiable = peut('etablissement.modifier');
  const basculer = async (page) => {
    setEnCours(page.id);
    try {
      // Les réglages d'un module s'enregistrent en entier : on garde les autres valeurs telles quelles.
      const lignes = await api.lire('etablissement_parametres', { eq: { etablissement_id: etablissement.id, module_id: 'etablissement' } });
      const actuel = lignes?.[0]?.data ?? {};
      const visible = fonctionActive(reglagesFonctions, page.id);
      await api.rpc('enregistrer_parametres_module', {
        p_etablissement_id: etablissement.id, p_module_id: 'etablissement',
        p_data: { ...actuel, ...reglagesApresBascule(reglagesFonctions, page.id) },
      });
      await relireFonctions();
      notifier(`${page.libelle} : ${visible ? 'caché' : 'affiché'}`);
    } catch (err) {
      notifier(err.message, 'erreur');
    } finally {
      setEnCours(null);
    }
  };
  return (
    <Section titre="Ce qui s’affiche dans le menu" sousTitre="Touchez une carte pour afficher ou cacher un écran pour toute l’équipe. Rien n’est effacé : vous pouvez le rallumer quand vous voulez.">
      {groupes.map((g) => (
        <div key={g} className="groupe-fonctions">
          <h3>{g}</h3>
          <div className="grille-fonctions">
            {pages.filter((p) => p.groupe === g).map((p) => {
              const actif = fonctionActive(reglagesFonctions, p.id);
              return (
                <button key={p.id} type="button" role="switch" aria-checked={actif} aria-label={p.libelle} className={`carte-fonction ${actif ? 'allumee' : ''}`}
                  disabled={!modifiable || enCours === p.id} onClick={() => basculer(p)}>
                  <span className="carte-fonction-icone"><Icone nom={p.icone} /></span>
                  <strong className="carte-fonction-nom">{p.libelle}</strong>
                  <span className="carte-fonction-etat">{actif ? 'Affiché' : 'Caché'}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Section>
  );
}

export function ListeApplications({ compact = false }) {
  const { api, etablissement } = useEspace();
  const { donnees: apps, chargement, erreur } = useDonnees(() => api.rpc('mes_applications', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (chargement && !apps) return <Squelette lignes={5} />;
  const categories = [...new Set((apps ?? []).map((a) => a.categorie))];
  return (
    <div className="pile">
      <Erreur message={erreur} />
      {!compact && <FonctionsAffichees />}
      {!compact && (
        <Section titre="Comment lire cette page" sousTitre="Une application n’est utilisable que si les cinq niveaux sont réunis. Pour en obtenir une nouvelle, contactez Agence Elite.">
          <ul className="niveaux-apps">
            {NIVEAUX.map(([id, l, d]) => <li key={id}><strong>{l}</strong><span className="texte-doux">{d}</span></li>)}
          </ul>
        </Section>
      )}
      {categories.map((c) => (
        <Section key={c} titre={c}>
          <div className="grille-apps">
            {apps.filter((a) => a.categorie === c).map((a) => {
              const [statut, ton] = STATUTS_MODULE[a.statut] ?? [a.statut, 'neutre'];
              const utilisable = a.disponible && a.accorde && a.active && a.autorise;
              return (
                <article key={a.id} className={`carte-app ${utilisable ? 'utilisable' : ''}`}>
                  <header>
                    <span className="carte-app-icone"><Icone nom={a.icone} /></span>
                    <span><strong>{a.nom}</strong><Badge ton={ton}>{statut}</Badge></span>
                  </header>
                  {a.description && <p className="texte-doux">{a.description}</p>}
                  {a.disponible ? (
                    <div className="niveaux-app">
                      {NIVEAUX.slice(1).map(([id, l]) => <Niveau key={id} actif={a[id]} libelle={l} />)}
                    </div>
                  ) : <small className="texte-faible">Pas encore disponible : aucune action possible pour l’instant.</small>}
                </article>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}

export default function Applications() {
  const { etablissement } = useEspace();
  return (
    <div className="page">
      <PageHeader titre="Applications" sousTitre={`Ce que ${etablissement.marque?.documents?.nom_commercial ?? etablissement.nom} peut utiliser`} />
      <ListeApplications />
    </div>
  );
}
