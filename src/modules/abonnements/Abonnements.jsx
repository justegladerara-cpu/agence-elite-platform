import { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
import { Badge, Bouton, Champ, Confirmation, DataTable, Erreur, Modale, ModaleMotif, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';

const PERIODICITES = { mensuel: 'Mensuel', trimestriel: 'Trimestriel', semestriel: 'Semestriel', annuel: 'Annuel' };
const STATUTS = { actif: ['Actif', 'vert'], suspendu: ['Suspendu', 'orange'], resilie: ['Résilié', 'neutre'] };

// Abonnements : abonnés, formules, périodes facturées ; facturation groupée des périodes dues.
export default function Abonnements({ naviguer }) {
  const { api, etablissement, peut, montant, notifier } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [formules, abonnements, periodes, contacts, articles, tdb] = await Promise.all([
      api.lire('abo_formules', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('abonnements', { eq: { etablissement_id: etab }, ordre: ['numero', 'desc'], limite: 3000 }),
      api.lire('abonnement_periodes', { eq: { etablissement_id: etab }, ordre: ['periode_debut', 'desc'], limite: 5000 }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.rpc('tableau_de_bord_abonnements', { p_etablissement_id: etab }),
    ]);
    return {
      formules, abonnements, periodes, articles, tdb,
      contacts: contacts.filter((c) => c.type !== 'fournisseur'),
      formule: Object.fromEntries(formules.map((f) => [f.id, f])),
      contact: Object.fromEntries(contacts.map((c) => [c.id, c])),
      abo: Object.fromEntries(abonnements.map((a) => [a.id, a])),
    };
  }, [etab]);
  const [onglet, setOnglet] = useState('abonnes');
  // #/abonnements?statut=…&nouveau=1 (tableau de bord).
  const [edition, setEdition] = useState(() => (lireParametres().get('nouveau') === '1' && peut('abonnements.gerer') ? { abonnement: {} } : null));
  const [facturer, setFacturer] = useState(false);
  const [erreurAction, setErreurAction] = useState('');
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const gerer = peut('abonnements.gerer');
  return (
    <div className="page page-large">
      <PageHeader titre="Abonnements" sousTitre="Contrats récurrents : une facture par période, jamais deux pour la même."
        actions={gerer && (
          <>
            {d.tdb.a_facturer > 0 && peut('facturation.gerer') && <Bouton onClick={() => setFacturer(true)}>Facturer les périodes dues ({d.tdb.a_facturer})</Bouton>}
            {onglet === 'formules'
              ? <Bouton variante="principal" icone="plus" onClick={() => setEdition({ formule: {} })}>Formule</Bouton>
              : <Bouton variante="principal" icone="plus" disabled={!d.formules.some((f) => f.actif)} onClick={() => setEdition({ abonnement: {} })}>Abonner un client</Bouton>}
          </>
        )} />
      <Erreur message={erreurAction} />
      <Tabs actif={onglet} onChange={setOnglet} onglets={[
        ['abonnes', 'Abonnés', d.abonnements.filter((a) => a.statut === 'actif').length],
        ['formules', 'Formules', d.formules.filter((f) => f.actif).length],
        ['periodes', 'Périodes facturées', d.periodes.length],
      ]} />
      {onglet === 'abonnes' && (
        <Section>
          <DataTable lignes={d.abonnements} onLigne={(a) => setEdition({ detail: a })}
            rechercher={(a) => `${a.numero} ${d.contact[a.contact_id]?.nom ?? ''} ${d.formule[a.formule_id]?.nom ?? ''}`}
            filtres={[{ id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS).map(([id, [l]]) => [id, l]), appliquer: (a, v) => a.statut === v }]}
            vide={<p className="texte-doux">{d.formules.length ? 'Aucun abonné.' : 'Créez d’abord une formule (onglet Formules).'}</p>}
            colonnes={[
              { id: 'numero', libelle: 'N°', rendu: (a) => <strong>{a.numero}</strong>, tri: (a) => a.numero },
              { id: 'client', libelle: 'Client', rendu: (a) => d.contact[a.contact_id]?.nom ?? '—', tri: (a) => d.contact[a.contact_id]?.nom ?? '' },
              { id: 'formule', libelle: 'Formule', rendu: (a) => d.formule[a.formule_id]?.nom },
              { id: 'prix', libelle: 'Prix', classe: 'nombre', rendu: (a) => `${montant(a.prix)} / ${PERIODICITES[d.formule[a.formule_id]?.periodicite]?.toLowerCase()}` },
              { id: 'echeance', libelle: 'Prochaine période', rendu: (a) => (a.statut === 'actif' ? formatDate(a.prochaine_echeance) : '—'), tri: (a) => a.prochaine_echeance },
              { id: 'statut', libelle: 'Statut', rendu: (a) => <Badge ton={STATUTS[a.statut][1]}>{STATUTS[a.statut][0]}</Badge> },
            ]} />
        </Section>
      )}
      {onglet === 'formules' && (
        <Section>
          <DataTable lignes={d.formules} onLigne={gerer ? (f) => setEdition({ formule: f }) : undefined}
            vide={<p className="texte-doux">Aucune formule (ex. Accès mensuel, Contrat de maintenance annuel).</p>}
            colonnes={[
              { id: 'nom', libelle: 'Formule', rendu: (f) => <strong>{f.nom}</strong> },
              { id: 'montant', libelle: 'Prix', classe: 'nombre', rendu: (f) => montant(f.montant) },
              { id: 'periodicite', libelle: 'Périodicité', rendu: (f) => PERIODICITES[f.periodicite] },
              { id: 'abonnes', libelle: 'Abonnés actifs', classe: 'nombre', rendu: (f) => d.abonnements.filter((a) => a.formule_id === f.id && a.statut === 'actif').length },
              { id: 'actif', libelle: 'État', rendu: (f) => <Badge ton={f.actif ? 'vert' : 'neutre'}>{f.actif ? 'Proposée' : 'Arrêtée'}</Badge> },
            ]} />
        </Section>
      )}
      {onglet === 'periodes' && (
        <Section>
          <DataTable lignes={d.periodes} onLigne={peut('facturation.lire') ? (p) => naviguer(`factures/${p.document_id}`) : undefined}
            vide={<p className="texte-doux">Aucune période facturée.</p>}
            colonnes={[
              { id: 'abo', libelle: 'Abonnement', rendu: (p) => d.abo[p.abonnement_id]?.numero },
              { id: 'client', libelle: 'Client', rendu: (p) => d.contact[d.abo[p.abonnement_id]?.contact_id]?.nom ?? '—' },
              { id: 'periode', libelle: 'Période', rendu: (p) => `${formatDate(p.periode_debut)} – ${formatDate(p.periode_fin)}`, tri: (p) => p.periode_debut },
              { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (p) => montant(p.montant) },
            ]} />
        </Section>
      )}
      {edition?.formule && <ModaleFormule formule={edition.formule} articles={d.articles} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); notifier('Formule enregistrée'); recharger(); }} />}
      {edition?.abonnement && d.formules.some((f) => f.actif) && <ModaleAbonnement d={d} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); notifier('Client abonné'); recharger(); }} />}
      {edition?.detail && <DetailAbonnement a={edition.detail} d={d} naviguer={naviguer} onFermer={() => setEdition(null)} onChange={() => { setEdition(null); recharger(); }} />}
      {facturer && (
        <Confirmation titre="Facturer les périodes dues" libelleAction="Facturer"
          texte={`${d.tdb.a_facturer} abonnement(s) ont une période à facturer. Une facture est émise par période ; le paiement se fait sur chaque facture.`}
          onFermer={() => setFacturer(false)}
          onValider={async () => {
            setFacturer(false);
            setErreurAction('');
            try {
              const r = await api.rpc('facturer_abonnements', { p_etablissement_id: etab });
              notifier(`${r.factures} facture(s) émise(s) pour ${montant(r.montant)}`);
              recharger();
            } catch (err) {
              setErreurAction(err.message);
            }
          }} />
      )}
    </div>
  );
}

