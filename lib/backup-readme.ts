/** The backup repository's README, written with every backup so it always describes the files beside it. */
export const BACKUP_README = `# Private Gloss backup

This repository contains personal reading data and complete book texts. **Keep it private.**

- \`backup.json\`: the index. Notes, highlights, discussions, chapter recaps, bookmarks, reading positions and safe preferences, and a SHA-256 checksum for every book file.
- \`books/\`: each book once. \`<id>.json\` is the parsed text; \`<id>.epub\` or \`<id>.pdf\` is the original file. A book's files change only when the book itself does.
- \`audio/\`: cached narration with word timing. No provider credentials.
- Earlier snapshots remain in Git history. Until 2026-10-28, \`backup.json\` held the whole library in one file.

## How it backs up

While Gloss is open and visible, one tab backs up every five minutes, from what the browser has saved (the same in every tab). New notes, highlights and settings are committed right away; a reading position alone at most once an hour. **Back up now** on the Backups page commits everything at once. Before each push the app checks that this repository is private, and afterwards that GitHub has the commit. Nothing is backed up while the app is closed.

## Restore

1. Run the personal Gloss app locally (\`Ilmak17/gloss\`), with this repository cloned into the app's \`.data/github-backup\` and \`GLOSS_BACKUP_REPOSITORY=Ilmak17/gloss-backup\` in \`.env.local\`.
2. Open \`http://127.0.0.1:3100/backups\` and click **Restore from GitHub backup**. Review the summary, then click **Restore library**. The app downloads a safety copy first. It adds missing books and notes, keeps existing text and edited notes, and uses the newer reading position. On an empty library it also restores preferences.
3. A single-file copy (a downloaded library, or a \`backup.json\` from before the split) is restored with **Choose backup to restore**.
4. Copy the JSON files in \`audio/\` into the app's \`.data/audio/\` (or its \`GLOSS_AUDIO_CACHE_DIR\`). Cached audio IDs depend on the provider key, so a different key may regenerate narration. Keys are not in this backup; reconnect them separately.

## Continue backing up on a new Mac

Authenticate GitHub with \`gh auth login\`, clone this repository into \`.data/github-backup\` on its \`main\` branch with the HTTPS origin, set \`GLOSS_BACKUP_REPOSITORY\` as above, and configure the Git author. Restore, then click **Back up now** once; automatic backups start after that first upload.
`;
