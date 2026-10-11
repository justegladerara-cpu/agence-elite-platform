import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate } from '../../noyau/format.js';
import { Bouton, Chargement, EmptyState, EnTete, Erreur, Modale } from '../../ui/composants.jsx';
import { ModalePaiement } from './Commande.jsx';
import { regrouperDettesFournisseurs } from './commun.js';
import '../paiements/dettes.css';

// « À qui je dois ? » : ce qui reste à payer aux fournisseurs (marchandise reçue), regroupé par fournisseur, avec les
// échéances et les retards. « Je l'ai payé » ouvre le paiement fournisseur déjà existant (payer_fournisseur).
export default function AQuiJeDois({ naviguer }) {
  const { api, etablissement, montant, peut, notifier, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const [choix, setChoix] = useState(null);
  const [paiement, setPaiement] = useState(null);
  const aujourdhui = dateLocale();
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [commandes, contacts] = await Promise.all([
      api.lire('commandes_achat', { eq: { etablissement_id: etab, ...(hubFiltre ? { hub_id: hubFiltre } : {}) }, ordre: ['date_commande', 'asc'], limite: 3000 }),
      api.lire('contacts', { eq: { etablissement_id: etab }, colonnes: ['id', 'nom', 'societe', 'telephone'] }).catch(() => []),
    ]);
    return { commandes, contacts: Object.fromEntries(contacts.map((c) => [c.id, c])) };
  }, [etab, hubFiltre]);

  const groupes = donnees ? regrouperDettesFournisseurs(donnees.commandes, aujourdhui) : [];
  const nom = (g) => donnees.contacts[g.fournisseur_id]?.societe || donnees.contacts[g.fournisseur_id]?.nom || 'Fournisseur';
  const total = groupes.reduce((s, g) => s + g.total, 0);
  const enRetard = groupes.reduce((s, g) => s + g.en_retard, 0);
  const payer = peut('achats.gerer');
  const ouvrirPaiement = (id) => {
    setChoix(null);
    setPaiement(donnees.commandes.find((c) => c.id === id));
  };

  return (
    <div className="page">
      <EnTete
        titre="À qui je dois ?"
        sousTitre={groupes.length ? `${montant(total)} à payer aux fournisseurs${enRetard > 0 ? ` · dont ${montant(enRetard)} en retard` : ''}` : 'Ce que vous devez encore à vos fournisseurs'}
      >
        <Bouton onClick={() => naviguer('achats?onglet=a_payer')}>Voir les commandes à payer</Bouton>
      </EnTete>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {donnees && !groupes.length && <EmptyState icone="coche" titre="Vous ne devez rien aux fournisseurs" texte="Toute la marchandise reçue est payée." />}
      <div className="dettes-liste">
        {groupes.map((g) => (
          <article key={g.fournisseur_id ?? 'sans'} className={`dette-carte ${g.en_retard > 0 ? 'en-retard' : ''}`}>
            <header className="dette-tete">
              <span>
                <strong>{nom(g)}</strong>
                <small className={`bloc ${g.en_retard > 0 ? 'texte-alerte' : 'texte-doux'}`}>
                  {g.en_retard > 0
                    ? `En retard : ${montant(g.en_retard)} (échéance du ${formatDate(g.prochaine_echeance)})`
                    : g.prochaine_echeance ? `À payer avant le ${formatDate(g.prochaine_echeance)}` : 'Pas d’échéance notée'}
                </small>
              </span>
              <strong className="dette-montant">{montant(g.total)}</strong>
            </header>
            <ul className="dette-lignes">
              {g.commandes.map((c) => (
                <li key={c.id}>
                  <span>
                    <button type="button" className="lien" onClick={() => naviguer(`achats/${c.id}`)}>{c.numero}</button>
                    {c.echeance ? <span className={c.retard ? 'texte-alerte' : ''}> · échéance {formatDate(c.echeance)}</span> : ''}
                  </span>
                  <span>{montant(c.reste)}</span>
                </li>
              ))}
            </ul>
            {payer && (
              <div className="dette-actions">
                <Bouton variante="principal" icone="coche" onClick={() => (g.commandes.length === 1 ? ouvrirPaiement(g.commandes[0].id) : setChoix(g))}>Je l’ai payé</Bouton>
              </div>
            )}
          </article>
        ))}
      </div>
      {choix && (
        <Modale titre={`Payer ${nom(choix)}`} onFermer={() => setChoix(null)}>
          <p className="texte-doux">Choisissez la commande payée (la plus urgente en premier) :</p>
          <div className="liste-simple">
            {choix.commandes.map((c) => (
              <div key={c.id} className="liste-ligne">
                <span><strong>{c.numero}</strong> · {montant(c.reste)}{c.echeance && <small className="texte-doux bloc">Échéance {formatDate(c.echeance)}</small>}</span>
                <Bouton onClick={() => ouvrirPaiement(c.id)}>Payer</Bouton>
              </div>
            ))}
          </div>
        </Modale>
      )}
      {paiement && (
        <ModalePaiement
          commande={paiement}
          onFermer={() => setPaiement(null)}
          onFait={() => {
            setPaiement(null);
            notifier('Paiement fournisseur enregistré');
            recharger();
          }}
        />
      )}
    </div>
  );
}
