#!/usr/bin/env node
/**
 * Hatch MCP server.
 *
 * Exposes the Hatch daemon's deploy / share / list / update / stop operations
 * as MCP tools, so Claude Code can ship the project it just helped you write
 * to your teammates with a sentence in chat.
 *
 * The daemon is the source of truth — this server is a thin protocol bridge.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const DAEMON_URL = process.env.HATCH_DAEMON_URL ?? "http://127.0.0.1:4592";
const DAEMON_TOKEN = process.env.HATCH_DAEMON_TOKEN ?? ""; // optional: forwarded as Bearer

// MCP wants tool inputSchemas as JSON Schema. We use zod-to-json-schema and
// strip a couple of meta keys ($schema, additionalProperties) that some MCP
// clients don't expect at the root.
function toolSchema(s: z.ZodObject<z.ZodRawShape>) {
  const j = zodToJsonSchema(s, { target: "openApi3" }) as Record<string, unknown>;
  delete j.$schema;
  delete j.additionalProperties;
  return j;
}

const EmptyObject = { type: "object" as const, properties: {} };

// ─── helpers ────────────────────────────────────────────────────────────────

async function daemon<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${DAEMON_URL}/api/v1${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(DAEMON_TOKEN ? { Authorization: `Bearer ${DAEMON_TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `daemon ${method} ${path} → ${res.status}: ${text || res.statusText}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

// ─── schemas ────────────────────────────────────────────────────────────────

const DeployArgs = z.object({
  name: z
    .string()
    .min(1)
    .describe(
      "Short name for the app (kebab-case). Used in the URL teammates will visit.",
    ),
  path: z
    .string()
    .min(1)
    .describe(
      "Absolute path to the project directory on this machine. The daemon will containerize whatever lives here.",
    ),
  framework: z
    .enum([
      "streamlit",
      "fastapi",
      "flask",
      "nextjs",
      "vite",
      "node",
      "python",
      "static",
    ])
    .optional()
    .describe("Override automatic framework detection."),
});

const ShareArgs = z.object({
  name: z.string().describe("App name, as registered with Hatch."),
  email: z.string().email().describe("Teammate's email (Google account)."),
});

const RevokeArgs = z.object({
  name: z.string(),
  email: z.string().email(),
});

const NameOnlyArgs = z.object({ name: z.string() });

// ─── tool definitions ───────────────────────────────────────────────────────

const tools = [
  {
    name: "deploy_app",
    description:
      "Containerize a local project and start it on this machine. Returns a tailnet URL the owner can then share with named teammates. Idempotent: re-deploys replace the running container.",
    inputSchema: toolSchema(DeployArgs),
  },
  {
    name: "share_app",
    description:
      "Grant a teammate access to a deployed app. The teammate must be on the same Tailscale tailnet to reach it.",
    inputSchema: toolSchema(ShareArgs),
  },
  {
    name: "revoke_app_access",
    description: "Remove a teammate's access to an app.",
    inputSchema: toolSchema(RevokeArgs),
  },
  {
    name: "list_apps",
    description: "List apps deployed via Hatch on this machine.",
    inputSchema: EmptyObject,
  },
  {
    name: "get_app",
    description:
      "Fetch a single app's status, URL, framework, and access list.",
    inputSchema: toolSchema(NameOnlyArgs),
  },
  {
    name: "update_app",
    description:
      "Rebuild and restart an app from its registered source path. Use after editing the source.",
    inputSchema: toolSchema(NameOnlyArgs),
  },
  {
    name: "stop_app",
    description:
      "Stop and remove an app's container. Source files are untouched; redeploy with deploy_app.",
    inputSchema: toolSchema(NameOnlyArgs),
  },
  {
    name: "tailscale_status",
    description:
      "Report Tailscale state (installed / running / hostname). Useful before sharing — peers can only reach apps if Tailscale is up.",
    inputSchema: EmptyObject,
  },
];

// ─── server ─────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "hatch-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    switch (name) {
      case "deploy_app": {
        const a = DeployArgs.parse(args);
        const app = await daemon("POST", "/apps", a);
        return ok(formatApp(app));
      }
      case "share_app": {
        const a = ShareArgs.parse(args);
        await daemon("POST", `/apps/${encodeURIComponent(a.name)}/access`, {
          email: a.email,
        });
        return ok(`Shared ${a.name} with ${a.email}.`);
      }
      case "revoke_app_access": {
        const a = RevokeArgs.parse(args);
        await daemon(
          "DELETE",
          `/apps/${encodeURIComponent(a.name)}/access/${encodeURIComponent(a.email)}`,
        );
        return ok(`Revoked ${a.email} from ${a.name}.`);
      }
      case "list_apps": {
        const apps = (await daemon<unknown[]>("GET", "/apps")) ?? [];
        if (!apps.length) return ok("No apps deployed yet.");
        return ok(apps.map(formatApp).join("\n\n"));
      }
      case "get_app": {
        const a = NameOnlyArgs.parse(args);
        const app = await daemon("GET", `/apps/${encodeURIComponent(a.name)}`);
        return ok(formatApp(app));
      }
      case "update_app": {
        const a = NameOnlyArgs.parse(args);
        const app = await daemon(
          "POST",
          `/apps/${encodeURIComponent(a.name)}/update`,
        );
        return ok(`Updated.\n\n${formatApp(app)}`);
      }
      case "stop_app": {
        const a = NameOnlyArgs.parse(args);
        await daemon("DELETE", `/apps/${encodeURIComponent(a.name)}`);
        return ok(`Stopped ${a.name}.`);
      }
      case "tailscale_status": {
        const s = await daemon("GET", "/tailscale/status");
        return ok(JSON.stringify(s, null, 2));
      }
      default:
        return ok(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ok(`Error: ${msg}`);
  }
});

function formatApp(raw: unknown): string {
  const a = raw as {
    name?: string;
    status?: string;
    framework?: string;
    tailnet_url?: string;
    port?: number;
  };
  const lines = [
    `${a.name ?? "(unknown)"} — ${a.status ?? "?"}`,
    a.framework ? `framework: ${a.framework}` : "",
    a.tailnet_url ? `url:       ${a.tailnet_url}` : "",
    a.port ? `port:      ${a.port}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const transport = new StdioServerTransport();
await server.connect(transport);
