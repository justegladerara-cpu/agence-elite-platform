// Pages d'analyse du Tableau de bord (Juste, 2026-10-24) : un clic sur « Chiffre d'affaires », « Encaissé »,
// « Ventes », « Panier moyen », « Caisses ouvertes », « Articles en rupture » ou « Stock sous le minimum » ouvre une
// page qui explique ce chiffre (petites cartes, graphiques, phrases simples, comparaison) au lieu de la liste des
// ventes. La liste reste à un clic (« Voir la liste des ventes »). Lecture seule.
import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
import { Bouton, EmptyState, Erreur, GraphiqueBarres, Icone, PageHeader, Squelette } from '../../ui/composants.jsx';
import { lireCompteMaison } from '../caisse/OffertsPertes.jsx';
import { jourDeService } from '../cloture/rapportDuSoir.js';
import { regrouper } from '../ventes/regroupement.js';
import { Barres, CarteChaleur, Fleche, ListeArticles, Points, Repartition, Retenir, useAnalyse } from './Analyses.jsx';
import { JOURS } from './analyses.js';
import {
  articlesAStock, clientsQuiReviennent, contenuPanier, dureeEnMots, heureCourte, minutesDepuis, partsArgent, routeZoom,
  trancheFrequente, tranchesPaniers,
} from './zoom.js';
import './zoom.css';

const TITRES = {
  chiffre: ['Total des ventes', 'Tout ce qui a été vendu : combien, quand, quoi, par qui'],
  encaisse: ['Argent reçu', 'L’argent vraiment entré : espèces, Mobile Money… et ce qui manque encore'],
  ventes: ['Les ventes', 'Combien de ventes, qui a le plus vendu, à quelle heure'],
  paniers: ['Les paniers', 'Chaque client = un panier : combien il a dépensé, ce qu’il a pris, qui l’a servi'],
  caisses: ['Les caisses', 'Qui tient la caisse, depuis quand, combien elle a encaissé'],
  ruptures: ['Articles en rupture', 'Plus rien en stock : à commander ou à vérifier'],
  'stock-bas': ['Stock sous le minimum', 'Il en reste un peu : à commander bientôt'],
};

const PERIODES_ZOOM = [['jour', 'Aujourd’hui'], ['hier', 'Hier'], ['7', '7 jours'], ['30', '30 jours']];

function bornesZoom(choix, jour) {
  const d = (x) => { const t = new Date(`${jour}T12:00:00`); t.setDate(t.getDate() + x); return dateLocale(Math.round((t - new Date(`${dateLocale(0)}T12:00:00`)) / 86400000)); };
  if (choix === 'hier') return [d(-1), d(-1)];
  if (choix === '7') return [d(-6), jour];
  if (choix === '30') return [d(-29), jour];
  return [jour, jour];
}

function periodeInitiale(p, jour) {
  const du = p.get('du');
  const au = p.get('au') ?? du;
  if (!du) return { choix: 'jour', du: jour, au: jour };
  for (const [id] of PERIODES_ZOOM) {
    const [x, y] = bornesZoom(id, jour);
    if (x === du && y === au) return { choix: id, du, au };
  }
  return { choix: 'perso', du, au };
}

export default function Zoom({ type, naviguer }) {
  const { reglagesFonctions, etablissement } = useEspace();
  const jour = jourDeService(reglagesFonctions);
  const [periode, setPeriode] = useState(() => periodeInitiale(lireParametres(), jour));
  const choisir = (id) => {
    const [du, au] = bornesZoom(id, jour);
    setPeriode({ choix: id, du, au });
  };
  const [titre, sousTitre] = TITRES[type] ?? ['Détail', ''];
  const nom = etablissement.marque?.documents?.nom_commercial ?? etablissement.nom;
  const surPeriode = !['ruptures', 'stock-bas'].includes(type);
  const periodeTexte = periode.du === periode.au ? formatDate(periode.du) : `du ${formatDate(periode.du)} au ${formatDate(periode.au)}`;
  return (
    <div className="page zoom">
      <button type="button" className="zoom-retour" onClick={() => naviguer('tableau-de-bord')}>
        <Icone nom="retour" taille={16} /> Tableau de bord
      </button>
      <PageHeader titre={titre} sousTitre={`${sousTitre} · ${nom}`} />
      {surPeriode && (
        <div className="zoom-periodes" role="group" aria-label="Période">
          {PERIODES_ZOOM.map(([id, libelle]) => (
            <button key={id} type="button" className={periode.choix === id ? 'actif' : ''} aria-pressed={periode.choix === id} onClick={() => choisir(id)}>{libelle}</button>
          ))}
          <span className="texte-doux zoom-periode-texte">{periodeTexte}</span>
        </div>
      )}
      {type === 'chiffre' && <ZoomChiffre du={periode.du} au={periode.au} naviguer={naviguer} />}
      {type === 'encaisse' && <ZoomEncaisse du={periode.du} au={periode.au} naviguer={naviguer} />}
      {type === 'ventes' && <ZoomVentes du={periode.du} au={periode.au} naviguer={naviguer} />}
      {type === 'paniers' && <ZoomPaniers du={periode.du} au={periode.au} naviguer={naviguer} />}
      {type === 'caisses' && <ZoomCaisses du={periode.du} au={periode.au} naviguer={naviguer} />}
      {(type === 'ruptures' || type === 'stock-bas') && <ZoomStock etat={type === 'ruptures' ? 'ruptures' : 'bas'} naviguer={naviguer} />}
      {!TITRES[type] && <EmptyState icone="tableau" titre="Page inconnue" texte="Revenez au tableau de bord." />}
    </div>
  );
}

