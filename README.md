# ClickUp MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

A Model Context Protocol (MCP) server for ClickUp. Manage tasks, track time, change status, and post daily standup updates to ClickUp Chat — all from **Claude Code, Cursor, Claude Desktop, or any MCP-compatible AI tool**.

> Tell your AI: *"Create Test task in AI Role Play, log 2 hours, mark delivered, and post my daily update to the channel"* → done in seconds, no context-switching.

## Features

- **Log tasks** — auto-assigns to you, finds the right space/list (including lists inside Sprint folders)
- **Track real time** — log actual hours spent (not just estimates) as a real time entry
- **Update status** — Open → In Progress → Delivered with one line
- **Discover** — list spaces, folders, lists, and chat channels in your workspace
- **Daily standup updates** — formatted message to any ClickUp Chat channel:
  - Done Today (with task links + time spent)
  - Planned for Tomorrow
  - AI Usage
  - Challenges / Blockers

## Setup

### 1. Get Your ClickUp API Key

1. ClickUp → Settings → Apps
2. Click **Generate** under API Token
3. Copy the `pk_...` key — you'll need it below

### 2. Install the Server

**Recommended — install globally (works from anywhere on your system):**

```bash
npm install -g clickup-task-mcp
```

After install, the `clickup-task-mcp` command is available system-wide. Verify:

```bash
which clickup-task-mcp     # should print a path
clickup-task-mcp --help    # (or just runs the server on stdio)
```

To upgrade later:
```bash
npm update -g clickup-task-mcp
```

**Alternative — build from source (for contributors):**

```bash
git clone git@github.com:arslan8122/clickup-mcp.git
cd clickup-mcp
npm install
npm run build
```

**No `.env` file needed for normal use.** You'll pass your API key directly to your AI client below.

### 3. Connect to Your AI Client

Pick the section that matches your tool. The API key is passed as an **environment variable** by the client when it launches the server.

#### Claude Code

After global install:
```bash
claude mcp add clickup -s user -e CLICKUP_API_KEY=pk_your_key_here -- clickup-task-mcp
```

If built from source:
```bash
claude mcp add clickup -s user -e CLICKUP_API_KEY=pk_your_key_here -- node /absolute/path/to/clickup-mcp/dist/index.js
```

Restart Claude Code, then run `/mcp` to confirm it's connected.

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "clickup": {
      "command": "clickup-task-mcp",
      "env": {
        "CLICKUP_API_KEY": "pk_your_key_here"
      }
    }
  }
}
```

Or if built from source, use:
```json
{
  "mcpServers": {
    "clickup": {
      "command": "node",
      "args": ["/absolute/path/to/clickup-mcp/dist/index.js"],
      "env": {
        "CLICKUP_API_KEY": "pk_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop.

#### Cursor / Other MCP Clients

Same JSON shape as Claude Desktop, in the client's MCP config file. After a global install, the `command` is just `clickup-task-mcp` with no `args` needed.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CLICKUP_API_KEY` | ✅ | Your ClickUp personal API token (starts with `pk_`) |
| `CLICKUP_TEAM_ID` | ❌ | Workspace/team ID. Auto-detected from your API key. |
| `CLICKUP_USER_ID` | ❌ | Your user ID. Auto-detected from your API key. |

Override `CLICKUP_TEAM_ID` / `CLICKUP_USER_ID` only if you belong to multiple workspaces and the auto-detected one is wrong.

### Using `.env` (development only)

If you're **developing or testing** the server directly (e.g. `npm run start` from the cloned repo), you can put your key in a `.env` file instead:

```bash
cp .env.example .env
# Edit .env, add CLICKUP_API_KEY=pk_...
npm run start
```

This is a dev convenience — **end users using Claude Code / Cursor / etc. should not need a `.env` file**. The API key flows through the client's MCP config.

## Available Tools

### Task Management
- `log_task` — Create a task in a space/list, auto-assign to you
- `update_task_status` — Change a task's status
- `get_task_update` — Get a formatted task summary
- `find_task` — Search task by name (basic)
- `track_time` — Log actual time spent on a task (e.g. `"2h"`, `"30m"`, `"1h 30m"`)

### Discovery
- `list_spaces` — List all spaces in your workspace
- `list_folders` — List folders in a space
- `list_lists` — List all lists in a space (including those inside folders/sprint folders)
- `list_chat_channels` — List all accessible ClickUp Chat channels

### ClickUp Chat
- `send_chat_message` — Post a free-form markdown message to any channel
- `send_task_update_to_chat` — Post a single task's status line to a channel
- `send_daily_update_to_chat` — Post a structured 4-section daily standup (Done Today / Planned Tomorrow / AI Usage / Blockers)

## Example: Full Daily Workflow

In one prompt to your AI:

```
Create "Fix login bug" in AI Role Play Assistant, log 2h on it,
mark it delivered, then post my daily update to AI Role Play
Assistant - Mike's Project channel.
```

The MCP will run: `log_task` → `track_time` → `update_task_status` → `send_daily_update_to_chat`.

## Roadmap / Limitations

- **No inline task pills in chat:** ClickUp's public v3 Chat API only supports markdown — true rich task pills (with status badges) require their internal API. The `send_daily_update_to_chat` tool bakes the status into the link text as `[Task [DELIVERED]](url)` as a workaround.
- **`find_task` is basic** — full search across the workspace via the v2 search API is on the roadmap.

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, branching conventions, and how to add a new MCP tool.

Quick:

```bash
git clone git@github.com:arslan8122/clickup-mcp.git
cd clickup-mcp && npm install && npm run build
```

Open issues or feature requests at https://github.com/arslan8122/clickup-mcp/issues.

## License

[MIT](LICENSE) © Arslan Asghar
