# Repository Guidance

## Project Overview

`posokanei-mcp` is an unofficial read-only MCP server for supermarket product and price data from PosoKanei.

It is published as the `posokanei-mcp` npm package and registered as `io.github.charistas/posokanei-mcp` in the MCP Registry.

This project is not affiliated with, endorsed by, or operated by PosoKanei, gov.gr, or any Greek public authority.

## Commands

Requires Node.js `>=20`.

```sh
npm install
npm run build
npm run typecheck
npm test
```

There is no lint script. Do not invent one as a required verification gate.

The test suite mocks PosoKanei API calls. Do not add required tests that depend on live PosoKanei network access.

## Source Conventions

- Edit `src/`, not `dist/`. `dist/` is generated and ignored.
- Keep TypeScript ESM style consistent with the existing files.
- Prefer Node built-ins and the official MCP SDK over new runtime dependencies.
- Keep changes small and directly tied to the task.
- If adding a runtime dependency is unavoidable, justify license compatibility, maintenance, security posture, and install footprint.

## MCP And API Safety

- Keep the server read-only.
- Do not add write, form-submission, account, auth-bypass, or mutation tools without an explicit design discussion.
- Treat PosoKanei endpoints as public but undocumented. Keep requests modest, cache-friendly, and rate-limited.
- Bound list, tree, search, and comparison responses so a single tool call cannot flood the client with huge JSON.
- Tool descriptions must be precise and must not imply official government affiliation.
- Keep API errors visible for transient or service-level failures.
- Only treat missing resources as unmatched user input when the API clearly returns a not-found condition.
- Preserve explicit constructor options over environment defaults.
- Keep rate limiting serialized for concurrent requests.
- Keep cache behavior deterministic and easy to disable in tests.

## Tests And Docs

- For behavior changes, add or update focused tests.
- For MCP tool or schema changes, update MCP server tests and the README tool table.
- Update `README.md` when installation, tools, environment variables, publishing, or public behavior changes.
- Keep `package.json#mcpName` and `server.json#name` identical.
- Keep `server.json` package version aligned with `package.json#version`.
- Keep `server.example.json` aligned with `server.json` unless it intentionally demonstrates placeholders.

## Verification

Before handoff after code changes, run:

```sh
npm run typecheck
npm test
```

For release, package, or registry metadata changes, also run:

```sh
npm_config_cache=/private/tmp/npm-cache npm pack --dry-run
npm_config_cache=/private/tmp/npm-cache npm publish --dry-run
mcp-publisher validate
```

Use the temporary npm cache only when the local default npm cache has permission or stale metadata problems.

## Publishing

- Publish order is GitHub first, npm second, MCP Registry third.
- Do not publish a new npm version without running the release verification gates.
- Remember that an npm `name@version` cannot be reused after publishing.
- If adding Claude Code support, create a tiny `CLAUDE.md` that imports `@AGENTS.md`; do not duplicate this file.

## Cleanup

- Do not leave background MCP servers, watchers, or dev processes running.
- Keep smoke-test installs and temporary client scripts outside the repo, such as under `/private/tmp`.
- Do not commit `dist/`, `node_modules/`, npm tarballs, local auth files, or `.env` files.
- In handoff notes, state what was verified and what remains unverified.
