import {
  ClickUpApi,
  TimeEntry,
  dayBoundsLocal,
  todayLocalIso,
  sumDurationMs,
} from "../lib/clickup-api.js";
import { copyDailyUpdate, DoneRow } from "../lib/format.js";
import { loadConfig } from "../lib/storage.js";

// One bucket = one folder (or, for tasks not in a folder, one list directly under
// the space). Keyed by `folder:<id>` or `list:<id>` so they can coexist.
interface Bucket {
  key: string;
  kind: "folder" | "list";
  refId: string;
  name: string;
  entries: TimeEntry[];
}

interface TaskAggregate {
  taskId: string;
  taskName: string;
  taskUrl: string;
  status: string;
  workedMs: number;
  selected: boolean;
}

const dateEl = document.getElementById("date") as HTMLInputElement;
const spaceEl = document.getElementById("space") as HTMLSelectElement;
const doneListEl = document.getElementById("done-list") as HTMLUListElement;
const plannedEl = document.getElementById("planned") as HTMLTextAreaElement;
const aiUsageEl = document.getElementById("ai-usage") as HTMLTextAreaElement;
const blockersEl = document.getElementById("blockers") as HTMLTextAreaElement;
const copyBtn = document.getElementById("copy") as HTMLButtonElement;
const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;

let api: ClickUpApi | null = null;
let teamId = "";
let userId = 0;
let buckets: Bucket[] = [];
let aggregatesByBucket: Map<string, TaskAggregate[]> = new Map();

