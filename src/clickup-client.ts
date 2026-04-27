export interface ClickUpTask {
  id: string;
  name: string;
  status: {
    status: string;
    color: string;
  };
  assignees: Array<{
    id: number;
    username: string;
    email: string;
  }>;
  due_date: string | null;
  time_estimate: number | null;
  time_spent: number | null;
  list: {
    id: string;
    name: string;
  };
  space: {
    id: string;
    name: string;
  };
  url: string;
}

export interface CreateTaskParams {
  name: string;
  description?: string;
  assignees?: number[];
  status?: string;
  priority?: number;
  due_date?: number;
  time_estimate?: number;
}

export interface TaskUpdate {
  taskName: string;
  status: string;
  timeSpent: string;
  assignees: string[];
  dueDate?: string;
  url: string;
}

export class ClickUpClient {
  private apiKey: string;
  private baseUrl = 'https://api.clickup.com/api/v2';
  private v3BaseUrl = 'https://api.clickup.com/api/v3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ClickUp API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  private async fetchV3(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.v3BaseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ClickUp Chat API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getChatChannels(workspaceId: string) {
    const all: any[] = [];
    let cursor: string | undefined;
    do {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=100` : `?limit=100`;
      const data = await this.fetchV3(`/workspaces/${workspaceId}/chat/channels${qs}`);
      const items = data.data || data.channels || [];
      all.push(...items);
      cursor = data.next_cursor || undefined;
    } while (cursor);
    return all;
  }

  async getChatChannelByName(workspaceId: string, channelName: string) {
    const channels = await this.getChatChannels(workspaceId);
    const target = channelName.toLowerCase().replace(/^#/, '').trim();
    const channel = channels.find((c: any) =>
      (c.name || '').toLowerCase().replace(/^#/, '').trim() === target
    );
    if (!channel) {
      const available = channels.map((c: any) => c.name).filter(Boolean).join(', ');
      throw new Error(`Chat channel "${channelName}" not found. Available: ${available || '(none accessible)'}`);
    }
    return channel;
  }

  async postChatMessage(workspaceId: string, channelId: string, content: string, contentFormat: 'text/md' | 'text/plain' = 'text/md') {
    return this.fetchV3(`/workspaces/${workspaceId}/chat/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ type: 'message', content, content_format: contentFormat }),
    });
  }

  async getSpaces(teamId: string) {
    return this.fetch(`/team/${teamId}/space`);
  }

  async getSpaceByName(teamId: string, spaceName: string) {
    const data = await this.fetch(`/team/${teamId}/space`);
    const space = data.spaces?.find((s: any) =>
      s.name.toLowerCase() === spaceName.toLowerCase()
    );
    if (!space) {
      throw new Error(`Space "${spaceName}" not found`);
    }
    return space;
  }

  async getLists(spaceId: string) {
    const data = await this.fetch(`/space/${spaceId}/list`);
    return data.lists || [];
  }

  async getFolders(spaceId: string) {
    const data = await this.fetch(`/space/${spaceId}/folder`);
    return data.folders || [];
  }

  async getFolderLists(folderId: string) {
    const data = await this.fetch(`/folder/${folderId}/list`);
    return data.lists || [];
  }

  async getAllListsInSpace(spaceId: string): Promise<Array<any>> {
    const folderless = await this.getLists(spaceId);
    const folders = await this.getFolders(spaceId);
    const folderLists: any[] = [];
    for (const folder of folders) {
      const lists = folder.lists && folder.lists.length > 0
        ? folder.lists
        : await this.getFolderLists(folder.id);
      for (const list of lists) {
        folderLists.push({ ...list, folderName: folder.name, folderId: folder.id });
      }
    }
    return [...folderless.map((l: any) => ({ ...l, folderName: null, folderId: null })), ...folderLists];
  }

  async getListByName(spaceId: string, listName: string) {
    const lists = await this.getAllListsInSpace(spaceId);
    const list = lists.find((l: any) =>
      l.name.toLowerCase() === listName.toLowerCase()
    );
    if (!list) {
      throw new Error(`List "${listName}" not found in space`);
    }
    return list;
  }

  async createTask(listId: string, params: CreateTaskParams): Promise<ClickUpTask> {
    const data = await this.fetch(`/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return data;
  }

  async getTask(taskId: string): Promise<ClickUpTask> {
    return this.fetch(`/task/${taskId}`);
  }

  async updateTask(taskId: string, updates: Partial<CreateTaskParams>) {
    return this.fetch(`/task/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async getTeams() {
    return this.fetch('/team');
  }

  async createTimeEntry(teamId: string, params: {
    tid: string;
    duration: number;
    start?: number;
    description?: string;
    assignee?: number;
    billable?: boolean;
  }) {
    const body: any = {
      tid: params.tid,
      duration: params.duration,
      start: params.start ?? Date.now() - params.duration,
    };
    if (params.description) body.description = params.description;
    if (params.assignee) body.assignee = params.assignee;
    if (params.billable !== undefined) body.billable = params.billable;
    return this.fetch(`/team/${teamId}/time_entries`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getAuthorizedUser() {
    return this.fetch('/user');
  }

  formatTaskUpdate(task: ClickUpTask): string {
    const timeSpent = task.time_spent
      ? `${Math.floor(task.time_spent / 3600000)}h ${Math.floor((task.time_spent % 3600000) / 60000)}m`
      : '0h';

    // Format: [Task Name](url) — Status — Time
    return `[${task.name}](${task.url}) — ${task.status.status} — ${timeSpent}`;
  }
}
