// Widgets du tableau de bord déclarés par le module Stock.
import React from 'react';
import { formatQuantite } from '../../noyau/format.js';
import { Section, StatCard } from '../../ui/composants.jsx';

export function ValeurStock({ tdb, espace, naviguer }) {
  const { montant, multiHub, hub } = espace;
  return <StatCard icone="stock" libelle="Valeur du stock" valeur={montant(tdb.valeur_stock)} detail={multiHub && !hub ? `${tdb.transferts} transfert(s) sur la période` : 'au coût d’achat'} onClick={() => naviguer('stock')} />;
}

export function StockASurveiller({ tdb, espace, naviguer }) {
  return (
    <Section titre="Stock à surveiller" action={<button className="lien" onClick={() => naviguer('stock')}>Voir le stock</button>}>
      {!tdb.stock_bas.length && <p className="texte-doux">Aucun article sous son seuil d’alerte.</p>}
      <div className="liste-simple">
        {tdb.stock_bas.map((s) => (
          <div key={`${s.article_id}-${s.hub_id ?? ''}`} className="liste-ligne">
            <span>{s.nom}{s.hub && espace.multiHub ? <small className="texte-doux bloc">{s.hub}</small> : null}</span>
            <span className="texte-doux">alerte à {formatQuantite(s.minimum)}</span>
            <strong className="texte-alerte">{formatQuantite(s.quantite)}</strong>
          </div>
        ))}
      </div>
    </Section>
  );
}
