import React, { useMemo, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Icone, Modale } from '../../ui/composants.jsx';
import {
  ajouterBillet, BILLETS_FCFA, erreurLigne, moyensActifs, paiementsPourVente,
} from './moyens.js';
import { celebrerEncaissement } from './effets.js';
import { PhotoServeur } from './communs.jsx';

// Encaissement de la nouvelle version (The Dream) : moyens réglables (MTN, Airtel, espèces, TPE…), billets du Congo,
// monnaie en grand, paiement en plusieurs moyens, « Qui a servi ? » avec les photos. Plus aucun pourboire.
export function Encaissement({
  total, contacts, contactId, onContact, onValider, onFermer, libelleRetour = 'Retour au panier',
  serveurs = [], serveursFiches = [], serviParInitial = '', clientRapide,
}) {
  const { montant, devise, reglagesFonctions } = useEspace();
  const moyens = useMemo(() => moyensActifs(reglagesFonctions), [reglagesFonctions]);
  const regleServeur = reglagesFonctions?.caisse?.qui_a_servi ?? 'rappel';
  const premier = moyens.find((m) => m.mode === 'especes') ?? moyens[0];
  const [lignes, setLignes] = useState([{ moyen: premier?.id, montant: '', chiffres: '', numero: '' }]);
  const [active, setActive] = useState(0);
  const [serviPar, setServiPar] = useState(serviParInitial);
  const [nouveaux, setNouveaux] = useState([]);
  const tousContacts = [...contacts, ...nouveaux.filter((n) => !contacts.some((c) => c.id === n.id))];
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const moyenDe = (l) => moyens.find((m) => m.id === l.moyen) ?? premier;
  const estEspeces = (l) => moyenDe(l)?.mode === 'especes';
  // Les espèces paient ce que les autres moyens laissent ; la monnaie se calcule sur elles seules.
  const horsEspeces = lignes.reduce((s, l) => s + (estEspeces(l) ? 0 : Number(l.montant || 0)), 0);
  const ligneEspeces = lignes.find(estEspeces);
  const duEspeces = Math.max(total - horsEspeces, 0);
  const recuEspeces = ligneEspeces ? (ligneEspeces.montant === '' ? duEspeces : Number(ligneEspeces.montant || 0)) : 0;
  const monnaie = ligneEspeces ? Math.max(recuEspeces - duEspeces, 0) : 0;
  const verse = horsEspeces + recuEspeces;
  const reste = Math.max(total - verse, 0);
  const trop = !ligneEspeces && horsEspeces > total;

  const ligne = lignes[active] ?? lignes[0];
  const moyen = moyenDe(ligne);
  const modifier = (champ, valeur, i = active) => setLignes((liste) => liste.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)));
  const autres = (i) => lignes.reduce((s, l, j) => s + (j === i ? 0 : Number(l.montant || 0)), 0);
  const choisirMoyen = (m) => {
    setErreur('');
    setLignes((liste) => liste.map((l, j) => {
      if (j !== active) return l;
      // Mobile money, carte : le montant se remplit tout seul avec ce qui reste à payer.
      const du = Math.max(total - autres(j), 0);
      return { ...l, moyen: m.id, montant: m.mode === 'especes' ? '' : String(du || ''), chiffres: m.id === l.moyen ? l.chiffres : '', numero: m.id === l.moyen ? l.numero : '' };
    }));
  };
  const ajouterMoyen = () => {
    const pris = new Set(lignes.map((l) => l.moyen));
    const suivant = moyens.find((m) => !pris.has(m.id)) ?? moyens[0];
    setLignes((liste) => {
      // La ligne en cours garde la moitié environ ; le reste va au nouveau moyen.
      const actuelle = liste[active];
      const montantActuel = Number(actuelle.montant || 0) || Math.round(total / 2);
      const garde = Math.min(montantActuel, total);
      const copie = liste.map((l, j) => (j === active ? { ...l, montant: String(garde) } : l));
      const restant = Math.max(total - copie.reduce((s, l) => s + Number(l.montant || 0), 0), 0);
      return [...copie, { moyen: suivant.id, montant: suivant.mode === 'especes' ? '' : String(restant || ''), chiffres: '', numero: '' }];
    });
    setActive(lignes.length);
  };
  const retirer = (i) => {
    setLignes((liste) => liste.filter((_, j) => j !== i));
    setActive(0);
  };

  const valider = async () => {
    setErreur('');
    const completes = lignes.map((l) => (estEspeces(l) && l.montant === '' ? { ...l, montant: String(duEspeces) } : l));
    for (const l of completes) {
      const message = erreurLigne(l, moyenDe(l));
      // Une ligne ajoutée puis laissée vide est ignorée quand d'autres lignes existent.
      if (message && !(Number(l.montant || 0) === 0 && completes.length > 1)) return setErreur(message);
    }
    if (trop) return setErreur('Le total des moyens dépasse le montant à payer. Corrigez un montant.');
    if (regleServeur === 'obligatoire' && serveurs.length > 0 && !serviPar) return setErreur('Qui a servi ? Touchez la photo du serveur.');
    setChargement(true);
    try {
      await onValider(paiementsPourVente(completes, moyens), { serviPar: serviPar.trim(), pourboire: null });
      celebrerEncaissement(monnaie > 0 ? `Rendez ${montant(monnaie)}` : 'Encaissé');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };

  const fiches = Object.fromEntries(serveursFiches.map((s) => [s.prenom.toLocaleLowerCase('fr'), s]));
  const billets = devise === 'XAF' || devise === 'XOF' ? BILLETS_FCFA : [5, 10, 20, 50, 100];

  return (
    <Modale
      titre="Encaisser"
      onFermer={onFermer}
      large
      pied={(
        <>
          {erreur && <span className="xp-enc-erreur" role="alert">{erreur}</span>}
          <Bouton onClick={onFermer}>{libelleRetour}</Bouton>
          <Bouton variante="principal" className="bouton principal bouton-valider-vente xp-valider" onClick={valider} chargement={chargement}>
            Valider · {montant(total)}
          </Bouton>
        </>
      )}
    >
      <div className="xp-enc">
        <div className="xp-enc-total">
          <span>À payer</span>
          <strong>{montant(total)}</strong>
        </div>

        {lignes.length > 1 && (
          <div className="xp-enc-lignes" role="tablist" aria-label="Moyens utilisés">
            {lignes.map((l, i) => {
              const m = moyenDe(l);
              return (
                <div key={i} className={`xp-enc-puce ${i === active ? 'actif' : ''}`}>
                  <button type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}>
                    <i style={{ background: m.couleur }} />
                    {m.libelle} · {montant(estEspeces(l) && l.montant === '' ? duEspeces : Number(l.montant || 0))}
                  </button>
                  <button type="button" className="xp-enc-retirer" onClick={() => retirer(i)} aria-label={`Retirer ${m.libelle}`}><Icone nom="fermer" taille={14} /></button>
                </div>
              );
            })}
          </div>
        )}

        <div className="xp-moyens" role="group" aria-label="Moyen de paiement">
          {moyens.map((m) => (
            <button key={m.id} type="button" className={`xp-moyen ${ligne.moyen === m.id ? 'actif' : ''}`} aria-pressed={ligne.moyen === m.id} onClick={() => choisirMoyen(m)}>
              <i style={{ background: m.couleur }} />
              <span>{m.libelle}</span>
            </button>
          ))}
        </div>

        {moyen?.mode === 'especes' ? (
          <div className="xp-enc-especes">
            <Champ libelle={lignes.length > 1 ? `Espèces à recevoir : ${montant(duEspeces)}. Le client donne :` : 'Le client donne'}>
              <input className="xp-gros-champ" type="number" min="0" step="any" inputMode="numeric" value={ligne.montant}
                onChange={(e) => modifier('montant', e.target.value)} placeholder={String(duEspeces)} aria-label="Montant donné par le client" />
            </Champ>
            <div className="xp-billets">
              {billets.map((b) => (
                <button key={b} type="button" onClick={() => modifier('montant', String(ajouterBillet(ligne.montant === '' ? 0 : ligne.montant, b, duEspeces)))}>
                  <small>+</small>{montant(b)}
                </button>
              ))}
              <button type="button" className="juste" onClick={() => modifier('montant', String(duEspeces))}>Compte juste</button>
            </div>
            <div className={`xp-monnaie ${monnaie > 0 ? 'oui' : ''}`} aria-live="polite">
              <span>Monnaie à rendre</span>
              <strong>{montant(monnaie)}</strong>
            </div>
          </div>
        ) : moyen && (
          <div className="xp-enc-reference">
            <Champ libelle={`Montant ${moyen.libelle}`} aide={lignes.length === 1 ? 'Rempli tout seul avec le montant à payer.' : undefined}>
              <input className="xp-gros-champ" type="number" min="0" step="any" inputMode="numeric" value={ligne.montant} onChange={(e) => modifier('montant', e.target.value)} />
            </Champ>
            {moyen.reference !== 'non' && (
              <Champ libelle={moyen.mode === 'mobile_money' ? `4 derniers chiffres de la référence ${moyen.libelle}` : 'Référence du ticket (facultatif)'}
                aide={moyen.reference === 'obligatoire' ? 'Obligatoire : on la retrouve sur le SMS de confirmation.' : undefined}>
                <input className="xp-gros-champ xp-chiffres" inputMode="numeric" maxLength={12} value={ligne.chiffres} autoFocus
                  onChange={(e) => modifier('chiffres', e.target.value.replace(/[^0-9A-Za-z]/g, ''))} placeholder="4821" />
              </Champ>
            )}
            {moyen.mode === 'mobile_money' && (
              <Champ libelle="Numéro du client (facultatif)">
                <input type="tel" inputMode="tel" maxLength={20} value={ligne.numero} onChange={(e) => modifier('numero', e.target.value)} placeholder="06 123 45 67" />
              </Champ>
            )}
          </div>
        )}

        {moyens.length > 1 && lignes.length < 4 && (
          <button type="button" className="lien xp-enc-ajouter" onClick={ajouterMoyen}>+ Payer une partie avec un autre moyen</button>
        )}

        {regleServeur !== 'non' && serveurs.length > 0 && (
          <fieldset className="xp-qui-a-servi">
            <legend>Qui a servi ?{regleServeur === 'obligatoire' ? '' : ' (facultatif)'}</legend>
            <div className="xp-serveurs">
              {serveurs.map((nom) => {
                const actif = serviPar && serviPar.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr');
                return (
                  <button key={nom} type="button" className={`xp-serveur ${actif ? 'actif' : ''}`} aria-pressed={!!actif} onClick={() => setServiPar(actif ? '' : nom)}>
                    <PhotoServeur prenom={nom} photo={fiches[nom.toLocaleLowerCase('fr')]?.photo_url} />
                    <span>{nom}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {(reste > 0 || trop) && (
          <div className={`xp-enc-reste ${trop ? 'trop' : ''}`}>
            <span>{trop ? 'Montant trop élevé' : 'Il paiera plus tard (reste dû)'}</span>
            <strong>{montant(trop ? horsEspeces - total : reste)}</strong>
          </div>
        )}
        {reste > 0 && (
          <>
            <Champ libelle="Qui paiera plus tard ?" aide="Obligatoire : choisissez le client qui doit le reste.">
              <select value={contactId ?? ''} onChange={(e) => onContact(e.target.value || null)}>
                <option value="">— Choisir —</option>
                {tousContacts.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </Champ>
            {clientRapide?.((c) => setNouveaux((l) => [...l, c]))}
          </>
        )}
      </div>
    </Modale>
  );
}
