# Talon Gateway Integration

## Role

Talon is the runtime that executes model-backed agent tasks and tool calls. Task Master treats Talon as an external runtime dependency through gateway APIs.

## Typical Runtime Configuration

- Gateway token auth enabled
- Default agent id configured (`jarvis`)
- Provider auth profiles available for selected model providers

## Integration Contract (Task Master -> Talon)

Task Master sends:

- model identifier (or `talon:<agentKey>`)
- message list
- session key
- optional agent header (`x-talon-agent-id`)

Talon responds with:

- assistant text
- model metadata
- token usage

## Operational Failure Classes

- Missing provider API key/auth profile
- Model/provider mismatch
- Tool capability mismatch for chosen model
- Session/auth routing mismatch

## Current Guidance

- Keep Jarvis session keys canonical in `jarvis:*` namespace.
- Prefer explicit model candidates with compatible provider auth.
- Degrade gracefully in Task Master if no compatible upstream model is available.