// Grande carte du chiffre principal, avec la flèche de comparaison et une phrase.
function Vedette({ libelle, valeur, k, phrase, ton }) {
  return (
    <section className={`carte zoom-vedette ${ton ?? ''}`}>
      <span className="analyse-etiquette">{libelle}</span>
      <strong className="zoom-vedette-valeur">{valeur}</strong>
      {k?.variation != null && <span className="zoom-vedette-comparaison"><Fleche k={k} /> {k.comparaisonTexte}</span>}
      {phrase && <p className="zoom-vedette-phrase">{phrase}</p>}
    </section>
  );
}

function Petite({ icone, libelle, valeur, detail, ton, onClick }) {
  const Balise = onClick ? 'button' : 'div';
  return (
    <Balise type={onClick ? 'button' : undefined} className={`zoom-petite ${ton ?? ''} ${onClick ? 'cliquable' : ''}`} onClick={onClick}>
      <span className="zoom-petite-tete">{icone && <Icone nom={icone} taille={15} />} {libelle}</span>
      <strong>{valeur}</strong>
      {detail && <small>{detail}</small>}
    </Balise>
  );
}

function Chargement({ chargement, erreur, a }) {
  return (
    <>
      <Erreur message={erreur} />
      {chargement && !a && <Squelette lignes={8} />}
    </>
  );
}

const avecComparaison = (k, a) => (k ? { ...k, comparaisonTexte: a.periode.comparaison } : k);

function BoutonListe({ naviguer, du, au, extra = '' }) {
  return (
    <div className="zoom-pied">
      <Bouton icone="ventes" onClick={() => naviguer(`ventes?du=${du}&au=${au}${extra}`)}>Voir la liste des ventes</Bouton>
    </div>
  );
}

