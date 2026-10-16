# Deploying PocketPilot

I could not deploy for you: it needs your hosting and Anthropic accounts. This is the shortest reliable path, with a fallback if anything goes wrong.

## 1. What gets deployed

- `web/` builds to static files (`npm run build` → `web/dist`).
- `web/api/coach.ts` is a serverless function at `POST /api/coach`. It reads `ANTHROPIC_API_KEY` from the host's environment variables. The key never reaches the browser.
- Without a key the endpoint answers `503 no_api_key` and the app shows its labelled built-in explainer. **The app is fully usable either way.**

## 2. Recommended: Vercel (one project, static site + function)

1. Push the repository to GitHub (check `.env` is not committed; `.gitignore` already excludes it).
2. In Vercel: **Add New → Project → import the repo**.
3. Settings:
   - **Root Directory:** `web`
   - **Framework preset:** Vite (build `npm run build`, output `dist`)
4. **Environment Variables** (Production): `ANTHROPIC_API_KEY` = your key. Optional: `COACH_MODEL`.
5. Deploy. Every push redeploys.

I have not run a deploy, so treat step 3 as the thing to check first if the function is not found. `web/api/coach.ts` is covered by unit tests, but the host wiring is unverified.

### Static-only alternative (Netlify, GitHub Pages, Cloudflare Pages)
Publish `web/dist`. There is no `/api/coach`, so every question or "Explain my finances" shows the labelled built-in explainer. Honest and reliable; use this if the function route gives you trouble.

## 3. Protect your key and your budget

- Set a monthly **spend limit** on the key in the Anthropic Console.
- The endpoint validates input, caps the request at 64 KB, and allows 12 requests per minute per IP (per function instance, so it is a courtesy limit, not a hard one).
- Each explanation sends about 2 to 3 thousand tokens and returns under 1,000; at list prices that is a few US cents. Check real usage in the Console after your first few calls.
- **Rotate or delete the key after the hackathon.**
- Never paste the key into chat, code, the README or the video.

## 4. Test the live AI on your deployment

The coach already worked live locally during development (one call with the demo data returned a well-formed answer that passed the figure check). Repeat it once on the host to confirm the key and the function route.

Locally, from `web/`:

```bash
cp ../.env.example ../.env     # add ANTHROPIC_API_KEY=...
npm run server                 # terminal 1: prints "AI enabled, model ..."
npm run dev                    # terminal 2
```

Open Insights, type a question (for example "Why might I run short this month?") and press **Ask**, or press **Explain my finances**. Pass condition: the badge reads **AI coach · claude-opus-5-5** and the text quotes only figures that appear on screen. If you instead see "Built-in explanation" with a notice, read the notice:

| Notice | Likely cause |
|---|---|
| "no API key" | `.env` not found or key empty; restart `npm run server` |
| "had a problem" | Upstream error. Check the server terminal; verify the key and the model name |
| "could not verify" | The model wrote a figure not in the data. The safety net worked; try again, or tell me the text and I will tighten the prompt |

## 5. Fresh-browser test of the deployed link (about 5 minutes)

In a private window, on desktop **and** your phone:

1. Page loads; "Explore the demo student profile" opens the dashboard with the **Demo data** banner.
2. Add a transaction (Transactions → + Add transaction).
3. Planning: move a slider; the green line moves away from the dashed line.
4. Insights → ask a question or press Explain my finances; a result appears (AI or labelled fallback).
5. Settings → Reset demo restores the original data.
6. No console errors (browser dev tools).

## 6. Before you record or submit

```bash
cd web && npm run check     # typecheck + tests + build
```

Then **reset the demo** (Settings → Reset demo) so the video starts from the original state.
