import { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale } from '../../noyau/format.js';
import { Bouton, Champ, Erreur, Icone, PageHeader, Section, Squelette } from '../../ui/composants.jsx';
import { calculerLigne, totaux, TYPES_DOCUMENT } from './commun.js';

const ligneVide = (tva) => ({ cle: Math.random().toString(36).slice(2), article_id: '', libelle: '', description: '', quantite: '1', unite: '', prix_unitaire: '', remise: '', taux_tva: String(tva ?? 0) });

// Création ou modification d'un devis / d'une facture en brouillon. La base recalcule et valide tout.
export default function EditeurDocument({ type: typeNouveau, documentId, naviguer }) {
  const { api, etablissement, montant, hubs, multiHub, hub } = useEspace();
  const [v, setV] = useState(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const { donnees, erreur: erreurChargement } = useDonnees(async () => {
    const [contacts, articles, parametres, complet] = await Promise.all([
      api.lire('contacts', { eq: { etablissement_id: etablissement.id, actif: true }, ordre: ['nom'] }),
      api.lire('articles', { eq: { etablissement_id: etablissement.id, actif: true }, ordre: ['nom'] }),
      api.lire('etablissement_parametres', { eq: { etablissement_id: etablissement.id, module_id: 'facturation' } }).catch(() => []),
      documentId ? api.rpc('document_vente_complet', { p_document_id: documentId }) : null,
    ]);
    const tva = parametres[0]?.data?.tva_par_defaut ?? 0;
    const initial = complet ? {
      type: complet.document.type, contact_id: complet.document.contact_id, hub_id: complet.document.hub_id,
      date_document: complet.document.date_document, echeance: complet.document.echeance ?? '', objet: complet.document.objet ?? '',
      notes: complet.document.notes ?? '', conditions: complet.document.conditions ?? '',
      lignes: complet.lignes.map((l) => ({ ...ligneVide(), ...Object.fromEntries(Object.entries(l).map(([k, x]) => [k, x == null ? '' : String(x)])), cle: l.id })),
    } : {
      type: typeNouveau, contact_id: '', hub_id: hub?.id ?? '', date_document: dateLocale(), echeance: '', objet: '', notes: '', conditions: '',
      lignes: [ligneVide(tva)],
    };
    setV(initial);
    return { contacts: contacts.filter((c) => c.type !== 'fournisseur'), articles, tva, statut: complet?.document.statut, numero: complet?.document.numero };
  }, [documentId, typeNouveau]);
  const articleDe = useMemo(() => Object.fromEntries((donnees?.articles ?? []).map((a) => [a.id, a])), [donnees]);
  if (erreurChargement) return <div className="page"><Erreur message={erreurChargement} /></div>;
  if (!donnees || !v) return <div className="page"><Squelette lignes={8} /></div>;

  const changer = (champ) => (e) => setV((x) => ({ ...x, [champ]: e.target.value }));
  const changerLigne = (i, champ, valeur) => setV((x) => {
    const lignes = [...x.lignes];
    lignes[i] = { ...lignes[i], [champ]: valeur };
    if (champ === 'article_id' && valeur) {
      const a = articleDe[valeur];
      lignes[i] = { ...lignes[i], libelle: a.nom, prix_unitaire: String(a.prix_vente), unite: a.unite ?? '' };
    }
    return { ...x, lignes };
  });
  const deplacer = (i, sens) => setV((x) => {
    const lignes = [...x.lignes];
    const j = i + sens;
    if (j < 0 || j >= lignes.length) return x;
    [lignes[i], lignes[j]] = [lignes[j], lignes[i]];
    return { ...x, lignes };
  });
  const t = totaux(v.lignes);
  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const id = await api.rpc('enregistrer_document_vente', {
        p_etablissement_id: etablissement.id,
        p_document: {
          ...v, id: documentId,
          lignes: v.lignes.map(({ cle, id: _id, ...l }) => ({ ...l, article_id: l.article_id || null })),
        },
      });
      naviguer(`factures/${id}`);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  const titre = documentId ? `Modifier ${TYPES_DOCUMENT[v.type].toLowerCase()} ${donnees.numero ?? '(brouillon)'}` : `Nouveau ${TYPES_DOCUMENT[v.type].toLowerCase()}`;
  return (
    <div className="page">
      <PageHeader titre={titre} fil={[{ libelle: 'Devis et factures', href: '#/factures' }, { libelle: titre }]} />
      <form className="formulaire" onSubmit={enregistrer}>
        <Section>
          <div className="grille-champs">
            <Champ libelle="Client">
              <select value={v.contact_id} onChange={changer('contact_id')} required>
                <option value="">— Choisir un client</option>
                {donnees.contacts.map((c) => <option key={c.id} value={c.id}>{c.societe ? `${c.societe} (${c.nom})` : c.nom}</option>)}
              </select>
            </Champ>
            {multiHub && (
              <Champ libelle="Hub (stock et suivi)">
                <select value={v.hub_id} onChange={changer('hub_id')}>
                  <option value="">Hub principal</option>
                  {hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
                </select>
              </Champ>
            )}
            <Champ libelle="Date"><input type="date" value={v.date_document} onChange={changer('date_document')} required /></Champ>
            <Champ libelle={v.type === 'devis' ? 'Valable jusqu’au' : 'Échéance'} aide="Vide : délai par défaut des paramètres.">
              <input type="date" value={v.echeance} min={v.date_document} onChange={changer('echeance')} />
            </Champ>
          </div>
          <Champ libelle="Objet"><input value={v.objet} onChange={changer('objet')} maxLength={200} placeholder="Ex. Fourniture de marchandises, prestation de service…" /></Champ>
          {!donnees.contacts.length && <p className="encart">Aucun client : créez d’abord un contact de type client.</p>}
        </Section>
        <Section titre="Lignes">
          <div className="tableau-conteneur">
            <table className="tableau lignes-document">
              <thead>
                <tr><th>Article ou désignation</th><th className="nombre">Qté</th><th className="nombre">Prix unitaire HT</th><th className="nombre">Remise</th><th className="nombre">TVA %</th><th className="nombre">Total HT</th><th /></tr>
              </thead>
              <tbody>
                {v.lignes.map((l, i) => (
                  <tr key={l.cle}>
                    <td>
                      <select value={l.article_id} onChange={(e) => changerLigne(i, 'article_id', e.target.value)} aria-label={`Article de la ligne ${i + 1}`}>
                        <option value="">Texte libre</option>
                        {donnees.articles.map((a) => <option key={a.id} value={a.id}>{a.reference ? `${a.reference} · ` : ''}{a.nom}</option>)}
                      </select>
                      <input value={l.libelle} onChange={(e) => changerLigne(i, 'libelle', e.target.value)} required maxLength={200} placeholder="Désignation" aria-label={`Désignation de la ligne ${i + 1}`} />
                      <input value={l.description} onChange={(e) => changerLigne(i, 'description', e.target.value)} maxLength={1000} placeholder="Détail (facultatif)" aria-label={`Détail de la ligne ${i + 1}`} className="discret" />
                    </td>
                    <td className="nombre"><input type="number" min="0" step="any" inputMode="decimal" value={l.quantite} onChange={(e) => changerLigne(i, 'quantite', e.target.value)} required aria-label={`Quantité ligne ${i + 1}`} /></td>
                    <td className="nombre"><input type="number" min="0" step="any" inputMode="decimal" value={l.prix_unitaire} onChange={(e) => changerLigne(i, 'prix_unitaire', e.target.value)} required aria-label={`Prix ligne ${i + 1}`} /></td>
                    <td className="nombre"><input type="number" min="0" step="any" inputMode="decimal" value={l.remise} onChange={(e) => changerLigne(i, 'remise', e.target.value)} aria-label={`Remise ligne ${i + 1}`} /></td>
                    <td className="nombre"><input type="number" min="0" max="100" step="any" value={l.taux_tva} onChange={(e) => changerLigne(i, 'taux_tva', e.target.value)} aria-label={`TVA ligne ${i + 1}`} /></td>
                    <td className="nombre">{montant(calculerLigne(l).ht)}</td>
                    <td>
                      <div className="groupe-boutons">
                        <button type="button" className="icone-bouton" onClick={() => deplacer(i, -1)} aria-label="Monter" disabled={i === 0}>↑</button>
                        <button type="button" className="icone-bouton" onClick={() => setV((x) => ({ ...x, lignes: x.lignes.filter((_, k) => k !== i) }))} aria-label={`Supprimer la ligne ${i + 1}`} disabled={v.lignes.length === 1}>
                          <Icone nom="fermer" taille={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Bouton type="button" icone="plus" onClick={() => setV((x) => ({ ...x, lignes: [...x.lignes, ligneVide(donnees.tva)] }))}>Ajouter une ligne</Bouton>
          <div className="totaux-document">
            {t.tva > 0 && <div><span>Total HT</span><strong>{montant(t.ht)}</strong></div>}
            {t.tva > 0 && <div><span>TVA</span><strong>{montant(t.tva)}</strong></div>}
            <div className="total"><span>{t.tva > 0 ? 'Total TTC' : 'Total'}</span><strong>{montant(t.ttc)}</strong></div>
          </div>
        </Section>
        <Section>
          <div className="grille-champs">
            <Champ libelle="Notes (imprimées)"><textarea rows={3} value={v.notes} onChange={changer('notes')} maxLength={2000} /></Champ>
            <Champ libelle="Conditions (sinon celles des paramètres)"><textarea rows={3} value={v.conditions} onChange={changer('conditions')} maxLength={1000} /></Champ>
          </div>
        </Section>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={() => naviguer(documentId ? `factures/${documentId}` : 'factures')}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi}>Enregistrer le brouillon</Bouton>
        </div>
      </form>
    </div>
  );
}
