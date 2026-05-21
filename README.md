# HopSoleil ☀

Carte des terrasses ensoleillées à Paris en temps réel.

## Stack

Next.js 15 · TypeScript · Tailwind v4 · Supabase · Mapbox · SunCalc · Google Places

## Setup local

```bash
# 1. Installer les dépendances
npm install

# 2. Copier le template d'env et remplir les clés
cp .env.local.example .env.local

# 3. Lancer Supabase (le SQL de supabase/schema.sql doit être exécuté côté projet Supabase)

# 4. Démarrer le dev server
npm run dev
```

## Scripts

- `npm run dev` — dev local sur http://localhost:3000
- `npm run build` — build prod
- `npm run typecheck` — vérification TypeScript
- `npm run lint` — ESLint
- `npm run import:places` — import Google Places → Supabase (one-shot)

## Déploiement

Push sur `main` → Vercel auto-deploy. Voir [CLAUDE.md](CLAUDE.md) pour le détail projet.
