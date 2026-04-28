import { ClickUpApi } from "../lib/clickup-api.js";
import { loadConfig, saveConfig } from "../lib/storage.js";

const apiKeyEl = document.getElementById("apiKey") as HTMLInputElement;
const teamGroupEl = document.getElementById("teamGroup") as HTMLDivElement;
const teamIdEl = document.getElementById("teamId") as HTMLSelectElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const saveBtn = document.getElementById("save") as HTMLButtonElement;

let detectedTeams: Array<{ id: string; name: string }> = [];

async function init() {
  const cfg = await loadConfig();
  if (cfg.apiKey) {
    apiKeyEl.value = cfg.apiKey;
    // If we already have a token, prefetch teams so the dropdown is populated
    // and the previously-saved team stays selected.
    await fetchTeams(cfg.teamId);
  }
}

apiKeyEl.addEventListener("blur", async () => {
  const key = apiKeyEl.value.trim();
  if (!key) {
    teamGroupEl.classList.remove("show");
    return;
  }
  await fetchTeams();
});

async function fetchTeams(preselectId?: string) {
  const key = apiKeyEl.value.trim();
  if (!key) return;

  setStatus("Detecting workspaces…", "info");
  try {
    const api = new ClickUpApi(key);
    const data = await api.getTeams();
    detectedTeams = data.teams || [];
  } catch (e) {
    setStatus(messageFor(e), "err");
    teamGroupEl.classList.remove("show");
    return;
  }

  if (detectedTeams.length === 0) {
    setStatus("Token has no accessible workspaces.", "err");
    teamGroupEl.classList.remove("show");
    return;
  }

  teamIdEl.innerHTML = detectedTeams
    .map(
      (t) =>
        `<option value="${escapeAttr(t.id)}">${escapeText(t.name)} (${escapeText(t.id)})</option>`
    )
    .join("");

  if (preselectId && detectedTeams.some((t) => t.id === preselectId)) {
    teamIdEl.value = preselectId;
  }

  // Show the group only if the user has more than one workspace.
  // With a single workspace we just store it silently on save.
  if (detectedTeams.length > 1) {
    teamGroupEl.classList.add("show");
    setStatus(`Found ${detectedTeams.length} workspaces — pick one.`, "info");
  } else {
    teamGroupEl.classList.remove("show");
    setStatus(`Workspace detected: ${detectedTeams[0].name}.`, "ok");
  }
}

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) {
    setStatus("API token is required.", "err");
    return;
  }

  if (detectedTeams.length === 0) {
    await fetchTeams();
    if (detectedTeams.length === 0) return;
  }

  const teamId =
    detectedTeams.length === 1 ? detectedTeams[0].id : teamIdEl.value;

  if (!teamId) {
    setStatus("Pick a workspace.", "err");
    return;
  }

  await saveConfig({ apiKey, teamId });
  const teamName =
    detectedTeams.find((t) => t.id === teamId)?.name || teamId;
  setStatus(`Saved. Using workspace: ${teamName}.`, "ok");
});

function setStatus(text: string, kind: "ok" | "err" | "info" | "" = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

function messageFor(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

init();
