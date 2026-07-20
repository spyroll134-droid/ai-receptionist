# Trademark Web — landing page

Marketing site for the AI receptionist product. Next.js + Tailwind, deployed
on Vercel, trial signups stored in Supabase.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Before it works end-to-end

The trial signup form posts to `/api/trial-signup`, which needs a Supabase
project:

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql` from this repo.
3. Copy `.env.local.example` to `.env.local` and fill in `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (Settings > API in the Supabase dashboard).
4. Set the same two variables in Vercel's project settings for production.

## Editing site content

Business name, phone numbers, pricing, and links all live in one place:
`lib/site-config.ts`. Update the placeholders there before launch — the demo
phone number in particular is a placeholder until the Vapi agent is live.

## Deploying

Push to `main` — if the repo is connected to Vercel, it deploys
automatically. Otherwise: `vercel --prod` from this directory (after
`vercel login` and `vercel link`).
