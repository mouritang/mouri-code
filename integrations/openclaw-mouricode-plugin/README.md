# OpenClaw MouriCode Plugin

This is a local OpenClaw plugin that exposes a few tools backed by a **local MouriCode bridge HTTP API**.

## Config

`baseUrl` defaults to `http://127.0.0.1:7788`. If MouriCode selects a fallback port, the plugin will auto-read `~/.clawdbot/mouricode-bridge.json` and use the discovered baseUrl.

`requestTimeoutMs` defaults to `15000`.

## Tools

- `mouricode_list_tasks`
  - `GET /api/tasks?activeOnly=1`
- `mouricode_get_monitor_snapshot`
  - `GET /api/monitor`
  - if `refresh=true`: `POST /api/monitor/run`
- `mouricode_get_task_output`
  - `GET /api/tasks/:taskId/output?maxChars=8000`
- `mouricode_send_prompt`
  - `POST /api/tasks/:taskId/prompt` with JSON body `{ "prompt": "..." }`

## Install (example)

Point OpenClaw at this plugin folder, then enable it:

```bash
openclaw plugins install /Volumes/ORICO/Mouri-code/integrations/openclaw-mouricode-plugin
openclaw plugins enable mouricode
```
