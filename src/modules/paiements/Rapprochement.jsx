import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, ModaleMotif, PageHeader, Section, Squelette, StatCard, Tabs } from '../../ui/composants.jsx';
import { lireReleve, MODELE_RELEVE } from './lireReleve.js';

const NATURES = { paiement: 'Paiement reçu', paiement_fournisseur: 'Paiement fournisseur', depense: 'Dépense' };
const STATUTS = { rapproche: ['Rapprochée', 'vert'], ignore: ['Écartée', 'neutre'] };

function telechargerModele() {
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([MODELE_RELEVE], { type: 'text/csv;charset=utf-8' }));
  lien.download = 'modele-releve.csv';
  lien.click();
  URL.revokeObjectURL(lien.href);
}

// Import : le fichier est lu dans le navigateur, l'aperçu montre ce qui sera envoyé et les lignes illisibles.
function ModaleImport({ comptes, onFermer, onFait }) {
  const { api, etablissement, montant } = useEspace();
  const [compte, setCompte] = useState(comptes[0] ?? '');
  const [ordre, setOrdre] = useState('jma');
  const [texte, setTexte] = useState('');
  const [nomFichier, setNomFichier] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  let lecture = null;
  let erreurLecture = '';
  if (texte) {
    try {
      lecture = lireReleve(texte, ordre);
    } catch (err) {
      erreurLecture = err.message;
    }
  }
  const entrees = lecture?.operations.filter((o) => o.montant > 0).reduce((s, o) => s + o.montant, 0) ?? 0;
  const sorties = lecture?.operations.filter((o) => o.montant < 0).reduce((s, o) => s - o.montant, 0) ?? 0;
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      const r = await api.rpc('importer_releve', { p_etablissement_id: etablissement.id, p_compte: compte.trim(), p_lignes: lecture.operations });
      onFait(r.deja_importees
        ? `${r.importees} ligne(s) importée(s), ${r.deja_importees} déjà présente(s) ignorée(s)`
        : `${r.importees} ligne(s) importée(s)`);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Modale titre="Importer un relevé" onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">
          Exportez le relevé de votre banque ou de votre compte Mobile Money en tableur (CSV), puis choisissez le fichier. Une ligne déjà
          importée n’est jamais ajoutée deux fois.{' '}
          <button type="button" className="lien" onClick={telechargerModele}>Télécharger un modèle</button>
        </p>
        <div className="grille-champs">
          <Champ libelle="Compte" aide="Ex. Banque principale, Mobile Money">
            <input list="comptes-releve" value={compte} maxLength={60} onChange={(e) => setCompte(e.target.value)} required />
            <datalist id="comptes-releve">{comptes.map((c) => <option key={c} value={c} />)}</datalist>
          </Champ>
          <Champ libelle="Dates écrites">
            <select value={ordre} onChange={(e) => setOrdre(e.target.value)}>
              <option value="jma">Jour / mois / année</option>
              <option value="mja">Mois / jour / année</option>
            </select>
          </Champ>
        </div>
        <label className="bouton secondaire">
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            hidden
            aria-label="Fichier du relevé"
            onChange={async (e) => {
              const fichier = e.target.files?.[0];
              if (!fichier) return;
              setNomFichier(fichier.name);
              setTexte(await fichier.text());
            }}
          />
          {nomFichier || 'Choisir le fichier du relevé'}
        </label>
        <Erreur message={erreurLecture} />
        {lecture && (
          <>
            <p role="status">
              <strong>{lecture.operations.length}</strong> opération(s) lue(s) · entrées {montant(entrees)} · sorties {montant(sorties)}
            </p>
            {lecture.erreurs.length > 0 && (
              <div className="encart">
                {lecture.erreurs.length} ligne(s) illisible(s), non importée(s) :
                <ul>{lecture.erreurs.slice(0, 5).map((x) => <li key={x.ligne}>Ligne {x.ligne} : {x.raison}</li>)}</ul>
              </div>
            )}
            {lecture.operations.length > 2000 && <p className="encart">Pas plus de 2000 lignes par import : découpez le relevé.</p>}
          </>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi}
            disabled={!lecture?.operations.length || lecture.operations.length > 2000 || !compte.trim()}>
            Importer {lecture?.operations.length ? `${lecture.operations.length} ligne(s)` : ''}
          </Bouton>
        </div>
      </form>
    </Modale>
  );
}

