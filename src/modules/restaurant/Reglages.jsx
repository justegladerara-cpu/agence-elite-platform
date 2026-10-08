import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';
import { POSTES, trierTables } from './commun.js';

// Réglages de la salle : tables par zone et par Hub, poste de préparation de chaque article.
export default function Reglages() {
  const { api, etablissement, hubs, notifier, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [tables, articles] = await Promise.all([
      api.lire('rest_tables', { eq: { etablissement_id: etab }, ordre: ['zone'] }).then(trierTables),
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
    ]);
    return { tables, articles };
  }, [etab]);
  const [onglet, setOnglet] = useState('tables');
  const [table, setTable] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const hubsVente = hubs.filter((h) => h.capacite_vente && h.actif);
  const changerPoste = async (article, poste) => {
    setErreurAction('');
    try {
      await api.rpc('definir_poste_preparation', { p_article_id: article.id, p_poste: poste });
      notifier(`${article.nom} : ${POSTES[poste]}`);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  return (
    <div className="page">
      <PageHeader titre="Tables et postes" fil={[{ libelle: 'Salle', href: '#/salle' }, { libelle: 'Tables et postes' }]}
        actions={onglet === 'tables' && <Bouton variante="principal" icone="plus" onClick={() => setTable({})}>Nouvelle table</Bouton>} />
      <Tabs actif={onglet} onChange={setOnglet} onglets={[['tables', 'Tables', d.tables.length], ['postes', 'Postes de préparation']]} />
      <Erreur message={erreurAction} />
      {onglet === 'tables' && (
        <Section>
          <DataTable
            lignes={d.tables}
            vide="Aucune table : créez-en une par emplacement réel (T1, T2, Terrasse 1…)."
            onLigne={(t) => setTable(t)}
            colonnes={[
              { id: 'nom', libelle: 'Table', rendu: (t) => <strong>{t.nom}</strong> },
              { id: 'zone', libelle: 'Zone' },
              { id: 'hub', libelle: 'Hub', rendu: (t) => hubs.find((h) => h.id === t.hub_id)?.nom ?? '—' },
              { id: 'places', libelle: 'Places', classe: 'nombre' },
              { id: 'actif', libelle: 'État', rendu: (t) => <Badge ton={t.actif ? 'vert' : 'neutre'}>{t.actif ? 'Active' : 'Retirée'}</Badge> },
            ]}
          />
        </Section>
      )}
      {onglet === 'postes' && (
        <Section sousTitre="Cuisine ou bar : le plat part sur l’écran correspondant. « Servi directement » : il est servi dès l’envoi (bouteille, dessert prêt).">
          <DataTable
            lignes={d.articles}
            vide="Aucun article : créez vos plats et boissons dans Articles."
            colonnes={[
              { id: 'nom', libelle: 'Article', rendu: (a) => <strong>{a.nom}</strong> },
              { id: 'prix', libelle: 'Prix', classe: 'nombre', rendu: (a) => montant(a.prix_vente) },
              {
                id: 'poste', libelle: 'Poste', rendu: (a) => (
                  <select value={a.poste_preparation ?? 'aucun'} onChange={(e) => changerPoste(a, e.target.value)} aria-label={`Poste de ${a.nom}`}>
                    {Object.entries(POSTES).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
                  </select>
                ),
              },
            ]}
          />
        </Section>
      )}
      {table && (
        <ModaleTable table={table} hubs={hubsVente} onFermer={() => setTable(null)}
          onFait={() => { setTable(null); notifier('Table enregistrée'); recharger(); }} />
      )}
    </div>
  );
}

function ModaleTable({ table, hubs, onFermer, onFait }) {
  const { api, etablissement, hub } = useEspace();
  const [v, setV] = useState({
    nom: table.nom ?? '', zone: table.zone ?? 'Salle', places: String(table.places ?? 4), ordre: String(table.ordre ?? 0),
    hub_id: table.hub_id ?? hub?.id ?? hubs[0]?.id ?? '', actif: table.actif ?? true,
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('enregistrer_table_restaurant', { p_etablissement_id: etablissement.id, p: { id: table.id, ...v } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={table.id ? `Table ${table.nom}` : 'Nouvelle table'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Nom"><input value={v.nom} onChange={changer('nom')} required maxLength={40} autoFocus placeholder="T1" /></Champ>
          <Champ libelle="Zone"><input value={v.zone} onChange={changer('zone')} maxLength={60} placeholder="Salle, Terrasse, VIP…" /></Champ>
          <Champ libelle="Places"><input type="number" min="1" max="100" value={v.places} onChange={changer('places')} /></Champ>
          <Champ libelle="Ordre d’affichage"><input type="number" value={v.ordre} onChange={changer('ordre')} /></Champ>
          {hubs.length > 1 && (
            <Champ libelle="Hub">
              <select value={v.hub_id} onChange={changer('hub_id')}>{hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}</select>
            </Champ>
          )}
        </div>
        {table.id && <label className="case"><input type="checkbox" checked={v.actif} onChange={changer('actif')} /> Table active</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
