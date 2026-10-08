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

export function ListeApplications({ compact = false }) {
  const { api, etablissement } = useEspace();
  const { donnees: apps, chargement, erreur } = useDonnees(() => api.rpc('mes_applications', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (chargement && !apps) return <Squelette lignes={5} />;
  const categories = [...new Set((apps ?? []).map((a) => a.categorie))];
  return (
    <div className="pile">
      <Erreur message={erreur} />
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
