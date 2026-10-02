import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, EmptyState, Erreur, Icone, PageHeader, Section, Squelette, StatCard, Tabs } from '../../ui/composants.jsx';

const PERIODES = [['jour', 'Aujourd’hui'], ['semaine', '7 jours'], ['mois', '30 jours']];
const JOURS = { jour: 0, semaine: 6, mois: 29 };

function joursEntre(du, au) {
  const jours = [];
  const courant = new Date(`${du}T12:00:00`);
  const fin = new Date(`${au}T12:00:00`);
  while (courant <= fin) {
    jours.push(courant.toISOString().slice(0, 10));
    courant.setDate(courant.getDate() + 1);
  }
  return jours;
}

function compact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString('fr-FR')} k`;
  return Math.round(n).toLocaleString('fr-FR');
}

function GraphiqueVentes({ series, montant }) {
  const max = Math.max(...series.map((s) => s.total), 1);
  const largeur = 640;
  const hauteur = 200;
  const marge = { haut: 12, bas: 26, gauche: 44, droite: 8 };
  const zoneL = largeur - marge.gauche - marge.droite;
  const zoneH = hauteur - marge.haut - marge.bas;
  const pas = zoneL / series.length;
  const barre = Math.max(Math.min(pas - 4, 36), 3);
  const graduations = [0, max / 2, max];
  const etiquetteTous = Math.ceil(series.length / 8);
  return (
    <svg className="graphique" viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label="Ventes par jour">
      {graduations.map((g) => {
        const y = marge.haut + zoneH - (g / max) * zoneH;
        return (
          <g key={g}>
            <line x1={marge.gauche} x2={largeur - marge.droite} y1={y} y2={y} className="graphique-grille" />
            <text x={marge.gauche - 6} y={y + 4} textAnchor="end" className="graphique-texte">{compact(g)}</text>
          </g>
        );
      })}
      {series.map((s, i) => {
        const h = (s.total / max) * zoneH;
        const x = marge.gauche + i * pas + (pas - barre) / 2;
        return (
          <g key={s.jour}>
            <rect x={x} y={marge.haut + zoneH - h} width={barre} height={Math.max(h, s.total > 0 ? 2 : 0)} rx="3" className="graphique-barre">
              <title>{`${new Date(`${s.jour}T12:00:00`).toLocaleDateString('fr-FR')} : ${montant(s.total)} (${s.nombre} vente(s))`}</title>
            </rect>
            {i % etiquetteTous === 0 && (
              <text x={x + barre / 2} y={hauteur - 8} textAnchor="middle" className="graphique-texte">
                {new Date(`${s.jour}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function TableauDeBord({ naviguer }) {
  const { api, etablissement, montant, peut, moduleActif, hub, multiHub, choisirHub } = useEspace();
  const [periode, setPeriode] = useState('jour');
  const du = dateLocale(-JOURS[periode]);
  const au = dateLocale();
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const { donnees: tdb, chargement, erreur } = useDonnees(
    () => api.rpc('tableau_de_bord_hub', { p_etablissement_id: etablissement.id, p_hub_id: hubFiltre, p_du: du, p_au: au }),
    [etablissement.id, hubFiltre, du, au]
  );

  const series = tdb ? (() => {
    const parJour = Object.fromEntries(tdb.ventes_par_jour.map((v) => [v.jour, v]));
    return joursEntre(du, au).map((jour) => ({ jour, total: parJour[jour]?.total ?? 0, nombre: parJour[jour]?.nombre ?? 0 }));
  })() : [];
  const resultat = tdb ? tdb.marge_brute - tdb.depenses : 0;

  const portee = multiHub ? (hub ? hub.nom : 'Tous les Hubs') : (etablissement.identite?.nom_commercial ?? etablissement.nom);
  return (
    <div className="page">
      <PageHeader
        titre="Tableau de bord"
        sousTitre={portee}
        actions={moduleActif('caisse') && peut('caisse.utiliser') && (!hub || hub.capacite_caisse) && <Bouton variante="principal" icone="caisse" onClick={() => naviguer('caisse')}>Ouvrir la caisse</Bouton>}
      />
      <Tabs onglets={PERIODES} actif={periode} onChange={setPeriode} />
      {chargement && !tdb && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {tdb && (
        <>
          <div className="grille-stats">
            <StatCard icone="ventes" libelle="Chiffre d’affaires" valeur={montant(tdb.chiffre_affaires)} detail={`${tdb.nombre_ventes} vente(s) · panier moyen ${montant(tdb.panier_moyen)}`} ton="fort" onClick={peut('ventes.lire') ? () => naviguer('ventes') : undefined} />
            <StatCard icone="caisse" libelle="Encaissé" valeur={montant(tdb.encaissements)} detail={Object.entries(tdb.encaissements_par_mode).map(([m, v]) => `${MODES_PAIEMENT[m]} ${compact(v)}`).join(' · ') || '—'} />
            {peut('depenses.lire') && <StatCard icone="depenses" libelle="Dépenses" valeur={montant(tdb.depenses)} onClick={() => naviguer('depenses')} />}
            {peut('depenses.lire') && (
              <StatCard icone="activite" libelle="Résultat estimé" valeur={montant(resultat)} detail={`Marge brute ${montant(tdb.marge_brute)} − dépenses`} ton={resultat < 0 ? 'alerte' : 'positif'} />
            )}
            <StatCard icone="contacts" libelle="À encaisser (crédits)" valeur={montant(tdb.creances)} ton={tdb.creances > 0 ? 'attention' : ''} onClick={peut('ventes.lire') ? () => naviguer('ventes') : undefined} />
            {peut('stock.lire') && <StatCard icone="stock" libelle="Valeur du stock" valeur={montant(tdb.valeur_stock)} detail={multiHub && !hub ? `${tdb.transferts} transfert(s) sur la période` : 'au coût d’achat'} onClick={() => naviguer('stock')} />}
          </div>
          {multiHub && !hub && tdb.par_hub?.length > 1 && (
            <Section titre="Par Hub" sousTitre="Cliquez sur un Hub pour filtrer tout l’établissement sur ce lieu.">
              <div className="tableau-conteneur">
                <table className="tableau">
                  <thead><tr><th>Hub</th><th className="nombre">Chiffre d’affaires</th><th className="nombre">Ventes</th><th className="nombre">Encaissé</th><th className="nombre">Valeur du stock</th><th>Caisse</th></tr></thead>
                  <tbody>
                    {tdb.par_hub.map((h) => (
                      <tr key={h.hub_id} className="cliquable" tabIndex={0} onClick={() => choisirHub(h.hub_id)} onKeyDown={(e) => e.key === 'Enter' && choisirHub(h.hub_id)}>
                        <td><span className="cellule-personne"><Icone nom={h.type === 'depot' ? 'depot' : 'hub'} /><strong>{h.nom}</strong>{h.articles_sous_minimum > 0 && <Badge ton="attention">{h.articles_sous_minimum} sous le seuil</Badge>}</span></td>
                        <td className="nombre"><strong>{montant(h.chiffre_affaires)}</strong></td>
                        <td className="nombre">{h.nombre_ventes}</td>
                        <td className="nombre">{montant(h.encaissements)}</td>
                        <td className="nombre">{montant(h.valeur_stock)}</td>
                        <td>{h.caisses_ouvertes ? <Badge ton="vert">{h.caisses_ouvertes} ouverte(s)</Badge> : <span className="texte-doux">fermée</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
          {periode !== 'jour' && (
            <Section titre="Ventes par jour">
              <GraphiqueVentes series={series} montant={montant} />
            </Section>
          )}
          <div className="deux-colonnes">
            <Section titre="Meilleures ventes">
              {!tdb.top_articles.length && <EmptyState titre="Pas encore de vente sur la période" />}
              <div className="liste-simple">
                {tdb.top_articles.map((a, i) => (
                  <div key={a.libelle} className="liste-ligne">
                    <span className="rang">{i + 1}</span>
                    <span>{a.libelle}</span>
                    <span className="texte-doux">{formatQuantite(a.quantite)}</span>
                    <strong>{montant(a.total)}</strong>
                  </div>
                ))}
              </div>
            </Section>
            {peut('stock.lire') && (
              <Section titre="Stock à surveiller" action={<button className="lien" onClick={() => naviguer('stock')}>Voir le stock</button>}>
                {!tdb.stock_bas.length && <p className="texte-doux">Aucun article sous son seuil d’alerte.</p>}
                <div className="liste-simple">
                  {tdb.stock_bas.map((s) => (
                    <div key={`${s.article_id}-${s.hub_id ?? ''}`} className="liste-ligne">
                      <span>{s.nom}{s.hub && multiHub ? <small className="texte-doux bloc">{s.hub}</small> : null}</span>
                      <span className="texte-doux">alerte à {formatQuantite(s.minimum)}</span>
                      <strong className="texte-alerte">{formatQuantite(s.quantite)}</strong>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
