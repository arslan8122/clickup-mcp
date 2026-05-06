// Browser-safe subset of the ClickUp client used by the popup.
// Mirrors the shape of src/clickup-client.ts but uses fetch only and includes
// the time-entries endpoint that the existing MCP server doesn't need.

export interface AuthorizedUser {
  user: { id: number; username: string; email: string };
}

export interface TeamMember {
  id: number;
  username: string;
  email?: string;
  initials?: string;
  color?: string;
  profilePicture?: string;
}

export interface SpaceRef {
  id: string;
  name: string;
}

export interface TaskStatus {
  status: string;
  color?: string;
}

export interface TimeEntryTask {
  id: string;
  name: string;
  status?: TaskStatus;
  url?: string;
}

// Shape returned by GET /team/{team_id}/time_entries (v2).
// Only fields we use are typed; everything else is permissive.
export interface TimeEntry {
  id: string;
  task: TimeEntryTask;
  // ClickUp returns duration as a string of milliseconds.
  duration: string | number;
  start: string | number;
  end: string | number;
  user: { id: number; username: string };
  task_location?: {
    space_id?: string;
    list_id?: string;
    folder_id?: string;
  };
}

export interface SpaceWithEntries {
  space: SpaceRef;
  entries: TimeEntry[];
}

export class ClickUpApi {
  private baseUrl = "https://api.clickup.com/api/v2";

  constructor(private apiKey: string) {}

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: this.apiKey,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ClickUp API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async getAuthorizedUser(): Promise<AuthorizedUser> {
    return this.request<AuthorizedUser>("/user");
  }

  async getTeams(): Promise<{
    teams: Array<{
      id: string;
      name: string;
      members?: Array<{ user: TeamMember }>;
    }>;
  }> {
    return this.request("/team");
  }

  // Returns workspace members for the configured team, sorted by username.
  // Uses GET /team (which embeds members) and matches by id, since the
  // dedicated members endpoint isn't available on every plan.
  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const { teams } = await this.getTeams();
    const team = teams.find((t) => t.id === teamId);
    if (!team || !team.members) return [];
    const members = team.members
      .map((m) => m.user)
      .filter((u): u is TeamMember => !!u && typeof u.id === "number");
    members.sort((a, b) =>
      (a.username || "").localeCompare(b.username || "")
    );
    return members;
  }

  // Time entries for one or more assignees in [startMs, endMs).
  async getTimeEntries(
    teamId: string,
    startMs: number,
    endMs: number,
    assignees: number | number[]
  ): Promise<TimeEntry[]> {
    const ids = Array.isArray(assignees) ? assignees : [assignees];
    const qs = new URLSearchParams({
      start_date: String(startMs),
      end_date: String(endMs),
      assignee: ids.join(","),
    });
    const data = await this.request<{ data: TimeEntry[] }>(
      `/team/${teamId}/time_entries?${qs.toString()}`
    );
    return data.data || [];
  }

  // Single task lookup, used as fallback when a time entry lacks status/url.
  async getTask(taskId: string): Promise<{
    id: string;
    name: string;
    status: TaskStatus;
    url: string;
    space?: SpaceRef;
  }> {
    return this.request(`/task/${taskId}`);
  }

  // Space lookup, used to resolve space names from time-entry task_location.space_id
  // when the entry doesn't include the name inline.
  async getSpace(spaceId: string): Promise<SpaceRef> {
    return this.request<SpaceRef>(`/space/${spaceId}`);
  }

  async getFolder(folderId: string): Promise<{ id: string; name: string }> {
    return this.request<{ id: string; name: string }>(`/folder/${folderId}`);
  }

  async getList(listId: string): Promise<{ id: string; name: string }> {
    return this.request<{ id: string; name: string }>(`/list/${listId}`);
  }
}

// Sum durations from a list of entries; ClickUp returns string ms.
export function sumDurationMs(entries: TimeEntry[]): number {
  let total = 0;
  for (const e of entries) {
    const n = typeof e.duration === "string" ? Number(e.duration) : e.duration;
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

// Mirrors the formatter in src/index.ts:573-581.
export function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Local-day [start, end) in epoch ms, for a yyyy-mm-dd input value.
export function dayBoundsLocal(yyyymmdd: string): { startMs: number; endMs: number } {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  const end = new Date(y, (m || 1) - 1, (d || 1) + 1, 0, 0, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

// Local [startDate, endDate] inclusive, in epoch ms. End date rolls to next-day 00:00.
export function rangeBoundsLocal(
  startYmd: string,
  endYmd: string
): { startMs: number; endMs: number } {
  const { startMs } = dayBoundsLocal(startYmd);
  const { endMs } = dayBoundsLocal(endYmd);
  return { startMs, endMs };
}

// Number of whole days in [startMs, endMs).
export function daysInRange(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / 86_400_000);
}

export function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
