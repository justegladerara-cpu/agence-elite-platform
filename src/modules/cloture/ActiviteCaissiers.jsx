import React, { useEffect } from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Erreur } from '../../ui/composants.jsx';
import { NOUVEAU_CAISSE_UNIQUE_JUSQUA, PastilleNouveau } from '../../ui/Nouveau.jsx';
import './activite-caissiers.css';

// Relecture automatique : le responsable suit la caisse en direct sans recharger la page.
const RAFRAICHIR_MS = 30000;

// « il y a 3 min », « il y a 2 h 05 » : depuis la dernière vente.
export function depuis(date, maintenant = Date.now()) {
  if (!date) return '';
  const minutes = Math.max(0, Math.floor((maintenant - new Date(date).getTime()) / 60000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `il y a ${h} h ${String(minutes % 60).padStart(2, '0')}`;
}

// Tableau de bord (gérant, responsable, comptable) : qui tient une caisse en ce moment, combien chaque personne a
// vendu sur la période et le classement (migration 20261011000128, fonction activite_caissiers), et les factures
// en cours de chacune (clients qui consomment encore, table ventes_en_attente).
// Depuis la migration 20261013100133 : comptage par service (une soirée de 18 h à 3 h reste au jour d'ouverture de la
// caisse), service en cours en direct, et alerte « ticket Z non tiré ».
export default function ActiviteCaissiers({ espace, du, au, naviguer }) {
  const { api, etablissement, montant } = espace;
  const { donnees, erreur, recharger } = useDonnees(
    async () => {
      const [personnes, factures, alertes] = await Promise.all([
        api.rpc('activite_caissiers', { p_etablissement_id: etablissement.id, p_du: du ?? null, p_au: au ?? null }),
        // Factures en cours (clients qui consomment encore) : lues seulement si le rôle y a accès.
        api.lire('ventes_en_attente', { eq: { etablissement_id: etablissement.id, statut: 'en_attente' }, colonnes: ['cree_par', 'total_estime'] }).catch(() => []),
        // Caisses ouvertes trop longtemps ou sans vente : l'alerte part aussi en notification (une seule fois).
        api.rpc('alertes_caisses', { p_etablissement_id: etablissement.id }).catch(() => []),
      ]);
      const parPersonne = {};
      for (const f of factures ?? []) {
        const n = (parPersonne[f.cree_par] ??= { nombre: 0, total: 0 });
        n.nombre += 1;
        n.total += Number(f.total_estime || 0);
      }
      return { personnes: (personnes ?? []).map((p) => ({ ...p, factures: parPersonne[p.id] ?? null })), alertes: alertes ?? [] };
    },
    [etablissement.id, du, au]
  );
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'hidden') recharger();
    }, RAFRAICHIR_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etablissement.id, du, au]);
  if (erreur) return <Erreur message={erreur} />;
  if (!donnees?.personnes.length) return null;
  const { personnes, alertes } = donnees;
  const enCaisse = personnes.filter((p) => p.en_caisse);
  const total = personnes.reduce((s, p) => s + Number(p.total_ventes || 0), 0);
  const nombre = personnes.reduce((s, p) => s + Number(p.nombre_ventes || 0), 0);
  return (
    <section className="carte cockpit-caissiers" aria-label="Caissières">
      <div className="titre-ligne">
        <h2>Caissières et caissiers<PastilleNouveau jusqua={NOUVEAU_CAISSE_UNIQUE_JUSQUA} /></h2>
        <Badge ton={enCaisse.length ? 'vert' : undefined}>{enCaisse.length ? `${enCaisse.length} en caisse maintenant` : 'Aucune caisse ouverte'}</Badge>
      </div>
      {alertes.map((a) => (
        <button key={a.session_id} type="button" className="alerte-caisse" onClick={() => naviguer?.('clotures')}>
          <strong>Ticket Z non tiré : {a.caissier}</strong>
          <span>
            Caisse ouverte depuis le {formatDateHeure(a.ouverte_le)}
            {a.derniere_vente ? `, dernière vente ${depuis(a.derniere_vente)}` : ', aucune vente'} · {a.nombre_ventes} vente(s) · {montant(a.total_ventes)}.
            {' '}Demandez-lui de tirer son ticket Z, ou fermez la caisse.
          </span>
        </button>
      ))}
      {enCaisse.map((p) => (
        <div key={p.id} className="caisse-en-direct" role="status">
          <span className="caisse-en-direct-point" aria-hidden="true" />
          <div>
            <strong>En caisse maintenant : {p.nom}</strong>
            <small className="texte-doux bloc">
              {p.caisses} · depuis {formatDateHeure(p.depuis)}
              {p.derniere_vente ? ` · dernière vente ${depuis(p.derniere_vente)}` : ' · pas encore de vente'}
              {p.factures ? ` · ${p.factures.nombre} facture(s) en cours` : ''}
            </small>
          </div>
          <div className="caisse-en-direct-montant">
            <strong>{montant(p.caisse_en_cours)}</strong>
            <small className="texte-doux">{p.nombre_en_cours ?? 0} vente(s) ce service</small>
          </div>
        </div>
      ))}
      <div className="tableau-conteneur">
        <table className="tableau cliquable">
          <thead><tr><th>#</th><th>Personne</th><th>En ce moment</th><th className="nombre">Factures en cours</th><th className="nombre">Ventes</th><th className="nombre">Montant</th></tr></thead>
          <tbody>
            {personnes.map((p, i) => (
              <tr key={p.id} onClick={() => naviguer?.('clotures')}>
                <td>{i === 0 && Number(p.total_ventes) > 0 ? <strong>1 ★</strong> : i + 1}</td>
                <td><strong>{p.nom}</strong></td>
                <td>
                  {p.en_caisse
                    ? <><Badge ton="vert">En caisse</Badge> <small className="texte-doux">{p.caisses} · depuis {formatDateHeure(p.depuis)} · {montant(p.caisse_en_cours)}</small></>
                    : <span className="texte-doux">—</span>}
                </td>
                <td className="nombre">
                  {p.factures ? <Badge ton="orange">{p.factures.nombre} · {montant(p.factures.total)}</Badge> : <span className="texte-doux">—</span>}
                </td>
                <td className="nombre">{p.nombre_ventes}</td>
                <td className="nombre"><strong>{montant(p.total_ventes)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td colSpan={3}><strong>Total de l’établissement</strong> <small className="texte-doux">(chaque service compte pour le jour où la caisse a été ouverte)</small></td>
              <td className="nombre">{nombre}</td>
              <td className="nombre"><strong>{montant(total)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
