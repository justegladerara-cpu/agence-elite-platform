import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lienMenu, svgQr } from '../../noyau/qr.js';
import { Badge, Bouton, Champ, EmptyState, Erreur, Modale, PageHeader, Section, Squelette } from '../../ui/composants.jsx';
import './menu-qr.css';

// QR code d'une table, dessiné dans le navigateur.
export function ImageQr({ texte, libelle }) {
  const svg = useMemo(() => svgQr(texte), [texte]);
  // eslint-disable-next-line react/no-danger
  return <div className="image-qr" role="img" aria-label={`QR code ${libelle}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function AjoutTables({ restaurant, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [prefixe, setPrefixe] = useState('Table');
  const [de, setDe] = useState('1');
  const [a, setA] = useState('10');
  const [seul, setSeul] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const lancer = async (p) => {
    setChargement(true);
    setErreur('');
    try {
      const n = await api.rpc('generer_emplacements_qr', { p_etablissement_id: etablissement.id, p });
      onFait(`${n} QR code(s) ajouté(s)`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  const ajouterUn = async () => {
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('enregistrer_emplacement_qr', { p_etablissement_id: etablissement.id, p: { libelle: seul } });
      onFait(`QR code « ${seul} » ajouté`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Ajouter des QR codes" onFermer={onFermer}>
      <div className="formulaire">
        {restaurant && (
          <div className="encart">
            <strong>Vos tables de la Salle</strong>
            <p className="texte-doux">Un QR code pour chaque table déjà créée dans la Salle : les commandes arriveront sur la bonne table.</p>
            <Bouton variante="principal" chargement={chargement} onClick={() => lancer({ depuis_tables: true })}>Reprendre les tables de la Salle</Bouton>
          </div>
        )}
        <div className="grille-champs">
          <Champ libelle="Nom"><input value={prefixe} maxLength={30} onChange={(e) => setPrefixe(e.target.value)} /></Champ>
          <Champ libelle="De"><input inputMode="numeric" value={de} onChange={(e) => setDe(e.target.value)} /></Champ>
          <Champ libelle="À"><input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} /></Champ>
        </div>
        <Bouton variante={restaurant ? 'secondaire' : 'principal'} chargement={chargement} onClick={() => lancer({ prefixe, de: Number(de), a: Number(a) })}>
          Créer {prefixe || 'Table'} {de} à {prefixe || 'Table'} {a}
        </Bouton>
        <Champ libelle="Ou un seul emplacement" aide="Ex. Comptoir, Terrasse, Salon VIP.">
          <input value={seul} maxLength={40} onChange={(e) => setSeul(e.target.value)} />
        </Champ>
        <Bouton disabled={!seul.trim()} chargement={chargement} onClick={ajouterUn}>Ajouter « {seul || '…'} »</Bouton>
        <Erreur message={erreur} />
      </div>
    </Modale>
  );
}

// Réglages du menu en ligne : allumer le menu, ouvrir la commande depuis la table, QR codes à imprimer, articles cachés.
export default function MenuQr({ naviguer }) {
  const { api, etablissement, notifier, moduleActif, peut, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [menus, emplacements, articles, commandes] = await Promise.all([
      api.lire('menus_qr', { eq: { etablissement_id: etab } }),
      api.lire('emplacements_qr', { eq: { etablissement_id: etab }, ordre: ['ordre', 'libelle'] }),
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('commandes_qr', { eq: { etablissement_id: etab, statut: 'nouvelle' } }).catch(() => []),
    ]);
    return { menu: menus[0] ?? { actif: false, commandes_actives: false, afficher_epuises: true }, emplacements, articles, nouvelles: commandes.length };
  }, [etab]);
  const [reglages, setReglages] = useState(null);
  const [ajout, setAjout] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreurAction, setErreurAction] = useState('');
  if (chargement && !donnees) return <Squelette lignes={6} />;
  if (erreur) return <Erreur message={erreur} />;
  const menu = { ...donnees.menu, ...(reglages ?? {}) };
  const modifie = reglages !== null;
  const actifs = donnees.emplacements.filter((e) => e.actif);
  const action = async (fn, message) => {
    setErreurAction('');
    try {
      await fn();
      if (message) notifier(message);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const enregistrer = async (changement) => {
    setEnCours(true);
    await action(() => api.rpc('enregistrer_menu_qr', { p_etablissement_id: etab, p: changement ?? menu }), 'Menu enregistré');
    setReglages(null);
    setEnCours(false);
  };
  const copier = async (texte) => {
    try {
      await navigator.clipboard.writeText(texte);
      notifier('Lien copié');
    } catch {
      window.prompt('Copiez le lien :', texte);
    }
  };
  const t = recherche.trim().toLowerCase();
  const articles = donnees.articles.filter((a) => Number(a.prix_vente) > 0 && (!t || a.nom.toLowerCase().includes(t)));
  const caches = donnees.articles.filter((a) => a.visible_menu === false).length;

  return (
    <div className="page menu-qr">
      <PageHeader
        titre="Menu QR des tables"
        sousTitre={menu.actif ? `Menu en ligne allumé · ${actifs.length} QR code(s)${menu.commandes_actives ? ' · les clients peuvent commander' : ' · consultation seule'}` : 'Menu en ligne éteint : personne ne le voit'}
        actions={(
          <>
            {donnees.nouvelles > 0 && <Bouton onClick={() => naviguer('commandes-qr')}>Commandes des tables <span className="pastille-compte">{donnees.nouvelles}</span></Bouton>}
            {actifs.length > 0 && <Bouton icone="imprimer" onClick={() => window.print()}>Imprimer les QR codes</Bouton>}
            <Bouton variante="principal" icone="plus" onClick={() => setAjout(true)}>Ajouter des QR codes</Bouton>
          </>
        )}
      />
      <Erreur message={erreurAction} />
      <Section titre="1. Votre menu en ligne" sousTitre="Le client scanne le QR code de sa table et voit vos articles, vos prix et ce qui est disponible, en direct.">
        <div className="formulaire">
          <label className="case-grande">
            <input type="checkbox" checked={Boolean(menu.actif)} onChange={(e) => enregistrer({ actif: e.target.checked })} disabled={enCours} />
            <span><strong>Menu en ligne allumé</strong><small className="bloc texte-doux">Éteint : les QR codes affichent « menu fermé ».</small></span>
          </label>
          <label className="case-grande">
            <input type="checkbox" checked={Boolean(menu.commandes_actives)} onChange={(e) => enregistrer({ commandes_actives: e.target.checked })} disabled={enCours || !menu.actif} />
            <span><strong>Les clients peuvent commander depuis la table</strong><small className="bloc texte-doux">Chaque commande arrive dans la caisse (« Commandes des tables ») : une personne de la caisse l’accepte ou la refuse. Rien n’est encaissé sans elle.</small></span>
          </label>
          <label className="case-grande">
            <input type="checkbox" checked={menu.afficher_epuises !== false} onChange={(e) => enregistrer({ afficher_epuises: e.target.checked })} disabled={enCours} />
            <span><strong>Montrer les articles épuisés</strong><small className="bloc texte-doux">Ils restent visibles, grisés « épuisé ». Décochez pour les cacher.</small></span>
          </label>
          <div className="grille-champs">
            <Champ libelle="Titre du menu (facultatif)"><input value={menu.titre ?? ''} maxLength={80} placeholder="Ex. Notre carte" onChange={(e) => setReglages({ ...(reglages ?? {}), titre: e.target.value })} /></Champ>
            <Champ libelle="Message d’accueil (facultatif)"><input value={menu.message ?? ''} maxLength={300} placeholder="Ex. Bienvenue ! Wi-Fi : …" onChange={(e) => setReglages({ ...(reglages ?? {}), message: e.target.value })} /></Champ>
          </div>
          {modifie && <div className="actions"><Bouton onClick={() => setReglages(null)}>Annuler</Bouton><Bouton variante="principal" chargement={enCours} onClick={() => enregistrer(reglages)}>Enregistrer</Bouton></div>}
        </div>
      </Section>

      <Section titre="2. Les QR codes" sousTitre="Imprimez-les et collez-en un sur chaque table. Un QR code perdu ou copié ? « Nouveau QR code » : l’ancien ne marche plus.">
        {!donnees.emplacements.length ? (
          <EmptyState icone="table" titre="Aucun QR code" texte="Ajoutez vos tables : Table 1 à Table 10 en un clic." action={<Bouton variante="principal" onClick={() => setAjout(true)}>Ajouter des QR codes</Bouton>} />
        ) : (
          <div className="feuille-qr">
            {donnees.emplacements.map((e) => {
              const lien = lienMenu(e.jeton);
              return (
                <article key={e.id} className={`carte-qr ${e.actif ? '' : 'inactive'}`}>
                  <ImageQr texte={lien} libelle={e.libelle} />
                  <strong className="carte-qr-nom">{e.libelle}</strong>
                  <small className="carte-qr-consigne">Scannez pour voir le menu{menu.commandes_actives && e.commande ? ' et commander' : ''}</small>
                  <div className="carte-qr-badges no-print">
                    {!e.actif && <Badge ton="neutre">désactivé</Badge>}
                    {e.table_id && <Badge ton="bleu">table de la Salle</Badge>}
                    {!e.commande && <Badge ton="neutre">consultation seule</Badge>}
                  </div>
                  <div className="carte-qr-actions no-print">
                    <a className="lien" href={lien} target="_blank" rel="noreferrer">Voir</a>
                    <button type="button" className="lien" onClick={() => copier(lien)}>Copier le lien</button>
                    <button type="button" className="lien" onClick={() => action(() => api.rpc('enregistrer_emplacement_qr', { p_etablissement_id: etab, p: { id: e.id, commande: !e.commande } }))}>
                      {e.commande ? 'Consultation seule' : 'Permettre la commande'}
                    </button>
                    <button type="button" className="lien" onClick={() => action(() => api.rpc('enregistrer_emplacement_qr', { p_etablissement_id: etab, p: { id: e.id, actif: !e.actif } }), e.actif ? 'QR code désactivé' : 'QR code réactivé')}>
                      {e.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                    <button type="button" className="lien" onClick={() => window.confirm(`Nouveau QR code pour « ${e.libelle} » ? L’ancien ne marchera plus : il faudra réimprimer.`)
                      && action(() => api.rpc('renouveler_jeton_qr', { p_emplacement_id: e.id }), 'Nouveau QR code créé : réimprimez-le')}>
                      Nouveau QR code
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      <Section titre="3. Ce que le client voit" sousTitre={`Tous les articles avec un prix sont sur le menu${caches ? `, sauf ${caches} caché(s)` : ''}. Décochez ce qui ne se vend pas à table (matières premières, articles internes).`}>
        <Champ libelle="Chercher un article"><input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} /></Champ>
        <ul className="liste-visibilite">
          {articles.slice(0, 300).map((a) => (
            <li key={a.id}>
              <label>
                <input type="checkbox" checked={a.visible_menu !== false} disabled={!peut('caisse.menu_qr')}
                  onChange={(ev) => action(() => api.rpc('regler_visibilite_menu', { p_etablissement_id: etab, p_article_ids: [a.id], p_visible: ev.target.checked }))} />
                <span>{a.nom}{a.variante ? ` — ${a.variante}` : ''}</span>
                <span className="texte-doux">{montant(a.prix_vente)}</span>
                {(a.epuise || a.disponible === false) && <Badge ton="neutre">indisponible</Badge>}
              </label>
            </li>
          ))}
        </ul>
        {moduleActif('articles') && <p className="texte-doux">Les photos, descriptions et catégories viennent de vos fiches Articles.</p>}
      </Section>
      {ajout && <AjoutTables restaurant={moduleActif('restaurant_salle')} onFermer={() => setAjout(false)} onFait={(m) => { setAjout(false); notifier(m); recharger(); }} />}
    </div>
  );
}
