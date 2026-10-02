import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale } from '../../noyau/format.js';
import { Bouton, Champ, Erreur, Icone, PageHeader, Section, Squelette } from '../../ui/composants.jsx';

const ligneVide = () => ({ cle: Math.random().toString(36).slice(2), article_id: '', quantite: '1', cout_unitaire: '' });

// Demande d'achat (achats.demander) ou commande fournisseur en brouillon (achats.gerer). La base valide tout.
export default function EditeurCommande({ commandeId, demande: demandeNouvelle, prefill, naviguer }) {
  const { api, etablissement, montant, hubs, hub, peut } = useEspace();
  const [v, setV] = useState(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const hubsStock = hubs.filter((h) => h.capacite_stock);
  const { donnees, erreur: erreurChargement } = useDonnees(async () => {
    const [fournisseurs, articles, commande, lignes] = await Promise.all([
      api.lire('contacts', { eq: { etablissement_id: etablissement.id, actif: true }, dans: { type: ['fournisseur', 'les_deux'] }, ordre: ['nom'] }),
      api.lire('articles', { eq: { etablissement_id: etablissement.id, actif: true, suivi_stock: true }, ordre: ['nom'] }),
      commandeId ? api.lire('commandes_achat', { eq: { id: commandeId } }).then((r) => r[0]) : null,
      commandeId ? api.lire('lignes_commande_achat', { eq: { commande_id: commandeId }, ordre: ['ordre'] }) : [],
    ]);
    const parDefaut = hubsStock.find((h) => h.id === hub?.id) ?? hubsStock.find((h) => h.type === 'depot') ?? hubsStock[0];
    setV(commande ? {
      demande: commande.statut === 'demande', fournisseur_id: commande.fournisseur_id ?? '', hub_id: commande.hub_id,
      date_commande: commande.date_commande, livraison_prevue: commande.livraison_prevue ?? '', echeance: commande.echeance ?? '',
      reference_fournisseur: commande.reference_fournisseur ?? '', notes: commande.notes ?? '',
      lignes: lignes.map((l) => ({ cle: l.id, article_id: l.article_id, quantite: String(l.quantite), cout_unitaire: String(l.cout_unitaire) })),
    } : {
      demande: Boolean(demandeNouvelle), fournisseur_id: '', hub_id: prefill?.hub_id ?? parDefaut?.id ?? '', date_commande: dateLocale(),
      livraison_prevue: '', echeance: '', reference_fournisseur: '', notes: '',
      lignes: prefill?.lignes?.length ? prefill.lignes.map((l) => ({ ...ligneVide(), article_id: l.article_id, quantite: String(l.quantite) })) : [ligneVide()],
    });
    return { fournisseurs, articles, numero: commande?.numero };
  }, [commandeId, demandeNouvelle]);
  const articleDe = useMemo(() => Object.fromEntries((donnees?.articles ?? []).map((a) => [a.id, a])), [donnees]);
  if (erreurChargement) return <div className="page"><Erreur message={erreurChargement} /></div>;
  if (!donnees || !v) return <div className="page"><Squelette lignes={8} /></div>;

  const changer = (champ) => (e) => setV((x) => ({ ...x, [champ]: e.target.value }));
  const changerLigne = (i, champ, valeur) => setV((x) => {
    const lignes = [...x.lignes];
    lignes[i] = { ...lignes[i], [champ]: valeur };
    if (champ === 'article_id' && valeur) lignes[i].cout_unitaire = String(articleDe[valeur]?.cout_achat ?? '');
    return { ...x, lignes };
  });
  const coutLigne = (l) => (l.cout_unitaire === '' ? Number(articleDe[l.article_id]?.cout_achat ?? 0) : Number(l.cout_unitaire));
  const total = v.lignes.reduce((t, l) => t + Math.round((Number(l.quantite) || 0) * coutLigne(l) * 100) / 100, 0);
  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const id = await api.rpc('enregistrer_commande_achat', {
        p_etablissement_id: etablissement.id,
        p: { ...v, id: commandeId, lignes: v.lignes.map(({ cle, ...l }) => l) },
      });
      naviguer(`achats/${id}`);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  const nature = v.demande ? 'demande d’achat' : 'commande fournisseur';
  const titre = commandeId ? `Modifier ${donnees.numero}` : `Nouvelle ${nature}`;
  return (
    <div className="page">
      <PageHeader titre={titre} sousTitre={v.demande ? 'Un responsable l’approuvera et choisira le fournisseur.' : undefined} fil={[{ libelle: 'Achats', href: '#/achats' }, { libelle: titre }]} />
      <form className="formulaire" onSubmit={enregistrer}>
        <Section>
          <div className="grille-champs">
            <Champ libelle={v.demande ? 'Fournisseur suggéré (facultatif)' : 'Fournisseur'}>
              <select value={v.fournisseur_id} onChange={changer('fournisseur_id')} required={!v.demande}>
                <option value="">— Choisir</option>
                {donnees.fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.societe || f.nom}</option>)}
              </select>
            </Champ>
            {hubsStock.length > 1 && (
              <Champ libelle="Livrer dans le Hub">
                <select value={v.hub_id} onChange={changer('hub_id')} required>
                  {hubsStock.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
                </select>
              </Champ>
            )}
            <Champ libelle="Date"><input type="date" value={v.date_commande} onChange={changer('date_commande')} required /></Champ>
            <Champ libelle="Livraison prévue"><input type="date" value={v.livraison_prevue} min={v.date_commande} onChange={changer('livraison_prevue')} /></Champ>
            {!v.demande && (
              <>
                <Champ libelle="Échéance de paiement" aide="Vide : délai par défaut des paramètres, à l’envoi.">
                  <input type="date" value={v.echeance} min={v.date_commande} onChange={changer('echeance')} />
                </Champ>
                <Champ libelle="Référence fournisseur (devis, proforma)"><input value={v.reference_fournisseur} onChange={changer('reference_fournisseur')} maxLength={60} /></Champ>
              </>
            )}
          </div>
          {!donnees.fournisseurs.length && !v.demande && (
            <p className="encart">Aucun fournisseur : créez d’abord un contact de type « Fournisseur ». <button type="button" className="lien" onClick={() => naviguer('contacts')}>Ouvrir les contacts</button></p>
          )}
        </Section>
        <Section titre="Articles">
          {!donnees.articles.length && <p className="encart">Aucun article suivi en stock. Seuls les articles stockés s’achètent ici ; les autres frais passent en dépenses.</p>}
          <div className="tableau-conteneur">
            <table className="tableau lignes-document">
              <thead><tr><th>Article</th><th className="nombre">Quantité</th><th className="nombre">Coût unitaire</th><th className="nombre">Total</th><th /></tr></thead>
              <tbody>
                {v.lignes.map((l, i) => (
                  <tr key={l.cle}>
                    <td>
                      <select value={l.article_id} onChange={(e) => changerLigne(i, 'article_id', e.target.value)} required aria-label={`Article de la ligne ${i + 1}`}>
                        <option value="">— Choisir un article</option>
                        {donnees.articles.map((a) => <option key={a.id} value={a.id}>{a.reference ? `${a.reference} · ` : ''}{a.nom}</option>)}
                      </select>
                    </td>
                    <td className="nombre"><input type="number" min="0" step="any" inputMode="decimal" value={l.quantite} onChange={(e) => changerLigne(i, 'quantite', e.target.value)} required aria-label={`Quantité ligne ${i + 1}`} /></td>
                    <td className="nombre"><input type="number" min="0" step="any" inputMode="decimal" value={l.cout_unitaire} onChange={(e) => changerLigne(i, 'cout_unitaire', e.target.value)} aria-label={`Coût ligne ${i + 1}`} placeholder="Coût fiche" /></td>
                    <td className="nombre">{montant(Math.round((Number(l.quantite) || 0) * coutLigne(l) * 100) / 100)}</td>
                    <td>
                      <button type="button" className="icone-bouton" onClick={() => setV((x) => ({ ...x, lignes: x.lignes.filter((_, k) => k !== i) }))} aria-label={`Supprimer la ligne ${i + 1}`} disabled={v.lignes.length === 1}>
                        <Icone nom="fermer" taille={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Bouton type="button" icone="plus" onClick={() => setV((x) => ({ ...x, lignes: [...x.lignes, ligneVide()] }))}>Ajouter un article</Bouton>
          <div className="totaux-document"><div className="total"><span>Total estimé</span><strong>{montant(total)}</strong></div></div>
        </Section>
        <Section>
          <Champ libelle="Notes"><textarea rows={3} value={v.notes} onChange={changer('notes')} maxLength={2000} placeholder={v.demande ? 'Pourquoi cet achat ? (rupture, client en attente…)' : ''} /></Champ>
        </Section>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={() => naviguer(commandeId ? `achats/${commandeId}` : 'achats')}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi} disabled={!v.demande && !peut('achats.gerer')}>
            {v.demande ? 'Envoyer la demande' : 'Enregistrer le brouillon'}
          </Bouton>
        </div>
      </form>
    </div>
  );
}
