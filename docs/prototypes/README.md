# Study room prototype

`study-room-v1.html` is a standalone, disposable interaction prototype for the
reader. It is not connected to the application, an AI provider, or ElevenLabs.
The article is original demonstration text; narration is a silent timer and AI
answers are explicitly labelled canned examples.

Open the HTML file in a browser, or serve this directory locally:

```sh
python3 -m http.server 56324 --bind 127.0.0.1 --directory docs/prototypes
```

Then open `http://127.0.0.1:56324/study-room-v1.html`.

## Main flow

1. Start the silent playback demo and observe word highlighting.
2. Choose “Разобрать эту мысль” to pause and open the contextual explanation.
3. Choose “Другой пример” or enter a question to explore the demonstration.
4. Choose “Продолжить чтение” to resume from the preserved position, if playback
   was running before the explanation opened.

The copy-context action prepares text for a manual Codex handoff; it sends no
message. Notes use an isolated `gloss:prototype:notes` localStorage key. The
prototype also includes reading modes, focus, chapter navigation and an optional
recall prompt. It does not persist reading position between page reloads.

## Verification

Inline JavaScript syntax was checked with Node. Desktop browser checks covered
the reading and explanation layouts, pause at 0:09, resume at 0:09, and the
alternative-example interaction. Mobile layout and real provider integration
have not been validated in this prototype.