function setStatus(text: string, kind: "" | "ok" | "error" = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

async function init() {
  dateEl.value = todayLocalIso();

  const cfg = await loadConfig();
  if (!cfg.apiKey || !cfg.teamId) {
    setStatus("Open extension options to set your API token.", "error");
    spaceEl.innerHTML = `<option value="">Not configured</option>`;
    copyBtn.disabled = true;
    return;
  }

  api = new ClickUpApi(cfg.apiKey);
  teamId = cfg.teamId;

  try {
    const me = await api.getAuthorizedUser();
    userId = me.user.id;
  } catch (e) {
    setStatus(messageFor(e), "error");
    return;
  }

  await loadForSelectedDate();
}

async function loadForSelectedDate() {
  if (!api) return;
  setStatus("Loading time entries…");
  spaceEl.disabled = true;
  spaceEl.innerHTML = `<option value="">Loading…</option>`;
  doneListEl.innerHTML = `<li class="empty">Loading…</li>`;

  const { startMs, endMs } = dayBoundsLocal(dateEl.value);

  let entries: TimeEntry[];
  try {
    entries = await api.getTimeEntries(teamId, startMs, endMs, userId);
  } catch (e) {
    setStatus(messageFor(e), "error");
    return;
  }

  buckets = groupByFolderOrList(entries);

  if (buckets.length === 0) {
    spaceEl.innerHTML = `<option value="">No time logged this day</option>`;
    spaceEl.disabled = true;
    doneListEl.innerHTML = `<li class="empty">No time logged on this date.</li>`;
    setStatus("");
    return;
  }

  await resolveBucketNames(buckets);

  // Sort by name for predictable ordering.
  buckets.sort((a, b) => a.name.localeCompare(b.name));

  spaceEl.innerHTML = buckets
    .map((b) => {
      const total = sumDurationMs(b.entries);
      const taskCount = uniqueTaskCount(b.entries);
      const label = `${b.name} (${taskCount} task${taskCount === 1 ? "" : "s"} · ${formatMsLocal(total)})`;
      return `<option value="${escapeAttr(b.key)}">${escapeText(label)}</option>`;
    })
    .join("");
  spaceEl.disabled = false;

  // Pre-aggregate per bucket so switching is instant.
  aggregatesByBucket = new Map();
  for (const b of buckets) {
    aggregatesByBucket.set(b.key, aggregateTasks(b.entries));
  }

  spaceEl.value = buckets[0].key;
  renderTaskRows();
  setStatus("");
}

// Group entries by folder when one exists; otherwise fall back to the list itself
// so folderless entries still get their own bucket.
function groupByFolderOrList(entries: TimeEntry[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const e of entries) {
    const folderId = e.task_location?.folder_id;
    const listId = e.task_location?.list_id;

    let key: string;
    let kind: "folder" | "list";
    let refId: string;

    if (folderId) {
      key = `folder:${folderId}`;
      kind = "folder";
      refId = folderId;
    } else if (listId) {
      key = `list:${listId}`;
      kind = "list";
      refId = listId;
    } else {
      key = "unknown";
      kind = "folder";
      refId = "";
    }

    if (!map.has(key)) {
      map.set(key, { key, kind, refId, name: "", entries: [] });
    }
    map.get(key)!.entries.push(e);
  }
  return Array.from(map.values());
}

async function resolveBucketNames(list: Bucket[]) {
  if (!api) return;
  await Promise.all(
    list.map(async (b) => {
      if (!b.refId) {
        b.name = "Unknown";
        return;
      }
      try {
        const ref =
          b.kind === "folder"
            ? await api!.getFolder(b.refId)
            : await api!.getList(b.refId);
        b.name = ref.name || b.refId;
      } catch {
        b.name = b.refId;
      }
    })
  );
}

function uniqueTaskCount(entries: TimeEntry[]): number {
  return new Set(entries.map((e) => e.task?.id).filter(Boolean)).size;
}

function aggregateTasks(entries: TimeEntry[]): TaskAggregate[] {
  const map = new Map<string, TaskAggregate>();
  for (const e of entries) {
    const t = e.task;
    if (!t?.id) continue;
    const dur = typeof e.duration === "string" ? Number(e.duration) : e.duration;
    const ms = Number.isFinite(dur) && dur > 0 ? dur : 0;
    const existing = map.get(t.id);
    if (existing) {
      existing.workedMs += ms;
    } else {
      map.set(t.id, {
        taskId: t.id,
        taskName: t.name || "(unnamed task)",
        taskUrl: t.url || `https://app.clickup.com/t/${t.id}`,
        status: t.status?.status || "",
        workedMs: ms,
        selected: true,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.workedMs - a.workedMs);
}

function renderTaskRows() {
  const list = aggregatesByBucket.get(spaceEl.value) || [];
  if (list.length === 0) {
    doneListEl.innerHTML = `<li class="empty">No tasks for this space.</li>`;
    return;
  }
  doneListEl.innerHTML = list
    .map((row, i) => {
      const status = (row.status || "").toUpperCase();
      const badge = status ? `<span class="badge">${escapeText(status)}</span>` : "";
      return `
        <li class="task-row">
          <input type="checkbox" data-i="${i}" ${row.selected ? "checked" : ""} />
          <div class="task-text">
            <a href="${escapeAttr(row.taskUrl)}" target="_blank" rel="noopener">${escapeText(row.taskName)}</a>
            ${badge}
            <span class="time">— Worked ${escapeText(formatMsLocal(row.workedMs))}</span>
          </div>
        </li>
      `;
    })
    .join("");

  doneListEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = Number(cb.dataset.i);
      const cur = aggregatesByBucket.get(spaceEl.value);
      if (cur && cur[i]) cur[i].selected = cb.checked;
    });
  });
}

async function onCopy() {
  const list = aggregatesByBucket.get(spaceEl.value) || [];
  const selected = list.filter((r) => r.selected);

  const doneToday: DoneRow[] = selected.map((r) => ({
    taskId: r.taskId,
    taskName: r.taskName,
    taskUrl: r.taskUrl,
    status: r.status,
    workedMs: r.workedMs,
  }));

  const planned = plannedEl.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    await copyDailyUpdate({
      doneToday,
      plannedTomorrow: planned,
      aiUsage: aiUsageEl.value.trim(),
      blockers: blockersEl.value.trim() || "None at the moment.",
    });
    setStatus("Copied to clipboard.", "ok");
  } catch (e) {
    setStatus(messageFor(e), "error");
  }
}

function formatMsLocal(ms: number): string {
  if (!ms || ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
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

dateEl.addEventListener("change", () => {
  loadForSelectedDate();
});
spaceEl.addEventListener("change", renderTaskRows);
refreshBtn.addEventListener("click", loadForSelectedDate);
copyBtn.addEventListener("click", onCopy);

init();
