# Book navigation implementation plan

> Execute inline with superpowers:executing-plans. User approved the complete description in chat.

**Goal:** Make long EPUBs navigable without losing the reader's place.
**Architecture:** Preserve the existing block IDs and text offsets; enrich EPUBs with original navigation and internal targets. Measure rendered chapters in a separate, noninteractive surface using the same typography. Keep exploration history separate from normal page turns.
**Tech Stack:** Next, React, TypeScript, native EPUB XML, CSS columns.
**Spec:** Approved five-part design in this chat: honest pagination; real TOC; return, bookmarks and footnotes; typography; selection actions for Codex and audio.

## Constraints
- Preserve existing positions, notes, highlights, voice and settings.
- English UI. No paid background audio, no copied book assets in Git.
- No invented page totals. Recompute on fonts, size, width, images.
- Source files remain local. Existing imports need a nondestructive update from the same EPUB.

## Review focus
- Existing import upgrade must reject a different text before changing anything.
- NCX and EPUB3 navigation may contain nested and fragment targets.
- Internal references must not open unsafe URLs or change character offsets.
- Font resize must invalidate totals and preserve exact reading position.
- Returning from search or a note must restore the original passage, including audio state.

## Tasks
- [ ] 1. EPUB metadata: add original TOC, targets and footnote references; tests for NCX, EPUB3, unsafe links and unchanged old text/IDs. Add safe metadata upgrade and original-file retention.
- [ ] 2. Reading navigation: use source labels, separate front/back matter, contextual bookmark labels, back-to-reading history and focus-safe footnote dialog. Verify on Deutsch.
- [ ] 3. Pagination: measure chapters sequentially with identical rendering; show global pages only when complete, remaining pages in section, page-jump popover and progress. Test offsets and invalidation in browser.
- [ ] 4. Selection/typography: Explain, Translate, Note, Listen from here; chapter context in Codex handoff; tune book spacing, images and paragraphs without breaking text offsets.
- [ ] 5. Run tests, typecheck, build, browser checks on existing and reimported book. Independent final review. Commit changes and push existing authorized branches.

## Execution record
- Base 595235a; clean checkout on local-study. Working in the current local checkout to update the user's running reader.
- Existing block-text conversion deliberately retained for safe upgrade. No forced migration of a different edition.
- Tasks 1–4 implemented. Original Deutsch upgrade compared all 4039 block IDs/types/texts successfully; UI update uses stored raw document (not title-cased presentation).
- Independent review identified and fixed: native dialog keyboard guard, playback follow restoration scoped to session, semantic EPUB3 note containers/bounds, pagination restart on in-place content update.
- Browser: old book upgraded in place, reload retains real titles; Page13 -> Page37 -> note popup -> Back returns Page13. Font 21 -> 22 recalculates total1488 ->1566 while preserving passage; restored21.
- 50 tests and tsc passed. Build passed before final review fixes; rerun final checks after completion.
- Final checks: 50/50 tests, TypeScript, production build pass (existing Atkinson font fallback warning). Independent follow-up review confirms all five fixes; EPUB8/8 rerun.
- Browser regression checks: footnote ArrowRight leaves background at Page37; note backlink closes in place; search result Chapter7 Page410 -> Back Page13. Live cached Michael: Listen from here -> detour pauses -> Back resumes -> Follow along remains checked. Voice stopped after verification.
- Complete. No book files, cached audio or credentials committed.
