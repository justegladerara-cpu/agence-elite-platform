import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDate, formatMontant } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, ModaleMotif, PageHeader, Section, Tabs } from '../../ui/composants.jsx';

// Comptabilité (Bêta) : écritures générées depuis l'argent reçu et payé, saisie manuelle équilibrée, extourne,
// balance, grand livre, plan de comptes réglable. Aucun plan national imposé.
const NATURES = { actif: 'Actif', passif: 'Passif', charge: 'Charge', produit: 'Produit' };
const SOURCES = {
  manuelle: 'Saisie', extourne: 'Extourne', paiement_vente: 'Encaissement vente', annulation_paiement_vente: 'Annulation encaissement',
  remboursement_vente: 'Remboursement', depense: 'Dépense', annulation_depense: 'Annulation dépense', paiement_fournisseur: 'Paiement fournisseur',
  annulation_paiement_fournisseur: 'Annulation paiement fournisseur', paiement_location: 'Location', paiement_scolarite: 'Scolarité',
};
const AFFECTATIONS = [
  ['tresorerie_especes', 'Trésorerie : espèces'], ['tresorerie_mobile_money', 'Trésorerie : mobile money'], ['tresorerie_carte', 'Trésorerie : carte'],
  ['tresorerie_virement', 'Trésorerie : virement'], ['tresorerie_cheque', 'Trésorerie : chèque'], ['ventes', 'Ventes encaissées'],
  ['prestations', 'Location et scolarité'], ['retours_ventes', 'Remboursements clients'], ['charges', 'Dépenses'], ['achats', 'Paiements fournisseurs'],
];
const JOURNAUX_AFFECTES = [['journal_ventes', 'Journal des encaissements'], ['journal_achats', 'Journal des dépenses'], ['journal_divers', 'Journal des saisies']];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const montant = (v) => (Number(v) ? formatMontant(v) : '');

