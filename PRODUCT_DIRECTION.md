# Healyx: purpose and next milestones

Healyx helps people understand their health, investigate questions with evidence, and follow through on useful actions. The product should close a loop: personal records → understandable signals → research → chosen action → observed outcome. Preparing for a clinical conversation is one use, not the product's whole purpose.

## Critical assessment

The first redesign improved navigation but did not yet deliver overwhelming value. A prominent partial score obscured uncertainty. Record views inferred normality from missing flags. Research discovery lacked source comparison. Generated protocols implied evidence strength and future score improvements that the system had not established.

This iteration prioritizes trustworthy utility: recorded versus unknown lab status, comparable changes, contextual questions, source comparison, authenticated chat, and deliberate selection of protocol actions. The optional score explains its factors and provenance. None of this establishes clinical validation or proves better health outcomes.

## Next vertical slices

1. **Reliable longitudinal record.** Verify lab provenance, specimen identity, units, dates and reference ranges; allow users to resolve duplicate conflicts. Add supported lab/device imports with explicit consent, revocation and export. Acceptance: every displayed signal can be traced to a source observation, and ambiguous observations never silently merge.
2. **Personal evidence workspace.** Save questions and source comparisons; distinguish publication type, population, intervention, endpoints, limitations and contradictory results. Link a question to selected records only with consent. Acceptance: claims link to supporting passages, unavailable details remain unknown, and evaluation measures unsupported-claim rate and retrieval recall.
3. **Action and outcome loop.** Let users select an action, choose a meaningful measure and review date, and compare actual observations over time. Keep adherence separate from health benefit and avoid causal claims from uncontrolled personal trends. Acceptance: each action has a visible rationale, baseline, owner and review outcome.
4. **Useful anticipation.** Opt-in updates when new relevant evidence or personal observations materially change a saved question. Show what changed, why it matters and uncertainty; let users tune or mute notifications. Acceptance: measure useful-action rate and notification burden before broader rollout.

## Release gates

Use synthetic and consented test data to evaluate retrieval, source fidelity, authentication isolation, missing/contradictory observations and provider outages. Test desktop/mobile and both themes. Track whether users can identify their latest recorded status, explain uncertainty and choose a useful next step without help. Production AI credentials, database permissions and live generation need a separate authenticated smoke test; a successful build alone does not verify them.
