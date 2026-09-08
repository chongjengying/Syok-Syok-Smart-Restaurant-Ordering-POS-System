# Deployment

## Local

Use `npm run dev:local` or `npm run build:local`. Local Supabase commands require a supported local container runtime.

## Staging

1. Validate with `npm run build:staging` and relevant tests.
2. Inspect migrations: `npx supabase migration list --linked`.
3. Push reviewed migrations only: `npx supabase db push --linked --include-all`.
4. Deploy Edge Functions separately when their source changed.
5. Deploy the Worker/assets: `npm run deploy:worker:staging`.

`npm run deploy:staging` targets Cloudflare Pages and requires a configured Pages project name. The repository's `wrangler.toml` configures Worker assets from `dist` for `syok-syok-pos-staging`.

Migration push and Cloudflare deployment are separate operations. A Worker deployment does not deploy Supabase migrations or Edge Functions.
