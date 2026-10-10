import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure, formatMontant } from '../../noyau/format.js';
import { Bouton, Champ, DataTable, Erreur, Modale, Section, Squelette } from '../../ui/composants.jsx';

// Taux de change saisis par l'établissement : historique conservé (une correction est une nouvelle saisie). Un devis ou
// une facture en préparation peut ensuite être présenté dans la devise du client, au taux du jour du document.
function ModaleTaux({ devise, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ devise: '', jour: dateLocale(), taux: '', source: '' });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const code = v.devise.trim().toUpperCase();
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      await api.rpc('enregistrer_taux_change', {
        p_etablissement_id: etablissement.id, p_devise: code, p_jour: v.jour, p_taux: Number(String(v.taux).replace(',', '.')), p_source: v.source || null,
      });
      onFait(`Taux ${code} enregistré`);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Modale titre="Saisir un taux de change" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Devise du client" aide="Code à 3 lettres (ex. EUR, USD)">
          <input value={v.devise} maxLength={3} onChange={(e) => setV({ ...v, devise: e.target.value.toUpperCase() })} required />
        </Champ>
        <Champ libelle="Date du taux"><input type="date" value={v.jour} max={dateLocale()} onChange={(e) => setV({ ...v, jour: e.target.value })} required /></Champ>
        <Champ libelle={`Valeur de 1 ${code || 'unité'} en ${devise}`}>
          <input inputMode="decimal" value={v.taux} onChange={(e) => setV({ ...v, taux: e.target.value })} required />
        </Champ>
        <Champ libelle="Source (facultatif)" aide="Banque, taux officiel, bureau de change…">
          <input value={v.source} maxLength={120} onChange={(e) => setV({ ...v, source: e.target.value })} />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi} disabled={!/^[A-Z]{3}$/.test(code) || !v.taux}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export default function TauxChange() {
  const { api, etablissement, peut, notifier } = useEspace();
  const [saisie, setSaisie] = useState(false);
  const devise = etablissement.devise;
  const { donnees, chargement, erreur, recharger } = useDonnees(
    () => api.lire('taux_change', { eq: { etablissement_id: etablissement.id }, ordre: ['jour', 'desc'], limite: 500 }),
    [etablissement.id],
  );
  const derniers = Object.values((donnees ?? []).reduce((acc, t) => {
    const actuel = acc[t.devise];
    if (!actuel || t.jour > actuel.jour || (t.jour === actuel.jour && t.cree_le > actuel.cree_le)) acc[t.devise] = t;
    return acc;
  }, {}));
  return (
    <Section
      titre="Taux de change"
      sousTitre={`Pour présenter un devis ou une facture dans la devise du client. Les montants restent comptés en ${devise}.`}
      action={peut('facturation.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setSaisie(true)}>Saisir un taux</Bouton>}
    >
      {chargement && !donnees && <Squelette lignes={4} />}
      <Erreur message={erreur} />
      {donnees && (
        <>
          {derniers.length > 0 && (
            <p className="texte-doux">
              Derniers taux : {derniers.map((t) => `1 ${t.devise} = ${formatMontant(t.taux, devise)} (${formatDate(t.jour)})`).join(' · ')}
            </p>
          )}
          <DataTable
            lignes={donnees}
            titreExport="Taux de change"
            rechercher={(t) => `${t.devise} ${t.source ?? ''}`}
            triInitial={{ id: 'jour', sens: 'desc' }}
            vide={<p className="texte-doux">Aucun taux saisi. Saisissez le taux de la devise de votre client avant de lui présenter un devis dans cette devise.</p>}
            colonnes={[
              { id: 'devise', libelle: 'Devise', rendu: (t) => <strong>{t.devise}</strong>, tri: (t) => t.devise },
              { id: 'jour', libelle: 'Date du taux', rendu: (t) => formatDate(t.jour), tri: (t) => `${t.jour} ${t.cree_le}`, exporter: (t) => t.jour },
              { id: 'taux', libelle: `Valeur de 1 unité en ${devise}`, classe: 'nombre', rendu: (t) => Number(t.taux).toLocaleString('fr-FR', { maximumFractionDigits: 8 }), tri: (t) => Number(t.taux), exporter: (t) => String(t.taux).replace('.', ',') },
              { id: 'source', libelle: 'Source', rendu: (t) => t.source ?? '—', tri: (t) => t.source ?? '' },
              { id: 'cree_le', libelle: 'Saisi le', rendu: (t) => formatDateHeure(t.cree_le), tri: (t) => t.cree_le },
            ]}
          />
        </>
      )}
      {saisie && <ModaleTaux devise={devise} onFermer={() => setSaisie(false)} onFait={(m) => { setSaisie(false); notifier(m); recharger(); }} />}
    </Section>
  );
}
