# Ask EdgeCase

Ask EdgeCase is a mobile-friendly AI chat interface from EdgeCaseLabs for direct answers, real sources, and no forced agreement.

## Local setup

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Messages are stored temporarily in browser `localStorage`. The chat endpoint requires the server-side OpenRouter secret described below.

## Build and preview

```bash
npm run build
npm run preview
```

The production bundle is written to `dist/`. Vite serves the React frontend, while Cloudflare Pages Functions serve the `/api/*` routes.

## Deployment architecture

This project is structured for Cloudflare Pages:

- `dist/` is the static frontend output.
- `functions/api/ask.ts` is the Pages Function for `POST /api/ask`.
- The browser calls only this same-origin endpoint; the OpenRouter request runs server-side.
- The function uses the `openrouter/free` model with a bounded output and request timeout.
- No paid resource, DNS configuration, or API key is included.

Deploy with the Cloudflare Pages dashboard or Wrangler after connecting this repository. Use `npm run build` as the build command and `dist` as the output directory. The `functions` directory is detected as the Pages Functions directory.

## API-key security

Do not add secrets to `.env`, `.dev.vars`, source files, browser code, or git. `.env.example` contains only `OPENROUTER_API_KEY=` and `.env*` files are ignored by git except for the example file. `.dev.vars` is also ignored for local Wrangler use.

### Cloudflare Pages encrypted secret

Set the encrypted secret in the Cloudflare dashboard under **Workers & Pages → your Pages project → Settings → Variables and Secrets → Add → Encrypt**:

- Variable name: `OPENROUTER_API_KEY`
- Value: your OpenRouter key, entered privately in Cloudflare

For a local Wrangler Pages environment, use a private `.dev.vars` file with the same variable name; never commit it. The deployed function reads only `context.env.OPENROUTER_API_KEY`. It does not log the key, request it from the browser, or include it in responses.

The endpoint validates the request, limits each message to 6,000 characters, forwards at most the latest 20 conversation messages, and returns sanitized errors. It does not log conversation content.
