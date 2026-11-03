import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

// App, plugin and HTTP servers must agree even when their TMPDIR values differ.
export const STATE_FILE = path.join(homedir(), ".ui5-modernization-dashboard", "state.json");

export async function readState(stateFile = STATE_FILE): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await fs.readFile(stateFile, "utf-8")); }
  catch { return null; }
}

export async function saveState(state: Record<string, unknown>, stateFile = STATE_FILE) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(state, null, 2), { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, stateFile);
  } finally { await fs.rm(temporary, { force: true }); }
}
