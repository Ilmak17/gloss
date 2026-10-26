import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rename, readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { parseBackup } from "./backup-format";

const exec = promisify(execFile);
const root = () => join(process.cwd(), ".data", "github-backup");
const statusPath = () => join(process.cwd(), ".data", "backup-status.json");
export const backupRepository = () => process.env.GLOSS_BACKUP_REPOSITORY || "";
const run = async (command: string, args: string[], cwd = root()) => (await exec(command, args, { cwd, timeout: 60000, maxBuffer: 1024 * 1024 })).stdout.trim();
export function localBackupRequest(request: Request, mutation = false): boolean {
  if (process.env.VERCEL || !/^[\w.-]+\/[\w.-]+$/.test(backupRepository())) return false;
  const host = request.headers.get("host");
  if (!["127.0.0.1:3100", "localhost:3100"].includes(host ?? "")) return false;
  if (request.headers.has("x-forwarded-host") && request.headers.get("x-forwarded-host") !== host) return false;
  if (mutation && (request.headers.get("origin") !== `http://${host}` || request.headers.get("content-type") !== "application/json")) return false;
  return true;
}
export async function backupStatus() {
  const status = JSON.parse(await readFile(statusPath(), "utf8").catch(() => "{}"));
  return { enabled: !!backupRepository(), repository: backupRepository(), ...status };
}
let busy = false;
export async function saveGitBackup(input: unknown) {
  if (busy) throw new Error("Another backup is running. Retry shortly.");
  busy = true;
  try {
    const backup = await parseBackup(input);
    if (!backup.data.docs.length) throw new Error("Empty libraries are not uploaded automatically.");
    const repo = backupRepository();
    // Verify privacy every time. Refuse to publish personal texts after a visibility change.
    const info = JSON.parse(await run("gh", ["repo", "view", repo, "--json", "isPrivate,nameWithOwner"], process.cwd()));
    if (!info.isPrivate || info.nameWithOwner.toLowerCase() !== repo.toLowerCase()) throw new Error("The backup repository must be private.");
    const remote = await run("git", ["remote", "get-url", "origin"]);
    if (remote !== `https://github.com/${repo}.git`) throw new Error("The backup checkout points to a different repository.");
    const branch = await run("git", ["branch", "--show-current"]);
    if (branch !== "main") throw new Error("The backup checkout must be on main.");
    const prior = await readFile(join(root(), "backup.json"), "utf8").catch(() => "");
    if (prior) {
      const previous = await parseBackup(JSON.parse(prior));
      // Avoid stale/empty browser profiles accidentally discarding the saved library.
      const incoming = new Set(backup.data.state.library.map(x => x.id));
      if (previous.data.state.library.some(x => !incoming.has(x.id))) throw new Error("This browser is missing backed-up books. Restore the backup before replacing it.");
    }
    const tmp = join(root(), "backup.json.tmp");
    await writeFile(tmp, JSON.stringify(backup, null, 2) + "\n", { mode: 0o600 });
    await rename(tmp, join(root(), "backup.json"));
    const audioDir = process.env.GLOSS_AUDIO_CACHE_DIR || join(process.cwd(), ".data", "audio");
    await mkdir(join(root(), "audio"), { recursive: true });
    const files = await readdir(/* turbopackIgnore: true */ audioDir).catch(() => []);
    let audio = 0;
    for (const name of files) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const source = join(/* turbopackIgnore: true */ audioDir, name);
      if (!(await lstat(/* turbopackIgnore: true */ source)).isFile()) continue;
      const clip = JSON.parse(await readFile(/* turbopackIgnore: true */ source, "utf8"));
      if (typeof clip.audio !== "string" || !Array.isArray(clip.words) || clip.mimeType !== "audio/mpeg") throw new Error("An audio cache file is invalid.");
      // The cache holds only audio and alignment, never provider credentials.
      await writeFile(join(root(), "audio", name), JSON.stringify({ audio: clip.audio, words: clip.words, mimeType: clip.mimeType }));
      audio++;
    }
    await run("git", ["add", "--", "backup.json", "audio"]);
    if (await run("git", ["diff", "--cached", "--name-only"])) {
      await run("git", ["commit", "-m", `Back up library (${backup.data.state.library.length} texts)`]);
    }
    await run("git", ["push", "origin", "main"]);
    const commit = await run("git", ["rev-parse", "HEAD"]);
    const remoteHead = await run("git", ["ls-remote", "origin", "refs/heads/main"]);
    if (!remoteHead.startsWith(commit + "\t")) throw new Error("The uploaded commit could not be verified.");
    const result = { at: new Date().toISOString(), commit, repository: repo, audio, texts: backup.data.state.library.length, error: null };
    await writeFile(statusPath(), JSON.stringify(result));
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backup failed.";
    const status = await backupStatus().catch(() => ({}));
    // Do not expose subprocess output, tokens or URLs from authentication errors.
    const safe = /Command failed|ENOENT|EACCES/.test(message) ? "GitHub backup failed. Check local GitHub access and the backup checkout." : message;
    await writeFile(statusPath(), JSON.stringify({ ...status, error: safe })).catch(() => {});
    throw new Error(safe);
  } finally { busy = false; }
}
