# Critical reading cards

Select a passage and choose **Challenge**, or use **Discuss → Challenge this idea**.

The floating card has three steps:

1. **Recall** — reconstruct the claim in your own words. Reveal the passage when ready to check it.
2. **Challenge** — write an objection, alternative explanation or question. **Copy for Codex** prepares the source, nearby context, your thinking and coaching instructions. Paste it into your Codex conversation manually.
3. **Reflect** — record a provisional conclusion and an optional unresolved question. Drafts are kept in Notebook; **Save & return to book** also applies the review choice.

The coach is asked to check the reconstruction before explaining, address objections fairly, distinguish source claims from its own reconstruction, and ask one question at a time. Answers are not generated or imported automatically in the reader.

## Returning to an idea

Enable **Revisit this thought** after writing a conclusion. A card appears in the library when due, with the earlier conclusion hidden until **Reveal my takeaway**. **Revisit later** advances the existing highlight-review schedule: 3, 7, 16, 35, 75, 160 days. **Done with this thought** removes it from review without deleting the note. These are practical defaults, not a claimed optimal schedule.

Notebook retains the claim, objection, conclusion and open question. Markdown export and the existing serialized backup retain the reader-authored fields separately from AI answers. No new service or API request is needed for the cards.

## Interaction and verification

The native dialog keeps keyboard focus inside the card, closes with Escape or an outside click, and restores focus to the initiating control. Its body scrolls independently while the action footer remains available. Motion respects reduced-motion preferences. The book's reading layout is unchanged while the card is open.

Validated: draft persistence after reload, clipboard contents, conclusion reveal, review enrollment, Escape/focus restoration, 390-pixel viewport bounds, unit tests and production build. Due-date behavior is covered with controlled-time tests; a real three-day wait was not performed.
