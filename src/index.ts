#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ClickUpClient } from './clickup-client.js';
import { loadConfig } from './config.js';

// Tool input schemas
const LogTaskSchema = z.object({
  taskName: z.string().describe('The name of the task to log'),
  spaceName: z.string().describe('The ClickUp space name where the task will be created'),
  listName: z.string().optional().describe('The list name within the space (uses first list if not specified)'),
  description: z.string().optional().describe('Task description'),
  priority: z.number().min(1).max(4).optional().describe('Priority: 1=Urgent, 2=High, 3=Normal, 4=Low'),
  dueDate: z.string().optional().describe('Due date in ISO format or timestamp'),
  timeEstimate: z.number().optional().describe('Time estimate in milliseconds'),
});

const GetTaskUpdateSchema = z.object({
  taskId: z.string().describe('The ClickUp task ID to get updates for'),
});

const UpdateTaskStatusSchema = z.object({
  taskId: z.string().describe('The ClickUp task ID'),
  status: z.string().describe('New status name'),
});

const FindTaskSchema = z.object({
  taskName: z.string().describe('Name of the task to search for'),
  spaceName: z.string().optional().describe('Space name to search in'),
});

const ListSpacesSchema = z.object({});

const ListListsSchema = z.object({
  spaceName: z.string().describe('The ClickUp space name to list lists from'),
});

const ListFoldersSchema = z.object({
  spaceName: z.string().describe('The ClickUp space name to list folders from'),
});

const ListChatChannelsSchema = z.object({});

const SendTaskUpdateToChatSchema = z.object({
  taskId: z.string().describe('The ClickUp task ID to post an update for'),
  channelName: z.string().describe('The ClickUp Chat channel name to post the update to'),
  prefix: z.string().optional().describe('Optional text to prepend to the task update line (e.g. "Daily update:")'),
});

const SendChatMessageSchema = z.object({
  channelName: z.string().describe('The ClickUp Chat channel name'),
  message: z.string().describe('The message content (markdown supported)'),
});

const TrackTimeSchema = z.object({
  taskId: z.string().describe('The ClickUp task ID to log time on'),
  duration: z.string().describe('Duration as "2h", "30m", "1h 30m", or milliseconds as number string'),
  description: z.string().optional().describe('Optional time-entry description'),
});

const SendDailyUpdateSchema = z.object({
  channelName: z.string().describe('The ClickUp Chat channel name to post the daily update to'),
  doneToday: z
    .array(
      z.object({
        taskId: z.string().describe('ClickUp task ID'),
        note: z.string().optional().describe('Note shown after the task link (default: "Completed")'),
        time: z.string().optional().describe('Override time string (e.g. "30m", "1h 15m"). If omitted, uses time_spent from the task.'),
      })
    )
    .describe('Tasks completed today. Each renders as: [Task](url) — note — time'),
  plannedTomorrow: z.array(z.string()).optional().describe('Bullet items planned for tomorrow. Omit or empty to render an empty section.'),
  aiUsage: z.string().optional().describe('AI usage summary text. Omit to render empty.'),
  blockers: z.string().optional().describe('Challenges/blockers. Defaults to "None".'),
});