// --- Total des ventes (chiffre d'affaires) ----------------------------------------------------------------------
function ZoomChiffre({ du, au, naviguer }) {
  const { montant } = useEspace();
  const { a, chargement, erreur } = useAnalyse(du, au, {});
  if (!a) return <Chargement chargement={chargement} erreur={erreur} a={a} />;
  if (!a.kpis[1].valeur) return <EmptyState icone="ventes" titre="Aucune vente sur ces dates" texte="Choisissez une autre période." />;
  const [ca, tickets, panier, marge, remises, annulations] = a.kpis;
  const p = a.prevision;
  const top = a.categories[0];
  const phrase = [
    a.meilleureHeure && `C’est à ${a.meilleureHeure.heure} h que vous vendez le plus (${montant(a.meilleureHeure.chiffre)}).`,
    top && `${top.libelle} rapporte le plus : ${top.part} % des ventes.`,
    p?.fin != null && `Si ça continue comme ça : environ ${montant(p.fin)} à la fin du service.`,
  ].filter(Boolean).join(' ');
  return (
    <>
      <div className="zoom-haut">
        <Vedette libelle="Total des ventes" valeur={montant(ca.valeur)} k={avecComparaison(ca, a)} phrase={phrase} />
        <div className="zoom-petites">
          <Petite icone="ventes" libelle="Nombre de ventes" valeur={formatQuantite(tickets.valeur)} detail={tickets.detail} onClick={() => naviguer(routeZoom('ventes', du, au))} />
          <Petite icone="panier" libelle="Dépense moyenne par client" valeur={montant(panier.valeur)} onClick={() => naviguer(routeZoom('paniers', du, au))} />
          <Petite icone="graphique" libelle="Bénéfice sur les produits" valeur={marge.valeur == null ? 'Pas calculé' : montant(marge.valeur)} detail={marge.detail} />
          <Petite icone="etoile" libelle="Réductions données" valeur={montant(remises.valeur)} />
          <Petite icone="fermer" libelle="Ventes annulées" valeur={formatQuantite(annulations.valeur)} detail={annulations.detail} ton={annulations.valeur ? 'attention' : ''} />
          {p && <Petite icone="horloge" libelle={p.fin != null ? 'Prévu à la fin du service' : 'D’habitude ce jour-là'} valeur={`≈ ${montant(p.fin ?? p.habituel)}`} detail={p.rush ? `Beaucoup de clients vers ${p.rush.heure} h` : null} />}
        </div>
      </div>
      <Barres titre="Heure par heure" sousTitre={a.meilleureHeure ? `Meilleure heure : ${a.meilleureHeure.heure} h. ${a.creux ? `Heures calmes : ${a.creux.de} h – ${a.creux.a} h.` : ''}` : null}
        donnees={a.heures.map((h) => ({ libelle: `${h.heure}h`, valeur: h.chiffre, titre: `${h.heure} h : ${montant(h.chiffre)} · ${h.tickets} vente(s)` }))} />
      {a.jours.length > 1 && (
        <Barres titre="Jour par jour" sousTitre={`En moyenne ${montant(a.moyenneJour)} par jour.`}
          donnees={a.jours.map((j) => ({ libelle: `${j.jour.slice(8, 10)}/${j.jour.slice(5, 7)}`, valeur: j.chiffre, titre: `${formatDate(j.jour)} : ${montant(j.chiffre)}` }))} />
      )}
      <div className="analyse-deux">
        <Repartition titre="Ce qui rapporte, par rayon" lignes={a.categories.map((c) => ({ libelle: c.libelle, valeur: c.chiffre, part: c.part }))} />
        <ListeArticles titre="Les 5 produits qui rapportent le plus" lignes={a.top.slice(0, 5)} valeur={(l) => montant(l.chiffre)} detail={(l) => `${formatQuantite(l.quantite)} vendu(s) · ${l.part} %`} />
      </div>
      <div className="analyse-deux">
        <Repartition titre="Qui a vendu" lignes={a.equipe.map((e) => ({ libelle: e.nom, valeur: e.chiffre, texte: `${montant(e.chiffre)} · ${e.tickets} vente(s)` }))} vide={a.portee.tous ? 'Aucune vente.' : null} />
        <Points a={a} />
      </div>
      {a.periode.jours >= 7 && <CarteChaleur a={a} />}
      <BoutonListe naviguer={naviguer} du={du} au={au} />
    </>
  );
}

