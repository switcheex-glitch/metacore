import { z } from "zod";
import { registerInvokeHandler } from "../ipc_host";
import {
  listVersions,
  getVersionDetail,
  revertToVersion,
  undoLastTurn,
} from "@/main/version_service";

const listSchema = z
  .object({ appSlug: z.string().min(1), limit: z.number().int().min(1).max(200).optional() })
  .strict();

const detailSchema = z
  .object({ appSlug: z.string().min(1), commitHash: z.string().min(4) })
  .strict();

const revertSchema = z
  .object({ appSlug: z.string().min(1), commitHash: z.string().min(4) })
  .strict();

const undoSchema = z.object({ appSlug: z.string().min(1) }).strict();

export function registerVersionHandlers() {
  registerInvokeHandler("version:list", async (_event, payload) => {
    const { appSlug, limit } = listSchema.parse(payload);
    return listVersions(appSlug, limit);
  });

  registerInvokeHandler("version:detail", async (_event, payload) => {
    const { appSlug, commitHash } = detailSchema.parse(payload);
    return getVersionDetail(appSlug, commitHash);
  });

  registerInvokeHandler("version:revert", async (_event, payload) => {
    const { appSlug, commitHash } = revertSchema.parse(payload);
    return revertToVersion(appSlug, commitHash);
  });

  registerInvokeHandler("version:undo", async (_event, payload) => {
    const { appSlug } = undoSchema.parse(payload);
    const result = await undoLastTurn(appSlug);
    return result ?? { commitHash: null, rewoundCount: 0 };
  });
}
