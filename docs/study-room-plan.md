# Study room: first working version

The user approved the reading/discussion prototype. Bring its core flow into the
existing personal reader, preserving document storage, annotations and providers.

## Scope

- Calm centered reading column, persistent desktop contents, compact player.
- A right-hand discussion panel on desktop and a bottom sheet on narrow screens.
- Existing streamed AI answers, follow-ups and saved glosses; Russian by default.
- Pause narration on selection/discussion without discarding the current audio.
- Explicit continuation, never automatic playback when a panel closes.
- Copy a bounded context packet for this Codex chat. No automatic chat connection.
- Keep existing focus, notebook, provider settings, EPUB chapters and resume.

## Implementation and checks

1. Extend the listening engine with idempotent pause/resume, clip position, seek,
   and a study interruption token invalidated by stop/new session. Test pause
   during loading and resumed audio, and stale-token rejection with fake audio.
2. Add StudyPanel and StudyContents using the existing document and gloss stores.
   Move questions out of the floating player area. Reuse GlossCard rendering,
   with example/limits follow-ups and Codex context copy. Verify bounded context
   and Russian prompt defaults in tests.
3. Style the reader and controls using existing theme variables. Verify reading,
   explanation, error handling, notebook and listening transitions in the local
   browser. Run tests, TypeScript and production build; commit verified chunks.

## Boundaries

No data migration, new dependencies, hosted deployment or additional provider.
Read/listen mode means following the voice can be turned off; a separate
audio-only screen and automatic end-of-chapter quiz are deferred. Existing
question-based study remains available. Audio progress is per current passage,
not an invented total book duration. Closing discussion keeps playback paused.
