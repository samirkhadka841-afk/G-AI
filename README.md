# Genius AI

A chat app with conversation history, file/PDF upload, streaming replies,
and a model switcher across Claude, ChatGPT, and Gemini.

## Important: GitHub Pages alone will NOT run this

GitHub Pages only serves static files. This app needs a small server-side
function (`api/chat.js`) to hold your API keys and call each provider —
GitHub Pages has no way to run that. The fix is simple: push this repo to
GitHub as usual, then connect that GitHub repo to **Vercel** (free tier).
Vercel builds the static frontend *and* runs `api/chat.js` for you,
straight from your GitHub repo.

## Deploy steps

1. Push this project to a new GitHub repository.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import that
   GitHub repo. Vercel auto-detects the Vite build — no config needed.
3. Before (or after) deploying, go to your Vercel project →
   **Settings → Environment Variables** and add whichever of these you
   want to enable:
   - `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
   - `OPENAI_API_KEY` — from [platform.openai.com](https://platform.openai.com)
   - `GOOGLE_API_KEY` — from [aistudio.google.com](https://aistudio.google.com)
   You don't need all three — the model picker still works with just one
   provider's key set; switching to a provider without a key set will show
   an error only when you try to use it.
4. Redeploy if you added the env vars after the first deploy. Your site is
   now live at the `*.vercel.app` URL Vercel gives you (or a custom domain).

## Local development

```
npm install
npm i -g vercel      # once
vercel dev            # runs both the frontend and api/chat.js locally
```

Running `npm run dev` alone (plain Vite) will load the UI but every
message will fail, since `/api/chat` won't exist without `vercel dev` or
an equivalent local function runner.

## Things to know before you rely on this

- **Not free at scale.** Vercel's free tier hosts the app for free, but
  every message still calls the provider's real API using your key, and
  each provider bills you directly per their normal pricing.
- **File/image attachments only work with Claude.** The other two
  providers receive a placeholder note instead of the actual image/PDF in
  this version — extending that is possible but wasn't built here.
- **Conversations are stored in the visitor's own browser** (localStorage),
  not on a server. Clearing browser data clears their chats. If you want
  chats shared across a person's devices, that needs a real database and
  real accounts — a bigger step up from this.
- **Model IDs change.** `src/App.jsx` has a `PROVIDERS` list near the top
  with the model IDs used today. If a provider retires or renames a model,
  update the `id` there to match their current docs.