function useEnvoi(onFait) {
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const envoyer = async (fn, message) => {
    setChargement(true);
    setErreur('');
    try {
      const r = await fn();
      onFait(typeof message === 'function' ? message(r) : message);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return { erreur, chargement, envoyer };
}

function ModaleSaisie({ comptes, journaux, journalDefaut, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [f, setF] = useState({ journal_id: journalDefaut ?? journaux[0]?.id ?? '', date: iso(new Date()), libelle: '' });
  const [lignes, setLignes] = useState([{ compte_id: '', debit: '', credit: '' }, { compte_id: '', debit: '', credit: '' }]);
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  const total = (k) => lignes.reduce((s, l) => s + Number(l[k] || 0), 0);
  const ecart = Math.round((total('debit') - total('credit')) * 100) / 100;
  const maj = (i, cle, v) => setLignes(lignes.map((l, j) => (j === i ? { ...l, [cle]: v, ...(cle === 'debit' && v ? { credit: '' } : {}), ...(cle === 'credit' && v ? { debit: '' } : {}) } : l)));
  return (
    <Modale titre="Nouvelle écriture" onFermer={onFermer} large>
      <form className="formulaire" onSubmit={(e) => {
        e.preventDefault();
        envoyer(() => api.rpc('enregistrer_ecriture', { p_etablissement_id: etablissement.id, p: { ...f, lignes: lignes.filter((l) => l.compte_id).map((l) => ({ compte_id: l.compte_id, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) } }), 'Écriture enregistrée');
      }}>
        <div className="grille-champs">
          <Champ libelle="Journal"><select value={f.journal_id} onChange={(e) => setF({ ...f, journal_id: e.target.value })} required>{journaux.map((j) => <option key={j.id} value={j.id}>{j.code} · {j.libelle}</option>)}</select></Champ>
          <Champ libelle="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Champ>
        </div>
        <Champ libelle="Libellé"><input value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} required maxLength={300} placeholder="Ex. : apport en caisse" /></Champ>
        {lignes.map((l, i) => (
          <div key={i} className="grille-champs">
            <Champ libelle={`Compte ${i + 1}`}>
              <select value={l.compte_id} onChange={(e) => maj(i, 'compte_id', e.target.value)}>
                <option value="">Choisir</option>
                {comptes.map((c) => <option key={c.id} value={c.id}>{c.numero} · {c.libelle}</option>)}
              </select>
            </Champ>
            <Champ libelle="Débit"><input type="number" min="0" step="any" value={l.debit} onChange={(e) => maj(i, 'debit', e.target.value)} /></Champ>
            <Champ libelle="Crédit"><input type="number" min="0" step="any" value={l.credit} onChange={(e) => maj(i, 'credit', e.target.value)} /></Champ>
          </div>
        ))}
        <div className="actions"><Bouton type="button" icone="plus" onClick={() => setLignes([...lignes, { compte_id: '', debit: '', credit: '' }])}>Ajouter une ligne</Bouton></div>
        <p className={ecart ? 'texte-alerte' : 'texte-doux'}>Débit {formatMontant(total('debit'))} · Crédit {formatMontant(total('credit'))}{ecart ? ` · écart ${formatMontant(ecart)}` : ' · équilibrée'}</p>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement} disabled={ecart !== 0 || total('debit') <= 0}>Enregistrer</Bouton></div>
      </form>
    </Modale>
  );
}

function ModaleEcriture({ ecriture: e, lignes, compte, journal, extournee, peutSaisir, onFermer, onExtourner }) {
  return (
    <Modale titre={`Écriture ${e.numero}`} onFermer={onFermer} large
      pied={peutSaisir && e.source_type !== 'extourne' && !extournee && <Bouton variante="danger" onClick={onExtourner}>Extourner</Bouton>}>
      <div className="pile">
        <p>{formatDate(e.date_ecriture)} · {journal?.code} · <Badge>{SOURCES[e.source_type] ?? e.source_type}</Badge>{extournee && <> <Badge ton="neutre">Extournée</Badge></>}</p>
        <p><strong>{e.libelle}</strong></p>
        <div className="liste-simple">
          {lignes.map((l) => (
            <div key={l.id} className="liste-ligne">
              <span>{compte(l.compte_id)?.numero} · {compte(l.compte_id)?.libelle}</span>
              <strong>{Number(l.debit) ? `Débit ${formatMontant(l.debit)}` : `Crédit ${formatMontant(l.credit)}`}</strong>
            </div>
          ))}
        </div>
        <p className="texte-doux">Une écriture ne se modifie pas. Pour corriger, extournez-la puis saisissez la bonne.</p>
      </div>
    </Modale>
  );
}

function ModaleCompte({ compte, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [f, setF] = useState({ numero: '', libelle: '', nature: 'charge', actif: true, ...compte });
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  return (
    <Modale titre={compte?.id ? `Compte ${compte.numero}` : 'Nouveau compte'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); envoyer(() => api.rpc('enregistrer_compte_comptable', { p_etablissement_id: etablissement.id, p: { id: f.id, numero: f.numero, libelle: f.libelle, nature: f.nature, actif: f.actif } }), 'Compte enregistré'); }}>
        <div className="grille-champs">
          <Champ libelle="Numéro" aide="Chiffres ou lettres, selon le plan de votre comptable"><input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} required maxLength={20} /></Champ>
          <Champ libelle="Nature"><select value={f.nature} onChange={(e) => setF({ ...f, nature: e.target.value })}>{Object.entries(NATURES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
        </div>
        <Champ libelle="Libellé"><input value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} required maxLength={120} /></Champ>
        <label className="case"><input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} /><span>Compte utilisable</span></label>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>
      </form>
    </Modale>
  );
}

function Plan({ donnees, compte, peutGerer, onCompte, recharger }) {
  const { api, etablissement, notifier } = useEspace();
  const [erreur, setErreur] = useState('');
  const affectation = (cle) => donnees.affectations.find((a) => a.cle === cle);
  const changer = async (cle, id) => {
    setErreur('');
    try {
      await api.rpc('definir_affectation_comptable', { p_etablissement_id: etablissement.id, p_cle: cle, p_cible_id: id });
      notifier('Affectation enregistrée');
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const actifs = donnees.comptes.filter((c) => c.actif);
  return (
    <>
      <DataTable
        lignes={donnees.comptes}
        onLigne={peutGerer ? onCompte : undefined}
        titreExport="plan-comptable"
        rechercher={(c) => `${c.numero} ${c.libelle}`}
        placeholder="Numéro ou libellé"
        filtres={[{ id: 'nature', libelle: 'Nature', options: Object.entries(NATURES), appliquer: (c, v) => c.nature === v }]}
        vide={<EmptyState icone="activite" titre="Aucun compte" texte="Préparez le plan comptable pour commencer." />}
        colonnes={[
          { id: 'numero', libelle: 'Numéro', tri: (c) => c.numero, rendu: (c) => <strong>{c.numero}</strong> },
          { id: 'libelle', libelle: 'Libellé', rendu: (c) => c.libelle },
          { id: 'nature', libelle: 'Nature', rendu: (c) => NATURES[c.nature], exporter: (c) => NATURES[c.nature] },
          { id: 'actif', libelle: 'État', rendu: (c) => (c.actif ? <Badge ton="vert">Utilisable</Badge> : <Badge>Désactivé</Badge>), exporter: (c) => (c.actif ? 'Utilisable' : 'Désactivé') },
        ]}
      />
      {donnees.affectations.length > 0 && (
        <Section titre="Comptes utilisés par les écritures automatiques" sousTitre="À faire valider par votre comptable.">
          <Erreur message={erreur} />
          <div className="grille-champs">
            {AFFECTATIONS.map(([cle, libelle]) => (
              <Champ key={cle} libelle={libelle}>
                <select value={affectation(cle)?.compte_id ?? ''} disabled={!peutGerer} onChange={(e) => changer(cle, e.target.value)}>
                  {!affectation(cle) && <option value="">Choisir</option>}
                  {actifs.map((c) => <option key={c.id} value={c.id}>{c.numero} · {c.libelle}</option>)}
                </select>
              </Champ>
            ))}
            {JOURNAUX_AFFECTES.map(([cle, libelle]) => (
              <Champ key={cle} libelle={libelle}>
                <select value={affectation(cle)?.journal_id ?? ''} disabled={!peutGerer} onChange={(e) => changer(cle, e.target.value)}>
                  {donnees.journaux.filter((j) => j.actif).map((j) => <option key={j.id} value={j.id}>{j.code} · {j.libelle}</option>)}
                </select>
              </Champ>
            ))}
          </div>
          <p className="texte-doux">Compte de trésorerie actuellement utilisé pour les espèces : {compte(affectation('tresorerie_especes')?.compte_id)?.libelle ?? '—'}.</p>
        </Section>
      )}
    </>
  );
}

export default function Comptabilite() {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const params = lireParametres();
  const vueInitiale = params.get('vue');
  const [onglet, setOnglet] = useState(['balance', 'grand_livre', 'plan'].includes(vueInitiale) ? vueInitiale : 'ecritures');
  const auj = new Date();
  const [du, setDu] = useState(iso(new Date(auj.getFullYear(), auj.getMonth(), 1)));
  const [au, setAu] = useState(iso(auj));
  const [compteGL, setCompteGL] = useState('');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [comptes, journaux, affectations, ecritures, attente] = await Promise.all([
      api.lire('compta_comptes', { eq: { etablissement_id: etab }, ordre: ['numero'] }),
      api.lire('compta_journaux', { eq: { etablissement_id: etab }, ordre: ['code'] }),
      api.lire('compta_affectations', { eq: { etablissement_id: etab } }),
      api.lire('compta_ecritures', { eq: { etablissement_id: etab }, gte: { date_ecriture: du }, lte: { date_ecriture: au }, ordre: ['numero', 'desc'], limite: 2000 }),
      api.rpc('compta_apercu_attente', { p_etablissement_id: etab, p_au: au }).catch(() => null),
    ]);
    const ids = ecritures.map((e) => e.id);
    const lignes = ids.length ? await api.lire('compta_lignes', { dans: { ecriture_id: ids } }) : [];
    const extournes = ecritures.filter((e) => e.source_type === 'extourne').map((e) => e.source_id);
    const balance = await api.rpc('compta_balance', { p_etablissement_id: etab, p_du: du, p_au: au });
    return { comptes, journaux, affectations, ecritures, lignes, attente, balance: balance ?? [], extournes: new Set(extournes) };
  }, [etab, du, au]);
  const compte = (id) => donnees?.comptes.find((c) => c.id === id);
  const journal = (id) => donnees?.journaux.find((j) => j.id === id);
  const peutSaisir = peut('comptabilite.saisir');
  const peutGerer = peut('comptabilite.gerer');
  const pret = (donnees?.affectations ?? []).some((a) => a.cle === 'journal_ventes');
  const [modale, setModale] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreurAction, setErreurAction] = useState('');
  const fait = (m) => { setModale(null); notifier(m); recharger(); };
  const lancer = async (fn, message) => {
    setEnvoi(true);
    setErreurAction('');
    try {
      const r = await fn();
      notifier(typeof message === 'function' ? message(r) : message);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  const attente = donnees?.attente;
  const action = !pret
    ? peutGerer && <Bouton variante="principal" icone="plus" chargement={envoi} onClick={() => lancer(() => api.rpc('initialiser_comptabilite', { p_etablissement_id: etab }), 'Plan comptable préparé : faites-le valider par votre comptable')}>Préparer le plan comptable</Bouton>
    : onglet === 'plan'
      ? peutGerer && <Bouton variante="principal" icone="plus" onClick={() => setModale({ type: 'compte' })}>Nouveau compte</Bouton>
      : peutSaisir && (
        <>
          <Bouton icone="plus" onClick={() => setModale({ type: 'saisie' })}>Nouvelle écriture</Bouton>
          <Bouton variante="principal" icone="activite" chargement={envoi} disabled={!attente?.nombre}
            onClick={() => lancer(() => api.rpc('generer_ecritures', { p_etablissement_id: etab, p_au: au }), (r) => `${r.ecritures} écriture(s) générée(s)`)}>
            Générer les écritures{attente?.nombre ? ` (${attente.nombre})` : ''}
          </Bouton>
        </>
      );

  // Grand livre : lignes du compte choisi sur la période, avec solde cumulé.
  const ecritureDe = (id) => donnees?.ecritures.find((e) => e.id === id);
  let cumul = 0;
  const grandLivre = (donnees?.lignes ?? [])
    .filter((l) => l.compte_id === compteGL)
    .map((l) => ({ ...l, ecriture: ecritureDe(l.ecriture_id) }))
    .sort((a, b) => (a.ecriture.date_ecriture + a.ecriture.numero).localeCompare(b.ecriture.date_ecriture + b.ecriture.numero))
    .map((l) => { cumul += Number(l.debit) - Number(l.credit); return { ...l, cumul }; });
  const totalBalance = (k) => (donnees?.balance ?? []).reduce((s, b) => s + Number(b[k]), 0);

  return (
    <div className="page">
      <PageHeader titre="Comptabilité" sousTitre={pret ? 'Écritures, balance et grand livre' : 'Commencez par préparer le plan comptable.'}
        badges={<Badge ton="bleu">Bêta</Badge>} actions={action} />
      <Tabs onglets={[['ecritures', 'Écritures'], ['balance', 'Balance'], ['grand_livre', 'Grand livre'], ['plan', 'Plan comptable']]} actif={onglet} onChange={setOnglet} />
      <Erreur message={erreur || erreurAction} />
      {onglet !== 'plan' && (
        <div className="grille-champs">
          <Champ libelle="Du"><input type="date" value={du} onChange={(e) => e.target.value && setDu(e.target.value)} /></Champ>
          <Champ libelle="Au"><input type="date" value={au} onChange={(e) => e.target.value && setAu(e.target.value)} /></Champ>
          {onglet === 'grand_livre' && (
            <Champ libelle="Compte">
              <select value={compteGL} onChange={(e) => setCompteGL(e.target.value)}>
                <option value="">Choisir un compte</option>
                {(donnees?.comptes ?? []).map((c) => <option key={c.id} value={c.id}>{c.numero} · {c.libelle}</option>)}
              </select>
            </Champ>
          )}
        </div>
      )}
      {onglet === 'ecritures' && pret && attente?.nombre > 0 && (
        <p className="texte-doux">{attente.nombre} opération(s) pas encore en comptabilité, pour {formatMontant(attente.montant)}. Le bouton « Générer les écritures » les passe en une fois ; rien n’est créé deux fois.</p>
      )}
      {onglet === 'ecritures' && (
        <DataTable
          chargement={chargement}
          lignes={donnees?.ecritures}
          onLigne={(e) => setModale({ type: 'ecriture', ecriture: e })}
          titreExport="ecritures"
          rechercher={(e) => `${e.numero} ${e.libelle}`}
          placeholder="Numéro ou libellé"
          filtres={[
            { id: 'journal', libelle: 'Journal', options: (donnees?.journaux ?? []).map((j) => [j.id, j.code]), appliquer: (e, v) => e.journal_id === v },
            { id: 'source', libelle: 'Origine', options: Object.entries(SOURCES), appliquer: (e, v) => e.source_type === v },
          ]}
          vide={<EmptyState icone="activite" titre="Aucune écriture sur la période" texte={pret ? 'Générez les écritures ou saisissez-en une.' : 'Préparez d’abord le plan comptable.'} />}
          colonnes={[
            { id: 'numero', libelle: 'N°', tri: (e) => e.numero, rendu: (e) => <strong>{e.numero}</strong> },
            { id: 'date', libelle: 'Date', tri: (e) => e.date_ecriture, rendu: (e) => formatDate(e.date_ecriture), exporter: (e) => e.date_ecriture },
            { id: 'journal', libelle: 'Journal', rendu: (e) => journal(e.journal_id)?.code },
            { id: 'libelle', libelle: 'Libellé', rendu: (e) => e.libelle },
            { id: 'origine', libelle: 'Origine', rendu: (e) => SOURCES[e.source_type], exporter: (e) => SOURCES[e.source_type] },
            { id: 'total', libelle: 'Montant', classe: 'nombre', tri: (e) => Number(e.total), rendu: (e) => formatMontant(e.total), exporter: (e) => e.total },
          ]}
        />
      )}
      {onglet === 'balance' && (
        <>
          <DataTable
            chargement={chargement}
            lignes={donnees?.balance}
            cle="compte_id"
            onLigne={(b) => { setCompteGL(b.compte_id); setOnglet('grand_livre'); }}
            titreExport="balance"
            vide={<EmptyState icone="activite" titre="Aucun mouvement sur la période" />}
            colonnes={[
              { id: 'numero', libelle: 'Compte', tri: (b) => b.numero, rendu: (b) => <strong>{b.numero}</strong> },
              { id: 'libelle', libelle: 'Libellé', rendu: (b) => b.libelle },
              { id: 'debit', libelle: 'Débit', classe: 'nombre', tri: (b) => Number(b.debit), rendu: (b) => montant(b.debit), exporter: (b) => b.debit },
              { id: 'credit', libelle: 'Crédit', classe: 'nombre', tri: (b) => Number(b.credit), rendu: (b) => montant(b.credit), exporter: (b) => b.credit },
              { id: 'solde', libelle: 'Solde', classe: 'nombre', tri: (b) => Number(b.solde), rendu: (b) => formatMontant(b.solde), exporter: (b) => b.solde },
            ]}
          />
          <p className="texte-doux">Totaux : débit {formatMontant(totalBalance('debit'))} · crédit {formatMontant(totalBalance('credit'))}. Les deux sont toujours égaux.</p>
        </>
      )}
      {onglet === 'grand_livre' && (
        <DataTable
          chargement={chargement}
          lignes={grandLivre}
          onLigne={(l) => setModale({ type: 'ecriture', ecriture: l.ecriture })}
          titreExport="grand-livre"
          vide={<EmptyState icone="activite" titre={compteGL ? 'Aucun mouvement sur la période' : 'Choisissez un compte'} />}
          colonnes={[
            { id: 'date', libelle: 'Date', rendu: (l) => formatDate(l.ecriture.date_ecriture), exporter: (l) => l.ecriture.date_ecriture },
            { id: 'numero', libelle: 'Écriture', rendu: (l) => l.ecriture.numero },
            { id: 'libelle', libelle: 'Libellé', rendu: (l) => l.libelle ?? l.ecriture.libelle },
            { id: 'debit', libelle: 'Débit', classe: 'nombre', rendu: (l) => montant(l.debit), exporter: (l) => l.debit },
            { id: 'credit', libelle: 'Crédit', classe: 'nombre', rendu: (l) => montant(l.credit), exporter: (l) => l.credit },
            { id: 'cumul', libelle: 'Solde', classe: 'nombre', rendu: (l) => formatMontant(l.cumul), exporter: (l) => l.cumul },
          ]}
        />
      )}
      {onglet === 'plan' && donnees && <Plan donnees={donnees} compte={compte} peutGerer={peutGerer} onCompte={(c) => setModale({ type: 'compte', compte: c })} recharger={recharger} />}
      {modale?.type === 'saisie' && (
        <ModaleSaisie comptes={donnees.comptes.filter((c) => c.actif)} journaux={donnees.journaux.filter((j) => j.actif)}
          journalDefaut={donnees.affectations.find((a) => a.cle === 'journal_divers')?.journal_id} onFermer={() => setModale(null)} onFait={fait} />
      )}
      {modale?.type === 'ecriture' && (
        <ModaleEcriture ecriture={modale.ecriture} lignes={donnees.lignes.filter((l) => l.ecriture_id === modale.ecriture.id)} compte={compte}
          journal={journal(modale.ecriture.journal_id)} extournee={donnees.extournes.has(modale.ecriture.id)} peutSaisir={peutSaisir}
          onFermer={() => setModale(null)} onExtourner={() => setModale({ type: 'extourne', ecriture: modale.ecriture })} />
      )}
      {modale?.type === 'extourne' && (
        <ModaleMotif titre={`Extourner ${modale.ecriture.numero}`} texte="Une écriture inverse est créée à la même date. L’écriture d’origine reste visible." libelleAction="Extourner"
          onFermer={() => setModale(null)}
          onValider={async (motif) => { await api.rpc('extourner_ecriture', { p_ecriture_id: modale.ecriture.id, p_motif: motif }); notifier('Écriture extournée'); recharger(); }} />
      )}
      {modale?.type === 'compte' && <ModaleCompte compte={modale.compte} onFermer={() => setModale(null)} onFait={fait} />}
    </div>
  );
}
