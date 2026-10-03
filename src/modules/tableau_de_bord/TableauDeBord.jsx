import React from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, EmptyState, Erreur, Icone, PageHeader, Squelette } from '../../ui/composants.jsx';
import { widgetsAccessibles } from '../index.js';
import { Activite, ActionsRapides, ASurveiller, BarrePeriode, Graphique, GrilleKpis, Kpi, ListeCockpit, useFiltresCockpit } from './cockpit.jsx';
import { DOMAINES } from './domaines.js';

// Tableau de bord : vue d'ensemble de l'établissement (#/tableau-de-bord) et un tableau par
// domaine (#/tableau-de-bord/<domaine>). Tout vient des fonctions cockpit_* de la base, qui
// n'agrègent que les modules actifs et autorisés (docs/TABLEAUX_DE_BORD.md).
export default function TableauDeBord({ naviguer, sousRoute }) {
  const { api, etablissement } = useEspace();
  const domaine = (sousRoute ?? '').split('/')[0] || null;
  const f = useFiltresCockpit();
  const { donnees: domaines, erreur: erreurDomaines } = useDonnees(
    () => api.rpc('cockpit_domaines', { p_etablissement_id: etablissement.id }),
    [etablissement.id]
  );
  const connu = domaine && domaines?.some((d) => d.id === domaine);
  return (
    <div className="page cockpit">
      <Erreur message={erreurDomaines} />
      {domaines && domaines.length > 1 && <OngletsDomaines domaines={domaines} actif={connu ? domaine : null} naviguer={naviguer} />}
      {domaines && (connu
        ? <VueDomaine domaine={domaine} titre={domaines.find((d) => d.id === domaine).titre} f={f} naviguer={naviguer} />
        : <VueGlobale domaines={domaines} f={f} naviguer={naviguer} />)}
      {!domaines && !erreurDomaines && <Squelette lignes={6} />}
    </div>
  );
}

function OngletsDomaines({ domaines, actif, naviguer }) {
  return (
    <nav className="cockpit-onglets" aria-label="Tableaux de bord">
      <button type="button" className={!actif ? 'actif' : ''} aria-current={!actif ? 'page' : undefined} onClick={() => naviguer('tableau-de-bord')}>
        <Icone nom="tableau" taille={15} /> Vue d’ensemble
      </button>
      {domaines.map((d) => (
        <button key={d.id} type="button" className={actif === d.id ? 'actif' : ''} aria-current={actif === d.id ? 'page' : undefined} onClick={() => naviguer(`tableau-de-bord/${d.id}`)}>
          <Icone nom={DOMAINES[d.id]?.icone ?? 'tableau'} taille={15} /> {d.titre}
        </button>
      ))}
    </nav>
  );
}

function portee(espace, f) {
  const { multiHub, hubs, etablissement } = espace;
  const nom = etablissement.marque?.documents?.nom_commercial ?? etablissement.nom;
  if (!multiHub) return nom;
  return `${nom} · ${hubs.find((h) => h.id === f.hubId)?.nom ?? 'Tous les Hubs'}`;
}