// --- Argent reçu (encaissé) --------------------------------------------------------------------------------------
function ZoomEncaisse({ du, au, naviguer }) {
  const { api, etablissement, montant } = useEspace();
  const { a, chargement, erreur } = useAnalyse(du, au, {});
  const { donnees: maison } = useDonnees(() => lireCompteMaison(api, etablissement.id, du, au), [etablissement.id, du, au]);
  if (!a) return <Chargement chargement={chargement} erreur={erreur} a={a} />;
  if (a.encaisse == null) return <EmptyState icone="alerte" titre="Pas d’accès aux paiements" texte="Demandez le droit de voir les paiements." />;
  const vendu = a.kpis[0].valeur;
  const totalMaison = (maison ?? []).reduce((t, m) => t + Number(m.montant), 0);
  const z = a.ticketZ;
  const k = { cle: 'encaisse', valeur: a.encaisse, variation: a.encaisseP ? Math.round(((a.encaisse - a.encaisseP) / a.encaisseP) * 100) : null, comparaisonTexte: a.periode.comparaison };
  k.favorable = k.variation == null || k.variation === 0 ? null : k.variation > 0;
  const parts = partsArgent({ vendu, encaisse: a.encaisse, attente: z.credit, maison: totalMaison });
  const especes = a.paiements.find((x) => x.mode === 'especes');
  const phrase = [
    vendu > 0 && `Sur ${montant(vendu)} vendus, ${montant(a.encaisse)} sont entrés en caisse.`,
    z.credit > 0 && `${montant(z.credit)} ne sont pas encore payés.`,
    especes && `${especes.part} % en espèces.`,
    z.ecart != null && z.ecart !== 0 && `Attention : ${z.ecart < 0 ? `il manque ${montant(-z.ecart)}` : `${montant(z.ecart)} en trop`} à la fermeture des caisses.`,
  ].filter(Boolean).join(' ');
  return (
    <>
      <div className="zoom-haut">
        <Vedette libelle="Argent reçu" valeur={montant(a.encaisse)} k={k} phrase={phrase} ton="vert" />
        <div className="zoom-petites">
          {a.paiements.map((p) => <Petite key={p.mode} icone={p.mode === 'especes' ? 'caisse' : p.mode === 'mobile_money' ? 'message' : 'facture'} libelle={MODES_PAIEMENT[p.mode] ?? p.libelle} valeur={montant(p.montant)} detail={`${p.part} % de l’argent reçu`} />)}
          <Petite icone="horloge" libelle="Pas encore payé" valeur={montant(z.credit)} ton={z.credit > 0 ? 'attention' : ''} detail={z.credit > 0 ? 'Voir qui doit payer' : 'Tout est payé'} onClick={z.credit > 0 ? () => naviguer('qui-me-doit') : undefined} />
          <Petite icone="etoile" libelle="Compte de la maison" valeur={montant(totalMaison)} detail={`${(maison ?? []).length} vente(s) offertes par le patron`} />
          {z.remboursements > 0 && <Petite icone="retour" libelle="Remboursé aux clients" valeur={montant(z.remboursements)} />}
          {a.depenses != null && <Petite icone="depenses" libelle="Dépenses de la période" valeur={montant(a.depenses)} onClick={() => naviguer('depenses')} />}
          {z.ecart != null && <Petite icone="alerte" libelle="Écart à la fermeture des caisses" valeur={z.ecart === 0 ? 'Aucun' : z.ecart < 0 ? `− ${montant(-z.ecart)}` : `+ ${montant(z.ecart)}`} ton={z.ecart ? 'alerte' : 'bon'} detail={`${z.nombreZ} ticket(s) Z`} onClick={() => naviguer('z-et-rapports/z')} />}
        </div>
      </div>
      <section className="carte">
        <div className="titre-ligne"><h2>Vendu, reçu, pas encore payé</h2></div>
        <p className="texte-doux analyse-phrase">Sur 100 F vendus, combien sont entrés en caisse ?</p>
        <ul className="zoom-parts">
          {parts.map((x) => (
            <li key={x.cle} className={`zoom-part ${x.cle}`}>
              <span className="zoom-part-libelle">{x.libelle}</span>
              <span className="zoom-part-barre" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(x.valeur > 0 ? 2 : 0, x.part))}%` }} /></span>
              <span className="zoom-part-valeur">{montant(x.valeur)} <small>{x.part} %</small></span>
            </li>
          ))}
        </ul>
      </section>
      <div className="analyse-deux">
        <Repartition titre="Comment les clients paient" lignes={a.paiements.map((p) => ({ libelle: p.libelle, valeur: p.montant, part: p.part }))} vide="Aucun paiement sur ces dates." />
        {a.depensesCategories.length > 0
          ? <Repartition titre="Où est parti l’argent (dépenses)" lignes={a.depensesCategories.map((d) => ({ libelle: d.categorie ?? d.libelle ?? 'Divers', valeur: Number(d.montant ?? d.total ?? 0) }))} />
          : <Points a={a} />}
      </div>
      <div className="zoom-pied">
        <Bouton icone="cloture" onClick={() => naviguer('z-et-rapports/z')}>Voir les tickets Z</Bouton>
        <Bouton icone="ventes" onClick={() => naviguer(`ventes?du=${du}&au=${au}`)}>Voir la liste des ventes</Bouton>
      </div>
    </>
  );
}

// Ventes de la période (lecture directe, jour de l'appareil) : pour les serveurs, les paniers, les clients.
function useVentesPeriode(du, au, avecLignes = false) {
  const { api, etablissement } = useEspace();
  return useDonnees(async () => {
    const [ventes, essais, contacts] = await Promise.all([
      api.lire('ventes', {
        eq: { etablissement_id: etablissement.id, statut: 'validee' },
        gte: { cree_le: new Date(`${du}T00:00:00`).toISOString() }, lte: { cree_le: new Date(`${au}T23:59:59.999`).toISOString() },
        ordre: ['cree_le', 'desc'], limite: 2000,
      }),
      api.lire('ventes_essais', { eq: { etablissement_id: etablissement.id }, colonnes: ['vente_id'] }).catch(() => []),
      api.lire('contacts', { eq: { etablissement_id: etablissement.id }, colonnes: ['id', 'nom'] }).catch(() => []),
    ]);
    const exclues = new Set((essais ?? []).map((e) => e.vente_id));
    const liste = ventes.filter((v) => !exclues.has(v.id));
    let lignes = {};
    if (avecLignes && liste.length) {
      const ids = liste.slice(0, 400).map((v) => v.id);
      const paquets = [];
      for (let i = 0; i < ids.length; i += 80) paquets.push(ids.slice(i, i + 80));
      const toutes = (await Promise.all(paquets.map((x) => api.lire('lignes_vente', { dans: { vente_id: x }, colonnes: ['vente_id', 'libelle', 'quantite', 'total'] }).catch(() => [])))).flat();
      lignes = toutes.reduce((m, l) => { (m[l.vente_id] ??= []).push(l); return m; }, {});
    }
    return { ventes: liste, lignes, contacts: Object.fromEntries((contacts ?? []).map((c) => [c.id, c.nom])) };
  }, [etablissement.id, du, au, avecLignes]);
}

// --- Les ventes ----------------------------------------------------------------------------------------------------
function ZoomVentes({ du, au, naviguer }) {
  const { montant } = useEspace();
  const { a, chargement, erreur } = useAnalyse(du, au, {});
  const { donnees: v } = useVentesPeriode(du, au);
  if (!a) return <Chargement chargement={chargement} erreur={erreur} a={a} />;
  const tickets = a.kpis[1];
  if (!tickets.valeur) return <EmptyState icone="ventes" titre="Aucune vente sur ces dates" texte="Choisissez une autre période." />;
  const meilleur = a.equipe[0];
  const serveurs = v ? regrouper(v.ventes, 'serveur').filter((g) => g.cle) : [];
  const phrase = [
    meilleur && `${meilleur.nom} a fait le plus de ventes : ${meilleur.tickets} pour ${montant(meilleur.chiffre)}.`,
    serveurs[0] && `Meilleur serveur : ${serveurs[0].libelle} (${montant(serveurs[0].total)}).`,
    a.annulations.length > 0 && `${a.annulations.length} vente(s) annulée(s).`,
  ].filter(Boolean).join(' ');
  return (
    <>
      <div className="zoom-haut">
        <Vedette libelle="Nombre de ventes" valeur={formatQuantite(tickets.valeur)} k={avecComparaison(tickets, a)} phrase={phrase} />
        <div className="zoom-petites">
          <Petite icone="ventes" libelle="Total vendu" valeur={montant(a.kpis[0].valeur)} onClick={() => naviguer(routeZoom('chiffre', du, au))} />
          <Petite icone="panier" libelle="Dépense moyenne" valeur={montant(a.kpis[2].valeur)} onClick={() => naviguer(routeZoom('paniers', du, au))} />
          <Petite icone="articles" libelle="Produits par vente" valeur={formatQuantite(Math.round(a.articlesParTicket * 10) / 10)} />
          <Petite icone="fermer" libelle="Annulées" valeur={formatQuantite(a.kpis[5].valeur)} ton={a.kpis[5].valeur ? 'attention' : ''} detail={a.tardives.length ? `${a.tardives.length} annulée(s) en retard` : null} />
        </div>
      </div>
      <section className="carte">
        <div className="titre-ligne"><h2>Classement des caissières</h2></div>
        {a.equipe.length === 0 ? <p className="texte-doux">Aucune vente.</p> : (
          <ol className="zoom-podium">
            {a.equipe.map((e, i) => (
              <li key={e.id} className={i === 0 ? 'premier' : ''}>
                <button type="button" onClick={() => naviguer(`ventes?du=${du}&au=${au}&vendeur=${e.id}`)}>
                  <span className="zoom-podium-rang">{i === 0 ? <Icone nom="etoile" taille={16} /> : i + 1}</span>
                  <strong>{e.nom}</strong>
                  <span className="zoom-podium-chiffre">{montant(e.chiffre)}</span>
                  <small>{e.tickets} vente(s) · {montant(e.panier)} par client{e.annulations ? ` · ${e.annulations} annulée(s)` : ''}</small>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
      {serveurs.length > 0 && (
        <section className="carte">
          <div className="titre-ligne"><h2>Classement des serveurs</h2></div>
          <ol className="zoom-podium">
            {serveurs.slice(0, 12).map((g, i) => (
              <li key={g.cle} className={i === 0 ? 'premier' : ''}>
                <button type="button" onClick={() => naviguer(`ventes?du=${du}&au=${au}&q=${encodeURIComponent(g.libelle)}`)}>
                  <span className="zoom-podium-rang">{i === 0 ? <Icone nom="etoile" taille={16} /> : i + 1}</span>
                  <strong>{g.libelle}</strong>
                  <span className="zoom-podium-chiffre">{montant(g.total)}</span>
                  <small>{g.nombre} vente(s) · {montant(Math.round(g.total / g.nombre))} par client</small>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <Barres titre="Nombre de ventes heure par heure" sousTitre={a.meilleureHeure ? `Le plus de clients vers ${a.heures.reduce((m, h) => (h.tickets > m.tickets ? h : m)).heure} h.` : null}
        donnees={a.heures.map((h) => ({ libelle: `${h.heure}h`, valeur: h.tickets, titre: `${h.heure} h : ${h.tickets} vente(s) · ${montant(h.chiffre)}` }))} />
      <div className="analyse-deux">
        <section className="carte">
          <div className="titre-ligne"><h2>Ventes annulées</h2></div>
          {a.annulations.length === 0 ? <p className="cockpit-rien"><Icone nom="coche" /> Aucune vente annulée.</p> : (
            <ul className="cockpit-liste">
              {a.annulations.slice(0, 10).map((x) => (
                <li key={x.numero}>
                  <div className="analyse-annulation">
                    <span><strong>{x.numero} · {x.par ?? '—'}</strong><small>{formatDateHeure(x.quand)} · {x.motif ?? 'sans raison'}{x.tardive ? ' · annulée plus de 30 min après' : ''}</small></span>
                    <span className="cockpit-liste-valeur">{montant(x.montant)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Retenir a={a} />
      </div>
      <BoutonListe naviguer={naviguer} du={du} au={au} />
    </>
  );
}

// --- Les paniers ---------------------------------------------------------------------------------------------------
function ZoomPaniers({ du, au, naviguer }) {
  const { montant } = useEspace();
  const { a, chargement, erreur } = useAnalyse(du, au, {});
  const { donnees: v, chargement: chargementVentes } = useVentesPeriode(du, au, true);
  const [tous, setTous] = useState(false);
  if (!a) return <Chargement chargement={chargement} erreur={erreur} a={a} />;
  const panier = a.kpis[2];
  if (!a.kpis[1].valeur) return <EmptyState icone="panier" titre="Aucun panier sur ces dates" texte="Choisissez une autre période." />;
  const ventes = v?.ventes ?? [];
  const tranches = tranchesPaniers(ventes);
  const frequente = trancheFrequente(tranches);
  const tries = [...ventes].sort((x, y) => Number(y.total) - Number(x.total));
  const plusGros = tries[0];
  const fideles = clientsQuiReviennent(ventes, (id) => v?.contacts[id]);
  const visibles = tous ? tries : tries.slice(0, 24);
  const phrase = [
    frequente && `La plupart des clients dépensent ${frequente.libelle.toLowerCase()} F (${frequente.nombre} panier(s)).`,
    plusGros && `Le plus gros panier : ${montant(plusGros.total)}${plusGros.servi_par ? `, servi par ${plusGros.servi_par}` : ''}.`,
    a.paires[0] && `Souvent pris ensemble : ${a.paires[0].a} + ${a.paires[0].b}.`,
  ].filter(Boolean).join(' ');
  return (
    <>
      <div className="zoom-haut">
        <Vedette libelle="Dépense moyenne par client" valeur={montant(panier.valeur)} k={avecComparaison(panier, a)} phrase={phrase} />
        <div className="zoom-petites">
          <Petite icone="panier" libelle="Nombre de paniers" valeur={formatQuantite(a.kpis[1].valeur)} />
          <Petite icone="articles" libelle="Produits par panier" valeur={formatQuantite(Math.round(a.articlesParTicket * 10) / 10)} />
          {plusGros && <Petite icone="etoile" libelle="Plus gros panier" valeur={montant(plusGros.total)} detail={heureCourte(plusGros.cree_le)} />}
          <Petite icone="clients" libelle="Clients qui reviennent" valeur={formatQuantite(fideles.length)} detail={fideles.length ? 'venus 2 fois ou plus' : 'clients sans nom : impossible à savoir'} />
        </div>
      </div>
      <Barres titre="Combien dépensent les clients" sousTitre="Nombre de paniers dans chaque tranche de prix"
        donnees={tranches.map((t) => ({ libelle: t.libelle.replace(' 000', 'k').replace(' 000', 'k'), valeur: t.nombre, titre: `${t.libelle} F : ${t.nombre} panier(s), ${montant(t.total)}` }))} />
      <section className="carte">
        <div className="titre-ligne"><h2>Les paniers, du plus gros au plus petit</h2><span className="texte-doux">{ventes.length} panier(s)</span></div>
        {chargementVentes && !v && <Squelette lignes={4} />}
        <div className="zoom-paniers">
          {visibles.map((x) => (
            <button key={x.id} type="button" className="zoom-panier" onClick={() => naviguer(`ventes/${x.id}`)}>
              <span className="zoom-panier-tete"><Icone nom="panier" taille={16} /><strong>{montant(x.total)}</strong></span>
              <span className="zoom-panier-contenu">{contenuPanier(v.lignes[x.id]) || x.numero}</span>
              <small>{heureCourte(x.cree_le)}{x.servi_par ? ` · servi par ${x.servi_par}` : ''}{x.contact_id && v.contacts[x.contact_id] ? ` · ${v.contacts[x.contact_id]}` : ''}</small>
            </button>
          ))}
        </div>
        {tries.length > 24 && <div className="zoom-pied"><Bouton onClick={() => setTous(!tous)}>{tous ? 'Voir moins' : `Voir les ${tries.length} paniers`}</Bouton></div>}
      </section>
      <div className="analyse-deux">
        {a.paires.length > 0
          ? <ListeArticles titre="Souvent pris ensemble" lignes={a.paires.map((p) => ({ libelle: `${p.a} + ${p.b}`, nombre: p.nombre }))} valeur={(l) => `${l.nombre} fois`} detail={() => 'Idée : les proposer ensemble'} />
          : <section className="carte"><div className="titre-ligne"><h2>Souvent pris ensemble</h2></div><p className="texte-doux">Pas encore assez de paniers pour le dire.</p></section>}
        <section className="carte">
          <div className="titre-ligne"><h2>Clients qui reviennent</h2></div>
          {fideles.length === 0 ? (
            <p className="texte-doux">Les ventes sont faites sans nom de client. Pour reconnaître ceux qui reviennent, choisissez le client à la caisse (son numéro suffit) ou faites-le s’inscrire sur la page du QR code.</p>
          ) : (
            <ol className="analyse-classement">
              {fideles.slice(0, 10).map((c, i) => (
                <li key={c.id}>
                  <span className="analyse-rang">{i + 1}</span>
                  <span className="analyse-classement-nom"><strong>{c.nom}</strong><small>{c.visites} passage(s) · {c.jours} jour(s) différent(s)</small></span>
                  <span className="analyse-classement-valeur">{montant(c.total)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <Repartition titre="Dépense moyenne selon l’heure" lignes={a.heures.filter((h) => h.tickets).map((h) => ({ libelle: `${h.heure} h`, valeur: h.panier }))} />
    </>
  );
}

// --- Les caisses ---------------------------------------------------------------------------------------------------
function ZoomCaisses({ du, au, naviguer }) {
  const { api, etablissement, montant, peut } = useEspace();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [ouvertes, activite, z] = await Promise.all([
      api.rpc('caisses_ouvertes', { p_etablissement_id: etablissement.id }).catch(() => []),
      api.rpc('activite_caissiers', { p_etablissement_id: etablissement.id, p_du: du, p_au: au }).catch(() => []),
      api.rpc('tickets_z', { p_etablissement_id: etablissement.id, p_limite: 200 }).catch(() => []),
    ]);
    return { ouvertes: ouvertes ?? [], activite: activite ?? [], z: (z ?? []).filter((x) => { const j = dateLocale(Math.round((new Date(x.cloturee_le) - new Date()) / 86400000)); return j >= du && j <= au; }) };
  }, [etablissement.id, du, au]);
  if (!donnees) return <><Erreur message={erreur} />{chargement && <Squelette lignes={6} />}</>;
  const parPersonne = Object.fromEntries(donnees.activite.map((x) => [x.id, x]));
  const maintenant = Date.now();
  return (
    <>
      <section className="carte">
        <div className="titre-ligne"><h2>Caisses ouvertes maintenant</h2><span className="onglet-compteur">{donnees.ouvertes.length}</span></div>
        {donnees.ouvertes.length === 0 ? <p className="cockpit-rien"><Icone nom="coche" /> Aucune caisse ouverte en ce moment.</p> : (
          <div className="zoom-caisses">
            {donnees.ouvertes.map((s) => {
              const act = parPersonne[s.ouverte_par];
              const calme = minutesDepuis(act?.derniere_vente, maintenant);
              const longue = calme != null && calme >= 45;
              return (
                <article key={s.id} className={`zoom-caisse ${longue ? 'calme' : ''}`}>
                  <header><span className="analyse-pastille" aria-hidden="true" /><strong>{s.caissier}</strong><span className="texte-doux">{s.point_de_vente}</span></header>
                  <dl>
                    <div><dt>Ouverte</dt><dd>{formatDateHeure(s.ouverte_le)}</dd></div>
                    <div><dt>Depuis</dt><dd>{dureeEnMots(minutesDepuis(s.ouverte_le, maintenant))}</dd></div>
                    <div><dt>Encaissé dans cette caisse</dt><dd>{act?.caisse_en_cours != null ? montant(act.caisse_en_cours) : '—'}</dd></div>
                    <div><dt>Ventes</dt><dd>{act?.nombre_en_cours ?? '—'}</dd></div>
                    <div><dt>Dernière vente</dt><dd>{act?.derniere_vente ? `il y a ${dureeEnMots(calme)}` : 'aucune'}</dd></div>
                  </dl>
                  {longue && <p className="zoom-caisse-alerte"><Icone nom="alerte" taille={15} /> Plus de vente depuis {dureeEnMots(calme)} : {s.caissier} est peut-être partie. À la prochaine vente, la caisse demandera « Est-ce toujours toi ? ».</p>}
                  {peut('cloture.cloturer') && !s.mienne && <Bouton icone="caisse" onClick={() => naviguer(`caisse?entrer=${s.id}`)}>Entrer dans cette caisse</Bouton>}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="carte">
        <div className="titre-ligne"><h2>Caisses fermées sur la période</h2><span className="onglet-compteur">{donnees.z.length}</span></div>
        {donnees.z.length === 0 ? <p className="texte-doux">Aucune caisse fermée sur ces dates.</p> : (
          <div className="tableau-conteneur">
            <table className="tableau cliquable">
              <thead><tr><th>Ticket Z</th><th>Qui</th><th>Ouverte</th><th>Fermée</th><th className="nombre">Ventes</th><th className="nombre">Écart</th></tr></thead>
              <tbody>
                {donnees.z.map((z) => (
                  <tr key={z.id} onClick={() => naviguer('z-et-rapports/z')}>
                    <td><strong>{z.numero}</strong></td>
                    <td>{z.caissier}</td>
                    <td>{formatDateHeure(z.ouverte_le)}</td>
                    <td>{formatDateHeure(z.cloturee_le)}</td>
                    <td className="nombre">{montant(z.total_ventes)}</td>
                    <td className={`nombre ${Number(z.ecart) ? 'analyse-ecart' : ''}`}>{z.ecart == null ? 'à compter' : Number(z.ecart) === 0 ? 'Aucun' : montant(z.ecart)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {donnees.activite.length > 0 && (
        <Repartition titre="Qui a encaissé le plus" lignes={donnees.activite.filter((x) => Number(x.total_ventes) > 0).map((x) => ({ libelle: x.nom, valeur: Number(x.total_ventes), texte: `${montant(x.total_ventes)} · ${x.nombre_ventes} vente(s)` }))} />
      )}
    </>
  );
}

// --- Stock : ruptures et stock bas ---------------------------------------------------------------------------------
function ZoomStock({ etat, naviguer }) {
  const { api, etablissement, peut } = useEspace();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [articles, stock, categories] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etablissement.id, actif: true }, colonnes: ['id', 'nom', 'photo', 'suivi_stock', 'stock_minimum', 'unite', 'categorie_id', 'actif', 'prix_vente'] }),
      api.lire('stock_hubs', { eq: { etablissement_id: etablissement.id } }),
      api.lire('categories_articles', { eq: { etablissement_id: etablissement.id } }).catch(() => []),
    ]);
    return { liste: articlesAStock(articles, stock, etat), categories: Object.fromEntries((categories ?? []).map((c) => [c.id, c.nom])) };
  }, [etablissement.id, etat]);
  if (!donnees) return <><Erreur message={erreur} />{chargement && <Squelette lignes={6} />}</>;
  const groupes = [...new Set(donnees.liste.map((x) => donnees.categories[x.categorie_id] ?? 'Sans rayon'))];
  return (
    <>
      <div className="zoom-pied debut">
        {peut('stock.ajuster') && <Bouton icone="stock" variante="principal" onClick={() => naviguer('stock?vue=reception')}>J’ai reçu de la marchandise</Bouton>}
        <Bouton icone="stock" onClick={() => naviguer(`stock?etat=${etat === 'ruptures' ? 'epuise' : 'bas'}`)}>Ouvrir le stock</Bouton>
      </div>
      {donnees.liste.length === 0 && <EmptyState icone="coche" titre={etat === 'ruptures' ? 'Aucun article en rupture' : 'Aucun article sous le minimum'} texte="Tout va bien." />}
      {groupes.map((g) => (
        <section key={g} className="carte">
          <div className="titre-ligne"><h2>{g}</h2><span className="onglet-compteur">{donnees.liste.filter((x) => (donnees.categories[x.categorie_id] ?? 'Sans rayon') === g).length}</span></div>
          <div className="zoom-articles">
            {donnees.liste.filter((x) => (donnees.categories[x.categorie_id] ?? 'Sans rayon') === g).map((x) => (
              <article key={x.id} className={`zoom-article ${etat}`}>
                {x.photo ? <img src={x.photo} alt="" className="zoom-article-photo" /> : <span className="zoom-article-photo vide" aria-hidden="true">{x.nom.slice(0, 2).toUpperCase()}</span>}
                <strong>{x.nom}</strong>
                <span className="zoom-article-stock">{etat === 'ruptures' ? 'Plus rien' : `Il reste ${formatQuantite(x.quantite, x.unite)}`}</span>
                <small className="texte-doux">Minimum : {formatQuantite(x.minimum, x.unite)}</small>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
