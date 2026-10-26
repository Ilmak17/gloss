# Personal reading workspace

Run `./scripts/local.sh` from this repository, then open **http://127.0.0.1:3100**.
The launcher uses Node 22+ from PATH, or the existing Codex runtime when the system Node is too old. It only listens on this computer. Stop with Ctrl+C. After a restart, run it again.

For a fresh checkout, install Node 22+, run `npm ci`, then `npm run dev:local`.
No Clerk account or database is needed for local reading. Keep `.env.local` out of Git.

## Books

The home page opens your library. Choose **Add a book → Books & files**. EPUB, PDF, Markdown and plain text are supported. The reader's **Contents** button moves between EPUB spine sections. Reading position is restored when the document opens again.

EPUB import runs in the browser. It preserves reading order, prose, headings, emphasis, supported tables and packaged PNG/JPEG/GIF/WebP images. This is a reading view, not a reproduction of the publisher's page layout. DRM-encrypted chapters are unsupported; SVG, embedded media and book CSS are not rendered. Internal footnote navigation and nested publisher navigation are not implemented yet.

The maximum archive size is 64 MB, with 16 MB per expanded file and 128 MB total. Books, annotations and progress live in this browser's IndexedDB/local storage. Keep original book files: clearing browser data removes this local library. Use the same browser and **127.0.0.1:3100** address each time; `localhost` has separate storage. A filesystem-backed library and full backup/export are future work.

## Listen while reading

Kokoro via DeepInfra is the default for English books. Set a server key in the ignored `.env.local`, or enter one under **Voice settings → Advanced**:

```dotenv
DEEPINFRA_API_KEY=your-key
```

Restart the local server after editing environment settings. Michael is the default voice. Choose one of six American/British voices and use **Preview voice** to compare a short original English passage. Each preview is generated only on click and saved just like book audio. The standard DeepInfra tier is explicit: no priority premium. Published price checked 2026-10-26: $0.99 per million characters; actual billing is controlled by DeepInfra. Account funds are required.

ElevenLabs remains an explicit alternative, using `ELEVENLABS_API_KEY` and optionally `ELEVENLABS_VOICE_ID`. Together uses its separate AI key. Browser settings store each provider's key separately; legacy ElevenLabs settings are retained when Kokoro becomes the default. No provider failure automatically switches to another paid provider. Kokoro's English voices refuse Cyrillic input with an actionable message.

Use **Read aloud** in the bottom player to begin at the current paragraph. Pause, resume, stop, speed, repeat, seek and follow-voice controls remain in **⋯**. Time is for the current passage. Kokoro and ElevenLabs timestamps drive word highlighting where the CSS Custom Highlight API is available. Missing or mismatched words (including normalized numbers) fall back to paragraph tracking instead of guessing offsets.

### Persistent audio

Local loopback requests save successful MP3 audio and word timings in **`.data/audio/`**, ignored by Git. Reopening the reader or restarting the server reuses saved audio. The cache identity includes exact trimmed text, provider, model, voice, fixed generation speed/format, a format version, and a credential fingerprint. Changing voice/model/text/credentials creates a separate entry. Playback speed changes do not regenerate audio. Neither credentials nor source text are stored in the cache files, but audio naturally contains the spoken text. Files use private permissions.

There is no speculative prefetch: a new passage generates when playback reaches it. This may introduce a pause between passages on their first listen. Concurrent identical requests in one server process share generation. Closing the tab or stopping narration does not cancel a generation already sent to the provider: it finishes and saves for reuse. A failed provider request is not cached; explicit retry may incur cost if the provider charged before failing.

Set `GLOSS_AUDIO_CACHE_DIR` to move the cache. Back up this directory to retain paid audio; deleting it makes later listening generate again. No automatic eviction is performed. `GLOSS_AUDIO_CACHE=off` disables storage for testing; non-loopback hosted requests never use this shared local cache. This is a single-user local setup, not a multi-user hosting cache. Read/access failures stop before generation; if a disk write fails after generation, the player warns that the audio was not saved.

Preparing study questions is local and needs no AI key.

## Read and discuss

The compact player keeps playback, passage progress and **Discuss** visible.
Open **⋯** for speed, repeat, follow-voice, voice settings and stop. The menu
opens upward and closes on Escape or an outside click.

The interface is in English. The library opens books directly from a compact reading list; the Details button keeps rename, organization and removal available. Topic filters appear as the collection grows.

The desktop reader has contents on the left and a question panel on the right.
Select text and choose **Explain**, or use **Discuss** in the player.
The copied context still requests explanations in Russian, without translating book text or changing existing notes.
Selecting text, opening a discussion or opening the notebook pauses narration.
The return-to-reading button resumes only when studying interrupted active playback;
closing the panel with X or Escape leaves it paused. Chapter navigation stops
audio so an earlier chapter cannot start speaking later.

Study questions now go to a local Codex draft, not the Together API. All reader
entry points (selection, paragraph, question box and B shortcut) prepare a draft.
Edit the question, or choose a suggested question; neither calls a model.
Reopening the same passage/action reuses the draft and preserves edits. Drafts
live with the existing browser notes and are included in Markdown export.
Older answers remain readable in a collapsed history; failed key requests are
not presented as answers. The reader no longer shows the Together logo, key
prompt, model selector or AI brief generation. Legacy provider routes and
non-reader features remain in the codebase.

**Copy for Codex** prepares the quote, question, nearby paragraphs and
saved discussion for manual pasting into a Codex chat. It does not send messages
or read this chat's history. The complete packet is also available in a selectable
field if the embedded browser cannot access the clipboard. It explicitly marks
the excerpt as partial context, not the full book. No service is called by copying.

## Development and verification

- `npm test`: EPUB and timestamp parsing; provider request/response contracts (mocked HTTP, no provider charges).
- `npm run lint`: TypeScript checking.
- `npm run build`: production build.
- `tests/fixtures/read-and-listen.epub`: original test book for browser import, contents and resume checks.

Work is on `local-study`. Commit small, verified changes locally. No hosted deployment is required.