function VueGlobale({ domaines, f, naviguer }) {
  const espace = useEspace();
  const { api, etablissement } = espace;
  const { donnees: c, chargement, erreur } = useDonnees(
    () => api.rpc('cockpit_etablissement', { p_etablissement_id: etablissement.id, p_du: f.du, p_au: f.au, p_filtres: f.filtres }),
    [etablissement.id, f.cle]
  );
  const extras = c ? widgetsAccessibles(espace, 'section', { cockpit: c, du: f.du, au: f.au }) : [];
  const principaux = (c?.domaines ?? []).flatMap((d) => d.kpis.slice(0, 1).map((k) => ({ ...k, cle: `${d.id}.${k.cle}`, libelle: domaines.length > 1 ? `${k.libelle} · ${d.titre}` : k.libelle }))).slice(0, 4);
  return (
    <>
      <PageHeader titre="Tableau de bord" sousTitre={portee(espace, f)} actions={<ActionsRapides domaines={domaines.map((d) => d.id)} naviguer={naviguer} limite={3} />} />
      <BarrePeriode f={f} />
      {chargement && !c && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {c && (
        <>
          {c.erreurs?.length > 0 && <p className="texte-doux">Certaines informations n’ont pas pu être chargées : {c.erreurs.join(', ')}.</p>}
          {domaines.length === 0 && <EmptyState icone="tableau" titre="Aucun indicateur pour vos applications" texte="Les indicateurs apparaissent avec les applications activées et vos droits." />}
          {principaux.length > 0 && <div className="kpis kpis-hero">{principaux.map((k, i) => <Kpi key={k.cle} kpi={k} naviguer={naviguer} mis_en_avant={i === 0} />)}</div>}
          <div className="cockpit-grille">
            <ASurveiller elements={c.attention} naviguer={naviguer} avecModule={domaines.length > 1} />
            <Activite elements={c.activite} naviguer={naviguer} avecModule={domaines.length > 1} />
          </div>
          {c.tendance && <Graphique g={c.tendance} naviguer={naviguer} />}
          {c.domaines.length > 0 && (
            <div className="cockpit-domaines">
              {c.domaines.map((d) => (
                <section key={d.id} className="carte cockpit-domaine">
                  <div className="titre-ligne">
                    <h2><Icone nom={DOMAINES[d.id]?.icone ?? 'tableau'} taille={16} /> {d.titre}</h2>
                    {d.attention > 0 && <Badge ton="attention">{d.attention} à surveiller</Badge>}
                  </div>
                  <GrilleKpis kpis={d.kpis} naviguer={naviguer} max={3} />
                  {d.kpis.length === 0 && <p className="texte-doux">Rien sur la période.</p>}
                  <Bouton icone="chevron" onClick={() => naviguer(`tableau-de-bord/${d.id}`)}>Tableau {d.titre}</Bouton>
                </section>
              ))}
            </div>
          )}
          {extras.map((w) => { const W = w.composant; return <W key={w.id} cockpit={c} espace={espace} naviguer={naviguer} />; })}
        </>
      )}
    </>
  );
}

function VueDomaine({ domaine, titre, f, naviguer }) {
  const espace = useEspace();
  const { api, etablissement } = espace;
  const { donnees: d, chargement, erreur } = useDonnees(
    () => api.rpc(`cockpit_${domaine}`, { p_etablissement_id: etablissement.id, p_du: f.du, p_au: f.au, p_filtres: f.filtres }),
    [etablissement.id, domaine, f.cle]
  );
  const vide = d && !d.kpis.length && !d.attention.length;
  return (
    <>
      <PageHeader titre={`Tableau ${titre}`} sousTitre={DOMAINES[domaine]?.sousTitre ?? portee(espace, f)} actions={<ActionsRapides domaines={[domaine]} naviguer={naviguer} limite={2} />} />
      <BarrePeriode f={f} filtresAvances={domaine === 'commerce'} />
      {chargement && !d && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {vide && <EmptyState icone="tableau" titre="Pas encore de données" texte="Les indicateurs apparaîtront dès les premières opérations." />}
      {d && !vide && (
        <>
          <GrilleKpis kpis={d.kpis} naviguer={naviguer} />
          {d.periode && d.periode.comparable === false && d.periode.du_precedent && (
            <p className="texte-faible cockpit-note">Pas de comparaison : la période précédente n’a pas assez de données.</p>
          )}
          <div className="cockpit-grille">
            <ASurveiller elements={d.attention} naviguer={naviguer} />
            <section className="carte">
              <div className="titre-ligne"><h2>Actions rapides</h2></div>
              <ActionsRapides domaines={[domaine]} naviguer={naviguer} />
            </section>
          </div>
          {d.graphiques.map((g) => <Graphique key={g.cle} g={g} naviguer={naviguer} />)}
          {(d.listes.length > 0 || d.activite.length > 0) && (
            <div className="cockpit-colonnes">
              {d.listes.map((l) => <ListeCockpit key={l.cle} liste={l} naviguer={naviguer} />)}
              <Activite elements={d.activite} naviguer={naviguer} />
            </div>
          )}
        </>
      )}
    </>
  );
}
