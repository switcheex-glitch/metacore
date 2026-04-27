import { z } from "zod";
import { registerInvokeHandler } from "../ipc_host";
import {
  listMcpServers,
  upsertMcpServer,
  removeMcpServer,
  McpUpsertSchema,
} from "@/main/mcp_service";

const removeSchema = z.object({ id: z.string().min(1) }).strict();

export function registerMcpHandlers() {
  registerInvokeHandler("mcp:list", async () => {
    const rows = await listMcpServers();
    return rows.map((r) => ({
      ...r,
      args: r.args ? (JSON.parse(r.args) as string[]) : [],
      env: r.env ? (JSON.parse(r.env) as Record<string, string>) : {},
    }));
  });

  registerInvokeHandler("mcp:upsert", async (_event, payload) => {
    const input = McpUpsertSchema.parse(payload);
    const saved = await upsertMcpServer({
      ...input,
      args: input.args ?? undefined,
      env: input.env ?? undefined,
    });
    return saved;
  });

  registerInvokeHandler("mcp:remove", async (_event, payload) => {
    const { id } = removeSchema.parse(payload);
    await removeMcpServer(id);
    return { ok: true };
  });
}
