// Resource Utilization tab.
//
// For each selected team member, fetches time entries in the chosen date range,
// groups them by ClickUp Folder (falling back to List name when an entry has no
// folder), and computes utilization as tracked_hours / capacity_hours where
// capacity is 8h per weekday in the range. The output table mirrors the format
// the user pastes into Google Sheets:
//
//   Name of the Resource | Project Name | Utilization | Total Current Utilization | Forecast (1-2 weeks) | Remarks/Comments
//
// "Copy for Sheets" emits TSV so cells land in the right columns; per
// spreadsheet convention the resource name and total cells are blank on
// continuation rows so they read as a merged group.

import {
  ClickUpApi,
  TeamMember,
  TimeEntry,
  rangeBoundsLocal,
  todayLocalIso,
} from "../lib/clickup-api.js";
import { loadConfig } from "../lib/storage.js";

interface FolderRow {
  projectName: string;
  trackedMs: number;
  utilizationPct: number;
}

interface ResourceRow {
  member: TeamMember;
  folders: FolderRow[];
  totalUtilizationPct: number;
}

const startEl = () =>
  document.getElementById("util-start") as HTMLInputElement;
const endEl = () => document.getElementById("util-end") as HTMLInputElement;
const membersEl = () => document.getElementById("util-members") as HTMLDivElement;
const tbodyEl = () => document.getElementById("util-tbody") as HTMLTableSectionElement;
const statusEl = () => document.getElementById("util-status") as HTMLSpanElement;
const loadBtn = () => document.getElementById("util-load") as HTMLButtonElement;
const copyBtn = () => document.getElementById("util-copy") as HTMLButtonElement;

let api: ClickUpApi | null = null;
let teamId = "";
let members: TeamMember[] = [];
let selectedMemberIds = new Set<number>();
let folderNameCache = new Map<string, string>();
let listNameCache = new Map<string, string>();
let lastResults: ResourceRow[] = [];

function setStatus(text: string, kind: "" | "ok" | "error" = "") {
  statusEl().textContent = text;
  statusEl().className = `status ${kind}`;
}

