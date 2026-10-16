# Demo video script (target 2:40, limit 3:00)

Dates and amounts are generated relative to **today**, so the exact figures differ day to day. The figures below are from a real walkthrough on 15 Oct and show the shape of the story; **read the numbers off your screen** rather than memorising these.

## Before you press record

- [ ] Browser at about 1280 px wide, zoom 100%, notifications off, one tab
- [ ] Settings → **Reset demo to its original state**, then go back to Overview
- [ ] Coach server running with your key (or accept the labelled fallback and say so in the narration)
- [ ] Do a dry run once; time it

## Script

| Time | On screen | Say |
|---|---|---|
| 0:00 | Landing page | "Having a bank account doesn't mean you control your money. PocketPilot helps Nigerian students understand it and decide better." |
| 0:12 | Click **Explore the demo student profile** | "No signup, no bank login, no BVN. This is a clearly labelled fictional student with synthetic data." Point at the *Demo data* banner. |
| 0:25 | Overview (Last 30 days): balance ₦24,500, money in ₦85,000, spent ₦73,600; the 30-day chart; "Coming up" list | "Her balance is ₦24,500. The chart is a projection, not recorded money, and expected income is marked *not received*. It shows she may run short around 11 to 12 November." |
| 0:50 | Transactions → **+ Add transaction**. Type *Lunch at campus cafeteria*, ₦1,200 | "A machine-learning model, trained on synthetic data, suggests *Food and groceries*, and shows which words it used. I can change it." Save. |
| 1:05 | Add *Church building fund*, ₦2,000 | "When the model isn't sure it says so. I choose *Other*. The user always has the last word." Select Other, tick **One-off**: "and this is a one-off, so the forecast won't assume she does this every week." Save. |
| 1:20 | Insights page | "These patterns come straight from her data, each with the evidence behind it. Food is almost half her spending, and a shortfall is coming." Type *Why might I run short this month?* in the coach box and press Enter. |
| 1:35 | Coach answer | "The AI only explains. Every naira figure it writes is checked against the calculator, and if the AI is down you get a labelled rule-based explanation instead." (If the badge says *Built-in*, say exactly that.) |
| 1:55 | Planning: drag **Entertainment and leisure** to −50% | "What if she cuts entertainment by half?" Point at the lines moving apart and the table: balance on 14 Nov improves by about ₦4,000. |
| 2:10 | Tick **Skip it** on *Friend's birthday party* | "And skips this party." Table: balance now slightly positive, **Shortfall avoided**. "Her real plan hasn't changed. This is only a what-if." |
| 2:25 | Go to **Insights** (your what-if is still active) and type *What changed with my what-if?* in the coach box, then press Enter | "The coach explains the difference, and the figures in *What this could change* are calculated by the engine, not the AI." |
| 2:35 | (Optional, if time) Add goal *Textbook fund*, ₦20,000 | "Goals are optional. If she adds one, PocketPilot tells the truth: under these assumptions it falls short, and what could change that. Nothing is changed for her." |
| 2:50 | Back to Overview | "From access to agency: PocketPilot turns a balance into understanding and a decision. All data here is synthetic and nothing is connected to a real bank." |

## If something goes wrong on camera

- **AI badge says Built-in:** keep going. Say "the AI service is unavailable, so PocketPilot shows its labelled fallback; the dashboard never depends on it." This demonstrates the safety design.
- **Numbers differ from this page:** fine. Narrate what you see.
- **You made a mess:** Settings → Reset demo, restart the take.

## Claims to avoid (they are not true or not verified)

- "Real bank / B Moni integration" (there is none)
- "Accurate" or "validated" about the category model (it is trained and tested on synthetic data only)
- "Guaranteed savings" or any promise about a goal
- Anything about the AI that you haven't seen it do live
