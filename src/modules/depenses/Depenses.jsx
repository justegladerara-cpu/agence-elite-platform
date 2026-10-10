import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { dateLocale, formatDate, MODES_PAIEMENT } from '../../noyau/format.js';
import { exporterCsv } from '../../ui/communs.jsx';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, lireImageReduite, Modale, ModaleMotif, Onglets, Vide } from '../../ui/composants.jsx';

const CATEGORIES = ['Achats de marchandises', 'Transport', 'Loyer', 'Énergie', 'Salaires', 'Téléphone et Internet', 'Entretien', 'Impôts et taxes', 'Divers'];
const PERIODES = [['mois', 'Ce mois'], ['30', '30 jours'], ['tout', 'Tout']];

function debut(periode) {
  if (periode === 'tout') return null;
  if (periode === '30') return dateLocale(-29);
  return `${dateLocale().slice(0, 8)}01`;
}

function FormulaireDepense({ fournisseurs, sessions, categories, reglages, onFermer, onEnregistre }) {
  const { api, etablissement, hub, multiHub, montant } = useEspace();
  const [valeurs, setValeurs] = useState({
    libelle: '', montant: '', categorie: 'Divers', date_depense: dateLocale(), mode: 'especes', fournisseur_id: '', justificatif: '',
    depuis_caisse: sessions.length > 0,
  });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const seuil = Number(reglages?.seuil_validation ?? 0);
  const depuisCaisse = valeurs.mode === 'especes' && valeurs.depuis_caisse && sessions.length > 0;
  // Au-dessus du seuil, une dépense hors caisse part en validation (sauf pour qui peut valider).
  const enValidation = seuil > 0 && !depuisCaisse && !reglages?.peut_valider && Number(valeurs.montant) >= seuil;
  const changer = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const { depuis_caisse: _caisse, ...reste } = valeurs;
      if (enValidation) {
        await api.rpc('demander_depense', {
          p_etablissement_id: etablissement.id,
          p: { ...reste, montant: Number(valeurs.montant), fournisseur_id: valeurs.fournisseur_id || null, ...(multiHub && hub ? { hub_id: hub.id } : {}) },
        });
        onEnregistre('Dépense envoyée en validation');
        return;
      }
      await api.rpc('enregistrer_depense', {
        p_etablissement_id: etablissement.id,
        p_depense: {
          ...reste,
          montant: Number(valeurs.montant),
          fournisseur_id: valeurs.fournisseur_id || null,
          session_caisse_id: valeurs.mode === 'especes' && depuisCaisse ? sessions[0].id : null,
          // Rattachée au Hub choisi en haut de l'écran (sinon : Hub de la caisse, ou Hub principal).
          ...(multiHub && hub ? { hub_id: hub.id } : {}),
        },
      });
      onEnregistre('Dépense enregistrée');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Nouvelle dépense" onFermer={onFermer}>
      <form className="formulaire" onSubmit={enregistrer}>
        <Champ libelle="Libellé"><input value={valeurs.libelle} onChange={changer('libelle')} required autoFocus placeholder="Ex. : transport de marchandises" /></Champ>
        <div className="grille-champs">
          <Champ libelle="Montant"><input type="number" min="0" step="any" inputMode="decimal" value={valeurs.montant} onChange={changer('montant')} required /></Champ>
          <Champ libelle="Date"><input type="date" value={valeurs.date_depense} onChange={changer('date_depense')} required /></Champ>
          <Champ libelle="Catégorie">
            <input list="categories-depenses" value={valeurs.categorie} onChange={changer('categorie')} required />
            <datalist id="categories-depenses">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Champ>
          <Champ libelle="Payée par">
            <select value={valeurs.mode} onChange={changer('mode')}>
              {Object.entries(MODES_PAIEMENT).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
            </select>
          </Champ>
        </div>
        {valeurs.mode === 'especes' && sessions.length > 0 && (
          <label className="case">
            <input type="checkbox" checked={valeurs.depuis_caisse} onChange={changer('depuis_caisse')} />
            Prise dans le tiroir de la caisse ouverte (sera déduite au ticket Z)
          </label>
        )}
        <Champ libelle="Fournisseur (facultatif)">
          <select value={valeurs.fournisseur_id} onChange={changer('fournisseur_id')}>
            <option value="">—</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </Champ>
        <div className="article-photo">
          {valeurs.justificatif && <img className="vignette grande" src={valeurs.justificatif} alt="Justificatif" />}
          <label className="bouton secondaire">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={async (e) => {
                const fichier = e.target.files?.[0];
                if (!fichier) return;
                try {
                  const image = await lireImageReduite(fichier, 1000);
                  setValeurs((v) => ({ ...v, justificatif: image }));
                } catch (err) {
                  setErreur(err.message);
                }
              }}
            />
            Photo du justificatif
          </label>
        </div>
        {enValidation && (
          <p className="encart" role="status">
            À partir de {montant(seuil)}, une dépense hors caisse doit être validée : elle sera comptée seulement après l’accord d’un responsable.
          </p>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>{enValidation ? 'Envoyer en validation' : 'Enregistrer'}</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export default function Depenses() {
  const { api, etablissement, montant, peut, notifier, hub, multiHub, utilisateur } = useEspace();
  const etab = etablissement.id;
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const [periode, setPeriode] = useState('mois');
  // ?nouveau=1 : ouvre directement la saisie.
  const [nouvelle, setNouvelle] = useState(() => peut('depenses.gerer') && lireParametres().get('nouveau') === '1');
  const [annulation, setAnnulation] = useState(null);
  const [justificatif, setJustificatif] = useState(null);
  const [refus, setRefus] = useState(null);
  const [erreurDecision, setErreurDecision] = useState('');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const depuis = debut(periode);
    const [depenses, contacts, sessions, reglages, demandes] = await Promise.all([
      api.lire('depenses', { eq: { etablissement_id: etab, ...(hubFiltre ? { hub_id: hubFiltre } : {}) }, gte: depuis ? { date_depense: depuis } : {}, ordre: ['date_depense', 'desc'], limite: 500 }),
      peut('contacts.lire') ? api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }) : [],
      api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }).catch(() => []),
      api.rpc('reglages_depenses', { p_etablissement_id: etab }).catch(() => ({ seuil_validation: 0, peut_valider: false })),
      api.lire('demandes_depense', { eq: { etablissement_id: etab, ...(hubFiltre ? { hub_id: hubFiltre } : {}) }, ordre: ['demande_le', 'desc'], limite: 100, colonnes: [
        'id', 'date_depense', 'categorie', 'libelle', 'montant', 'mode', 'fournisseur_id', 'statut', 'demande_par', 'demande_le', 'decide_le', 'motif_refus',
      ] }).catch(() => []),
    ]);
    return { reglages, demandes, depenses, fournisseurs: contacts.filter((c) => c.type !== 'client'), noms: Object.fromEntries(contacts.map((c) => [c.id, c.nom])), sessions: sessions.filter((x) => !hubFiltre || x.hub_id === hubFiltre) };
  }, [etab, periode, hubFiltre]);

  const valides = (donnees?.depenses ?? []).filter((d) => d.statut === 'valide');
  const total = valides.reduce((s, d) => s + d.montant, 0);
  const parCategorie = {};
  for (const d of valides) parCategorie[d.categorie] = (parCategorie[d.categorie] ?? 0) + d.montant;
  const categories = [...new Set([...CATEGORIES, ...Object.keys(parCategorie)])];
  // À valider, puis les décisions des 30 derniers jours (pour que la personne qui a demandé voie la réponse).
  const limiteDecision = dateLocale(-30);
  // decide_le : texte (Supabase) ou Date (moteur local) ; new Date accepte les deux.
  const demandes = (donnees?.demandes ?? []).filter((x) => x.statut === 'a_valider' || (x.decide_le && new Date(x.decide_le) >= new Date(`${limiteDecision}T00:00:00`)));
  const decider = async (x, valider, motif) => {
    setErreurDecision('');
    try {
      await api.rpc('decider_demande_depense', { p_demande_id: x.id, p_valider: valider, p_motif: motif ?? null });
      notifier(valider ? 'Dépense validée et enregistrée' : 'Dépense refusée');
      recharger();
    } catch (err) {
      setErreurDecision(err.message);
      throw err;
    }
  };

  return (
    <div className="page">
      <EnTete titre="Dépenses" sousTitre={`${montant(total)} sur la période`}>
        {donnees?.depenses.length > 0 && (
          <Bouton icone="telecharger" onClick={() => exporterCsv(`depenses-${dateLocale()}.csv`, [
            { libelle: 'Date', valeur: (d) => d.date_depense },
            { libelle: 'Libellé', valeur: (d) => d.libelle },
            { libelle: 'Fournisseur', valeur: (d) => donnees.noms[d.fournisseur_id] ?? '' },
            { libelle: 'Catégorie', valeur: (d) => d.categorie ?? '' },
            { libelle: 'Payée par', valeur: (d) => MODES_PAIEMENT[d.mode] ?? d.mode },
            { libelle: 'Montant', valeur: (d) => d.montant },
            { libelle: 'État', valeur: (d) => (d.statut === 'annulee' ? `Annulée : ${d.motif_annulation ?? ''}` : 'Valide') },
          ], donnees.depenses)}>Exporter</Bouton>
        )}
        {peut('depenses.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setNouvelle(true)}>Nouvelle dépense</Bouton>}
      </EnTete>
      <div className="filtres">
        <Onglets onglets={PERIODES} actif={periode} onChange={setPeriode} />
      </div>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {Object.keys(parCategorie).length > 0 && (
        <div className="puces statiques">
          {Object.entries(parCategorie).sort((a, b) => b[1] - a[1]).map(([c, m]) => <span key={c}>{c} · <strong>{montant(m)}</strong></span>)}
        </div>
      )}
      {demandes.length > 0 && (
        <section className="section">
          <h2>Demandes de dépense</h2>
          <Erreur message={erreurDecision} />
          <div className="liste-simple">
            {demandes.map((x) => (
              <div key={x.id} className="liste-ligne">
                <span>
                  <strong>{x.libelle}</strong> · {montant(x.montant)}
                  <small className="texte-doux bloc">
                    {formatDate(x.date_depense)} · {x.categorie} · {MODES_PAIEMENT[x.mode]}{x.fournisseur_id ? ` · ${donnees.noms[x.fournisseur_id] ?? ''}` : ''}
                    {x.motif_refus ? ` · Refusée : ${x.motif_refus}` : ''}
                  </small>
                </span>
                {x.statut === 'a_valider' && donnees.reglages.peut_valider && x.demande_par !== utilisateur?.id ? (
                  <span className="groupe-boutons">
                    <Bouton onClick={() => setRefus(x)}>Refuser</Bouton>
                    <Bouton variante="principal" onClick={() => decider(x, true).catch(() => {})}>Valider</Bouton>
                  </span>
                ) : <Badge ton={x.statut === 'validee' ? 'vert' : x.statut === 'refusee' ? 'rouge' : 'orange'}>{{ a_valider: 'À valider', validee: 'Validée', refusee: 'Refusée' }[x.statut]}</Badge>}
              </div>
            ))}
          </div>
        </section>
      )}
      {donnees && !donnees.depenses.length && <Vide titre="Aucune dépense" texte="Enregistrez vos dépenses pour suivre votre résultat." />}
      {donnees?.depenses.length > 0 && (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Payée par</th><th className="nombre">Montant</th><th /></tr></thead>
            <tbody>
              {donnees.depenses.map((d) => (
                <tr key={d.id} className={d.statut === 'annulee' ? 'barre' : ''}>
                  <td>{formatDate(d.date_depense)}</td>
                  <td>
                    <strong>{d.libelle}</strong>
                    {d.fournisseur_id && <small className="texte-doux bloc">{donnees.noms[d.fournisseur_id]}</small>}
                    {d.statut === 'annulee' && <small className="texte-alerte bloc">Annulée : {d.motif_annulation}</small>}
                  </td>
                  <td>{d.categorie}</td>
                  <td>{MODES_PAIEMENT[d.mode]}{d.session_caisse_id && <Badge>caisse</Badge>}</td>
                  <td className="nombre">{montant(d.montant)}</td>
                  <td className="actions-ligne">
                    {d.justificatif && <button className="lien" onClick={() => setJustificatif(d.justificatif)}>Justificatif</button>}
                    {d.statut === 'valide' && peut('depenses.gerer') && <button className="lien danger" onClick={() => setAnnulation(d)}>Annuler</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nouvelle && donnees && (
        <FormulaireDepense
          fournisseurs={donnees.fournisseurs}
          sessions={donnees.sessions}
          categories={categories}
          reglages={donnees.reglages}
          onFermer={() => setNouvelle(false)}
          onEnregistre={(message) => {
            setNouvelle(false);
            notifier(message);
            recharger();
          }}
        />
      )}
      {annulation && (
        <ModaleMotif
          titre={`Annuler « ${annulation.libelle} »`}
          texte="La dépense reste visible, barrée, avec son motif."
          libelleAction="Annuler la dépense"
          onValider={(motif) => api.rpc('annuler_depense', { p_depense_id: annulation.id, p_motif: motif }).then(() => {
            notifier('Dépense annulée');
            recharger();
          })}
          onFermer={() => setAnnulation(null)}
        />
      )}
      {refus && (
        <ModaleMotif
          titre={`Refuser « ${refus.libelle} »`}
          texte="La personne qui a demandé la dépense est prévenue avec ce motif."
          libelleAction="Refuser la dépense"
          onValider={(motif) => decider(refus, false, motif)}
          onFermer={() => setRefus(null)}
        />
      )}
      {justificatif && (
        <Modale titre="Justificatif" onFermer={() => setJustificatif(null)}>
          <img src={justificatif} alt="Justificatif" className="justificatif" />
        </Modale>
      )}
    </div>
  );
}
