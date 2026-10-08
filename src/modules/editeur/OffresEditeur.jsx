import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatMontant } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, PageHeader, Section, StatusBadge } from '../../ui/composants.jsx';
import { useVueEditeur } from './ClientsEditeur.jsx';
import { FormulaireOffre } from './Editeur.jsx';

const MODULES_COMMERCE = ['articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture', 'contacts', 'depenses'];

// Offres et prix : modifiables par la direction (Super Admin) uniquement ; la base le contrôle.
export default function OffresEditeur() {
  const { roleEditeur, notifier } = useEspace();
  const { donnees: vue, chargement, erreur, recharger } = useVueEditeur();
  const [offre, setOffre] = useState(null);
  const superAdmin = roleEditeur === 'super_admin';
  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Offres et prix' }]}
        titre="Offres et prix"
        sousTitre="Les prix préremplissent le montant lors de l’attribution d’une licence. Le support est vendu à part."
        actions={superAdmin && <Bouton variante="principal" icone="plus" onClick={() => setOffre({})}>Nouvelle offre</Bouton>}
      />
      {!superAdmin && <div className="bandeau info">Consultation : seule la direction (Super Admin) modifie les offres et les prix.</div>}
      <Erreur message={erreur} />
      <DataTable
        chargement={chargement}
        lignes={vue?.offres ?? null}
        onLigne={superAdmin ? setOffre : undefined}
        colonnes={[
          { id: 'nom', libelle: 'Offre', rendu: (o) => <><strong>{o.nom}</strong>{o.offre_essai && <> <Badge ton="bleu">Offre d’essai</Badge></>}<small className="texte-doux bloc">{o.description}</small></> },
          { id: 'modules', libelle: 'Modules', classe: 'nombre', rendu: (o) => o.modules.length },
          { id: 'acq', libelle: 'Acquisition', classe: 'nombre', rendu: (o) => formatMontant(o.prix_acquisition, o.devise) },
          { id: 'mensuel', libelle: 'Mensuel', classe: 'nombre', rendu: (o) => formatMontant(o.prix_mensuel, o.devise) },
          { id: 'annuel', libelle: 'Annuel', classe: 'nombre', rendu: (o) => formatMontant(o.prix_annuel, o.devise) },
          { id: 'mes', libelle: 'Mise en service', classe: 'nombre', rendu: (o) => formatMontant(o.prix_mise_en_service, o.devise) },
          { id: 'support', libelle: 'Support / mois', classe: 'nombre', rendu: (o) => (Number(o.prix_support_mensuel) > 0 ? formatMontant(o.prix_support_mensuel, o.devise) : 'à définir') },
          { id: 'actif', libelle: 'État', rendu: (o) => <StatusBadge statut={o.actif ? 'actif' : 'inactif'} libelle={o.actif ? 'Proposée' : 'Retirée'} /> },
        ]}
      />
      <OptionsModules superAdmin={superAdmin} />
      {offre && (
        <FormulaireOffre
          offre={offre.id ? offre : null}
          modules={MODULES_COMMERCE}
          onFermer={() => setOffre(null)}
          onEnregistre={() => { setOffre(null); notifier('Offre enregistrée'); recharger(); }}
        />
      )}
    </div>
  );
}

// Tarifs des modules vendus en complément d'une offre (modules complémentaires) : aucun montant en dur.
function OptionsModules({ superAdmin }) {
  const { api, notifier } = useEspace();
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [modules, options] = await Promise.all([
      api.lire('modules', { ordre: ['nom'] }),
      api.lire('options_modules'),
    ]);
    const parModule = Object.fromEntries(options.map((o) => [o.module_id, o]));
    return modules.filter((m) => m.nature !== 'socle' && ['actif', 'beta'].includes(m.statut)).map((m) => ({ ...m, option: parModule[m.id] ?? null }));
  }, []);
  const [edition, setEdition] = useState(null);
  return (
    <Section titre="Options de modules" sousTitre="Prix d’un module ajouté en complément à la licence d’un établissement (fiche établissement › Modules).">
      <Erreur message={erreur} />
      <DataTable
        chargement={chargement}
        lignes={donnees}
        onLigne={superAdmin ? setEdition : undefined}
        colonnes={[
          { id: 'nom', libelle: 'Module', rendu: (m) => <strong>{m.nom}</strong> },
          { id: 'mensuel', libelle: 'Mensuel', classe: 'nombre', rendu: (m) => (m.option ? formatMontant(m.option.prix_mensuel, m.option.devise) : 'à définir') },
          { id: 'annuel', libelle: 'Annuel', classe: 'nombre', rendu: (m) => (m.option ? formatMontant(m.option.prix_annuel, m.option.devise) : 'à définir') },
          { id: 'mes', libelle: 'Mise en service', classe: 'nombre', rendu: (m) => (m.option ? formatMontant(m.option.prix_mise_en_service, m.option.devise) : 'à définir') },
          { id: 'etat', libelle: 'État', rendu: (m) => <StatusBadge statut={m.option?.actif === false ? 'inactif' : 'actif'} libelle={m.option?.actif === false ? 'Non vendue' : 'Vendue'} /> },
        ]}
      />
      {edition && (
        <FormulaireOption
          module={edition}
          onFermer={() => setEdition(null)}
          onEnregistre={() => { setEdition(null); notifier('Option enregistrée'); recharger(); }}
        />
      )}
    </Section>
  );
}

function FormulaireOption({ module, onFermer, onEnregistre }) {
  const { api } = useEspace();
  const o = module.option ?? {};
  const [valeurs, setValeurs] = useState({
    prix_mensuel: o.prix_mensuel ?? 0, prix_annuel: o.prix_annuel ?? 0, prix_mise_en_service: o.prix_mise_en_service ?? 0, actif: o.actif ?? true,
  });
  const [erreur, setErreur] = useState('');
  const changer = (cle) => (e) => setValeurs((v) => ({ ...v, [cle]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_option_module', { p_module_id: module.id, p_option: valeurs });
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Option « ${module.nom} »`} onFermer={onFermer}>
      <form onSubmit={enregistrer} className="formulaire">
        <Champ libelle="Prix mensuel"><input type="number" min="0" value={valeurs.prix_mensuel} onChange={changer('prix_mensuel')} /></Champ>
        <Champ libelle="Prix annuel"><input type="number" min="0" value={valeurs.prix_annuel} onChange={changer('prix_annuel')} /></Champ>
        <Champ libelle="Mise en service"><input type="number" min="0" value={valeurs.prix_mise_en_service} onChange={changer('prix_mise_en_service')} /></Champ>
        <label className="case"><input type="checkbox" checked={valeurs.actif} onChange={changer('actif')} /> Option vendue</label>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" type="submit">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
