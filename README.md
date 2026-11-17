# Rishari Positioning Studio

Guided discovery and review workspace for Rishari's B2B positioning work. `SPEC.md` is the source of truth.

**Current status: Pass 1 of 3.** Client intake, accounts, permissions, uploads, and the admin review basics work. AI features (Pass 2) and client strategy review and exports (Pass 3) are not built yet. No AI is called anywhere in this version.

## Stack

React + TypeScript (Vite, Inter via @fontsource) · Node.js + Express + TypeScript · PostgreSQL · Clerk sign-in · S3-compatible file storage · Render hosting. OpenAI API arrives in Pass 2.

## Run locally

Requires Node 20+ and PostgreSQL.

```
npm install
cp .env.example .env            # uses development sign-in by default
npm run admin:grant -- you@example.com
npm run demo:seed -- you@example.com client@example.com   # optional fictional project + invite link
npm run build && npm start      # http://localhost:3000
```

For live reloading while editing, run `npm run dev` and open http://localhost:5173.

Development sign-in (`AUTH_MODE=dev`) has no passwords and is blocked from starting in production.

## Preview build (hosted in Claude)

`npm run build:demo` builds `dist/demo/index.html`: the same screens running on an in-browser fictional dataset, with a bar to switch between the client and Rishari views. Nothing is sent to a server. It is for demos only and never holds real client data.

## Brand

Styling follows the Rishari Brand Guidelines v1.0 (July 2026): Inter only, black and white with cool grey bands, dark cyan (#0077A3) for eyebrows and links, square corners, and the wordmark's cyan square as the only bright cyan. Tokens live at the top of `client/src/styles.css`.

## Tests

```
createdb rishari_test
npm test            # acceptance tests against a real Postgres database
npm run typecheck
```

## Deploy to Render

1. **Clerk:** create an application at clerk.com. Turn on email sign-in with verification. Copy the publishable key and secret key.
2. **Storage:** create a private bucket (Cloudflare R2 or AWS S3) and an access key limited to that bucket.
3. **Render:** New > Blueprint > choose this repo. Render reads `render.yaml` and creates the web service and database. Pick plans when prompted.
4. Fill in the environment variables Render asks for: `APP_URL` (your app's URL), the two Clerk keys, and the `S3_*` values.
5. After the first deploy, open the service's Shell and run `npm run admin:grant -- you@rishari.com`.
6. Follow `ADMIN_SETUP.md` to complete the data-use page and invite your first client.

## Costs to expect

- Render: a web service plus a PostgreSQL database, both billed monthly by plan.
- Clerk: free tier covers small user counts. Check current limits.
- Storage: R2 or S3, usually cents per month at this scale.
- OpenAI: not used yet. From Pass 2, billed per use to Rishari's own API key. Set a monthly limit in the OpenAI account.

## Project layout

```
server/        API, business logic (services/), auth, storage adapter, migrations, seed content
client/src/    React app: client discovery (client/) and admin workspace (admin/)
shared/        Fixed interface copy used by both sides
tests/         Acceptance tests
docs/          Operations: backup, export, deletion
```

Questions and module text are seeded into the database on first start and can be edited there without code changes. Re-seeding never overwrites edits.
