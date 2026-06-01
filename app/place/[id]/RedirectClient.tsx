'use client'

import { useEffect } from 'react'

// Redirige l'utilisateur réel vers la vraie interface (home) avec la terrasse
// pré-sélectionnée. La redirection est côté client : ainsi le HTML servi
// contient bien les balises OG/Twitter (lues par les robots des réseaux
// sociaux) avant que les humains soient renvoyés vers l'app.
export default function RedirectClient({ id }: { id: string }) {
  useEffect(() => {
    window.location.replace(`/?place=${encodeURIComponent(id)}`)
  }, [id])
  return null
}
