// Builds the daily-update output in two flavors:
// - text/html: rich format with bold headers, bullets, anchor links, styled status badge.
// - text/plain: markdown fallback so the same content lands cleanly in any plain-text editor.
//
// The shape mirrors src/index.ts:600-604 so the extension and the MCP server
// produce equivalent output.

export interface DoneRow {
  taskId: string;
  taskName: string;
  taskUrl: string;
  status: string; // raw status, e.g. "delivered"
  workedMs: number;
}

export interface DailyUpdate {
  doneToday: DoneRow[];
  plannedTomorrow: string[];
  aiUsage: string;
  blockers: string;
}

const BADGE_STYLE =
  "display:inline-block;background:#bf1e75;color:#fff;font-size:9px;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:3px;margin-left:6px;vertical-align:middle;";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

// HTML output is built so the bullet contains a *bare* anchor whose visible text
// is the task URL itself. ClickUp Chat detects the URL and re-renders it as a
// task card with the pink status badge — that's the look from the screenshot.
// We do NOT use the task name as anchor text, because ClickUp Chat keeps the
// anchor text and skips the auto-render in that case.
export function buildHtml(update: DailyUpdate): string {
  const doneItems = update.doneToday.length
    ? update.doneToday
        .map((r) => {
          const time = formatMsLocal(r.workedMs);
          const url = escapeHtml(r.taskUrl);
          const status = (r.status || "").toUpperCase() || "DONE";
          // Anchor text === href so ClickUp parses it back to a raw URL.
          return `<li><a href="${url}">${url}</a> ${escapeHtml(status)} — ${escapeHtml(time)}</li>`;
        })
        .join("")
    : "";

  const plannedItems = update.plannedTomorrow.length
    ? update.plannedTomorrow.map((s) => `<li>${escapeHtml(s)}</li>`).join("")
    : "";

  return [
    `<p><b>1. Done Today</b></p>`,
    doneItems ? `<ul>${doneItems}</ul>` : "",
    `<p><b>2. Planned for Tomorrow</b></p>`,
    plannedItems ? `<ul>${plannedItems}</ul>` : "",
    `<p><b>3. AI Usage</b></p>`,
    `<p>${escapeHtml(update.aiUsage || "")}</p>`,
    `<p><b>4. Challenges / Blockers</b></p>`,
    `<p>${escapeHtml(update.blockers || "None at the moment.")}</p>`,
  ].join("");
}

export function buildMarkdown(update: DailyUpdate): string {
  const doneLines = update.doneToday
    .map((r) => {
      const status = (r.status || "").toUpperCase() || "DONE";
      return `• ${r.taskUrl} ${status} — ${formatMsLocal(r.workedMs)}`;
    })
    .join("\n");

  const plannedLines = update.plannedTomorrow.map((s) => `• ${s}`).join("\n");

  return [
    `**1. Done Today**`,
    doneLines || "—",
    ``,
    `**2. Planned for Tomorrow**`,
    plannedLines || "—",
    ``,
    `**3. AI Usage**`,
    update.aiUsage || "—",
    ``,
    `**4. Challenges / Blockers**`,
    update.blockers || "None at the moment.",
  ].join("\n");
}

export async function copyDailyUpdate(update: DailyUpdate): Promise<void> {
  const html = buildHtml(update);
  const text = buildMarkdown(update);

  const item = new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([text], { type: "text/plain" }),
  });
  await navigator.clipboard.write([item]);
}
