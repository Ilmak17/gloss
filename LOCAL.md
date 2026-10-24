# Personal reading workspace

Run `./scripts/local.sh` from this repository, then open **http://127.0.0.1:3100**.
The launcher uses Node 22+ from PATH, or the existing Codex runtime when the system Node is too old. It only listens on this computer. Stop with Ctrl+C. After a restart, run it again.

For a fresh checkout, install Node 22+, run `npm ci`, then `npm run dev:local`.
No Clerk account or database is needed for local reading. Keep `.env.local` out of Git.

## Books

Choose **Open a book or PDF** on the home page, or **Add books & articles → Books & files** in the library. EPUB, PDF, Markdown and plain text are supported. The reader's **Contents** button moves between EPUB spine sections. Reading position is restored when the document opens again.

EPUB import runs in the browser. It preserves reading order, prose, headings, emphasis, supported tables and packaged PNG/JPEG/GIF/WebP images. This is a reading view, not a reproduction of the publisher's page layout. DRM-encrypted chapters are unsupported; SVG, embedded media and book CSS are not rendered. Internal footnote navigation and nested publisher navigation are not implemented yet.

The maximum archive size is 64 MB, with 16 MB per expanded file and 128 MB total. Books, annotations and progress live in this browser's IndexedDB/local storage. Keep original book files: clearing browser data removes this local library. Use the same browser and **127.0.0.1:3100** address each time; `localhost` has separate storage. A filesystem-backed library and full backup/export are future work.

## Listen while reading

Open a text, choose **Voice settings**, then select **ElevenLabs**. Paste your ElevenLabs API key and optionally a voice ID from your ElevenLabs voice library. Alternatively configure the local server in `.env.local`:

```dotenv
ELEVENLABS_API_KEY=your-key
ELEVENLABS_VOICE_ID=your-voice-id
```

For a new free ElevenLabs account, library voices can be blocked by the API even when they work on the website. Create a personal voice with Voice Design and use its voice ID, or choose an eligible paid plan. The local setup uses a personal voice named **Gloss Reader**; its ID and key are in the ignored `.env.local`.

Restart the local server after changing environment settings. A key entered in Voice settings overrides the server key and remains in this browser's local storage. The server sends it only to ElevenLabs. The Together provider continues using its separate key from AI settings.

Use **Читать вслух** in the bottom player to begin at the current paragraph. The player offers pause, resume, stop, speed, repeat, seek within the current audio passage, and a button to return to the spoken paragraph. Its time display is for that passage, not the whole book. **Следовать за голосом** controls automatic paragraph tracking. ElevenLabs word timestamps drive word highlighting in browsers with the CSS Custom Highlight API; otherwise paragraph tracking remains available. Mismatched/missing timestamps fall back to paragraph tracking.

Audio is generated in short passages, with up to two passages prefetched. It uses your provider credits, needs internet access and is not stored across listening sessions. Pausing retains the current clip; stopping/restarting can generate it again. Preparing study questions is local and needs no AI key.

## Read and discuss

The compact player keeps playback, passage progress and **Разбор** visible.
Open **⋯** for speed, repeat, follow-voice, voice settings and stop. The menu
opens upward and closes on Escape or an outside click.

The desktop reader has contents on the left and a question panel on the right.
Select text and choose **Explain**, or use **Разбор** in the player.
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

**Скопировать для Codex** prepares the quote, question, nearby paragraphs and
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