function Candidat({ c, onChoisir }) {
  const { montant } = useEspace();
  return (
    <div className="liste-ligne">
      <span>
        <strong>{NATURES[c.objet_type]}</strong> · {montant(c.montant)} · {formatDate(c.jour)}
        <small className="texte-doux bloc">{[MODES_PAIEMENT[c.mode] ?? c.mode, c.reference, c.libelle].filter(Boolean).join(' · ')}</small>
      </span>
      <span>
        {c.score >= 100 && <><Badge ton="vert">Référence retrouvée</Badge> </>}
        <Bouton onClick={onChoisir}>Rapprocher</Bouton>
      </span>
    </div>
  );
}

export default function Rapprochement() {
  const { api, etablissement, montant, notifier } = useEspace();
  const [onglet, setOnglet] = useState('a_rapprocher');
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const { donnees: r, chargement, erreur, recharger } = useDonnees(
    () => api.rpc('rapprochement', { p_etablissement_id: etablissement.id }),
    [etablissement.id],
  );
  const executer = async (rpc, params, message) => {
    setErreurAction('');
    try {
      await api.rpc(rpc, params);
      notifier(message);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const proposees = r?.a_rapprocher.filter((l) => l.candidats.length) ?? [];
  return (
    <div className="page page-large">
      <PageHeader
        titre="Rapprochement"
        sousTitre="Relevés de banque et de Mobile Money comparés aux paiements reçus, aux paiements fournisseurs et aux dépenses."
        actions={<Bouton variante="principal" icone="plus" onClick={() => setAction('import')}>Importer un relevé</Bouton>}
      />
      {chargement && !r && <Squelette lignes={6} />}
      <Erreur message={erreur || erreurAction} />
      {r && (
        <>
          <div className="grille-stats">
            <StatCard icone="document" libelle="Lignes à rapprocher" valeur={r.a_rapprocher.length} ton={r.a_rapprocher.length ? 'attention' : undefined}
              detail={proposees.length ? `${proposees.length} avec une proposition` : undefined} onClick={() => setOnglet('a_rapprocher')} />
            <StatCard icone="ventes" libelle="Paiements sans relevé" valeur={r.paiements_sans_releve.length}
              detail="Reçus hors espèces, 60 derniers jours" onClick={() => setOnglet('sans_releve')} />
            {r.comptes.map((c) => (
              <StatCard key={c.compte} icone="facture" libelle={c.compte} valeur={montant(c.solde_mouvements)}
                detail={`${c.lignes} ligne(s) importée(s), dernière le ${formatDate(c.dernier_jour)}`} note="Somme des lignes importées, pas le solde de la banque" />
            ))}
          </div>
          <Tabs
            onglets={[['a_rapprocher', 'À rapprocher', r.a_rapprocher.length], ['sans_releve', 'Paiements sans relevé', r.paiements_sans_releve.length], ['traitees', 'Traitées']]}
            actif={onglet}
            onChange={setOnglet}
          />
          {onglet === 'a_rapprocher' && (r.a_rapprocher.length === 0 ? (
            <EmptyState icone="coche" titre="Rien à rapprocher" texte="Importez le dernier relevé de votre banque ou de votre compte Mobile Money." />
          ) : (
            <div className="pile">
              {r.a_rapprocher.map((l) => (
                <Section key={l.id}
                  titre={`${l.montant > 0 ? 'Reçu' : 'Sorti'} ${montant(Math.abs(l.montant))} · ${formatDate(l.jour)}`}
                  sousTitre={[l.compte, l.libelle, l.reference].filter(Boolean).join(' · ')}
                  action={<Bouton onClick={() => setAction({ ignorer: l })}>Écarter</Bouton>}>
                  {l.candidats.length === 0
                    ? <p className="texte-doux">Aucun mouvement de même montant à 10 jours près. Enregistrez le paiement ou la dépense, ou écartez la ligne (frais, virement interne…).</p>
                    : <div className="liste-simple">{l.candidats.map((c) => (
                      <Candidat key={c.objet_id} c={c}
                        onChoisir={() => executer('rapprocher_ligne_releve', { p_ligne_id: l.id, p_objet_type: c.objet_type, p_objet_id: c.objet_id }, 'Ligne rapprochée')} />
                    ))}</div>}
                </Section>
              ))}
            </div>
          ))}
          {onglet === 'sans_releve' && (
            <Section titre="Paiements reçus sans ligne de relevé" sousTitre="Mobile Money, carte, virement ou chèque enregistrés ces 60 derniers jours, pas encore retrouvés sur un relevé.">
              <DataTable lignes={r.paiements_sans_releve} titreExport="Paiements sans relevé" triInitial={{ id: 'jour', sens: 'desc' }}
                rechercher={(p) => `${p.vente} ${p.reference ?? ''}`}
                vide={<p className="texte-doux">Chaque paiement récent est retrouvé sur un relevé.</p>}
                colonnes={[
                  { id: 'jour', libelle: 'Date', rendu: (p) => formatDate(p.jour), tri: (p) => p.jour },
                  { id: 'vente', libelle: 'Vente', rendu: (p) => p.vente, tri: (p) => p.vente },
                  { id: 'mode', libelle: 'Mode', rendu: (p) => MODES_PAIEMENT[p.mode] ?? p.mode, tri: (p) => p.mode },
                  { id: 'reference', libelle: 'Référence', rendu: (p) => p.reference ?? '—', tri: (p) => p.reference ?? '' },
                  { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (p) => montant(p.montant), tri: (p) => Number(p.montant) },
                ]} />
            </Section>
          )}
          {onglet === 'traitees' && (
            <Section titre="Lignes traitées" sousTitre="Les 100 dernières. Un rapprochement se défait si l’on s’est trompé.">
              <DataTable lignes={r.derniers} titreExport="Lignes de relevé traitées" triInitial={{ id: 'traite_le', sens: 'desc' }}
                rechercher={(l) => `${l.compte} ${l.libelle} ${l.note ?? ''}`}
                vide={<p className="texte-doux">Aucune ligne traitée.</p>}
                colonnes={[
                  { id: 'jour', libelle: 'Date', rendu: (l) => formatDate(l.jour), tri: (l) => l.jour },
                  { id: 'compte', libelle: 'Compte', rendu: (l) => l.compte, tri: (l) => l.compte },
                  { id: 'libelle', libelle: 'Libellé', rendu: (l) => l.libelle, tri: (l) => l.libelle },
                  { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (l) => montant(l.montant), tri: (l) => Number(l.montant) },
                  { id: 'statut', libelle: 'État', rendu: (l) => <><Badge ton={STATUTS[l.statut][1]}>{STATUTS[l.statut][0]}</Badge> {l.objet_type ? NATURES[l.objet_type] : l.note}</>, exporter: (l) => `${STATUTS[l.statut][0]} ${l.objet_type ? NATURES[l.objet_type] : l.note ?? ''}` },
                  { id: 'traite_le', libelle: 'Traitée le', rendu: (l) => formatDateHeure(l.traite_le), tri: (l) => l.traite_le },
                  { id: 'defaire', libelle: '', rendu: (l) => <button type="button" className="lien" onClick={(e) => { e.stopPropagation(); executer('traiter_ligne_releve', { p_ligne_id: l.id, p_action: 'defaire' }, 'Ligne remise à rapprocher'); }}>Défaire</button>, exporter: () => '' },
                ]} />
            </Section>
          )}
        </>
      )}
      {action === 'import' && (
        <ModaleImport comptes={(r?.comptes ?? []).map((c) => c.compte)} onFermer={() => setAction(null)}
          onFait={(m) => { setAction(null); notifier(m); recharger(); }} />
      )}
      {action?.ignorer && (
        <ModaleMotif
          titre="Écarter la ligne"
          texte={`${action.ignorer.libelle} · ${montant(action.ignorer.montant)}. Elle ne sera plus proposée ; vous pourrez la remettre à rapprocher.`}
          libelleAction="Écarter"
          onValider={(note) => api.rpc('traiter_ligne_releve', { p_ligne_id: action.ignorer.id, p_action: 'ignorer', p_note: note }).then(() => { notifier('Ligne écartée'); recharger(); })}
          onFermer={() => setAction(null)}
        />
      )}
    </div>
  );
}
