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

function FormulaireDepense({ fournisseurs, sessions, categories, onFermer, onEnregistre }) {
  const { api, etablissement, hub, multiHub } = useEspace();
  const [valeurs, setValeurs] = useState({
    libelle: '', montant: '', categorie: 'Divers', date_depense: dateLocale(), mode: 'especes', fournisseur_id: '', justificatif: '',
    depuis_caisse: sessions.length > 0,
  });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const { depuis_caisse: depuisCaisse, ...reste } = valeurs;
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
      onEnregistre();
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
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export default function Depenses() {
  const { api, etablissement, montant, peut, notifier, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const [periode, setPeriode] = useState('mois');
  // ?nouveau=1 : ouvre directement la saisie.
  const [nouvelle, setNouvelle] = useState(() => peut('depenses.gerer') && lireParametres().get('nouveau') === '1');
  const [annulation, setAnnulation] = useState(null);
  const [justificatif, setJustificatif] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const depuis = debut(periode);
    const [depenses, contacts, sessions] = await Promise.all([
      api.lire('depenses', { eq: { etablissement_id: etab, ...(hubFiltre ? { hub_id: hubFiltre } : {}) }, gte: depuis ? { date_depense: depuis } : {}, ordre: ['date_depense', 'desc'], limite: 500 }),
      peut('contacts.lire') ? api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }) : [],
      api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }).catch(() => []),
    ]);
    return { depenses, fournisseurs: contacts.filter((c) => c.type !== 'client'), noms: Object.fromEntries(contacts.map((c) => [c.id, c.nom])), sessions: sessions.filter((x) => !hubFiltre || x.hub_id === hubFiltre) };
  }, [etab, periode, hubFiltre]);

  const valides = (donnees?.depenses ?? []).filter((d) => d.statut === 'valide');
  const total = valides.reduce((s, d) => s + d.montant, 0);
  const parCategorie = {};
  for (const d of valides) parCategorie[d.categorie] = (parCategorie[d.categorie] ?? 0) + d.montant;
  const categories = [...new Set([...CATEGORIES, ...Object.keys(parCategorie)])];

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
          onFermer={() => setNouvelle(false)}
          onEnregistre={() => {
            setNouvelle(false);
            notifier('Dépense enregistrée');
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
      {justificatif && (
        <Modale titre="Justificatif" onFermer={() => setJustificatif(null)}>
          <img src={justificatif} alt="Justificatif" className="justificatif" />
        </Modale>
      )}
    </div>
  );
}
