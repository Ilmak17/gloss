import { backupStatus, loadGitBackup, localBackupRequest, saveGitBackup } from "@/lib/backup-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!localBackupRequest(request)) return Response.json({ enabled: false }, { status: 404 });
  return Response.json(await backupStatus(), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!localBackupRequest(request, true)) return Response.json({ error: "Local backups are not enabled for this request." }, { status: 403 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing backup.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 60 * 1024 * 1024) { await reader.cancel(); throw new Error("This backup exceeds the 60 MB limit. Download a local copy instead."); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body?.restore === true) return Response.json(await loadGitBackup());
    // A tab still running an older Gloss sends its own copy from memory, which may be out of date.
    if (!body || typeof body !== "object" || !("snapshot" in body)) return Response.json({ error: "This Gloss tab is out of date. Reload it to keep backing up." }, { status: 409 });
    return Response.json(await saveGitBackup(body.snapshot, { now: body.now === true }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Backup failed." }, { status: 400 });
  }
}
