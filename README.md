# CineAgent (Director's Cut)

CineAgent is a full-stack AI film director: it turns briefs into structured shot plans with **Z.AI GLM-5.1**, renders video through a Seedance proxy, and persists sessions on Butterbase so your hackathon demo survives reloads.

## Architecture

```text
┌────────────────────┐      HMR / assets      ┌────────────────────┐
│      Browser       │ <---------------------> │ Vite Dev :5173     │
└─────────┬──────────┘                       └────────────────────┘
          │
          │ POST /api/*  (Seedance proxy)
          v
┌────────────────────┐      REST + Bearer    ┌────────────────────┐
│   Express :3001    │ --------------------> │   Seedance API     │
└────────────────────┘                       └────────────────────┘

┌────────────────────┐   chat completions    ┌────────────────────┐
│      Browser       │ --------------------> │   Z.AI (GLM-5.1)   │
└────────────────────┘                       └────────────────────┘

┌────────────────────┐   Data API + storage  ┌────────────────────┐
│      Browser       │ --------------------> │  Butterbase Cloud  │
└────────────────────┘                       └────────────────────┘

┌────────────────────┐   MCP tools            ┌────────────────────┐
│ Cursor / Agent     │ --------------------> │   Butterbase MCP   │
└────────────────────┘                       └────────────────────┘
```

## Setup