function defaultStartIso(): string {
  // Default to last Monday so the range covers a full work week.
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  // Roll back to last Monday (or 7 days ago if it's Monday).
  const offset = day === 1 ? 7 : (day + 6) % 7;
  d.setDate(d.getDate() - offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function defaultEndIso(): string {
  // Default end = previous Sunday so we report on a closed week.
  const start = new Date(defaultStartIso());
  start.setDate(start.getDate() + 6);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Capacity = 8h per weekday in [startMs, endMs).
function capacityHours(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  let weekdays = 0;
  const d = new Date(startMs);
  while (d.getTime() < endMs) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) weekdays += 1;
    d.setDate(d.getDate() + 1);
  }
  return weekdays * 8;
}

function msToHours(ms: number): number {
  return ms / 3_600_000;
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return "0%";
  // Round to nearest int — matches the example screenshot (15%, 65%, 20%).
  return `${Math.round(pct)}%`;
}

export async function initResourceUtilization() {
  startEl().value = defaultStartIso();
  endEl().value = defaultEndIso();

  const cfg = await loadConfig();
  if (!cfg.apiKey || !cfg.teamId) {
    setStatus("Open extension options to set your API token.", "error");
    membersEl().innerHTML = `<div class="empty">Not configured</div>`;
    return;
  }
  api = new ClickUpApi(cfg.apiKey);
  teamId = cfg.teamId;

  await loadMembers();

  loadBtn().addEventListener("click", () => {
    loadUtilization().catch((e) => setStatus(messageFor(e), "error"));
  });
  copyBtn().addEventListener("click", () => {
    copyAsTsv().catch((e) => setStatus(messageFor(e), "error"));
  });
}

async function loadMembers() {
  if (!api) return;
  try {
    // Only show the current logged-in user, not all team members
    const me = await api.getAuthorizedUser();
    members = [{
      id: me.user.id,
      username: me.user.username,
      email: me.user.email
    }];
    // Auto-select the current user
    selectedMemberIds.add(me.user.id);
  } catch (e) {
    setStatus(messageFor(e), "error");
    membersEl().innerHTML = `<div class="empty">Failed to load user.</div>`;
    return;
  }
  renderMembers();
}

function renderMembers() {
  if (members.length === 0) return;
  const m = members[0]; // Only one user now
  const email = m.email ? `<span class="m-email">${escapeText(m.email)}</span>` : "";
  membersEl().innerHTML = `
    <div class="member-row" style="cursor: default;">
      <span class="m-name">${escapeText(m.username || `User ${m.id}`)}</span>
      ${email}
    </div>
  `;
}

async function loadUtilization() {
  if (!api) return;
  if (selectedMemberIds.size === 0) {
    setStatus("Pick at least one resource.", "error");
    return;
  }
  const start = startEl().value;
  const end = endEl().value;
  if (!start || !end) {
    setStatus("Pick a start and end date.", "error");
    return;
  }
  if (end < start) {
    setStatus("End date is before start date.", "error");
    return;
  }

  const { startMs, endMs } = rangeBoundsLocal(start, end);
  const capH = capacityHours(startMs, endMs);
  if (capH <= 0) {
    setStatus("Date range has no weekdays.", "error");
    return;
  }

  setStatus("Loading…");
  copyBtn().disabled = true;
  tbodyEl().innerHTML = `<tr class="empty"><td colspan="6">Loading…</td></tr>`;

  // Fetch time entries per member in parallel — ClickUp returns both task and
  // task_location for each entry, so one call per person is enough.
  const idList = Array.from(selectedMemberIds);
  const memberById = new Map(members.map((m) => [m.id, m]));

  let entriesPerMember: Array<{ member: TeamMember; entries: TimeEntry[] }>;
  try {
    entriesPerMember = await Promise.all(
      idList.map(async (id) => {
        const m = memberById.get(id);
        if (!m) return { member: { id, username: `User ${id}` }, entries: [] };
        const entries = await api!.getTimeEntries(teamId, startMs, endMs, id);
        return { member: m, entries };
      })
    );
  } catch (e) {
    setStatus(messageFor(e), "error");
    tbodyEl().innerHTML = `<tr class="empty"><td colspan="6">Failed to load.</td></tr>`;
    return;
  }

  // Resolve every distinct folder/list id once, cached across calls.
  const folderIds = new Set<string>();
  const listIds = new Set<string>();
  for (const { entries } of entriesPerMember) {
    for (const e of entries) {
      const f = e.task_location?.folder_id;
      const l = e.task_location?.list_id;
      if (f && !folderNameCache.has(f)) folderIds.add(f);
      if (!f && l && !listNameCache.has(l)) listIds.add(l);
    }
  }
  await Promise.all([
    ...Array.from(folderIds).map(async (id) => {
      try {
        const f = await api!.getFolder(id);
        folderNameCache.set(id, f.name || id);
      } catch {
        folderNameCache.set(id, id);
      }
    }),
    ...Array.from(listIds).map(async (id) => {
      try {
        const l = await api!.getList(id);
        listNameCache.set(id, l.name || id);
      } catch {
        listNameCache.set(id, id);
      }
    }),
  ]);

  lastResults = entriesPerMember
    .map(({ member, entries }) => aggregate(member, entries, capH))
    .sort((a, b) => (a.member.username || "").localeCompare(b.member.username || ""));

  renderTable(lastResults, capH);
  copyBtn().disabled = lastResults.every((r) => r.folders.length === 0);
  setStatus(
    `Loaded ${entriesPerMember.length} resource${entriesPerMember.length === 1 ? "" : "s"} · ${capH}h capacity`,
    "ok"
  );
}

function aggregate(
  member: TeamMember,
  entries: TimeEntry[],
  capacityH: number
): ResourceRow {
  // Group ms by project label (folder name when present, else list name).
  const byProject = new Map<string, number>();
  for (const e of entries) {
    const dur = typeof e.duration === "string" ? Number(e.duration) : e.duration;
    const ms = Number.isFinite(dur) && dur > 0 ? dur : 0;
    if (ms === 0) continue;
    const folderId = e.task_location?.folder_id;
    const listId = e.task_location?.list_id;
    let label: string;
    if (folderId) {
      label = folderNameCache.get(folderId) || folderId;
    } else if (listId) {
      label = listNameCache.get(listId) || listId;
    } else {
      label = "(unknown)";
    }
    byProject.set(label, (byProject.get(label) || 0) + ms);
  }

  const folders: FolderRow[] = Array.from(byProject.entries())
    .map(([projectName, trackedMs]) => ({
      projectName,
      trackedMs,
      utilizationPct: (msToHours(trackedMs) / capacityH) * 100,
    }))
    .sort((a, b) => b.trackedMs - a.trackedMs);

  const totalUtilizationPct = folders.reduce(
    (acc, f) => acc + f.utilizationPct,
    0
  );

  return { member, folders, totalUtilizationPct };
}

function renderTable(rows: ResourceRow[], _capacityH: number) {
  if (rows.length === 0) {
    tbodyEl().innerHTML = `<tr class="empty"><td colspan="6">No data.</td></tr>`;
    return;
  }
  const html: string[] = [];
  for (const r of rows) {
    if (r.folders.length === 0) {
      html.push(`
        <tr class="resource-row">
          <td>${escapeText(r.member.username || "")}</td>
          <td colspan="5" class="empty">No time logged in this range.</td>
        </tr>
      `);
      continue;
    }
    r.folders.forEach((f, i) => {
      const isFirst = i === 0;
      const total = isFirst ? formatPct(r.totalUtilizationPct) : "";
      const name = isFirst ? escapeText(r.member.username || "") : "";
      const forecast = formatPct(f.utilizationPct);
      html.push(`
        <tr class="${isFirst ? "resource-row" : ""}">
          <td>${name}</td>
          <td>${escapeText(f.projectName)}</td>
          <td class="num">${formatPct(f.utilizationPct)}</td>
          <td class="num">${total}</td>
          <td class="num">${forecast}</td>
          <td></td>
        </tr>
      `);
    });
  }
  tbodyEl().innerHTML = html.join("");
}

// Tab-separated values pastes into Google Sheets as one cell per tab.
// Continuation rows leave the resource name and total cells blank so the
// visual layout matches the merged-cell example.
function buildTsv(rows: ResourceRow[]): string {
  const header = [
    "Name of the Resource",
    "Project Name",
    "Utilization",
    "Total Current Utilization",
    "Forecast (1-2 weeks)",
    "Remarks/Comments",
  ].join("\t");

  const lines: string[] = [header];
  for (const r of rows) {
    if (r.folders.length === 0) {
      lines.push(
        [r.member.username || "", "", "", formatPct(r.totalUtilizationPct), "", ""].join("\t")
      );
      continue;
    }
    r.folders.forEach((f, i) => {
      const isFirst = i === 0;
      lines.push(
        [
          isFirst ? r.member.username || "" : "",
          f.projectName,
          formatPct(f.utilizationPct),
          isFirst ? formatPct(r.totalUtilizationPct) : "",
          formatPct(f.utilizationPct),
          "",
        ].join("\t")
      );
    });
  }
  return lines.join("\n");
}

async function copyAsTsv() {
  if (lastResults.length === 0) {
    setStatus("Nothing to copy. Load first.", "error");
    return;
  }
  const tsv = buildTsv(lastResults);
  await navigator.clipboard.writeText(tsv);
  setStatus("Copied as TSV — paste into Google Sheets.", "ok");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function messageFor(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Suppress unused import warning in editors that don't strip type-only imports.
void todayLocalIso;
