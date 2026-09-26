# GINA — Frontend

Next.js (App Router) client for **GINA**: chat, dataset upload, dataset overview, and SSE streaming from `POST /api/query`.

## Repo context

- **Root README** ([`../README.md`](../README.md)) — product overview, stack, local setup for backend + frontend.
- **Eval & accuracy** ([`../eval/README.md`](../eval/README.md)) — manifest-based HTTP evals; recorded **24/24** pass summary for `saas-eval-advanced`: [`../eval/bundles/saas-eval-advanced/results/result-summary.md`](../eval/bundles/saas-eval-advanced/results/result-summary.md).

## Local development

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_BASE_URL → backend (e.g. http://localhost:3001)
# NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production

```bash
npm run build && npm start
```

## Deploying on Vercel (auth)

OAuth uses `window.location.origin` for the callback URL. You must allow that URL in **Supabase → Authentication → URL Configuration**:

- Add **Redirect URLs** for each environment, e.g. `https://<project>.vercel.app/auth/callback`, preview URLs (`https://*.vercel.app/auth/callback` if your Supabase plan supports wildcards), and any custom domain.
- Set **Site URL** to your primary public URL (production or preview leader), not `http://localhost:3000`, or Supabase may fall back there when a redirect is not allowlisted.

Set `NEXT_PUBLIC_API_BASE_URL` on Vercel to your deployed API origin (e.g. `https://gina-backend.example.com` — **no trailing slash**).

**CORS (required):** the backend only allows `localhost` dev URLs by default. On the machine where the API runs, set:

`CORS_ORIGINS=https://<your-vercel-app>.vercel.app`

Use the **exact** origin the browser shows (scheme + host; Vercel previews use a different hostname per deployment — add each or comma-separate several). Redeploy/restart the backend after changing env. If `CORS_ORIGINS` is wrong, the browser shows “Failed to fetch” on `GET /api/datasets` because the **OPTIONS** preflight is rejected.

See `backend/.env.example` (`CORS_ORIGINS`) and `backend/src/config/corsOrigins.ts`.

## Stack notes

This app uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) for font optimization. For Next.js features and deployment, see [Next.js documentation](https://nextjs.org/docs).
