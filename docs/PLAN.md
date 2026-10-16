# PocketPilot — SDLC plan

Hackathon: B Moni x TINC26 "From Access to Agency". Product: an AI + ML personal finance companion for Nigerian students. All data is **synthetic**; there is no live banking integration.

## Stack (chosen after inspecting the environment)

| Concern | Choice | Why |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript, Recharts | Fast to build, mobile-first, installable as a PWA later |
| Finance engine | Pure TypeScript module `web/src/engine` | Deterministic, unit-tested, no UI imports. Source of truth for every number |
| ML | scikit-learn (TF-IDF + logistic regression) trained in `ml/`, exported to `model.json`, inference re-implemented in TypeScript | Genuine supervised model; runs offline in the browser; parity-tested against Python |
| AI coach | Node server proxy (`server/`), key from env var, deterministic fallback explainer | Key never reaches the client; app works with no key or network |
| Persistence | `localStorage` (single state object, derived values computed) | Enough for a demo; documented limitation |

## Increments (each leaves a working app)

| # | Increment | Exit criteria |
|---|---|---|
| 0 | Requirements, plan, scaffold | App builds and starts |
| 1 | Engine + synthetic data + tests | `vitest` passes hand-computed cases |
| 2 | ML categoriser | Trained, evaluated, TS parity test passes |
| 3 | App shell, Overview, Transactions (CRUD, ML suggestion, filters, reset) | Totals match engine; demo resettable |
| 4 | Priorities, Budget, upcoming events | Budget vs actual correct; irregular-income caveat shown |
| 5 | Scenario simulator + goal feasibility + charts | Slider changes recompute forecast; original plan untouched |
| 6 | AI coach (server + fallback) | Structured response validated; failure leaves dashboard working |
| 7 | Polish, test pass, README, demo script, submission text (≤150 words) | Acceptance checklist in the master prompt |

## Key modelling decisions

- Amounts are positive naira; `type` carries direction.
- **Own-account transfers** (category *Savings and transfers*) leave the wallet balance but are *not* consumption expenses, and are reported as savings contributions.
- **Received vs expected income** are separate: only past-dated income transactions affect the recorded balance; expected income events exist only in projections and can be switched off.
- **Projection**: `balance(t) = starting + Σ income received/expected ≤ t − Σ expenses paid/planned ≤ t`. Run-rate spending per category is the mean daily spend over a lookback window of the user's own history; known upcoming expenses are added on top (assumption: they are not already in the run-rate).
- The LLM never computes numbers; it receives engine output and explains it.
