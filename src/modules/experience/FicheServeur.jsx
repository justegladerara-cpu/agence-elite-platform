import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Chargement, Erreur } from '../../ui/composants.jsx';
import { DetailVente } from '../ventes/Ventes.jsx';
import { analyseServeur, instantsSoirees, JOURS_LONGS, jourDeSemaine } from './analyse.js';
import { Barre, Courbe, PhotoServeur, pluriel, Tuile, Verdict } from './communs.jsx';

// Fiche d'un serveur, ouverte depuis le tableau de bord : ce qu'il a servi, quand, sur la période choisie,
// ses chiffres comparés à l'équipe et des analyses écrites. Un toucher sur une vente ouvre son ticket.
const PAR_PAQUET = 80;

export default function FicheServeur({ serveur, du, au, equipe, debut = 8 }) {
  const { api, etablissement, montant } = useEspace();
  const fuseau = etablissement.fuseau || 'Africa/Brazzaville';
  const [ticket, setTicket] = useState(null);
  const [toutes, setToutes] = useState(false);
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const { de, a } = instantsSoirees(du, au, fuseau, debut);
    const ventes = await api.lire('ventes', {
      eq: { etablissement_id: etablissement.id, serveur_id: serveur.id ?? null },
      gte: { cree_le: de }, lte: { cree_le: new Date(Date.parse(a) - 1).toISOString() }, ordre: ['cree_le', 'desc'], limite: 1000,
    });
    // Lignes par paquets : l'adresse de la demande reste courte, même sur 3 mois.
    const ids = ventes.map((v) => v.id);
    const paquets = [];
    for (let i = 0; i < ids.length; i += PAR_PAQUET) paquets.push(ids.slice(i, i + PAR_PAQUET));
    const lignes = (await Promise.all(paquets.map((p) => api.lire('lignes_vente', { dans: { vente_id: p }, limite: 5000 })))).flat();
    return { ventes, lignes };
  }, [etablissement.id, serveur.id, du, au]);

  if (chargement && !donnees) return <Chargement texte={`La fiche de ${serveur.prenom} se prépare…`} />;
  if (erreur) return <Erreur message={erreur} />;
  const a = analyseServeur({ ventes: donnees.ventes, lignes: donnees.lignes, equipe, fuseau, debut });
  const soirees = Object.keys(a.parSoiree).sort();
  const unJour = du === au;
  const lignesParVente = {};
  donnees.lignes.forEach((l) => { (lignesParVente[l.vente_id] ??= []).push(l); });
  const liste = toutes ? donnees.ventes : donnees.ventes.slice(0, 25);
  const maxArticle = Math.max(1, ...a.articles.map((x) => x.ca));
  const heures = (rang) => `${(rang + debut) % 24} h`;

  return (
    <div className="xp-fiche">
      <div className="xp-fiche-tete">
        <PhotoServeur prenom={serveur.prenom} photo={serveur.photo} taille={72} />
        <div>
          <strong className="xp-fiche-nom">{serveur.prenom}</strong>
          <small className="texte-doux">{serveur.role ?? 'Serveur'} · {unJour ? `soirée du ${new Date(`${du}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}` : `du ${du.split('-').reverse().join('/')} au ${au.split('-').reverse().join('/')}`}</small>
        </div>
      </div>

      <div className="xp-grille etroite">
        <Tuile icone="graphique" titre="Total vendu" valeur={montant(a.ca)}
          verdict={a.partEquipe != null ? { ton: 'neutre', texte: `${Math.round(a.partEquipe * 100)} % de l’équipe` } : undefined} />
        <Tuile icone="ventes" titre="Ventes" valeur={a.ventes} pourquoi={soirees.length > 1 ? `en ${pluriel(soirees.length, 'soirée')}` : undefined} />
        <Tuile icone="panier" titre="Dépense moyenne par client" valeur={montant(Math.round(a.panier))}
          verdict={a.ecartPanier == null ? undefined : { ton: a.ecartPanier >= 0 ? 'bon' : 'vigilance', texte: `${a.ecartPanier >= 0 ? '+' : '−'}${Math.round(Math.abs(a.ecartPanier) * 100)} % vs équipe` }} />
        <Tuile icone="horloge" titre="Heure forte" valeur={a.heureForte == null ? '—' : `${a.heureForte} h`} />
        <Tuile icone="fermer" titre="Annulations" valeur={a.annulees} verdict={{ ton: a.annulees ? 'vigilance' : 'bon', texte: a.annulees ? 'à vérifier' : 'aucune' }} />
        {a.plusGrosse && <Tuile icone="etoile" titre="Plus grosse vente" valeur={montant(a.plusGrosse.total)} onClick={() => setTicket(a.plusGrosse.id)} conseil="Voir le ticket" />}
      </div>

      {a.analyses.length > 0 && (
        <section className="xp-section">
          <h3 className="xp-section-titre">Analyse</h3>
          <ul className="xp-analyses">
            {a.analyses.map((x) => <li key={x.texte} className={x.ton}><Verdict ton={x.ton}>{x.ton === 'bon' ? 'Bien' : x.ton === 'mauvais' ? 'Attention' : x.ton === 'vigilance' ? 'À voir' : 'Info'}</Verdict>{x.texte}</li>)}
          </ul>
        </section>
      )}

      {a.ca > 0 && (
        <section className="xp-section">
          <h3 className="xp-section-titre">{unJour || soirees.length < 2 ? 'Heure par heure' : 'Soirée par soirée'}</h3>
          {unJour || soirees.length < 2 ? (
            <Courbe series={[{ nom: serveur.prenom, points: a.parHeure.slice(0, 20), couleur: 'var(--accent)', remplie: true }]}
              etiquettes={[0, 4, 8, 12, 16, 19].map(heures)} hauteur={110} />
          ) : (
            <Courbe series={[{ nom: serveur.prenom, points: soirees.map((s) => a.parSoiree[s]), couleur: 'var(--accent)', remplie: true }]}
              etiquettes={[soirees[0], soirees[Math.floor(soirees.length / 2)], soirees[soirees.length - 1]].map((s) => `${JOURS_LONGS[jourDeSemaine(s)].slice(0, 3)} ${s.slice(8)}`)} hauteur={110} />
          )}
        </section>
      )}

      {a.articles.length > 0 && (
        <section className="xp-section">
          <h3 className="xp-section-titre">Ce qu’il a servi <small>{pluriel(a.articles.reduce((s, x) => s + x.qte, 0), 'article')}</small></h3>
          <div className="xp-barres">
            {a.articles.slice(0, 8).map((x) => (
              <Barre key={x.id} libelle={x.nom} valeur={montant(x.ca)} part={x.ca / maxArticle}
                detail={`${x.qte} vendu${x.qte > 1 ? 's' : ''}${x.avecCout ? ` · rapporte ${montant(Math.round(x.marge))}` : ''}`} />
            ))}
          </div>
        </section>
      )}

      <section className="xp-section">
        <h3 className="xp-section-titre">Ses ventes, une par une <small>touchez pour voir le ticket</small></h3>
        <div className="xp-liste">
          {liste.map((v) => {
            const l = lignesParVente[v.id] ?? [];
            return (
              <button type="button" key={v.id} className="xp-ligne cliquable" onClick={() => setTicket(v.id)}>
                <span className="xp-ligne-texte">
                  <strong>{new Date(v.cree_le).toLocaleString('fr-FR', { weekday: unJour ? undefined : 'short', day: unJour ? undefined : 'numeric', hour: '2-digit', minute: '2-digit', timeZone: fuseau })} · {v.numero}</strong>
                  <small>{l.slice(0, 3).map((x) => `${Number(x.quantite)} × ${x.libelle}`).join(', ')}{l.length > 3 ? ` +${l.length - 3}` : ''}</small>
                </span>
                {v.statut === 'annulee' && <Verdict ton="mauvais">annulée</Verdict>}
                <span className="xp-ligne-valeur">{montant(v.total)}</span>
              </button>
            );
          })}
          {!donnees.ventes.length && <div className="xp-ligne"><span className="texte-doux">Aucune vente sur la période.</span></div>}
        </div>
        {!toutes && donnees.ventes.length > 25 && <button type="button" className="lien" onClick={() => setToutes(true)}>Voir les {donnees.ventes.length} ventes</button>}
      </section>
      {ticket && <DetailVente venteId={ticket} onFermer={() => setTicket(null)} onChange={() => {}} />}
    </div>
  );
}
