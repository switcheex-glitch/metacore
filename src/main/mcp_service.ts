import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { tool as aiTool, jsonSchema, type Tool } from "ai";
import { getDb } from "@/db";
import { mcpServers, mcpToolConsents, type McpServer } from "@/db/schema";
import type { ToolContext } from "@/ai/tools/types";

export type McpServerInput = {
  id?: string;
  name: string;
  transport: "stdio" | "http";
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
  enabled?: boolean;
};

export async function listMcpServers(): Promise<McpServer[]> {
  const db = getDb();
  return db.select().from(mcpServers);
}

export async function upsertMcpServer(input: McpServerInput): Promise<McpServer> {
  const db = getDb();
  const id = input.id ?? randomUUID();
  const row = {
    id,
    name: input.name,
    transport: input.transport,
    command: input.command ?? null,
    args: input.args ? JSON.stringify(input.args) : null,
    env: input.env ? JSON.stringify(input.env) : null,
    url: input.url ?? null,
    enabled: input.enabled ?? true,
  };
  const existing = await db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
  if (existing.length === 0) {
    await db.insert(mcpServers).values(row);
  } else {
    await db
      .update(mcpServers)
      .set({
        name: row.name,
        transport: row.transport,
        command: row.command,
        args: row.args,
        env: row.env,
        url: row.url,
        enabled: row.enabled,
      })
      .where(eq(mcpServers.id, id));
  }
  const saved = await db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
  return saved[0]!;
}

export async function removeMcpServer(id: string): Promise<void> {
  const db = getDb();
  await db.delete(mcpServers).where(eq(mcpServers.id, id));
}

export async function setMcpToolConsent(
  mcpServerId: string,
  toolName: string,
  consent: "always" | "ask" | "never",
): Promise<void> {
  const db = getDb();
  const existing = await db
    .select()
    .from(mcpToolConsents)
    .where(and(eq(mcpToolConsents.mcpServerId, mcpServerId), eq(mcpToolConsents.toolName, toolName)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(mcpToolConsents).values({ mcpServerId, toolName, consent });
  } else {
    await db
      .update(mcpToolConsents)
      .set({ consent })
      .where(
        and(eq(mcpToolConsents.mcpServerId, mcpServerId), eq(mcpToolConsents.toolName, toolName)),
      );
  }
}

type McpClientHandle = {
  close: () => Promise<void>;
  listTools: () => Promise<Array<{ name: string; description?: string; inputSchema: unknown }>>;
  callTool: (name: string, args: unknown) => Promise<unknown>;
};

async function openStdioClient(server: McpServer): Promise<McpClientHandle | null> {
  if (!server.command) return null;
  try {
    const sdk = await import("@modelcontextprotocol/sdk/client/index.js");
    const stdio = await import("@modelcontextprotocol/sdk/client/stdio.js");
    const parsedArgs = server.args ? (JSON.parse(server.args) as string[]) : [];
    const parsedEnv = server.env ? (JSON.parse(server.env) as Record<string, string>) : undefined;
    const transport = new stdio.StdioClientTransport({
      command: server.command,
      args: parsedArgs,
      env: parsedEnv,
    });
    const client = new sdk.Client({ name: "metacore", version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    return {
      async close() {
        await client.close();
      },
      async listTools() {
        const res = await client.listTools();
        return (res.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
      },
      async callTool(name, args) {
        const res = await client.callTool({
          name,
          arguments: (args as Record<string, unknown>) ?? {},
        });
        return res;
      },
    };
  } catch (err) {
    console.warn(`MCP stdio client for ${server.name} failed:`, (err as Error).message);
    return null;
  }
}

async function openHttpClient(server: McpServer): Promise<McpClientHandle | null> {
  if (!server.url) return null;
  try {
    const sdk = await import("@modelcontextprotocol/sdk/client/index.js");
    const streamable = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const transport = new streamable.StreamableHTTPClientTransport(new URL(server.url));
    const client = new sdk.Client({ name: "metacore", version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    return {
      async close() {
        await client.close();
      },
      async listTools() {
        const res = await client.listTools();
        return (res.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
      },
      async callTool(name, args) {
        const res = await client.callTool({
          name,
          arguments: (args as Record<string, unknown>) ?? {},
        });
        return res;
      },
    };
  } catch (err) {
    console.warn(`MCP http client for ${server.name} failed:`, (err as Error).message);
    return null;
  }
}

export async function openMcpClients(): Promise<
  Array<{ server: McpServer; handle: McpClientHandle }>
> {
  const servers = (await listMcpServers()).filter((s) => s.enabled);
  const out: Array<{ server: McpServer; handle: McpClientHandle }> = [];
  for (const s of servers) {
    const handle =
      s.transport === "stdio" ? await openStdioClient(s) : await openHttpClient(s);
    if (handle) out.push({ server: s, handle });
  }
  return out;
}

export async function buildMcpToolSet(
  ctx: ToolContext,
  clients: Array<{ server: McpServer; handle: McpClientHandle }>,
): Promise<Record<string, Tool>> {
  const out: Record<string, Tool> = {};
  for (const { server, handle } of clients) {
    let tools: Awaited<ReturnType<McpClientHandle["listTools"]>>;
    try {
      tools = await handle.listTools();
    } catch {
      continue;
    }
    for (const t of tools) {
      const qualifiedName = `mcp_${sanitize(server.name)}_${sanitize(t.name)}`;
      out[qualifiedName] = aiTool({
        description: t.description ?? `MCP tool ${t.name} from ${server.name}`,
        parameters: jsonSchema(
          (t.inputSchema as Record<string, unknown>) ?? {
            type: "object",
            properties: {},
          },
        ),
        async execute(args) {
          if (ctx.signal.aborted) throw new Error("aborted");
          const ok = await ctx.requireConsent({
            toolName: qualifiedName,
            toolDescription: t.description ?? qualifiedName,
            preview: { summary: `MCP ${server.name}.${t.name}` },
            defaultConsent: "ask",
          });
          if (!ok) throw new Error(`User denied permission for ${qualifiedName}`);
          return handle.callTool(t.name, args);
        },
      });
    }
  }
  return out;
}

export async function closeMcpClients(
  clients: Array<{ handle: { close: () => Promise<void> } }>,
) {
  await Promise.all(
    clients.map(async ({ handle }) => {
      try {
        await handle.close();
      } catch {
        // swallow — process may already be gone
      }
    }),
  );
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
}

export const McpUpsertSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(80),
    transport: z.enum(["stdio", "http"]),
    command: z.string().optional().nullable(),
    args: z.array(z.string()).optional().nullable(),
    env: z.record(z.string()).optional().nullable(),
    url: z.string().url().optional().nullable(),
    enabled: z.boolean().optional(),
  })
  .strict();

export type McpUpsertInput = z.infer<typeof McpUpsertSchema>;