// Tool definitions
const tools: Tool[] = [
  {
    name: 'log_task',
    description: 'Log a new task to ClickUp in the specified space and list, assign it to you, and return the task details',
    inputSchema: {
      type: 'object',
      properties: {
        taskName: { type: 'string', description: 'The name of the task to log' },
        spaceName: { type: 'string', description: 'The ClickUp space name where the task will be created' },
        listName: { type: 'string', description: 'The list name within the space (uses first list if not specified)' },
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'number', description: 'Priority: 1=Urgent, 2=High, 3=Normal, 4=Low', minimum: 1, maximum: 4 },
        dueDate: { type: 'string', description: 'Due date in ISO format or timestamp' },
        timeEstimate: { type: 'number', description: 'Time estimate in milliseconds' },
      },
      required: ['taskName', 'spaceName'],
    },
  },
  {
    name: 'get_task_update',
    description: 'Get the current status and details of a task in the formatted update style',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ClickUp task ID to get updates for' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'update_task_status',
    description: 'Update the status of a task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ClickUp task ID' },
        status: { type: 'string', description: 'New status name' },
      },
      required: ['taskId', 'status'],
    },
  },
  {
    name: 'find_task',
    description: 'Find a task by name in ClickUp',
    inputSchema: {
      type: 'object',
      properties: {
        taskName: { type: 'string', description: 'Name of the task to search for' },
        spaceName: { type: 'string', description: 'Space name to search in' },
      },
      required: ['taskName'],
    },
  },
  {
    name: 'list_spaces',
    description: 'List all spaces in your ClickUp workspace',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_lists',
    description: 'List all lists (including those in folders/sprints) inside a ClickUp space',
    inputSchema: {
      type: 'object',
      properties: {
        spaceName: { type: 'string', description: 'The ClickUp space name to list lists from' },
      },
      required: ['spaceName'],
    },
  },
  {
    name: 'list_folders',
    description: 'List all folders (e.g. Sprint folders) inside a ClickUp space',
    inputSchema: {
      type: 'object',
      properties: {
        spaceName: { type: 'string', description: 'The ClickUp space name to list folders from' },
      },
      required: ['spaceName'],
    },
  },
  {
    name: 'list_chat_channels',
    description: 'List all ClickUp Chat channels accessible to your account',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'send_task_update_to_chat',
    description: 'Post the formatted update for a task ([Name](url) — Status — Time) into a ClickUp Chat channel',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ClickUp task ID to post an update for' },
        channelName: { type: 'string', description: 'The ClickUp Chat channel name to post the update to' },
        prefix: { type: 'string', description: 'Optional text to prepend (e.g. "Daily update:")' },
      },
      required: ['taskId', 'channelName'],
    },
  },
  {
    name: 'send_chat_message',
    description: 'Post a free-form markdown message to a ClickUp Chat channel',
    inputSchema: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'The ClickUp Chat channel name' },
        message: { type: 'string', description: 'The message content (markdown supported)' },
      },
      required: ['channelName', 'message'],
    },
  },
  {
    name: 'track_time',
    description: 'Log actual time spent on a ClickUp task (creates a time entry under your user). Updates the task\'s time_spent total.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ClickUp task ID' },
        duration: { type: 'string', description: 'Duration like "2h", "30m", "1h 30m"' },
        description: { type: 'string', description: 'Optional description for the time entry' },
      },
      required: ['taskId', 'duration'],
    },
  },
  {
    name: 'send_daily_update_to_chat',
    description:
      'Post a structured daily standup update to a ClickUp Chat channel with sections: 1. Done Today (task links with status badges + time), 2. Planned for Tomorrow (bullets), 3. AI Usage, 4. Challenges / Blockers. Task links auto-render with status badges in ClickUp Chat.',
    inputSchema: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'The ClickUp Chat channel name' },
        doneToday: {
          type: 'array',
          description: 'Tasks completed today. Each renders as: [Task](url) — note — time',
          items: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'ClickUp task ID' },
              note: { type: 'string', description: 'Note after task link (default: "Completed")' },
              time: { type: 'string', description: 'Time override (e.g. "30m"). Defaults to time_spent on task.' },
            },
            required: ['taskId'],
          },
        },
        plannedTomorrow: {
          type: 'array',
          items: { type: 'string' },
          description: 'Bullet items planned for tomorrow. Omit/empty to render empty section.',
        },
        aiUsage: { type: 'string', description: 'AI usage summary. Omit to render empty.' },
        blockers: { type: 'string', description: 'Challenges/blockers. Defaults to "None".' },
      },
      required: ['channelName', 'doneToday'],
    },
  },
];

