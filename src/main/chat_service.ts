import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { chats, messages, apps, type Chat, type Message } from "@/db/schema";

export type ChatWithPreview = Chat & {
  lastMessageAt: string | null;
  messageCount: number;
};

export async function getAppIdBySlug(slug: string): Promise<number | null> {
  const db = getDb();
  const rows = await db.select({ id: apps.id }).from(apps).where(eq(apps.slug, slug)).limit(1);
  return rows[0]?.id ?? null;
}

export async function listChatsForApp(appSlug: string): Promise<Chat[]> {
  const db = getDb();
  const appId = await getAppIdBySlug(appSlug);
  if (appId == null) return [];
  return db.select().from(chats).where(eq(chats.appId, appId)).orderBy(desc(chats.createdAt));
}

export async function createChat(appSlug: string, title?: string): Promise<Chat> {
  const db = getDb();
  const appId = await getAppIdBySlug(appSlug);
  if (appId == null) throw new Error(`App not found: ${appSlug}`);
  const inserted = await db
    .insert(chats)
    .values({ appId, title: title?.trim() || "New chat" })
    .returning();
  return inserted[0]!;
}

export async function getOrCreateDefaultChat(appSlug: string): Promise<Chat> {
  const list = await listChatsForApp(appSlug);
  if (list.length > 0) return list[0]!;
  return createChat(appSlug);
}

export async function deleteChat(chatId: number): Promise<void> {
  const db = getDb();
  await db.delete(chats).where(eq(chats.id, chatId));
}

export async function renameChat(chatId: number, title: string): Promise<void> {
  const db = getDb();
  await db.update(chats).set({ title }).where(eq(chats.id, chatId));
}

export async function listMessages(chatId: number): Promise<Message[]> {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

export async function appendMessage(input: {
  chatId: number;
  role: Message["role"];
  content: string;
  commitHash?: string | null;
  aiMessagesJson?: string | null;
  toolCalls?: string | null;
  toolResults?: string | null;
}): Promise<Message> {
  const db = getDb();
  const inserted = await db
    .insert(messages)
    .values({
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      commitHash: input.commitHash ?? null,
      aiMessagesJson: input.aiMessagesJson ?? null,
      toolCalls: input.toolCalls ?? null,
      toolResults: input.toolResults ?? null,
    })
    .returning();
  return inserted[0]!;
}

export async function getChat(chatId: number): Promise<Chat | null> {
  const db = getDb();
  const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  return rows[0] ?? null;
}

export async function getAppForChat(chatId: number) {
  const db = getDb();
  const rows = await db
    .select({ app: apps, chat: chats })
    .from(chats)
    .innerJoin(apps, eq(apps.id, chats.appId))
    .where(eq(chats.id, chatId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateMessageCommit(messageId: number, commitHash: string) {
  const db = getDb();
  await db.update(messages).set({ commitHash }).where(eq(messages.id, messageId));
}

export async function setChatApp(chatId: number, appId: number) {
  const db = getDb();
  await db.update(chats).set({ appId }).where(eq(chats.id, chatId));
}

export async function renameChatIfDefault(chatId: number, title: string) {
  const db = getDb();
  const current = await db
    .select({ title: chats.title })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);
  const existing = current[0]?.title;
  if (!existing || existing === "New chat" || existing === "Новый чат") {
    await db.update(chats).set({ title: title.slice(0, 120) }).where(eq(chats.id, chatId));
  }
}

export async function deleteMessage(chatId: number, messageId: number) {
  const db = getDb();
  await db.delete(messages).where(and(eq(messages.chatId, chatId), eq(messages.id, messageId)));
}
