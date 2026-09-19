# Ask EdgeCase

Ask EdgeCase is a mobile-friendly AI chat prototype from EdgeCaseLabs for direct answers, real sources, and no forced agreement. It is intentionally not connected to a model provider yet.

## Local setup

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The interface works without a provider: messages are stored temporarily in browser `localStorage`, and the API placeholder returns `MODEL_NOT_CONFIGURED`.

## Build and preview

```bash
npm run build
npm run preview
```

The production bundle is written to `dist/`. Vite serves the React frontend, while Cloudflare Pages Functions serve the `/api/*` routes.

## Deployment architecture

This project is structured for Cloudflare Pages:

- `dist/` is the static frontend output.
- `functions/api/ask.ts` is the Pages Function placeholder for `POST /api/ask`.
- A future provider integration should run only inside the Pages Function, never in the browser.
- No provider, paid resource, DNS configuration, or API key is included.

Deploy with the Cloudflare Pages dashboard or Wrangler after connecting this repository. Use `npm run build` as the build command and `dist` as the output directory.

## API-key security

Do not add secrets to `.env`, source files, browser code, or git. `.env.example` contains variable names only and `.env*` files are ignored by git except for the example file. When model integration is approved, store the provider key as a Cloudflare Pages secret and read it only in the server-side function.

## Future model integration

The browser already posts a message, selected answer mode, and No BS preference to `/api/ask`. Replace the safe `MODEL_NOT_CONFIGURED` response in `functions/api/ask.ts` with a server-side provider request, validate the response, enforce rate limits, and preserve the current error contract. Do not expose provider credentials or accept arbitrary provider URLs from the client.
