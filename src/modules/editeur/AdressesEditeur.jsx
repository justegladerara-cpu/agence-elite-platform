// Adresses web des clients (ex. thedream.agence-elite.fr) : créées sur le projet Cloudflare de la plateforme
// par la fonction serveur /api/adresses (super admin uniquement, voir serveur/adresses.js).
import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, PageHeader, Section } from '../../ui/composants.jsx';

const DOMAINE = 'agence-elite.fr';

// « Le Kangourou Café » → « le-kangourou-cafe »
export function suggererSousDomaine(nom) {
  return String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
    .replace(/-+$/, '');
}

export default function AdressesEditeur({ suggestion = '' }) {
  const { api, roleEditeur, notifier } = useEspace();
  const superAdmin = roleEditeur === 'super_admin';
  const enLigne = typeof api.serveur === 'function';
  const [nom, setNom] = useState(suggererSousDomaine(decodeURIComponent(suggestion)));
  const [envoi, setEnvoi] = useState(false);
  const [erreurCreation, setErreurCreation] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(
    () => (enLigne && superAdmin ? api.serveur('/api/adresses') : Promise.resolve(null)),
    [enLigne, superAdmin]
  );

  if (!superAdmin) return <div className="page"><EmptyState titre="Réservé à la direction (Super Admin)" /></div>;
  if (!enLigne) return <div className="page"><EmptyState titre="Disponible sur la plateforme en ligne uniquement" /></div>;

  const valide = /^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/.test(nom);
  const creer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreurCreation(null);
    try {
      const r = await api.serveur('/api/adresses', { methode: 'POST', corps: { sous_domaine: nom } });
      notifier(r.deja_existant ? `${r.adresse} existe déjà` : `${r.adresse} créée : active dans quelques minutes`);
      if (r.dns !== 'OK') setErreurCreation(`Adresse enregistrée, mais ${r.dns}`);
      setNom('');
      recharger();
    } catch (err) {
      setErreurCreation(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Adresses web' }]}
        titre="Adresses web"
        sousTitre={`Une adresse par client, par exemple thedream.${DOMAINE}. Elle ouvre la plateforme.`}
      />
      <Section titre="Créer une adresse">
        <form className="pile" onSubmit={creer}>
          <Champ libelle="Nom de l’adresse" aide={valide ? `Adresse : https://${nom}.${DOMAINE}` : 'Lettres minuscules, chiffres et tirets'}>
            <input value={nom} onChange={(e) => setNom(e.target.value.toLowerCase().trim())} placeholder="thedream" maxLength={42} />
          </Champ>
          <Erreur message={erreurCreation} />
          <div>
            <Bouton variante="principal" icone="plus" type="submit" disabled={!valide} chargement={envoi}>Créer l’adresse</Bouton>
          </div>
        </form>
      </Section>
      <Erreur message={erreur} />
      <DataTable
        chargement={chargement}
        lignes={donnees?.adresses ?? (erreur ? [] : null)}
        cle="adresse"
        vide="Aucune adresse pour le moment"
        colonnes={[
          { id: 'adresse', libelle: 'Adresse', rendu: (a) => <a href={a.adresse} target="_blank" rel="noreferrer">{a.adresse.replace('https://', '')}</a> },
          { id: 'etat', libelle: 'État', rendu: (a) => <Badge ton={a.etat === 'actif' ? 'vert' : 'neutre'}>{a.etat}</Badge> },
        ]}
      />
    </div>
  );
}
