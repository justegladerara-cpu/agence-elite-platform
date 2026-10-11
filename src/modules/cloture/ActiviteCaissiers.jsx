import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Erreur } from '../../ui/composants.jsx';
import { PastilleNouveau } from '../../ui/Nouveau.jsx';

// Tableau de bord (gérant, responsable, comptable) : qui tient une caisse en ce moment, combien chaque personne a
// vendu sur la période et le classement (migration 20261011000128, fonction activite_caissiers), et les factures
// en cours de chacune (clients qui consomment encore, table ventes_en_attente).
export default function ActiviteCaissiers({ espace, du, au, naviguer }) {
  const { api, etablissement, montant } = espace;
  const { donnees, erreur } = useDonnees(
    async () => {
      const [personnes, factures] = await Promise.all([
        api.rpc('activite_caissiers', { p_etablissement_id: etablissement.id, p_du: du ?? null, p_au: au ?? null }),
        // Factures en cours (clients qui consomment encore) : lues seulement si le rôle y a accès.
        api.lire('ventes_en_attente', { eq: { etablissement_id: etablissement.id, statut: 'en_attente' }, colonnes: ['cree_par', 'total_estime'] }).catch(() => []),
      ]);
      const parPersonne = {};
      for (const f of factures ?? []) {
        const n = (parPersonne[f.cree_par] ??= { nombre: 0, total: 0 });
        n.nombre += 1;
        n.total += Number(f.total_estime || 0);
      }
      return (personnes ?? []).map((p) => ({ ...p, factures: parPersonne[p.id] ?? null }));
    },
    [etablissement.id, du, au]
  );
  if (erreur) return <Erreur message={erreur} />;
  if (!donnees?.length) return null;
  const enCaisse = donnees.filter((p) => p.en_caisse);
  return (
    <section className="carte cockpit-caissiers" aria-label="Caissières">
      <div className="titre-ligne">
        <h2>Caissières et caissiers<PastilleNouveau /></h2>
        <Badge ton={enCaisse.length ? 'vert' : undefined}>{enCaisse.length ? `${enCaisse.length} en caisse maintenant` : 'Aucune caisse ouverte'}</Badge>
      </div>
      <div className="tableau-conteneur">
        <table className="tableau cliquable">
          <thead><tr><th>#</th><th>Personne</th><th>En ce moment</th><th className="nombre">Factures en cours</th><th className="nombre">Ventes</th><th className="nombre">Montant</th></tr></thead>
          <tbody>
            {donnees.map((p, i) => (
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
        </table>
      </div>
    </section>
  );
}
