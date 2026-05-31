import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — HopSoleil',
  description: 'Politique de confidentialité et de protection des données personnelles de HopSoleil.',
}

export default function PrivacyPage() {
  return (
    <main style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: '48px 24px 80px',
      fontFamily: 'var(--font-outfit), sans-serif',
      color: '#142033',
      lineHeight: 1.7,
    }}>
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 40,
          fontSize: 14,
          fontWeight: 700,
          color: '#1F3A5F',
          textDecoration: 'none',
          background: 'rgba(31,58,95,0.07)',
          padding: '8px 14px',
          borderRadius: 999,
        }}
      >
        ← Retour à la carte
      </Link>

      <h1 style={{ fontSize: 32, fontWeight: 900, color: '#1F3A5F', marginBottom: 8, lineHeight: 1.15 }}>
        Politique de confidentialité
      </h1>
      <p style={{ fontSize: 14, color: '#6f7a8a', marginBottom: 40 }}>
        Dernière mise à jour : juin 2026
      </p>

      <section style={{ marginBottom: 36 }}>
        <h2 style={h2}>1. Qui sommes-nous ?</h2>
        <p>
          HopSoleil est un service en ligne permettant de trouver des terrasses ensoleillées à Paris en temps réel.
          Ce service est édité et exploité par Kenny (Raphaël Isambert), à titre personnel, en tant que développeur indépendant.
        </p>
        <p>Contact : <a href="mailto:contact@hopsoleil.fr" style={linkStyle}>contact@hopsoleil.fr</a></p>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={h2}>2. Données collectées</h2>
        <p>Nous collectons uniquement les données strictement nécessaires au fonctionnement du service :</p>
        <ul style={ulStyle}>
          <li><strong>Compte utilisateur (optionnel) :</strong> adresse e-mail et pseudo, lors de la création d'un compte.</li>
          <li><strong>Avis et photos :</strong> les commentaires et photos que vous publiez volontairement sur une terrasse.</li>
          <li><strong>Favoris :</strong> la liste des terrasses que vous avez enregistrées, associée à votre compte.</li>
          <li><strong>Données de géolocalisation :</strong> position GPS utilisée uniquement en temps réel pour centrer la carte, jamais stockée sur nos serveurs.</li>
          <li><strong>Logs techniques :</strong> adresses IP et logs d'accès conservés par notre hébergeur (Vercel) pour la sécurité et le débogage.</li>
        </ul>
        <p>Nous ne collectons pas de données de navigation, ne déposons pas de cookies publicitaires, et ne vendons aucune donnée à des tiers.</p>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={h2}>3. Finalités du traitement</h2>
        <ul style={ulStyle}>
          <li>Fournir le service : affichage de la carte, calcul des scores soleil, affichage des terrasses.</li>
          <li>Gestion des comptes utilisateurs et de l'authentification.</li>
          <li>Permettre la publication et l'affichage d'avis et de photos.</li>
          <li>Amélioration du service (analyses agrégées et anonymisées).</li>
        </ul>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={h2}>4. Base légale (RGPD)</h2>
        <p>
          Le traitement de vos données repose sur votre <strong>consentement</strong> (création de compte, publication d'avis)
          et sur notre <strong>intérêt légitime</strong> à assurer la sécurité et le bon fonctionnement du service.
        </p>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={h2}>5. Hébergement et sous-traitants</h2>
        <ul style={ulStyle}>
          <li><strong>Vercel</strong> (hébergement web, CDN) — États-Unis, couvert par les clauses contractuelles types UE.</li>
          <li><strong>Supabase</strong> (base de données, stockage photos, authentification) — région <code style={codeStyle}>eu-west-3</code> (Paris, France).</li>
          <li><strong>Mapbox</strong> (fond de carte) — États-Unis, voir <a href="https://www.mapbox.com/legal/privacy" target="_blank" rel="noreferrer" style={linkStyle}>mapbox.com/legal/privacy</a>.</li>
          <li><strong>Google</strong> (informations sur les établissements, photos) — voir <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" style={linkStyle}>policies.google.com/privacy</a>.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={h2}>6. Durée de conservation</h2>
        <ul style={ulStyle}>
          <li>Données de compte : conservées tant que votre compte est actif, puis supprimées dans les 30 jours suivant la demande de suppression.</li>
          <li>Avis et photos : conservés jusqu'à suppression par l'utilisateur ou par l'administrateur.</li>
          <li>Logs techniques : 30 jours maximum.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={h2}>7. Vos droits</h2>
        <p>Conformément au RGPD, vous disposez des droits suivants :</p>
        <ul style={ulStyle}>
          <li><strong>Accès</strong> : obtenir une copie des données vous concernant.</li>
          <li><strong>Rectification</strong> : corriger des données inexactes.</li>
          <li><strong>Effacement</strong> : demander la suppression de votre compte et de vos données.</li>
          <li><strong>Portabilité</strong> : recevoir vos données dans un format structuré.</li>
          <li><strong>Opposition</strong> : vous opposer à certains traitements.</li>
        </ul>
        <p>
          Pour exercer ces droits, contactez-nous à <a href="mailto:contact@hopsoleil.fr" style={linkStyle}>contact@hopsoleil.fr</a>.
          Vous pouvez également introduire une réclamation auprès de la <a href="https://www.cnil.fr" target="_blank" rel="noreferrer" style={linkStyle}>CNIL</a>.
        </p>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={h2}>8. Sécurité</h2>
        <p>
          Les communications sont chiffrées via HTTPS. Les mots de passe sont hachés et ne sont jamais stockés en clair.
          L'accès aux données est restreint par des politiques de sécurité au niveau base de données (Row Level Security Supabase).
        </p>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={h2}>9. Modifications</h2>
        <p>
          Cette politique peut être mise à jour. En cas de modification substantielle, nous informerons les utilisateurs
          connectés par e-mail ou notification dans l'application.
        </p>
      </section>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(31,58,95,0.10)', fontSize: 13, color: '#98a2b3' }}>
        HopSoleil — contact@hopsoleil.fr
      </div>
    </main>
  )
}

const h2: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#1F3A5F',
  marginBottom: 12,
  marginTop: 0,
}

const ulStyle: React.CSSProperties = {
  paddingLeft: 20,
  marginBottom: 12,
}

const linkStyle: React.CSSProperties = {
  color: '#1F3A5F',
  fontWeight: 600,
}

const codeStyle: React.CSSProperties = {
  background: 'rgba(31,58,95,0.08)',
  padding: '1px 5px',
  borderRadius: 4,
  fontSize: 13,
}
