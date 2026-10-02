import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Bouton, Chargement, EnTete, Erreur, Indicateur, Onglets, Vide } from '../../ui/composants.jsx';

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
  const { api, etablissement, montant, peut, moduleActif } = useEspace();
  const [periode, setPeriode] = useState('jour');
  const du = dateLocale(-JOURS[periode]);
  const au = dateLocale();
  const { donnees: tdb, chargement, erreur } = useDonnees(
    () => api.rpc('tableau_de_bord_commerce', { p_etablissement_id: etablissement.id, p_du: du, p_au: au }),
    [etablissement.id, du, au]
  );

  const series = tdb ? (() => {
    const parJour = Object.fromEntries(tdb.ventes_par_jour.map((v) => [v.jour, v]));
    return joursEntre(du, au).map((jour) => ({ jour, total: parJour[jour]?.total ?? 0, nombre: parJour[jour]?.nombre ?? 0 }));
  })() : [];
  const resultat = tdb ? tdb.marge_brute - tdb.depenses : 0;

  return (
    <div className="page">
      <EnTete titre="Tableau de bord" sousTitre={etablissement.identite?.nom_commercial ?? etablissement.nom}>
        {moduleActif('caisse') && peut('caisse.utiliser') && <Bouton variante="principal" icone="caisse" onClick={() => naviguer('caisse')}>Ouvrir la caisse</Bouton>}
      </EnTete>
      <div className="filtres">
        <Onglets onglets={PERIODES} actif={periode} onChange={setPeriode} />
      </div>
      {chargement && !tdb && <Chargement />}
      <Erreur message={erreur} />
      {tdb && (
        <>
          <div className="grille-indicateurs">
            <Indicateur libelle="Chiffre d’affaires" valeur={montant(tdb.chiffre_affaires)} detail={`${tdb.nombre_ventes} vente(s)`} ton="fort" />
            <Indicateur libelle="Panier moyen" valeur={montant(tdb.panier_moyen)} />
            <Indicateur libelle="Encaissé" valeur={montant(tdb.encaissements)} detail={Object.entries(tdb.encaissements_par_mode).map(([m, v]) => `${MODES_PAIEMENT[m]} ${compact(v)}`).join(' · ') || '—'} />
            {peut('depenses.lire') && <Indicateur libelle="Dépenses" valeur={montant(tdb.depenses)} />}
            {peut('depenses.lire') && (
              <Indicateur libelle="Résultat estimé" valeur={montant(resultat)} detail={`Marge brute ${montant(tdb.marge_brute)} − dépenses`} ton={resultat < 0 ? 'alerte' : 'positif'} />
            )}
            <Indicateur libelle="À encaisser (crédits)" valeur={montant(tdb.creances)} ton={tdb.creances > 0 ? 'attention' : ''} />
          </div>
          {periode !== 'jour' && (
            <section className="carte">
              <h2>Ventes par jour</h2>
              <GraphiqueVentes series={series} montant={montant} />
            </section>
          )}
          <div className="deux-colonnes">
            <section className="carte">
              <h2>Meilleures ventes</h2>
              {!tdb.top_articles.length && <Vide titre="Pas encore de vente sur la période" />}
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
            </section>
            {peut('stock.lire') && (
              <section className="carte">
                <div className="titre-ligne">
                  <h2>Stock à surveiller</h2>
                  <button className="lien" onClick={() => naviguer('stock')}>Voir le stock</button>
                </div>
                {!tdb.stock_bas.length && <p className="texte-doux">Aucun article sous son seuil d’alerte.</p>}
                <div className="liste-simple">
                  {tdb.stock_bas.map((s) => (
                    <div key={s.article_id} className="liste-ligne">
                      <span>{s.nom}</span>
                      <span className="texte-doux">alerte à {formatQuantite(s.minimum)}</span>
                      <strong className="texte-alerte">{formatQuantite(s.quantite)}</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
