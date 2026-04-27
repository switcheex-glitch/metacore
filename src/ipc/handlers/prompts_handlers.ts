import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { registerInvokeHandler } from "../ipc_host";
import { getDb } from "@/db";
import { prompts } from "@/db/schema";
import type { Prompt } from "@/db/schema";

const upsertSchema = z
  .object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(120),
    body: z.string().min(1).max(20_000),
    tags: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

const removeSchema = z.object({ id: z.number().int().positive() }).strict();

export function registerPromptsHandlers() {
  registerInvokeHandler("prompts:list", async (): Promise<Prompt[]> => {
    const db = getDb();
    return db.select().from(prompts).orderBy(desc(prompts.updatedAt));
  });

  registerInvokeHandler("prompts:upsert", async (_event, payload) => {
    const input = upsertSchema.parse(payload);
    const db = getDb();
    const tags = input.tags?.trim() ? input.tags.trim() : null;
    if (input.id) {
      const [row] = await db
        .update(prompts)
        .set({
          title: input.title,
          body: input.body,
          tags,
          updatedAt: sql`(current_timestamp)`,
        })
        .where(eq(prompts.id, input.id))
        .returning();
      if (!row) throw new Error("prompt_not_found");
      return row;
    }
    const [row] = await db
      .insert(prompts)
      .values({ title: input.title, body: input.body, tags })
      .returning();
    return row!;
  });

  registerInvokeHandler("prompts:remove", async (_event, payload) => {
    const { id } = removeSchema.parse(payload);
    const db = getDb();
    await db.delete(prompts).where(eq(prompts.id, id));
    return { ok: true };
  });
}
