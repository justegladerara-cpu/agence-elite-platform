import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatQuantite } from '../../noyau/format.js';
import { lienWhatsApp } from '../../noyau/messagesWhatsapp.js';
import { Bouton, Champ, EmptyState, Erreur, PageHeader, Section, Squelette } from '../../ui/composants.jsx';
import { BandeauNouveau, NOUVEAU_LOT3_JUSQUA } from '../../ui/Nouveau.jsx';
import { articlesSousMinimum, grouperCommande, retenusParArticle, suggestion, texteCommande } from './preparerCommande.js';
import './stock.css';

// Un fournisseur : ses articles, les quantités modifiables, le texte prêt, WhatsApp et « Copier ».
function GroupeFournisseur({ fournisseur, lignes, quantites, onQuantite }) {
  const { etablissement, notifier } = useEspace();
  const avecQuantites = lignes.map((l) => ({ ...l, quantite: Number(String(quantites[l.article_id] ?? l.quantite).replace(',', '.')) || 0 }));
  const texte = texteCommande({ fournisseur: fournisseur?.nom, etablissement: etablissement.nom, lignes: avecQuantites });
  const rien = !avecQuantites.some((l) => l.quantite > 0);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      notifier('Commande copiée : collez-la dans WhatsApp ou un SMS');
    } catch {
      window.prompt('Copiez la commande :', texte);
    }
  };
  const titre = fournisseur?.nom ?? 'Fournisseur à choisir';
  return (
    <Section titre={titre} sousTitre={fournisseur?.telephone ? `WhatsApp : ${fournisseur.telephone}` : 'WhatsApp vous demandera à qui envoyer.'} className="groupe-commande">
      <div className="liste-simple">
        {avecQuantites.map((l) => (
          <div key={l.article_id} className="liste-ligne ligne-commande">
            <span>
              <strong>{l.nom}</strong>
              <small className="texte-doux bloc">
                Stock {formatQuantite(l.stock, l.unite)} pour un minimum de {formatQuantite(l.minimum)}
              </small>
            </span>
            <Champ libelle={l.parConditionnement > 1 ? `${l.conditionnement} de ${l.parConditionnement}` : 'Quantité'}>
              <input type="number" min="0" step="any" inputMode="decimal" value={quantites[l.article_id] ?? String(l.quantite)}
                onChange={(e) => onQuantite(l.article_id, e.target.value)} aria-label={`Quantité à commander ${l.nom}`} />
            </Champ>
          </div>
        ))}
      </div>
      <Champ libelle="Message prêt à envoyer">
        <textarea readOnly rows={Math.min(14, 7 + avecQuantites.length)} value={texte} aria-label={`Message pour ${titre}`} />
      </Champ>
      <div className="actions">
        <Bouton icone="document" onClick={copier} disabled={rien}>Copier le texte</Bouton>
        <a className={`bouton principal ${rien ? 'desactive' : ''}`} href={rien ? undefined : lienWhatsApp(fournisseur?.telephone, texte)} target="_blank" rel="noreferrer"
          aria-disabled={rien}>Envoyer sur WhatsApp</a>
      </div>
    </Section>
  );
}

// « Préparer la commande » : articles au minimum ou en dessous, regroupés par fournisseur (celui retenu à la réception),
// quantité proposée modifiable, message WhatsApp prêt. Aucune commande n'est créée : la personne envoie elle-même.
export default function PreparerCommande({ naviguer }) {
  const { api, etablissement, hubs, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  const hubsStock = (multiHub && hub ? [hub] : hubs).filter((h) => h.capacite_stock !== false);
  const [hubId, setHubId] = useState(() => hubsStock.find((h) => h.principal)?.id ?? hubsStock[0]?.id ?? null);
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [articles, stock, conditionnements, contacts] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('stock_hubs', { eq: { etablissement_id: etab } }),
      api.lire('conditionnements_articles', { eq: { etablissement_id: etab } }).catch(() => []),
      api.lire('contacts', { eq: { etablissement_id: etab }, colonnes: ['id', 'nom', 'telephone'] }).catch(() => []),
    ]);
    return { articles, stock, retenus: retenusParArticle(conditionnements), contacts: Object.fromEntries(contacts.map((c) => [c.id, c])) };
  }, [etab]);
  const [quantites, setQuantites] = useState({});
  const groupes = useMemo(() => {
    if (!donnees) return [];
    const stockDe = Object.fromEntries(donnees.stock.filter((s) => s.hub_id === hubId).map((s) => [s.article_id, Number(s.quantite)]));
    const lignes = articlesSousMinimum(donnees.articles, stockDe).map((s) => {
      const retenu = donnees.retenus[s.article_id];
      const proposition = suggestion(s, retenu);
      return { ...s, ...proposition, conditionnement: retenu?.conditionnement, fournisseur_id: retenu?.fournisseur_id ?? null };
    });
    return grouperCommande(lignes);
  }, [donnees, hubId]);
  if (chargement && !donnees) return <Squelette lignes={6} />;
  if (erreur) return <Erreur message={erreur} />;
  return (
    <div className="page">
      <PageHeader
        titre="Préparer la commande"
        sousTitre="Ce qui est au minimum ou en dessous, par fournisseur, avec un message WhatsApp prêt"
        actions={<Bouton icone="stock" onClick={() => naviguer('stock')}>Retour au stock</Bouton>}
      />
      <BandeauNouveau jusqua={NOUVEAU_LOT3_JUSQUA}>
        Vérifiez les quantités proposées (le double du minimum, en casiers ou cartons quand on les connaît), puis « Envoyer sur
        WhatsApp » ou « Copier le texte ». Rien ne part tout seul.
      </BandeauNouveau>
      {hubsStock.length > 1 && (
        <Section>
          <Champ libelle="Stock de">
            <select value={hubId ?? ''} onChange={(e) => setHubId(e.target.value)}>
              {hubsStock.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
            </select>
          </Champ>
        </Section>
      )}
      {!groupes.length && (
        <Section>
          <EmptyState icone="coche" titre="Rien à commander" texte="Aucun article n’est à son stock minimum. Réglez le stock minimum sur la fiche de chaque article pour être prévenu." />
        </Section>
      )}
      {groupes.map((g) => (
        <GroupeFournisseur
          key={g.fournisseur_id ?? 'inconnu'}
          fournisseur={g.fournisseur_id ? donnees.contacts[g.fournisseur_id] ?? null : null}
          lignes={g.liste}
          quantites={quantites}
          onQuantite={(id, v) => setQuantites((q) => ({ ...q, [id]: v }))}
        />
      ))}
    </div>
  );
}
