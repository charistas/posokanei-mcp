# Contributing

Thanks for helping improve `posokanei-mcp`.

## Local Setup

```sh
npm install
npm run typecheck
npm test
```

Tests should mock external API calls. Do not add tests that require live PosoKanei network access unless they are clearly marked as optional smoke tests.

## Project Rules

- Keep the server read-only.
- Keep result sizes bounded so MCP clients are not flooded with huge JSON payloads.
- Add or update tests for behavior changes.
- Do not add write/form-submission tools without a separate design discussion.
- Preserve the unofficial project disclaimer in public docs.

## Dependency Policy

New runtime dependencies should be justified. Prefer Node built-ins and the official MCP SDK where practical.

