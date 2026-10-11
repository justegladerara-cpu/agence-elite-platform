import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { actionsAccessibles } from '../../noyau/actionsRapides.js';
import { dateLocale, formatDate } from '../../noyau/format.js';
import { ecrireModeSimple, useModeSimple } from '../../noyau/modeSimple.js';
import { Badge, Bouton, Erreur, Icone, StatCard } from '../../ui/composants.jsx';
import { pagesAccessibles } from '../index.js';
import { aFaire, boutonsAccessibles, chercherIntention, lienWhatsapp, texteBilanDuJour } from './accueil.js';
import './accueil.css';

// Accueil (#/accueil) : « Qu'est-ce que vous voulez faire ? ». Gros boutons selon les droits, barre « Je veux… »,
// chiffres du jour, liste « À faire aujourd'hui », bilan du jour sur WhatsApp et mode simple.
// Tout vient de fonctions existantes de la base : aucune donnée n'est calculée ici sans elle.
export default function Accueil({ naviguer }) {
  const espace = useEspace();
  const { api, etablissement, hub, peut, moduleActif, montant, devise, utilisateur } = espace;
  const etab = etablissement.id;
  const modeSimple = useModeSimple();
  const [texte, setTexte] = useState('');
  const pages = pagesAccessibles(espace);
  const boutons = boutonsAccessibles(pages, peut);
  const voitChiffres = peut('ventes.lire') || peut('tableau_de_bord.lire');

  const { donnees, erreur } = useDonnees(async () => {
    const jour = dateLocale();
    const [tdb, sessions, factures, peremptions, articles, ventes] = await Promise.all([
      voitChiffres ? api.rpc('tableau_de_bord_hub', { p_etablissement_id: etab, p_hub_id: hub?.id ?? null, p_du: jour, p_au: jour }).catch(() => null) : null,
      moduleActif('caisse') ? api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }).catch(() => []) : [],
      moduleActif('facturation') && peut('facturation.lire')
        ? api.rpc('tableau_de_bord_facturation', { p_etablissement_id: etab }).catch(() => null) : null,
      // Dates de péremption (migration 20261011000127) : sans la fonction, la ligne n'apparaît simplement pas.
      peut('stock.lire') ? api.rpc('peremptions_proches', { p_etablissement_id: etab, p_jours: 7 }).catch(() => null) : null,
      peut('articles.lire') ? api.lire('articles', { eq: { etablissement_id: etab }, limite: 5 }).catch(() => null) : null,
      peut('ventes.lire') ? api.lire('ventes', { eq: { etablissement_id: etab }, limite: 1 }).catch(() => null) : null,
    ]);
    const caissesAnciennes = sessions.filter((s) => String(s.ouverte_le).slice(0, 10) < jour).length;
    const facturesEnRetard = Number(factures?.nb_en_retard ?? 0);
    return { tdb, caissesAnciennes, facturesEnRetard, peremptions, articles, ventes };
  }, [etab, hub?.id]);

  const resultats = useMemo(
    () => chercherIntention(texte, { boutons, actions: actionsAccessibles(espace), pages }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texte, etab]
  );
  const todo = donnees ? aFaire({ ...donnees, devise }) : [];
  const nom = etablissement.marque?.documents?.nom_commercial ?? etablissement.nom;
  const prenom = (utilisateur?.prenom ?? utilisateur?.nom_complet ?? '').split(' ')[0];
  const tdb = donnees?.tdb;
  const bilan = tdb ? texteBilanDuJour({ nom, date: formatDate(dateLocale()), tdb, devise }) : null;
  const demarrage = peut('etablissement.modifier') && donnees && (donnees.articles?.length ?? 5) < 5;

  return (
    <div className="page accueil">
      <header className="accueil-tete">
        <div>
          <h1>Bonjour{prenom ? ` ${prenom}` : ''} 👋</h1>
          <p className="texte-doux">Qu’est-ce que vous voulez faire ?</p>
        </div>
        <label className="accueil-mode">
          <input type="checkbox" checked={modeSimple} onChange={(e) => ecrireModeSimple(e.target.checked)} />
          <span>Mode simple <small className="texte-doux">(menu réduit à l’essentiel)</small></span>
        </label>
      </header>

      <form className="accueil-je-veux" onSubmit={(e) => { e.preventDefault(); if (resultats[0]) naviguer(resultats[0].route); }}>
        <Icone nom="recherche" />
        <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Je veux… (ex. dépense, facture, compter, commander)" aria-label="Je veux" />
      </form>
      {resultats.length > 0 && (
        <ul className="accueil-resultats">
          {resultats.map((r) => (
            <li key={r.id}><button type="button" onClick={() => naviguer(r.route)}><Icone nom={r.icone} /> {r.libelle}</button></li>
          ))}
        </ul>
      )}

      <div className="accueil-boutons">
        {boutons.map((b) => (
          <button key={b.id} type="button" className={`accueil-bouton ${b.id === 'vendre' ? 'principal' : ''}`} onClick={() => naviguer(b.route)}>
            <Icone nom={b.icone} taille={28} />
            <strong>{b.libelle}</strong>
            <small>{b.detail}</small>
          </button>
        ))}
      </div>

      <Erreur message={erreur} />
      {tdb && (
        <section>
          <h2 className="accueil-titre">Aujourd’hui</h2>
          <div className="accueil-chiffres">
            <StatCard icone="ventes" libelle="Ventes du jour" valeur={montant(tdb.chiffre_affaires)} detail={`${tdb.nombre_ventes} vente(s)`} onClick={peut('ventes.lire') ? () => naviguer('ventes') : undefined} />
            <StatCard icone="caisse" libelle="Argent encaissé" valeur={montant(tdb.encaissements)} detail="espèces, Mobile Money…" />
            <StatCard icone="depenses" libelle="Dépenses" valeur={montant(tdb.depenses)} onClick={peut('depenses.lire') ? () => naviguer('depenses') : undefined} />
            <StatCard icone="stock" libelle="Bientôt épuisés" valeur={String(tdb.stock_bas?.length ?? 0)} detail="article(s)" ton={tdb.stock_bas?.length ? 'alerte' : undefined} onClick={peut('stock.lire') ? () => naviguer('stock') : undefined} />
          </div>
          {bilan && (
            <a className="bouton accueil-whatsapp" href={lienWhatsapp(bilan)} target="_blank" rel="noreferrer">
              <Icone nom="message" /> Envoyer le bilan du jour sur WhatsApp
            </a>
          )}
        </section>
      )}

      {donnees && (
        <section>
          <h2 className="accueil-titre">À faire aujourd’hui</h2>
          {todo.length === 0 && <p className="texte-doux"><Icone nom="coche" /> Rien d’urgent. Bonne journée !</p>}
          <ul className="accueil-a-faire">
            {todo.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => naviguer(t.route)}>
                  <Badge ton={t.ton}>À faire</Badge> <span>{t.texte}</span> <Icone nom="chevron" taille={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {demarrage && (
        <section className="carte accueil-demarrage">
          <h2 className="accueil-titre">Bien démarrer en 5 étapes</h2>
          <ol>
            <li><button type="button" className="lien" onClick={() => naviguer('parametres')}>Mettre votre nom et votre logo</button></li>
            <li><button type="button" className="lien" onClick={() => naviguer('articles?nouveau=1')}>Ajouter vos premiers articles (ou partir d’un modèle par métier)</button></li>
            <li><button type="button" className="lien" onClick={() => naviguer('stock?vue=reception')}>Entrer votre stock de départ (« J’ai reçu »)</button></li>
            <li><button type="button" className="lien" onClick={() => naviguer('equipe')}>Ajouter votre caissier</button></li>
            <li><button type="button" className="lien" onClick={() => naviguer('caisse')}>Faire une première vente test</button>{donnees.ventes?.length ? <> <Badge ton="vert">Fait</Badge></> : null}</li>
          </ol>
          {pages.some((p) => p.id === 'mise-en-service') && <Bouton onClick={() => naviguer('mise-en-service')}>Voir la liste complète de mise en service</Bouton>}
        </section>
      )}
    </div>
  );
}
