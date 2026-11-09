# Healyx Health

A personal health workspace built with Next.js, Supabase, and Groq. Main navigation: Overview, Health Records, Research, and Protocol. The experimental Brain route is retained for existing links but removed from navigation.

## Local setup

Use Node.js 20.9 or later. Install with `npm ci --legacy-peer-deps`, then `npm run dev`. Configure a local `.env.local` (never commit credentials):

- `NEXT_PUBLIC_SUPABASE_URL`: existing Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public Supabase anonymous key. Existing database tables and row-level security policies are required.
- `GROQ_API_KEY`: server-only Groq API credential for chat, transcription, and generation. Configure it in the deployed environment as well.

Run `node --test tests/*.test.cjs`, `npx tsc --noEmit`, and `npm run build` before deployment. Sign in with an existing test account to verify records, chat, research, and protocol. No production credentials or patient records are bundled.

## What the number means

The dashboard's cardiometabolic snapshot is a **simplified wellness indicator**, not a validated Life’s Essential 8 score or measure of total health. It is inspired by AHA categories but omits diet and medication/history adjustments. Seven supported factors are blood pressure, non-HDL cholesterol, glucose, BMI, physical activity, sleep, and nicotine. Each available factor is scored 0–100; the displayed number is the rounded unweighted mean of available factors. The UI lists every contribution and missing factor. No observations means no displayed score.

The exact bands live in `lib/healthScore.ts`. Eligible dated lab observations and paired vital records are selected in `lib/clientHealth.ts`. Non-HDL requires total cholesterol minus HDL; LDL is no longer converted using an assumed offset. Exercise days do not establish duration, so activity is left missing until actual minutes can be collected. Both systolic and diastolic readings are required. The more severe blood-pressure band wins. Glucose and cholesterol require explicit compatible units; generic glucose is not assumed fasting. Non-HDL requires same-day total cholesterol and HDL. Conflicting same-day values are excluded. Results may combine observations from different dates and do not implement recency cutoffs. These limitations are material when interpreting the number.

PhenoAge is withheld because the current records cannot establish verified same-panel provenance. The mathematical implementation remains available for controlled inputs.

## Research and protocol

Research searches PubMed and ClinicalTrials.gov and links to original records. Indexing is not a guarantee of peer review, study quality, or applicability; trial registration does not prove effectiveness. Abstracts and AI summaries are labeled separately. Source outages produce a retryable error rather than a false claim of no evidence.

Protocol shows the saved plan, actual task completion, next unfinished action, and review date. Generated suggestions require personal/clinical review before acting on them. No fabricated completion or outcome data is shown.

## Chat troubleshooting

The prior Groq client was initialized while modules loaded. Missing `GROQ_API_KEY` could fail before the chat handler returned JSON. Initialization is now deferred until a request; configuration and provider failures return controlled errors. The client handles non-JSON failures, empty replies, timeouts, and excludes error messages from future conversation history. A valid server key and accessible provider model are still required for live answers.

## Design

A compact, theme-aware dashboard replaces the bright banner. The existing light/dark switch and sign-out remain. The dashboard prioritizes latest lab signals, explicit score coverage, chat, records, research, and next actions. Motion respects reduced-motion preferences.

## Current trust boundaries

Chat validates a Supabase bearer token and loads records through the authenticated user-scoped client. Dashboard questions prefill the composer; the user sends them. Research comparison uses reported source passages and explicit unknowns; source review refetches a verified PubMed or trial identifier and does not forward patient profiles. Records never treat missing status as normal or a downward trend as automatically beneficial. The home screen prioritizes recorded status and comparable changes; the score is optional.

See [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md) for the product critique, future milestones and release criteria.
