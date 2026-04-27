# ClickUp MCP Server

A Model Context Protocol (MCP) server for ClickUp task management. This server allows you to log tasks, assign them to yourself, and get formatted updates through Claude or other MCP-compatible clients.

## Features

- 📝 **Log Tasks**: Create new tasks in ClickUp with automatic assignment
- 📊 **Get Updates**: Retrieve formatted task updates in a consistent format
- ✅ **Update Status**: Change task status programmatically
- 🔍 **Find Tasks**: Search for tasks by name
- ⚙️ **Flexible Configuration**: Support for multiple spaces and lists

## Prerequisites

- Node.js 18 or higher
- ClickUp API key
- ClickUp account with access to a workspace

## Installation

1. Clone or navigate to this directory:
```bash
cd clickup-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript code:
```bash
npm run build
```

## Configuration

### 1. Get Your ClickUp API Key

1. Go to ClickUp Settings → Apps
2. Click "Generate" under API Token
3. Copy your API key

### 2. Create Environment File

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your API key:

```env
CLICKUP_API_KEY=pk_your_api_key_here
```

**That's it!** The server will automatically:
- Detect your User ID from the API key
- Detect your Team ID from your ClickUp account
- Assign tasks to you automatically

**Optional**: If you have multiple teams or want to override the auto-detection, you can manually specify:
```env
CLICKUP_TEAM_ID=your_team_id
CLICKUP_USER_ID=your_user_id
```

## Usage with Claude Desktop

### 1. Configure Claude Desktop

Add this to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "clickup": {
      "command": "node",
      "args": ["/Users/arslan/datics/clickup-mcp/dist/index.js"],
      "env": {
        "CLICKUP_API_KEY": "pk_your_api_key_here"
      }
    }
  }
}
```

**Note**: User ID and Team ID are auto-detected from your API key!

### 2. Restart Claude Desktop

After updating the config, restart Claude Desktop to load the MCP server.

### 3. Use the Tools

You can now ask Claude to:

- **Log a task**: "Log a task called 'Fix bug in authentication' to the 'Development' space in ClickUp"
- **Get updates**: "Get the update for ClickUp task abc123"
- **Update status**: "Update task abc123 status to 'In Progress'"

## Available Tools

### 1. `log_task`

Create a new task in ClickUp and assign it to you.

**Parameters**:
- `taskName` (required): The name of the task
- `spaceName` (required): The ClickUp space name where the task will be created
- `listName` (optional): The list name within the space (uses first list if not specified)
- `description` (optional): Task description
- `priority` (optional): 1=Urgent, 2=High, 3=Normal, 4=Low
- `dueDate` (optional): Due date in ISO format
- `timeEstimate` (optional): Time estimate in milliseconds

**Examples**:
```
Log a task called "Implement user authentication" in space "Development"
```

```
Log a task called "Fix login bug" in space "Development" list "Bug Fixes" with high priority
```

### 2. `get_task_update`

Get formatted update for a task.

**Parameters**:
- `taskId` (required): The ClickUp task ID

**Example**:
```
Get the update for task abc123xyz
```

**Output Format**:
```
[Task Name](https://app.clickup.com/t/abc123xyz) — In Progress — 2h 30m
```

The format is: `[Task Name](url) — Status — Time Spent`

### 3. `update_task_status`

Update the status of a task.

**Parameters**:
- `taskId` (required): The ClickUp task ID
- `status` (required): New status name

**Example**:
```
Update task abc123xyz status to "Completed"
```

### 4. `find_task`

Find a task by name (currently returns task ID requirement message).

**Parameters**:
- `taskName` (required): Name of the task to search for
- `spaceName` (optional): Space name to search in

## Development

### Watch Mode

For development, you can run TypeScript in watch mode:

```bash
npm run watch
```

### Testing

You can test the MCP server using the MCP Inspector or by running it directly:

```bash
node dist/index.js
```

## Task Update Format

Tasks are formatted as shown in your screenshot:

```
📋 **Task Name**
Status: Status Name
Assignees: username1, username2
Time Spent: Xh Ym
Due Date: MM/DD/YYYY
🔗 https://app.clickup.com/t/task_id
```

## Troubleshooting

### Server Not Appearing in Claude

1. Check that the config file path is correct
2. Verify the `dist/index.js` file exists (run `npm run build`)
3. Check Claude Desktop logs for errors
4. Restart Claude Desktop

### API Key Issues

- Ensure your API key starts with `pk_`
- Verify the key has not been revoked in ClickUp settings
- Check that your user has access to the workspace

### List/Space Not Found

- Double-check your list ID or space name
- Ensure your API key has access to that workspace
- Verify the team ID is correct

## License

MIT
