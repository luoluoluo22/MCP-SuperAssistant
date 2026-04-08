# Local Service Config

This project now assumes a single local entry service plus global skills.

## Recommended Startup

Run the combined local service from:

```powershell
cd /d F:\Desktop\kaifa\mcp-superassistamt
pnpm local-service
```

The wrapper service will:

- start the embedded `@srbhptl39/mcp-superassistant-proxy`
- expose MCP on the same local address
- expose global skills from `%USERPROFILE%\.super\skills`

## Recommended Extension Settings

- Connection Type: `WebSocket`
- Server URI: `ws://localhost:3006/message`

## Global Skills Path

Store user-level skills here:

```text
C:\Users\Administrator\.super\skills
```

Each skill should use:

```text
C:\Users\Administrator\.super\skills\<skill-id>\SKILL.md
```

Example:

```text
C:\Users\Administrator\.super\skills\desktop-files\SKILL.md
```

## Available Local Endpoints

- MCP WebSocket: `ws://localhost:3006/message`
- Skills list: `http://localhost:3006/skills`
- Health check: `http://localhost:3006/health`

## Notes

- `WebSocket` is the preferred transport because the upstream proxy can crash on SSE reconnect.
- If port `3006` is occupied, stop the old process before starting `pnpm local-service`.
