# Local Development

## Start Full Stack

From repo root:

```bash
docker compose up -d
```

## Health/Smoke Endpoints

```bash
curl -sS http://127.0.0.1:3333/health
curl -sS http://127.0.0.1:4444/health
curl -sS http://127.0.0.1:4444/v1/mcps
curl -sS -I http://127.0.0.1:5173 | head -n 1
```

## Key Environment Variables

- `TALON_GATEWAY_URL`
- `TALON_GATEWAY_TOKEN`
- `TALON_DEFAULT_AGENT_ID`
- `CONTEXT_GATEWAY_URL`
- `CONTEXT_GATEWAY_TOKEN`
- `DATABASE_URL`

## Notes

- MCP Gateway UI supports live hot reload for `src/ui/*.css|*.js|*.html` edits.
- If host bind mounts drift after compose changes, recreate service:

```bash
docker compose up -d --force-recreate mcp-gateway
```
