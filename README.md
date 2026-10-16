# PocketPilot

*Understand your money. Take control.* An AI + ML personal finance companion for Nigerian students (B Moni x TINC26 hackathon prototype).

**All data is synthetic. There is no live bank or B Moni connection.**

## Run

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # engine + ML parity tests
```

## Retrain the category model (optional)

```bash
cd ml
py -m venv .venv && .venv\Scripts\python -m pip install scikit-learn
.venv\Scripts\python generate_dataset.py
.venv\Scripts\python train.py     # writes ml/artifacts/metrics.json and web/src/ml/model.json
```

## Layers

1. **Finance engine** (`web/src/engine`): deterministic, unit-tested; the only source of numbers.
2. **ML** (`ml/`, `web/src/ml`): TF-IDF + logistic regression (scikit-learn) trained on synthetic descriptions; inference ported to TypeScript and parity-tested against Python. Validation is on held-out *synthetic* phrases (~60% accuracy, macro-F1 ~0.62), which does not establish real-world accuracy.
3. **AI coach** (`web/server`, `web/src/coach`): the browser sends calculated facts (no names, no transaction text) plus, if the person types one, their question (max 300 characters) to a small Node server that holds the API key and calls Claude with structured output. Every ₦ amount and % in the reply is checked against the engine's numbers; anything unverifiable, and any failure, timeout or missing key, falls back to a clearly labelled rule-based explainer (not generative AI). The "what could change" figures always come from the engine, never the model.

## Run the coach (optional)

```bash
cp .env.example .env     # add ANTHROPIC_API_KEY. The app works without it.
cd web
npm run server           # coach on http://127.0.0.1:8787 (reads ../.env)
npm run dev              # app on http://localhost:5173, proxies /api to the coach
```

The default model is `claude-opus-5-5`; set `COACH_MODEL` to change it. The coach has been run live against the Claude API with the demo data: one structured answer came back in about 11 seconds and every ₦ amount and % in it passed the figure check. It is also covered by tests with a fake model client.

See `docs/PLAN.md` for the increment plan and modelling decisions.

## Status

| # | Increment | State |
|---|---|---|
| 0 | Plan + scaffold | done |
| 1 | Engine, synthetic data, tests | done |
| 2 | ML categoriser | done |
| 3 | Overview, Transactions, Settings, onboarding | done |
| 4 | Budget, priorities, planned expenses, expected income | done |
| 5 | Scenario simulator + goal feasibility | done |
| 6 | AI coach, labelled fallback, Insights page | done, and checked live once |
| 7 | Deploy guide, demo script, 150-word description, submission checklist | docs done; deploy, video and submit are yours (see below) |

## Forecast assumptions

Forecasts project your **recent daily spending pace** (last 28 days) forward, plus known planned expenses. Mark an expense as a **one-off** and it still reduces your balance but is left out of the pace, so it is not assumed to repeat. The app also asks when an amount is at least 3 times the usual for its category (needs 5 or more past items). The Planning page lists what was left out under "Assumptions".

## Submission pack

- [`docs/DEPLOY.md`](docs/DEPLOY.md): Vercel steps, key safety, a live-AI test, and a fresh-browser test
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md): timed 2:40 video script and claims to avoid
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md): 142-word description, tool disclosures, limitations, checklist

Run `npm run check` in `web/` (typecheck + tests + build) before submitting.
