# Critical reading in the margin

Select a passage and choose **Challenge**, or use **Discuss → Challenge this idea**.

The thought opens in the margin beside the passage. The page never moves for it: a vermilion pencil line runs down the passage's left edge, and the thought sits level with it. When the margin is too narrow (phones, small windows), the thought opens over the page instead, as a sheet at the bottom on phones.

Three short prompts come one at a time. Each one appears after a short pause in writing, once the one before has an answer. **Skip** moves on without one:

1. **In your words, what is the claim?** The caret is already in this answer when a fresh challenge opens.
2. **Where do you doubt it?** Evidence, Limits and Alternatives are toggles. Each is saved as its question ("What supports this claim?" and so on) ahead of your own words, which the field never rewrites.
3. **Where do you stand, for now?** Once written, **Revisit later** and an optional **What would change your mind?** appear.

Everything autosaves to the Notebook. **Copy for Codex** prepares the source, nearby context and your thinking for an English discussion; paste it into Codex yourself. If the clipboard is unavailable, the prepared message appears for manual copying.

## Closing and returning

Close with the × or Escape. The thought fades and the pencil line folds into a small dot in the margin by the passage's first line. Clicking the dot reopens the thought with everything you wrote. In a book, turning away from the passage's page closes its thought. In an article, a passage scrolled out of view leaves its thought below the top bar.

A challenged passage is marked only by its dot, not by an underline. Challenges that start on the same line share one dot.

## Returning to an idea

Enable **Revisit later** after writing where you stand. A card appears in the library when due, with the earlier conclusion hidden until **Reveal my takeaway**. **Revisit later** advances the existing highlight-review schedule: 3, 7, 16, 35, 75, 160 days. **Done with this thought** removes it from review without deleting the note. These are practical defaults, not a claimed optimal schedule.

Notebook retains the claim, doubt, conclusion and open question. Markdown export and the existing serialized backup retain the reader-authored fields separately from AI answers. No new service or API request is needed.

## Motion

Opening: the pencil draws down the passage (240 ms, ease-out) while the selection wash fades; the thought fades in and slides 8 px from the right (120–360 ms). A new prompt fades in and rises 4 px (200 ms). Closing: the thought fades (160 ms) while the line folds into the dot (240 ms). With Reduce Motion on, everything appears and disappears without movement.

## Verification

Unit tests cover prompt order, doubt toggles, placement and the book's page dots. Checked in a browser on an isolated copy with backup off: book page at 1280×760 and 390×844, article at 1440×860; focus on open, prompt reveal, toggles keeping typed text, autosave across reopen, fold-to-dot alignment, dots after page turns, scroll following and Escape.