async function main() {
  const config = loadConfig();
  const client = new ClickUpClient(config.apiKey);

  // Get user info and team ID if not configured
  let userId = config.userId;
  let teamId = config.teamId;

  if (!userId || !teamId) {
    try {
      const user = await client.getAuthorizedUser();
      if (!userId) userId = user.user.id;

      const teams = await client.getTeams();
      if (!teamId && teams.teams && teams.teams.length > 0) {
        teamId = teams.teams[0].id;
      }
    } catch (error) {
      console.error('Warning: Could not fetch user info:', error);
    }
  }

  const server = new Server(
    {
      name: 'clickup-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'log_task': {
          const params = LogTaskSchema.parse(args);

          if (!teamId) {
            throw new Error('Team ID could not be determined. Please set CLICKUP_TEAM_ID in your environment.');
          }

          // Find the space by name
          const space = await client.getSpaceByName(teamId, params.spaceName);
          const lists = await client.getAllListsInSpace(space.id);

          if (lists.length === 0) {
            throw new Error(`No lists found in space "${params.spaceName}"`);
          }

          // Find list by name or use first list
          let listId: string;
          if (params.listName) {
            const listName = params.listName;
            const lname = listName.toLowerCase();

            // Special-case: "latest sprint" or "current sprint" → pick most recent sprint-like list
            let list: any;
            if (lname === 'latest sprint' || lname === 'current sprint') {
              const sprintLists = lists
                .filter((l: any) =>
                  /sprint/i.test(l.name) ||
                  (l.folderName && /sprint/i.test(l.folderName))
                )
                .sort((a: any, b: any) => {
                  const ad = Number(a.start_date || a.due_date || 0);
                  const bd = Number(b.start_date || b.due_date || 0);
                  return bd - ad;
                });
              list = sprintLists[0];
            } else {
              list = lists.find((l: any) => l.name.toLowerCase() === lname);
            }

            if (!list) {
              const availableLists = lists
                .map((l: any) => l.folderName ? `${l.folderName}/${l.name}` : l.name)
                .join(', ');
              throw new Error(`List "${listName}" not found in space "${params.spaceName}". Available lists: ${availableLists}`);
            }
            listId = list.id;
          } else {
            listId = lists[0].id;
          }

          // Create task
          const taskParams: any = {
            name: params.taskName,
            description: params.description,
            assignees: userId ? [userId] : [],
          };

          if (params.priority) taskParams.priority = params.priority;
          if (params.timeEstimate) taskParams.time_estimate = params.timeEstimate;
          if (params.dueDate) {
            const dueTimestamp = new Date(params.dueDate).getTime();
            taskParams.due_date = dueTimestamp;
          }

          const task = await client.createTask(listId, taskParams);
          const formattedUpdate = client.formatTaskUpdate(task);

          return {
            content: [
              {
                type: 'text',
                text: `✅ Task logged successfully!\n\n${formattedUpdate}\n\nTask ID: ${task.id}`,
              },
            ],
          };
        }

        case 'get_task_update': {
          const params = GetTaskUpdateSchema.parse(args);
          const task = await client.getTask(params.taskId);
          const formattedUpdate = client.formatTaskUpdate(task);

          return {
            content: [
              {
                type: 'text',
                text: formattedUpdate,
              },
            ],
          };
        }

        case 'update_task_status': {
          const params = UpdateTaskStatusSchema.parse(args);
          await client.updateTask(params.taskId, { status: params.status });
          const task = await client.getTask(params.taskId);
          const formattedUpdate = client.formatTaskUpdate(task);

          return {
            content: [
              {
                type: 'text',
                text: `✅ Task status updated!\n\n${formattedUpdate}`,
              },
            ],
          };
        }

        case 'find_task': {
          const params = FindTaskSchema.parse(args);

          // This is a simplified search - in production you'd want to use ClickUp's search API
          // For now, we'll return a message about how to implement this
          return {
            content: [
              {
                type: 'text',
                text: `To find task "${params.taskName}", you'll need the task ID. ClickUp's search API can be integrated here. For now, please use the task ID directly with get_task_update.`,
              },
            ],
          };
        }

        case 'list_spaces': {
          ListSpacesSchema.parse(args);
          if (!teamId) {
            throw new Error('Team ID could not be determined. Please set CLICKUP_TEAM_ID in your environment.');
          }
          const data = await client.getSpaces(teamId);
          const spaces = (data.spaces || []).map((s: any) => `- ${s.name} (id: ${s.id})`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: spaces ? `Spaces:\n${spaces}` : 'No spaces found.',
              },
            ],
          };
        }

        case 'list_folders': {
          const params = ListFoldersSchema.parse(args);
          if (!teamId) {
            throw new Error('Team ID could not be determined. Please set CLICKUP_TEAM_ID in your environment.');
          }
          const space = await client.getSpaceByName(teamId, params.spaceName);
          const folders = await client.getFolders(space.id);
          const out = folders.map((f: any) => `- ${f.name} (id: ${f.id})`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: out ? `Folders in "${params.spaceName}":\n${out}` : `No folders found in "${params.spaceName}".`,
              },
            ],
          };
        }

        case 'list_lists': {
          const params = ListListsSchema.parse(args);
          if (!teamId) {
            throw new Error('Team ID could not be determined. Please set CLICKUP_TEAM_ID in your environment.');
          }
          const space = await client.getSpaceByName(teamId, params.spaceName);
          const lists = await client.getAllListsInSpace(space.id);
          const out = lists
            .map((l: any) => {
              const loc = l.folderName ? `${l.folderName}/` : '';
              return `- ${loc}${l.name} (id: ${l.id})`;
            })
            .join('\n');
          return {
            content: [
              {
                type: 'text',
                text: out ? `Lists in "${params.spaceName}":\n${out}` : `No lists found in "${params.spaceName}".`,
              },
            ],
          };
        }

        case 'list_chat_channels': {
          ListChatChannelsSchema.parse(args);
          if (!teamId) {
            throw new Error('Workspace/Team ID could not be determined.');
          }
          const channels = await client.getChatChannels(teamId);
          const out = channels
            .map((c: any) => `- ${c.name || '(unnamed)'} (id: ${c.id})`)
            .join('\n');
          return {
            content: [
              {
                type: 'text',
                text: out ? `Chat channels:\n${out}` : 'No chat channels accessible.',
              },
            ],
          };
        }

        case 'send_task_update_to_chat': {
          const params = SendTaskUpdateToChatSchema.parse(args);
          if (!teamId) {
            throw new Error('Workspace/Team ID could not be determined.');
          }
          const task = await client.getTask(params.taskId);
          const update = client.formatTaskUpdate(task);
          const content = params.prefix ? `${params.prefix} ${update}` : update;
          const channel = await client.getChatChannelByName(teamId, params.channelName);
          await client.postChatMessage(teamId, channel.id, content);
          return {
            content: [
              {
                type: 'text',
                text: `✅ Posted to "${channel.name}":\n${content}`,
              },
            ],
          };
        }

        case 'send_chat_message': {
          const params = SendChatMessageSchema.parse(args);
          if (!teamId) {
            throw new Error('Workspace/Team ID could not be determined.');
          }
          const channel = await client.getChatChannelByName(teamId, params.channelName);
          await client.postChatMessage(teamId, channel.id, params.message);
          return {
            content: [
              {
                type: 'text',
                text: `✅ Posted to "${channel.name}":\n${params.message}`,
              },
            ],
          };
        }

        case 'track_time': {
          const params = TrackTimeSchema.parse(args);
          if (!teamId) {
            throw new Error('Workspace/Team ID could not be determined.');
          }

          // Parse duration: "2h", "30m", "1h 30m", or raw ms
          const parseDuration = (s: string): number => {
            const trimmed = s.trim();
            if (/^\d+$/.test(trimmed)) return Number(trimmed);
            let total = 0;
            const hMatch = trimmed.match(/(\d+)\s*h/i);
            const mMatch = trimmed.match(/(\d+)\s*m/i);
            if (hMatch) total += Number(hMatch[1]) * 3600000;
            if (mMatch) total += Number(mMatch[1]) * 60000;
            if (total === 0) throw new Error(`Could not parse duration: "${s}"`);
            return total;
          };

          const durationMs = parseDuration(params.duration);
          const entry = await client.createTimeEntry(teamId, {
            tid: params.taskId,
            duration: durationMs,
            assignee: userId ? Number(userId) : undefined,
            description: params.description,
          });

          return {
            content: [
              {
                type: 'text',
                text: `✅ Logged ${params.duration} on task ${params.taskId}.\nEntry ID: ${entry?.data?.id || entry?.id || '(unknown)'}`,
              },
            ],
          };
        }

        case 'send_daily_update_to_chat': {
          const params = SendDailyUpdateSchema.parse(args);
          if (!teamId) {
            throw new Error('Workspace/Team ID could not be determined.');
          }

          const formatMs = (ms: number | null | undefined): string => {
            if (!ms || ms <= 0) return '0m';
            const totalMin = Math.floor(ms / 60000);
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            if (h && m) return `${h}h ${m}m`;
            if (h) return `${h}h`;
            return `${m}m`;
          };

          // Build "Done Today" lines
          const doneLines: string[] = [];
          for (const item of params.doneToday) {
            const task = await client.getTask(item.taskId);
            const note = item.note || 'Completed';
            const spent = task.time_spent ? Number(task.time_spent) : 0;
            const estimate = (task as any).time_estimate ? Number((task as any).time_estimate) : 0;
            const time = item.time || (spent > 0 ? formatMs(spent) : formatMs(estimate));
            const statusLabel = (task.status?.status || '').toUpperCase();
            const linkText = statusLabel ? `${task.name} [${statusLabel}]` : task.name;
            doneLines.push(`• [${linkText}](${task.url}) — ${note} — ${time}`);
          }

          const plannedLines = (params.plannedTomorrow || []).map((s) => `• ${s}`).join('\n');
          const aiUsage = params.aiUsage || '';
          const blockers = params.blockers || 'None';

          const message =
            `**Done Today**\n${doneLines.join('\n')}\n\n` +
            `**Planned for Tomorrow**\n${plannedLines || '—'}\n\n` +
            `**AI Usage**\n${aiUsage || '—'}\n\n` +
            `**Challenges / Blockers**\n${blockers}`;

          const channel = await client.getChatChannelByName(teamId, params.channelName);
          await client.postChatMessage(teamId, channel.id, message);
          return {
            content: [
              {
                type: 'text',
                text: `✅ Posted daily update to "${channel.name}":\n\n${message}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ClickUp MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
