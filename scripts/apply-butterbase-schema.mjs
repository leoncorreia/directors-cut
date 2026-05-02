/**
 * Applies CineAgent sessions + revisions schema via Butterbase REST API.
 * Reads API key from project .mcp.json (Authorization Bearer header).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const mcpPath = path.join(root, ".mcp.json");
const raw = fs.readFileSync(mcpPath, "utf8");
const mcp = JSON.parse(raw);
const auth =
  mcp.mcpServers?.butterbase?.headers?.Authorization ??
  mcp.mcpServers?.["user-butterbase"]?.headers?.Authorization;

if (!auth) {
  console.error("No Authorization header found in .mcp.json");
  process.exit(1);
}

/** Nested `tables` object — column flags use camelCase `primaryKey` (Butterbase REST API). */
const schemaBody = {
  schema: {
    tables: {
      sessions: {
        columns: {
          id: { type: "uuid", primaryKey: true, default: "gen_random_uuid()" },
          brief: { type: "text", nullable: false },
          style_dna: { type: "text", nullable: true },
          aspect_ratio: { type: "text", nullable: false, default: "'16:9'" },
          created_at: { type: "timestamptz", nullable: false, default: "now()" },
        },
      },
      revisions: {
        columns: {
          id: { type: "uuid", primaryKey: true, default: "gen_random_uuid()" },
          session_id: {
            type: "uuid",
            nullable: false,
            references: { table: "sessions", column: "id", onDelete: "CASCADE" },
          },
          take_number: { type: "integer", nullable: false },
          feedback: { type: "text", nullable: true },
          director_notes: { type: "text", nullable: false },
          shot_plan: { type: "jsonb", nullable: false },
          seedance_prompt: { type: "text", nullable: false },
          critique: { type: "text", nullable: false },
          video_url: { type: "text", nullable: true },
          status: { type: "text", nullable: false, default: "'pending'" },
          error_message: { type: "text", nullable: true },
          created_at: { type: "timestamptz", nullable: false, default: "now()" },
        },
      },
    },
  },
  dry_run: false,
  name: "cineagent_sessions_and_revisions",
};

async function main() {
  const appsRes = await fetch("https://api.butterbase.ai/apps", {
    headers: { Authorization: auth },
  });
  if (!appsRes.ok) {
    const t = await appsRes.text();
    throw new Error(`GET /apps failed: ${appsRes.status} ${t}`);
  }
  const appsPayload = await appsRes.json();
  const apps = Array.isArray(appsPayload) ? appsPayload : appsPayload.apps ?? appsPayload.data ?? [];
  if (!apps.length) {
    throw new Error("No Butterbase apps found. Create an app in the dashboard first.");
  }

  const appId = apps[0].id ?? apps[0].app_id;
  if (!appId) {
    throw new Error("Could not parse app id from /apps response.");
  }

  const schemaRes = await fetch(`https://api.butterbase.ai/v1/${appId}/schema`, {
    headers: { Authorization: auth },
  });
  if (!schemaRes.ok) {
    const t = await schemaRes.text();
    throw new Error(`GET /schema failed: ${schemaRes.status} ${t}`);
  }
  const current = await schemaRes.json();
  const existingTables = structuredClone(current.schema?.tables ?? {});

  // Platform GET /schema can return a broken partial index on `_idempotency_keys`; strip indexes so merge validates.
  if (existingTables._idempotency_keys?.indexes) {
    delete existingTables._idempotency_keys.indexes;
  }

  const mergedBody = {
    ...schemaBody,
    schema: {
      tables: {
        ...existingTables,
        ...schemaBody.schema.tables,
      },
    },
  };

  const applyUrl = `https://api.butterbase.ai/v1/${appId}/schema/apply`;
  const applyRes = await fetch(applyUrl, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mergedBody),
  });

  const text = await applyRes.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  if (!applyRes.ok) {
    console.error("Schema apply failed:", applyRes.status);
    if (json?.error?.details) {
      console.error(JSON.stringify(json.error.details, null, 2));
    } else {
      console.error(json);
    }
    process.exit(1);
  }

  console.log("Schema applied successfully for app:", appId);
  console.log(typeof json === "string" ? json : JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