function DetailAbonnement({ a, d, naviguer, onFermer, onChange }) {
  const { api, peut, montant, notifier } = useEspace();
  const [motif, setMotif] = useState(null);
  const [erreur, setErreur] = useState('');
  const periodes = d.periodes.filter((p) => p.abonnement_id === a.id);
  const changer = async (statut, texte) => {
    setErreur('');
    try {
      await api.rpc('changer_statut_abonnement', { p_id: a.id, p_statut: statut, p_motif: texte ?? null });
      notifier(STATUTS[statut][0]);
      onChange();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`${a.numero} · ${d.contact[a.contact_id]?.nom ?? ''}`} onFermer={onFermer}>
      <div className="detail">
        <p><Badge ton={STATUTS[a.statut][1]}>{STATUTS[a.statut][0]}</Badge> {d.formule[a.formule_id]?.nom} · {montant(a.prix)} · depuis le {formatDate(a.debut)}</p>
        {a.motif && <p className="encart">{a.motif}</p>}
        {a.statut === 'actif' && <p>Prochaine période : {formatDate(a.prochaine_echeance)}</p>}
        <table className="tableau">
          <thead><tr><th>Période</th><th className="nombre">Montant</th></tr></thead>
          <tbody>
            {periodes.map((p) => (
              <tr key={p.id}>
                <td>{peut('facturation.lire') ? <button type="button" className="lien" onClick={() => naviguer(`factures/${p.document_id}`)}>{formatDate(p.periode_debut)} – {formatDate(p.periode_fin)}</button> : `${formatDate(p.periode_debut)} – ${formatDate(p.periode_fin)}`}</td>
                <td className="nombre">{montant(p.montant)}</td>
              </tr>
            ))}
            {!periodes.length && <tr><td colSpan={2} className="texte-doux">Aucune période facturée.</td></tr>}
          </tbody>
        </table>
        <Erreur message={erreur} />
        {peut('abonnements.gerer') && a.statut !== 'resilie' && (
          <div className="actions">
            {a.statut === 'actif' && <Bouton onClick={() => setMotif('suspendu')}>Suspendre</Bouton>}
            {a.statut === 'suspendu' && <Bouton variante="principal" onClick={() => changer('actif')}>Reprendre</Bouton>}
            <Bouton onClick={() => setMotif('resilie')}>Résilier</Bouton>
          </div>
        )}
      </div>
      {motif && (
        <ModaleMotif titre={motif === 'resilie' ? 'Résilier l’abonnement' : 'Suspendre l’abonnement'}
          texte={motif === 'resilie' ? 'Plus aucune période ne sera facturée. Les factures déjà émises restent.' : 'Les périodes de pause ne sont pas facturées.'}
          libelleAction="Valider" onFermer={() => setMotif(null)} onValider={(texte) => { const s = motif; setMotif(null); changer(s, texte); }} />
      )}
    </Modale>
  );
}

