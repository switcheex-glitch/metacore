import { z } from "zod";
import { registerInvokeHandler } from "../ipc_host";
import { resolveConsent } from "@/main/consent_service";

const respondSchema = z
  .object({
    id: z.string().min(1),
    response: z.enum(["accept-once", "accept-always", "decline"]),
    streamId: z.string().optional(),
  })
  .strict();

export function registerConsentHandlers() {
  registerInvokeHandler("consent:respond", (_event, payload) => {
    const { id, response, streamId } = respondSchema.parse(payload);
    resolveConsent(id, response, streamId ?? null);
    return { ok: true };
  });
}
