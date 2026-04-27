# Contributing to ClickUp MCP

Thanks for your interest in contributing! This project is a Model Context Protocol (MCP) server that lets AI tools (Claude Code, Cursor, etc.) interact with ClickUp.

## Quick Links

- [Open an Issue](https://github.com/arslan8122/clickup-mcp/issues)
- [Discussions](https://github.com/arslan8122/clickup-mcp/discussions)
- [README](./README.md)

## Ways to Contribute

- **Report bugs** — open an issue with reproduction steps and your environment.
- **Suggest features** — open a feature-request issue describing the use case.
- **Submit code** — bug fixes, new tools, docs, tests.
- **Improve docs** — typos, clearer examples, screenshots.

## Development Setup

```bash
git clone git@github.com:arslan8122/clickup-mcp.git
cd clickup-mcp
npm install
cp .env.example .env
# Add your ClickUp API key to .env
npm run build
```

For development with hot rebuild:

```bash
npm run watch
```

To test changes against a local Claude Code install:

```bash
claude mcp add clickup-dev -s user \
  -e CLICKUP_API_KEY=pk_your_key \
  -- node /absolute/path/to/clickup-mcp/dist/index.js
```

Then restart Claude Code.

## Pull Request Process

1. **Fork** the repo and create a branch from `main`:
   - `feat/<short-name>` for new features
   - `fix/<short-name>` for bug fixes
   - `docs/<short-name>` for documentation
2. **Make your change** with a clear, focused commit history.
3. **Build passes**: `npm run build` must succeed before opening the PR.
4. **Update README/docs** if your change affects user-facing behavior or adds a new tool.
5. **Open a PR** against `main`. Describe:
   - What problem it solves
   - How you tested it (manual steps or screenshots welcome)
   - Any breaking changes

## Adding a New MCP Tool

Each tool needs three pieces in `src/index.ts`:

1. A Zod schema (e.g. `MyToolSchema`)
2. A `Tool` definition in the `tools` array (with `name`, `description`, `inputSchema`)
3. A `case 'my_tool':` block in the `CallToolRequestSchema` handler

If the tool calls a new ClickUp endpoint, add a method to `src/clickup-client.ts`.

Keep tool descriptions concrete — the model uses them to decide when to call the tool.

## Code Style

- TypeScript strict mode is on; please keep it that way.
- Match the existing patterns in `src/` rather than introducing new abstractions.
- No new dependencies without a clear reason.

## Reporting Security Issues

Please do **not** open a public issue for security vulnerabilities. Email the maintainer directly (see GitHub profile).

## Code of Conduct

Be respectful. Disagree on ideas, not people. Maintainers reserve the right to lock or close hostile threads.

## License

By contributing, you agree your contributions are licensed under the MIT License (same as the project).
