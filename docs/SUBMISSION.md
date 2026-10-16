# PocketPilot: submission pack

B Moni x TINC26 "From Access to Agency". Items marked **[YOU]** need something only you can supply (an account, a link, the handbook's exact rules).

## 1. Project description (142 words, limit 150)

PocketPilot helps Nigerian students move from having money to understanding it. Most apps show a balance; PocketPilot explains where the money goes, forecasts where the balance is heading, and lets users test decisions before making them. A deterministic finance engine produces every number. A scikit-learn text classifier, trained on synthetic data, suggests spending categories that users can correct. A Claude-powered coach explains the engine's results in plain English; its figures are checked against the engine, and a labelled rule-based explainer takes over if the AI is unavailable. A scenario simulator compares the current plan with adjustments, such as trimming flexible spending or skipping a bill, and an optional goal gets an honest feasibility verdict. No savings goal, bank login or BVN is required. The prototype uses a fictional student profile and synthetic data; there is no live banking or B Moni integration.

## 2. How AI and ML are used (for the "AI explanation" field, if the form asks)

| Layer | What it does | What it never does |
|---|---|---|
| Finance engine (TypeScript, 120 tests) | Every balance, total, forecast, budget status and goal verdict | n/a: it is the source of truth |
| ML classifier (scikit-learn TF-IDF + logistic regression) | Suggests a category from a transaction description. The user can always change it | Decide anything on its own; it is trained only on synthetic descriptions |
| AI coach (Claude, via a server-side proxy) | Explains the engine's results in plain English, adapted to the user's priorities | Calculate numbers. Each ₦ amount and % in its reply is checked against the engine; mismatches are discarded |
| Built-in explainer | Rule-based text shown when the AI is off, slow, rate-limited or fails verification | Pretend to be AI. It is labelled "rule-based, not generative AI" |

## 3. Tools, libraries and services to disclose

- **Frontend:** React 19, TypeScript, Vite, Recharts.
- **ML:** Python, scikit-learn (training only); inference re-implemented in TypeScript and tested for parity with scikit-learn.
- **AI:** Anthropic Claude API through the official TypeScript SDK; default model `claude-opus-5-5` (set `COACH_MODEL` to change).
- **Testing:** Vitest, Testing Library, jsdom.
- **Built with** Claude Code as a coding assistant.
- **No B Moni API** is used. The transaction source is simulated and labelled as such.

## 4. Honest limitations (say these out loud; judges respect them)

- All data is **synthetic**. The category model was trained and validated on synthetic, template-generated descriptions: ~60% accuracy on held-out synthetic phrases (macro-F1 0.62). That shows the pipeline works, **not** real-world accuracy.
- Known weak spot: a payment to another person (e.g. "transfer to Tunde") can be read as moving one's own money, which is not counted as spending. The form warns and lets the user correct it.
- Forecasts are **estimates**: they assume everyday spending continues at the recent 28-day average, and that planned bills are extra to it. Users can mark an expense as a **one-off** so it is not extrapolated (the form also asks when an amount is much larger than usual for its category). An unmarked large purchase is still treated as part of the pace.
- The AI coach was run live once in development (demo data, `claude-opus-5-5`; the answer passed the figure check) and is otherwise covered by tests with a fake model client. That is a single sample, not a measure of how every answer will read. Re-test on the deployed site with your key before recording (see `docs/DEPLOY.md` section 4).
- If a user types a question to the coach, that text (max 300 characters) is sent to the AI service along with the calculated figures. The built-in fallback cannot read questions and says so. The AI is told to answer only from the supplied figures and to decline loans, investments and anything outside them, and its answer is still checked against the engine's numbers.
- Data lives in the browser (`localStorage`). There are no accounts and no sync.
- Not licensed financial advice. The app says so.

## 5. Pre-submission checklist

### Product (done and verified)
- [x] Onboarding without credentials; fictional student profile; resettable demo
- [x] Transactions: add, edit, delete, filter; ML category suggestion with correction
- [x] Budget, expected income vs received income kept separate, planned expenses, priorities (none required)
- [x] Scenario simulator: original plan never changed until the user accepts
- [x] Optional goal with an honest feasibility verdict
- [x] AI coach with verification and a labelled fallback; dashboard works if AI fails
- [x] Mobile and desktop layouts; accessibility pass (contrast, names, focus, reduced motion)
- [x] 120 automated tests, typecheck and production build pass (`npm run check` in `web/`)
- [x] No secrets in the repo or the client bundle

### Needs you
- [ ] **[YOU]** Read the participant handbook and confirm: deadline and timezone, submission form URL, word limits, video length, repo visibility rules, required disclosures
- [ ] **[YOU]** Put the code in a repository the organisers can open (public, or shared with them). Run `git status` first and confirm `.env` is not tracked
- [ ] **[YOU]** Deploy (`docs/DEPLOY.md`) and open the link in a **fresh private window** on your phone and laptop
- [ ] **[YOU]** Add `ANTHROPIC_API_KEY` on the host, ask the coach one question on the deployed site, and confirm the badge says "AI coach" (or accept the labelled fallback)
- [ ] **[YOU]** Record the 2 to 3 minute video (`docs/DEMO_SCRIPT.md`); watch it once with sound
- [ ] **[YOU]** Paste the description (section 1), links and disclosures (sections 2 and 3) into the form; submit **before** the deadline, not at it
- [ ] **[YOU]** Screenshot the confirmation page

### If time runs short (cut in this order)
1. Skip the goal section of the video.
2. Skip the deploy of the AI coach and submit with the labelled fallback (it is honest and fully working).
3. Never cut: a working link, the video, the disclosures.
