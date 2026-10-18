// CRM Agence Elite (outil interne, dépôt agence-elite-crm) : « porte unique ». Il ne s'ouvre que d'ici.
// Le bouton transmet le jeton de session du Super Admin dans l'adresse (#porte=…) ; le CRM vérifie lui-même auprès
// de la base de la plateforme (fonction est_super_admin) puis efface le jeton de l'adresse. L'autorisation dure 12 h
// sur l'appareil. Les données du CRM restent dans sa propre base, avec sa propre connexion.
import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, EmptyState, Erreur, PageHeader, Section } from '../../ui/composants.jsx';

export const ADRESSE_CRM = 'https://crm.agence-elite.fr/';

export function lienPorteCrm(jeton, adresse = ADRESSE_CRM) {
  return `${adresse}#porte=${encodeURIComponent(jeton)}`;
}

export default function CrmEditeur({ accueil = false }) {
  const { roleEditeur, api } = useEspace();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  if (roleEditeur !== 'super_admin') return <div className="page"><EmptyState titre="Réservé à la direction (Super Admin)" /></div>;
  if (typeof api.jeton !== 'function')
    return <div className="page"><EmptyState titre="Disponible sur la plateforme en ligne uniquement" texte="Le mode démo local n’a pas de session à transmettre au CRM." /></div>;

  const ouvrir = async () => {
    // Fenêtre ouverte tout de suite (sinon le navigateur la bloque), puis envoyée vers le CRM une fois le jeton lu.
    const fenetre = window.open('', '_blank');
    setEnvoi(true);
    setErreur(null);
    try {
      const jeton = await api.jeton();
      if (!jeton) throw new Error('Session expirée : reconnectez-vous');
      const lien = lienPorteCrm(jeton);
      if (fenetre) {
        fenetre.opener = null;
        fenetre.location.href = lien;
      } else window.location.href = lien;
    } catch (e) {
      fenetre?.close();
      setErreur(e);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'CRM Agence Elite' }]}
        titre={accueil ? 'Administration Agence Elite' : 'CRM Agence Elite'}
        sousTitre={accueil
          ? 'L’administration de la plateforme se fait maintenant dans le CRM : tour de contrôle, clients, licences, comptes, paiements.'
          : 'L’outil interne de prospection, de clients et de factures d’Agence Elite.'}
      />
      <Section titre="Accès">
        <p className="texte-doux">
          Le CRM s’ouvre dans un nouvel onglet. Vous pouvez aussi aller directement sur crm.agence-elite.fr et vous connecter
          avec ce compte super admin. Le CRM garde sa propre connexion et ses données.
        </p>
        <Bouton variante="principal" icone="clients" chargement={envoi} onClick={ouvrir}>Ouvrir le CRM</Bouton>
        <Erreur message={erreur?.message} />
      </Section>
    </div>
  );
}
