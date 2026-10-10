import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { MODES_PAIEMENT } from '../../noyau/format.js';
import { Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';

const jourIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const decaler = (jours) => { const d = new Date(); d.setDate(d.getDate() + jours); return jourIso(d); };
const nouvelleVente = () => ({ cle: Math.random().toString(36).slice(2), heure: '', mode: 'especes', contact_id: '', lignes: [{ article_id: '', quantite: '1' }] });
const nombre = (v) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));

// Ventes d'un jour passé saisies après coup (droit caisse.rattraper) : plusieurs ventes, puis la caisse de ce jour est
// fermée avec son ticket Z. Mêmes contrôles qu'en caisse (prix du jour de la saisie, stock, crédit).
export default function VentesPassees({ pointsDeVente, onFermer, onFait }) {
  const { api, etablissement, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees } = useDonnees(async () => {
    const [articles, contacts] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
    ]);
    return { articles, contacts: contacts.filter((c) => c.type !== 'fournisseur') };
  }, [etab]);
  const [pdv, setPdv] = useState(pointsDeVente[0]?.id ?? '');
  const [jour, setJour] = useState(decaler(-1));
  const [motif, setMotif] = useState('');
  const [especes, setEspeces] = useState('');
  const [ventes, setVentes] = useState([nouvelleVente()]);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const prix = useMemo(() => Object.fromEntries((donnees?.articles ?? []).map((a) => [a.id, Number(a.prix_vente)])), [donnees]);
  const totalVente = (v) => v.lignes.reduce((s, l) => s + (prix[l.article_id] ?? 0) * (nombre(l.quantite) || 0), 0);
  const total = ventes.reduce((s, v) => s + totalVente(v), 0);
  const changer = (cle, maj) => setVentes((liste) => liste.map((v) => (v.cle === cle ? { ...v, ...maj } : v)));
  const changerLigne = (v, i, maj) => changer(v.cle, { lignes: v.lignes.map((l, j) => (j === i ? { ...l, ...maj } : l)) });

  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const r = await api.rpc('saisir_ventes_passees', {
        p_etablissement_id: etab,
        p_point_de_vente_id: pdv,
        p_jour: jour,
        p_motif: motif,
        p_especes_comptees: especes === '' ? null : nombre(especes),
        p_fond_initial: 0,
        p_ventes: ventes.map((v) => {
          const t = totalVente(v);
          return {
            heure: v.heure || null,
            lignes: v.lignes.filter((l) => l.article_id).map((l) => ({ article_id: l.article_id, quantite: nombre(l.quantite) })),
            paiements: v.mode === 'credit' ? [] : [{ mode: v.mode, montant: t }],
            contact_id: v.contact_id || null,
          };
        }),
      });
      onFait(r);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };

  return (
    <Modale
      titre="Saisir les ventes d’un jour passé"
      onFermer={onFermer}
      large
      pied={(
        <>
          <span className="texte-doux">{ventes.length} vente(s) · {montant(total)}</span>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" type="submit" form="ventes-passees" chargement={chargement} disabled={!donnees || !total}>
            Enregistrer et fermer la caisse de ce jour
          </Bouton>
        </>
      )}
    >
      <form id="ventes-passees" className="formulaire" onSubmit={valider}>
        <p className="texte-doux">
          Pour les ventes faites sans la caisse (coupure, oubli). Elles sont datées du jour choisi et marquées « Saisie après
          coup » ; la caisse de ce jour est fermée avec son ticket Z. La caisse d’aujourd’hui n’est pas touchée.
        </p>
        <div className="grille-champs">
          {pointsDeVente.length > 1 && (
            <Champ libelle="Caisse">
              <select value={pdv} onChange={(e) => setPdv(e.target.value)}>
                {pointsDeVente.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            </Champ>
          )}
          <Champ libelle="Jour des ventes">
            <input type="date" value={jour} min={decaler(-31)} max={decaler(-1)} onChange={(e) => setJour(e.target.value)} required />
          </Champ>
          <Champ libelle="Pourquoi après coup ?">
            <input value={motif} maxLength={200} onChange={(e) => setMotif(e.target.value)} required placeholder="Ex. : coupure d’électricité" />
          </Champ>
        </div>
        {ventes.map((v, n) => (
          <fieldset key={v.cle} className="carte">
            <legend>Vente {n + 1} · {montant(totalVente(v))}</legend>
            {v.lignes.map((l, i) => (
              <div key={i} className="grille-champs">
                <Champ libelle={`Article (vente ${n + 1})`}>
                  <select value={l.article_id} onChange={(e) => changerLigne(v, i, { article_id: e.target.value })} required={i === 0}>
                    <option value="">Choisir…</option>
                    {(donnees?.articles ?? []).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                  </select>
                </Champ>
                <Champ libelle={`Quantité (vente ${n + 1})`}>
                  <input inputMode="decimal" value={l.quantite} onChange={(e) => changerLigne(v, i, { quantite: e.target.value })} required />
                </Champ>
              </div>
            ))}
            <div className="grille-champs">
              <Champ libelle={`Paiement (vente ${n + 1})`}>
                <select value={v.mode} onChange={(e) => changer(v.cle, { mode: e.target.value })}>
                  {Object.entries(MODES_PAIEMENT).map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
                  <option value="credit">À crédit</option>
                </select>
              </Champ>
              {v.mode === 'credit' && (
                <Champ libelle={`Client qui doit (vente ${n + 1})`}>
                  <select value={v.contact_id} onChange={(e) => changer(v.cle, { contact_id: e.target.value })} required>
                    <option value="">Choisir…</option>
                    {(donnees?.contacts ?? []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </Champ>
              )}
              <Champ libelle={`Heure, facultatif (vente ${n + 1})`}>
                <input type="time" value={v.heure} onChange={(e) => changer(v.cle, { heure: e.target.value })} />
              </Champ>
            </div>
            <div className="actions">
              <button type="button" className="lien" onClick={() => changer(v.cle, { lignes: [...v.lignes, { article_id: '', quantite: '1' }] })}>Ajouter un article</button>
              {ventes.length > 1 && <button type="button" className="lien" onClick={() => setVentes((liste) => liste.filter((x) => x.cle !== v.cle))}>Retirer cette vente</button>}
            </div>
          </fieldset>
        ))}
        <div className="actions">
          <Bouton type="button" icone="plus" onClick={() => setVentes((liste) => [...liste, nouvelleVente()])}>Ajouter une vente</Bouton>
        </div>
        <Champ libelle="Espèces comptées ce jour-là (facultatif)" aide="Laissez vide si vous ne les connaissez pas : le ticket Z portera « espèces à compter ».">
          <input inputMode="decimal" value={especes} onChange={(e) => setEspeces(e.target.value)} />
        </Champ>
        <Erreur message={erreur} />
      </form>
    </Modale>
  );
}