function ModaleFormule({ formule, articles, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ nom: formule.nom ?? '', description: formule.description ?? '', article_id: formule.article_id ?? '',
    montant: formule.montant != null ? String(formule.montant) : '', periodicite: formule.periodicite ?? 'mensuel', actif: formule.actif ?? true });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('enregistrer_formule_abonnement', { p_etablissement_id: etablissement.id, p: { id: formule.id, ...v } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={formule.id ? formule.nom : 'Nouvelle formule'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Nom"><input value={v.nom} onChange={changer('nom')} required maxLength={120} autoFocus placeholder="Accès mensuel" /></Champ>
          <Champ libelle="Prix par période"><input type="number" min="0" step="any" value={v.montant} onChange={changer('montant')} required /></Champ>
          <Champ libelle="Périodicité"><select value={v.periodicite} onChange={changer('periodicite')}>{Object.entries(PERIODICITES).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Champ>
          <Champ libelle="Article facturé (facultatif)">
            <select value={v.article_id} onChange={changer('article_id')}>
              <option value="">— Aucun</option>
              {articles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </Champ>
        </div>
        <Champ libelle="Description"><textarea rows={2} value={v.description} onChange={changer('description')} maxLength={1000} /></Champ>
        {formule.id && <label className="case"><input type="checkbox" checked={v.actif} onChange={changer('actif')} /> Proposée aux nouveaux abonnés</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleAbonnement({ d, onFermer, onFait }) {
  const { api, etablissement, montant } = useEspace();
  const formules = d.formules.filter((f) => f.actif);
  const [v, setV] = useState({ contact_id: '', formule_id: formules[0]?.id ?? '', prix: '', debut: new Date().toISOString().slice(0, 10), note: '' });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('souscrire_abonnement', { p_etablissement_id: etablissement.id, p: v });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Abonner un client" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Client">
            <select value={v.contact_id} onChange={changer('contact_id')} required>
              <option value="">— Choisir</option>
              {d.contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Formule">
            <select value={v.formule_id} onChange={changer('formule_id')}>{formules.map((f) => <option key={f.id} value={f.id}>{f.nom} · {montant(f.montant)}</option>)}</select>
          </Champ>
          <Champ libelle="Prix particulier" aide="Vide : prix de la formule."><input type="number" min="0" step="any" value={v.prix} onChange={changer('prix')} /></Champ>
          <Champ libelle="Début"><input type="date" value={v.debut} onChange={changer('debut')} required /></Champ>
        </div>
        <Champ libelle="Note"><input value={v.note} onChange={changer('note')} maxLength={1000} /></Champ>
        <p className="texte-doux">Client absent de la liste : créez-le d’abord dans Contacts.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Abonner</Bouton>
        </div>
      </form>
    </Modale>
  );
}
