# Critical reading cards

Select a passage and choose **Challenge**, or use **Discuss → Challenge this idea**.

The floating card has three steps:

1. **What’s the author saying?** — write a sentence or two, then optionally reveal the passage. The writing area grows with your answer.
2. **What would you question?** — optional Evidence, Limits and Another explanation starters append to your question without replacing it. **Copy for Codex** prepares the source, nearby context and your thinking for an English discussion. Paste it into Codex manually.
3. **Where do you stand now?** — keep a provisional conclusion and an optional unresolved question. **Pin in margin** creates a separate passage note; repeating it updates that copy without overwriting other notes.

Every step is optional. Use the back arrow, skip to a conclusion, or return to reading at any time. All writing and review choices autosave to Notebook.

The coach is asked to check the reconstruction before explaining, address objections fairly, distinguish source claims from its own reconstruction, and ask one question at a time. Answers are not generated or imported automatically in the reader.

## Returning to an idea

Enable **Revisit later** after writing a conclusion. A card appears in the library when due, with the earlier conclusion hidden until **Reveal my takeaway**. **Revisit later** advances the existing highlight-review schedule: 3, 7, 16, 35, 75, 160 days. **Done with this thought** removes it from review without deleting the note. These are practical defaults, not a claimed optimal schedule.

Notebook retains the claim, objection, conclusion and open question. Markdown export and the existing serialized backup retain the reader-authored fields separately from AI answers. No new service or API request is needed for the cards.

## Interaction and verification

The native dialog keeps keyboard focus inside the card, closes with Escape or an outside click, and restores focus to the initiating control. Its body scrolls independently while the action footer remains available. Motion respects reduced-motion preferences. The book's reading layout is unchanged while the card is open.

Validated: draft persistence after reload, clipboard contents, conclusion reveal, review enrollment, Escape/focus restoration, 390-pixel viewport bounds, unit tests and production build. Due-date behavior is covered with controlled-time tests; a real three-day wait was not performed.