1. Copy env: `cp .env.example .env` (or duplicate on Windows) and fill every variable.
2. **Z.AI:** create an API key on the [Z.AI Open Platform](https://docs.z.ai/guides/llm/glm-5.1) → set **`VITE_ZAI_API_KEY`** in `.env`. Optional: **`VITE_ZAI_MODEL`** (default `glm-5.1`), **`VITE_ZAI_BASE_URL`** only if docs specify a different API host.
3. **Butterbase:** open [dashboard.butterbase.ai](https://dashboard.butterbase.ai), create an app, copy **`app_id`** → `VITE_BUTTERBASE_APP_ID`. Keep `VITE_BUTTERBASE_API_URL=https://api.butterbase.ai` unless your dashboard shows a different API host.
4. **Butterbase MCP (Cursor):** add the Butterbase MCP server per [MCP Setup](https://docs.butterbase.ai/getting-started/mcp-setup/) (e.g. `~/.cursor/mcp.json` or project `.mcp.json` with your **service** key — never commit secrets).
5. **Schema:** run Butterbase MCP **`apply_schema`** (or ask Cursor to apply it) using:

```json
{
  "tables": [
    {
      "name": "sessions",
      "columns": [
        { "name": "id", "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
        { "name": "brief", "type": "text" },
        { "name": "style_dna", "type": "text", "nullable": true },
        { "name": "aspect_ratio", "type": "text", "default": "'16:9'" },
        { "name": "created_at", "type": "timestamptz", "default": "now()" }
      ]
    },
    {
      "name": "revisions",
      "columns": [
        { "name": "id", "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
        { "name": "session_id", "type": "uuid", "references": "sessions.id", "on_delete": "CASCADE" },
        { "name": "take_number", "type": "integer" },
        { "name": "feedback", "type": "text", "nullable": true },
        { "name": "director_notes", "type": "text" },
        { "name": "shot_plan", "type": "jsonb" },
        { "name": "seedance_prompt", "type": "text" },
        { "name": "critique", "type": "text" },
        { "name": "video_url", "type": "text", "nullable": true },
        { "name": "status", "type": "text", "default": "'pending'" },
        { "name": "error_message", "type": "text", "nullable": true },
        { "name": "created_at", "type": "timestamptz", "default": "now()" }
      ]
    }
  ]
}
```
6. Install and run:
   - `npm install`
   - `npm install --prefix client`
   - `npm install --prefix server`
   - `npm run dev` → Vite **5173** + Express **3001**

Optional: after deploying the frontend to Butterbase, set `VITE_BUTTERBASE_DEV_URL` to your `*.butterbase.dev` URL so the hackathon submit modal can pre-fill the demo link.

## Hackathon Submission (Butterbase MCP)

Submissions go through the Butterbase MCP tool. Two ways to submit:

### Option A: In-app (easiest)

Click **🏆 Submit** in the top-right of the running app (enabled after at least one take finishes successfully). Enter your **submission code** from organizers and your deployed **`*.butterbase.dev`** demo URL.

### Option B: Via MCP in Cursor / Claude Code

Make sure Butterbase MCP is connected (see Setup), then ask your assistant:

> Submit my hackathon entry using `submit_hackathon_entry` with:
> - `submission_code`: [YOUR_CODE]
> - `app_id`: [YOUR_APP_ID]
> - `data.project_name`: CineAgent
> - `data.demo_url`: [YOUR_BUTTERBASE_DEV_URL]
> - `data.description`: [your description]

Canonical docs: [Hackathon](https://docs.butterbase.ai/hackathon/).

### Maximising your leaderboard score

- Deploy to Butterbase (`*.butterbase.dev`) for up to **50** URL points.
- Include **`app_id`** in the submission for up to **50** feature-detection points.
- Use Butterbase features in the project: **database** (`sessions` + `revisions`), **file storage** (optional video persistence), and **frontend deploy** for the demo URL.

The in-app submit button calls `POST /v1/hackathon/submit` as a convenience wrapper; **`submit_hackathon_entry` via MCP remains the canonical path** documented by Butterbase.

## Deploy API (Render)

The Seedance proxy must be reachable from the browser when you use the Butterbase-hosted UI (CORS). Host the `server` app on [Render](https://render.com):

1. Push this repo to GitHub (or GitLab / Bitbucket).
2. In Render: **New** → **Blueprint** (or **Web Service**), point at the repo. If you use the included `render.yaml`, confirm **Root Directory** is `server` for the API service (the Blueprint sets `rootDir: server`).
3. In the service **Environment** tab, set:
   - **`SEEDANCE_API_KEY`** — same value as in your local `.env` (mark **Secret**).
   - **`CORS_ORIGINS`** — your Butterbase frontend origin, e.g. `https://super-hackathon.butterbase.dev` (no trailing slash). Add `,http://localhost:5173` if you want local dev against production API.
4. Deploy and copy the public URL (e.g. `https://directors-cut-api.onrender.com`). **`GET /health`** should return `{"ok":true}`.

Free web services spin down after idle; first request after sleep can take ~30–60s.

## Deploy frontend (Butterbase MCP)

When the API URL is known and CORS is configured:

1. Ensure **`VITE_ZAI_API_KEY`** (and other `VITE_*` vars) are set for the production build — they are baked into `client/dist`. Add **`VITE_API_BASE`** (no trailing slash) pointing at your Render URL, e.g. `VITE_API_BASE=https://directors-cut-api.onrender.com`.
2. `cd client && npm run build` (output: `client/dist`).
3. In Cursor with Butterbase MCP: run **`create_frontend_deployment`**, upload the zip of `client/dist`, then **`start_frontend_deployment`**.
4. Set **`VITE_BUTTERBASE_DEV_URL`** in `.env` to your **`*.butterbase.dev`** URL if you want the hackathon submit modal to pre-fill the demo link.
5. Use the **`*.butterbase.dev`** URL as your hackathon **demo URL** (frontend + API are both live).

## Seedance (BytePlus ModelArk)

Point **`SEEDANCE_API_BASE`** at the ModelArk **data-plane** URL (see [Base URL and authentication](https://docs.byteplus.com/en/docs/ModelArk/1298459)), e.g. `https://ark.ap-southeast.bytepluses.com/api/v3`. The proxy then uses **`POST/GET …/contents/generations/tasks`** ([create task](https://docs.byteplus.com/en/docs/ModelArk/1520757)), not the legacy `api.seedance.ai` paths.

Use **`SEEDANCE_MODEL`** from your BytePlus console (e.g. Dreamina / Seedance 2.0). Optional: **`SEEDANCE_RESOLUTION`** (`720p`, `1080p`, …), **`SEEDANCE_GENERATE_AUDIO`** (`true`/`false`) if a model rejects audio flags.

## Known limitations

- Z.AI may return **429** under heavy load; wait and retry.
- Seedance generation is async; expect roughly **30–60s** per take.

The director LLM runs **in the browser** via `VITE_ZAI_API_KEY` (same exposure pattern as a typical Vite `VITE_*` setup). For production hardening, proxy chat completions through your backend.
