import { tool as aiTool, type Tool } from "ai";
import type { ToolContext, ToolDefinition, ToolRegistry } from "./types";
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  searchReplaceTool,
  deleteFileTool,
  renameFileTool,
} from "./file_tools";
import { listFilesTool, grepTool, codeSearchTool } from "./search_tools";
import {
  addDependencyTool,
  readLogsTool,
  runTypeChecksTool,
  runShellTool,
  createDesktopShortcutTool,
  updateTodosTool,
  setChatSummaryTool,
  webSearchTool,
  webCrawlTool,
  executeSqlTool,
  getSupabaseProjectInfoTool,
  getSupabaseTableSchemaTool,
  addIntegrationTool,
} from "./misc_tools";

export const BUILT_IN_TOOLS: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  searchReplaceTool,
  deleteFileTool,
  renameFileTool,
  listFilesTool,
  grepTool,
  codeSearchTool,
  addDependencyTool,
  readLogsTool,
  runTypeChecksTool,
  runShellTool,
  createDesktopShortcutTool,
  updateTodosTool,
  setChatSummaryTool,
  webSearchTool,
  webCrawlTool,
  executeSqlTool,
  getSupabaseProjectInfoTool,
  getSupabaseTableSchemaTool,
  addIntegrationTool,
];

export function getToolRegistry(options: { readOnly: boolean }): ToolRegistry {
  const out: ToolRegistry = {};
  for (const t of BUILT_IN_TOOLS) {
    if (options.readOnly && !t.readOnly) continue;
    out[t.name] = t;
  }
  return out;
}

export function buildAgentToolSet(
  ctx: ToolContext,
  options: { readOnly: boolean },
  extraTools: ToolRegistry = {},
): Record<string, Tool> {
  const registry: ToolRegistry = { ...getToolRegistry(options), ...extraTools };
  const out: Record<string, Tool> = {};
  for (const [name, def] of Object.entries(registry)) {
    out[name] = aiTool({
      description: def.description,
      parameters: def.schema,
      async execute(rawArgs) {
        if (ctx.signal.aborted) {
          throw new Error("aborted");
        }
        const parsed = def.schema.parse(rawArgs);
        if (def.defaultConsent !== "always") {
          const preview = def.getConsentPreview?.(parsed) ?? null;
          const ok = await ctx.requireConsent({
            toolName: def.name,
            toolDescription: def.description,
            preview,
            defaultConsent: def.defaultConsent,
          });
          if (!ok) {
            throw new Error(`User denied permission for ${def.name}`);
          }
        }
        return def.execute(parsed, ctx);
      },
    });
  }
  return out;
}

export type { ToolDefinition, ToolRegistry, ToolContext } from "./types";
