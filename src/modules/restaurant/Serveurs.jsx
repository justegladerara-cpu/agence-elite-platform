import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Bouton, Champ, EmptyState, Erreur, Modale, PageHeader, Section, Squelette, StatCard, Tabs } from '../../ui/composants.jsx';

// Serveurs de la salle : affectation des tables (avec historique), transfert motivé d'une commande,
// activité par serveur. Les droits sont vérifiés par la base ; l'écran ne fait que masquer l'inutile.

const PERIODES = [['jour', 'Aujourd’hui', 0], ['semaine', '7 jours', 6], ['mois', '30 jours', 29]];

const dateLocale = (decalageJours = 0) => {
  const d = new Date(Date.now() - decalageJours * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Choix du serveur d'une table : affecter, changer (l'ancienne affectation se termine), retirer.
export function ModaleAffectation({ table, affectation, commande, serveurs, onFermer, onFait }) {
  const { api, peut } = useEspace();
  const possibles = serveurs.filter((x) => !x.hubs || x.hubs.includes(table.hub_id));
  const [choix, setChoix] = useState(affectation?.serveur_id ?? '');
  const [motif, setMotif] = useState('');
  const [transferer, setTransferer] = useState(false);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const historique = useDonnees(
    () => api.lire('rest_affectations', { eq: { table_id: table.id }, ordre: ['debut', 'desc'], limite: 8 }),
    [table.id],
  );
  const nom = Object.fromEntries(serveurs.map((x) => [x.user_id, x.nom]));
  const peutTransferer = commande && choix && commande.serveur_id !== choix && peut('restaurant_salle.transferer');
  const executer = async (fn, message) => {
    setErreur('');
    setChargement(true);
    try {
      await fn();
      onFait(message);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  const valider = (e) => {
    e.preventDefault();
    executer(async () => {
      await api.rpc('affecter_serveur_table', { p_table_id: table.id, p_serveur_id: choix, p_motif: motif || null });
      if (peutTransferer && transferer) {
        await api.rpc('transferer_serveur_commande', { p_commande_id: commande.id, p_serveur_id: choix, p_motif: motif || 'Changement de serveur de la table' });
      }
    }, `Table ${table.nom} : ${nom[choix] ?? 'serveur'} affecté(e)`);
  };
  return (
    <Modale titre={`Serveur de la table ${table.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        {!possibles.length && <p className="texte-doux">Aucun membre ne peut servir dans ce Hub. Donnez le rôle Serveur (ou le droit de servir) dans Équipe.</p>}
        <Champ libelle="Serveur">
          <select value={choix} onChange={(e) => setChoix(e.target.value)} required autoFocus>
            <option value="" disabled>Choisir…</option>
            {possibles.map((x) => <option key={x.user_id} value={x.user_id}>{x.nom}{x.moi ? ' (vous)' : ''}</option>)}
          </select>
        </Champ>
        <Champ libelle="Motif (facultatif)" aide="Ex. relève du soir. Conservé dans l’historique.">
          <input value={motif} maxLength={200} onChange={(e) => setMotif(e.target.value)} />
        </Champ>
        {commande && commande.serveur_id !== choix && choix && (
          peutTransferer ? (
            <label className="case">
              <input type="checkbox" checked={transferer} onChange={(e) => setTransferer(e.target.checked)} />
              Transférer aussi la commande en cours ({commande.numero}) à ce serveur
            </label>
          ) : <p className="texte-doux">La commande en cours garde son serveur ({nom[commande.serveur_id] ?? 'serveur actuel'}).</p>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          {affectation && (
            <Bouton type="button" onClick={() => executer(() => api.rpc('retirer_serveur_table', { p_table_id: table.id, p_motif: motif || null }), `Table ${table.nom} : affectation retirée`)}>
              Retirer l’affectation
            </Bouton>
          )}
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement} disabled={!choix || choix === affectation?.serveur_id && !(peutTransferer && transferer)}>
            {affectation ? 'Changer' : 'Affecter'}
          </Bouton>
        </div>
      </form>
      <h3 className="titre-section">Historique de la table</h3>
      {historique.erreur && <Erreur message={historique.erreur} />}
      {historique.donnees && !historique.donnees.length && <p className="texte-doux">Aucune affectation pour le moment.</p>}
      <div className="liste-simple">
        {(historique.donnees ?? []).map((a) => (
          <div key={a.id} className="liste-ligne">
            <span><strong>{nom[a.serveur_id] ?? 'Ancien membre'}</strong><br />
              <small className="texte-doux">{formatDateHeure(a.debut)}{a.fin ? ` → ${formatDateHeure(a.fin)}` : ' · en cours'}{a.motif ? ` · ${a.motif}` : ''}{a.motif_fin ? ` · fin : ${a.motif_fin}` : ''}</small></span>
          </div>
        ))}
      </div>
    </Modale>
  );
}

// Transfert volontaire d'une commande ouverte : motif obligatoire, trace conservée.
export function ModaleTransfertServeur({ commande, serveurs, onFermer, onFait }) {
  const { api } = useEspace();
  const [choix, setChoix] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('transferer_serveur_commande', { p_commande_id: commande.id, p_serveur_id: choix, p_motif: motif });
      onFait(`Commande ${commande.numero} transférée à ${serveurs.find((x) => x.user_id === choix)?.nom ?? 'un autre serveur'}`);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Transférer ${commande.numero}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        {!serveurs.length && <p className="texte-doux">Aucun autre serveur ne peut servir dans ce Hub.</p>}
        <Champ libelle="Nouveau serveur">
          <select value={choix} onChange={(e) => setChoix(e.target.value)} required autoFocus>
            <option value="" disabled>Choisir…</option>
            {serveurs.map((x) => <option key={x.user_id} value={x.user_id}>{x.nom}{x.moi ? ' (vous)' : ''}</option>)}
          </select>
        </Champ>
        <Champ libelle="Motif" aide="Obligatoire : il est conservé avec la commande.">
          <input value={motif} required maxLength={200} onChange={(e) => setMotif(e.target.value)} />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" disabled={!choix || !motif.trim()}>Transférer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function TableauServeurs({ serveurs }) {
  const { montant } = useEspace();
  return (
    <div className="tableau-conteneur">
      <table className="tableau tableau-serveurs">
        <thead>
          <tr>
            <th>Serveur</th><th className="nombre">Tables affectées</th><th className="nombre">Tables servies</th>
            <th className="nombre">Commandes (en cours)</th><th className="nombre">Couverts</th><th className="nombre">Chiffre</th>
            <th className="nombre">Encaissé</th><th className="nombre">Addition moyenne</th><th className="nombre">Plats annulés</th>
          </tr>
        </thead>
        <tbody>
          {serveurs.map((x) => (
            <tr key={x.serveur_id}>
              <td data-libelle="Serveur"><strong>{x.nom}</strong>{x.moi && <small className="texte-doux"> (vous)</small>}</td>
              <td data-libelle="Tables affectées" className="nombre">{x.tables_affectees}</td>
              <td data-libelle="Tables servies" className="nombre">{x.tables_servies}</td>
              <td data-libelle="Commandes" className="nombre">{x.commandes}{x.commandes_en_cours ? ` (${x.commandes_en_cours})` : ''}</td>
              <td data-libelle="Couverts" className="nombre">{x.couverts}</td>
              <td data-libelle="Chiffre" className="nombre">{montant(x.chiffre_affaires)}</td>
              <td data-libelle="Encaissé" className="nombre">{montant(x.encaisse)}</td>
              <td data-libelle="Addition moyenne" className="nombre">{x.additions ? montant(x.ticket_moyen) : '—'}</td>
              <td data-libelle="Plats annulés" className="nombre">{x.plats_annules}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Encart du plan de salle (responsables) : qui sert quoi maintenant.
export function ServiceEnCours({ naviguer, actualisation }) {
  const { api, etablissement, montant } = useEspace();
  const stats = useDonnees(() => api.rpc('statistiques_serveurs_restaurant', { p_etablissement_id: etablissement.id }), [etablissement.id, actualisation]);
  const actifs = (stats.donnees?.serveurs ?? []).filter((x) => x.tables_affectees || x.commandes_en_cours || x.commandes);
  return (
    <Section titre="Service en cours" sousTitre="Aujourd’hui, par serveur : tables, commandes, couverts et chiffre."
      action={<button type="button" className="lien" onClick={() => naviguer('salle/serveurs')}>Détail et historique</button>}>
      {stats.erreur && <Erreur message={stats.erreur} />}
      {stats.donnees && !actifs.length && <p className="texte-doux">Aucun serveur en service pour le moment. Affectez les tables pour démarrer.</p>}
      <div className="liste-simple">
        {actifs.map((x) => (
          <div key={x.serveur_id} className="liste-ligne">
            <span><strong>{x.nom}</strong><br />
              <small className="texte-doux">{x.tables_affectees} table(s) · {x.commandes_en_cours} commande(s) en cours · {x.couverts} couvert(s)</small></span>
            <strong>{montant(x.chiffre_affaires)}</strong>
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function Serveurs({ naviguer }) {
  const { api, etablissement, peut, montant } = useEspace();
  const etab = etablissement.id;
  const [periode, setPeriode] = useState('jour');
  const decalage = PERIODES.find(([id]) => id === periode)[2];
  const voirHistorique = peut('restaurant_salle.affecter') || peut('restaurant_salle.performances');
  const { donnees: d, chargement, erreur } = useDonnees(async () => {
    const [stats, serveurs, affectations, transferts, tables] = await Promise.all([
      api.rpc('statistiques_serveurs_restaurant', { p_etablissement_id: etab, p_du: dateLocale(decalage), p_au: dateLocale(0) }),
      api.rpc('serveurs_restaurant', { p_etablissement_id: etab }),
      voirHistorique ? api.lire('rest_affectations', { eq: { etablissement_id: etab }, ordre: ['debut', 'desc'], limite: 40 }) : [],
      voirHistorique ? api.lire('rest_transferts_serveur', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 20 }) : [],
      api.lire('rest_tables', { eq: { etablissement_id: etab } }),
    ]);
    return { stats, serveurs, affectations, transferts, table: Object.fromEntries(tables.map((t) => [t.id, t.nom])) };
  }, [etab, decalage]);
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={/permission|refus/i.test(erreur) ? 'Accès refusé : vous n’avez pas accès à la salle.' : erreur} /></div>;
  const nom = Object.fromEntries(d.serveurs.map((x) => [x.user_id, x.nom]));
  const lignes = d.stats.serveurs;
  const total = (cle) => lignes.reduce((s, x) => s + Number(x[cle] ?? 0), 0);
  return (
    <div className="page page-large">
      <PageHeader titre="Serveurs" sousTitre={d.stats.tous ? 'Activité de chaque serveur sur la période.' : 'Votre activité sur la période.'}
        fil={[{ libelle: 'Salle', href: '#/salle' }, { libelle: 'Serveurs' }]}
        actions={<Bouton icone="table" onClick={() => naviguer('salle')}>Salle</Bouton>} />
      <Tabs actif={periode} onChange={setPeriode} onglets={PERIODES.map(([id, libelle]) => [id, libelle])} />
      <div className="grille-stats">
        <StatCard icone="membres" libelle="Serveurs actifs" valeur={lignes.length} />
        <StatCard icone="table" libelle="Commandes" valeur={total('commandes')} detail={`${total('commandes_en_cours')} en cours`} />
        <StatCard icone="membres" libelle="Couverts" valeur={total('couverts')} />
        <StatCard icone="ventes" libelle="Chiffre" valeur={montant(total('chiffre_affaires'))} detail={`Encaissé ${montant(total('encaisse'))}`} />
      </div>
      <Section titre="Par serveur" sousTitre="Chiffre des additions encaissées des commandes ouvertes sur la période ; une addition annulée ne compte pas.">
        {!lignes.length ? <EmptyState icone="membres" titre="Aucune activité" texte="Aucune table affectée ni commande sur cette période." /> : <TableauServeurs serveurs={lignes} />}
      </Section>
      {voirHistorique && (
        <Section titre="Historique des affectations" sousTitre="Les 40 dernières : qui a servi quelle table, de quand à quand.">
          {!d.affectations.length && <p className="texte-doux">Aucune affectation enregistrée.</p>}
          <div className="liste-simple">
            {d.affectations.map((a) => (
              <div key={a.id} className="liste-ligne">
                <span><strong>Table {d.table[a.table_id] ?? '?'}</strong> · {nom[a.serveur_id] ?? 'Ancien membre'}<br />
                  <small className="texte-doux">{formatDateHeure(a.debut)}{a.fin ? ` → ${formatDateHeure(a.fin)}` : ' · en cours'}
                    {a.motif ? ` · ${a.motif}` : ''}{a.motif_fin ? ` · fin : ${a.motif_fin}` : ''} · par {nom[a.affectee_par] ?? 'un responsable'}</small></span>
              </div>
            ))}
          </div>
        </Section>
      )}
      {voirHistorique && d.transferts.length > 0 && (
        <Section titre="Transferts de commandes">
          <div className="liste-simple">
            {d.transferts.map((x) => (
              <div key={x.id} className="liste-ligne">
                <span>{nom[x.ancien_serveur_id] ?? 'Ancien membre'} → <strong>{nom[x.nouveau_serveur_id] ?? 'Ancien membre'}</strong><br />
                  <small className="texte-doux">{formatDateHeure(x.cree_le)} · {x.motif}</small></span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
