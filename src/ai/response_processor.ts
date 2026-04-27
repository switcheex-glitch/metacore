export type MetacoreWriteTag = {
  kind: "write";
  path: string;
  description: string | null;
  content: string;
};

export type MetacoreRenameTag = {
  kind: "rename";
  from: string;
  to: string;
};

export type MetacoreDeleteTag = {
  kind: "delete";
  path: string;
};

export type MetacoreAddDependencyTag = {
  kind: "add-dependency";
  packages: string[];
};

export type MetacoreExecuteSqlTag = {
  kind: "execute-sql";
  description: string | null;
  sql: string;
};

export type MetacoreSearchReplaceTag = {
  kind: "search-replace";
  path: string;
  search: string;
  replace: string;
};

export type MetacoreCommandTag = {
  kind: "command";
  command: "rebuild" | "restart";
};

export type MetacoreCreateAppTag = {
  kind: "create-app";
  name: string;
  description: string | null;
};

export type MetacoreTag =
  | MetacoreWriteTag
  | MetacoreRenameTag
  | MetacoreDeleteTag
  | MetacoreAddDependencyTag
  | MetacoreExecuteSqlTag
  | MetacoreSearchReplaceTag
  | MetacoreCommandTag
  | MetacoreCreateAppTag;

export type ParsedMetacoreResponse = {
  tags: MetacoreTag[];
  chatSummary: string | null;
  textWithoutTags: string;
  hasUnclosedWrite: boolean;
};

const TAG_NAMESPACES = ["metacore"] as const;

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out[m[1]!] = unescapeAttr(m[2]!);
  }
  return out;
}

function findBlock(
  text: string,
  tagName: string,
  cursor: number,
): { start: number; attrsEnd: number; close: number; attrs: string } | null {
  const openRe = new RegExp(`<${tagName}(\\s[^>]*)?>`, "g");
  openRe.lastIndex = cursor;
  const open = openRe.exec(text);
  if (!open) return null;
  const attrsStr = open[1] ?? "";
  const attrsEnd = open.index + open[0].length;
  const closeTag = `</${tagName}>`;
  const close = text.indexOf(closeTag, attrsEnd);
  if (close === -1) {
    return { start: open.index, attrsEnd, close: -1, attrs: attrsStr };
  }
  return { start: open.index, attrsEnd, close, attrs: attrsStr };
}

function collectBlockTag<T>(
  text: string,
  tagName: string,
  build: (attrs: Record<string, string>, body: string) => T | null,
): { tags: T[]; spans: Array<[number, number]>; hasUnclosed: boolean } {
  const tags: T[] = [];
  const spans: Array<[number, number]> = [];
  let cursor = 0;
  let hasUnclosed = false;
  while (cursor < text.length) {
    const block = findBlock(text, tagName, cursor);
    if (!block) break;
    if (block.close === -1) {
      hasUnclosed = true;
      spans.push([block.start, text.length]);
      break;
    }
    const attrs = parseAttrs(block.attrs);
    const body = text.slice(block.attrsEnd, block.close);
    const built = build(attrs, body);
    if (built) tags.push(built);
    spans.push([block.start, block.close + `</${tagName}>`.length]);
    cursor = block.close + `</${tagName}>`.length;
  }
  return { tags, spans, hasUnclosed };
}

function collectVoidTag<T>(
  text: string,
  tagName: string,
  build: (attrs: Record<string, string>) => T | null,
): { tags: T[]; spans: Array<[number, number]> } {
  const tags: T[] = [];
  const spans: Array<[number, number]> = [];
  const re = new RegExp(`<${tagName}(\\s[^>]*?)?\\s*/?\\s*>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const attrs = parseAttrs(m[1] ?? "");
    const built = build(attrs);
    if (built) tags.push(built);
    spans.push([m.index, m.index + m[0].length]);
  }
  return { tags, spans };
}

function collectForAllNamespaces<T>(
  text: string,
  suffix: string,
  collect: (
    text: string,
    tagName: string,
  ) => { tags: T[]; spans: Array<[number, number]>; hasUnclosed?: boolean },
): { tags: T[]; spans: Array<[number, number]>; hasUnclosed: boolean } {
  const tags: T[] = [];
  const spans: Array<[number, number]> = [];
  let hasUnclosed = false;
  for (const ns of TAG_NAMESPACES) {
    const out = collect(text, `${ns}-${suffix}`);
    tags.push(...out.tags);
    spans.push(...out.spans);
    if (out.hasUnclosed) hasUnclosed = true;
  }
  return { tags, spans, hasUnclosed };
}

function parseSearchReplaceBody(body: string): { search: string; replace: string } | null {
  const re = /<<<<<<<\s*SEARCH\s*\r?\n([\s\S]*?)\r?\n=======\s*\r?\n([\s\S]*?)\r?\n>>>>>>>\s*REPLACE/;
  const m = re.exec(body);
  if (!m) return null;
  return { search: m[1] ?? "", replace: m[2] ?? "" };
}

export function parseMetacoreResponse(text: string): ParsedMetacoreResponse {
  const allSpans: Array<[number, number]> = [];

  const writes = collectForAllNamespaces<MetacoreWriteTag>(text, "write", (t, name) =>
    collectBlockTag<MetacoreWriteTag>(t, name, (attrs, body) => {
      const p = attrs.path;
      if (!p) return null;
      const content = body.replace(/^\r?\n/, "").replace(/\r?\n\s*$/, "");
      return {
        kind: "write",
        path: p,
        description: attrs.description ?? null,
        content,
      };
    }),
  );
  allSpans.push(...writes.spans);

  const execSql = collectForAllNamespaces<MetacoreExecuteSqlTag>(text, "execute-sql", (t, name) =>
    collectBlockTag<MetacoreExecuteSqlTag>(t, name, (attrs, body) => ({
      kind: "execute-sql",
      description: attrs.description ?? null,
      sql: body.trim(),
    })),
  );
  allSpans.push(...execSql.spans);

  const searchReplace = collectForAllNamespaces<MetacoreSearchReplaceTag>(
    text,
    "search-replace",
    (t, name) =>
      collectBlockTag<MetacoreSearchReplaceTag>(t, name, (attrs, body) => {
        const p = attrs.path;
        if (!p) return null;
        const parsed = parseSearchReplaceBody(body);
        if (!parsed) return null;
        return { kind: "search-replace", path: p, search: parsed.search, replace: parsed.replace };
      }),
  );
  allSpans.push(...searchReplace.spans);

  // Strip chat-summary wrappers from the visible text, but we only need one summary value.
  const summaryBlock = collectForAllNamespaces<null>(text, "chat-summary", (t, name) =>
    collectBlockTag<null>(t, name, () => null),
  );
  allSpans.push(...summaryBlock.spans);
  const summaryMatch = /<metacore-chat-summary(?:\s[^>]*)?>([\s\S]*?)<\/metacore-chat-summary>/.exec(
    text,
  );
  const chatSummary = summaryMatch ? summaryMatch[1]!.trim() : null;

  const renames = collectForAllNamespaces<MetacoreRenameTag>(text, "rename", (t, name) =>
    collectVoidTag<MetacoreRenameTag>(t, name, (attrs) => {
      if (!attrs.from || !attrs.to) return null;
      return { kind: "rename", from: attrs.from, to: attrs.to };
    }),
  );
  allSpans.push(...renames.spans);

  const deletes = collectForAllNamespaces<MetacoreDeleteTag>(text, "delete", (t, name) =>
    collectVoidTag<MetacoreDeleteTag>(t, name, (attrs) => {
      if (!attrs.path) return null;
      return { kind: "delete", path: attrs.path };
    }),
  );
  allSpans.push(...deletes.spans);

  const deps = collectForAllNamespaces<MetacoreAddDependencyTag>(
    text,
    "add-dependency",
    (t, name) =>
      collectVoidTag<MetacoreAddDependencyTag>(t, name, (attrs) => {
        if (!attrs.packages) return null;
        const list = attrs.packages.split(/\s+/).map((s) => s.trim()).filter(Boolean);
        if (list.length === 0) return null;
        return { kind: "add-dependency", packages: list };
      }),
  );
  allSpans.push(...deps.spans);

  const commands = collectForAllNamespaces<MetacoreCommandTag>(text, "command", (t, name) =>
    collectVoidTag<MetacoreCommandTag>(t, name, (attrs) => {
      const kind = attrs.type;
      if (kind !== "rebuild" && kind !== "restart") return null;
      return { kind: "command", command: kind };
    }),
  );
  allSpans.push(...commands.spans);

  const createApps = collectForAllNamespaces<MetacoreCreateAppTag>(text, "create-app", (t, name) =>
    collectVoidTag<MetacoreCreateAppTag>(t, name, (attrs) => {
      const projectName = attrs.name?.trim();
      if (!projectName) return null;
      return {
        kind: "create-app",
        name: projectName,
        description: attrs.description?.trim() || null,
      };
    }),
  );
  allSpans.push(...createApps.spans);

  allSpans.sort((a, b) => a[0] - b[0]);
  let textWithoutTags = "";
  let pos = 0;
  for (const [s, e] of allSpans) {
    if (s >= pos) {
      textWithoutTags += text.slice(pos, s);
      pos = e;
    } else if (e > pos) {
      pos = e;
    }
  }
  textWithoutTags += text.slice(pos);
  textWithoutTags = textWithoutTags.replace(/\n{3,}/g, "\n\n").trim();

  const tags: MetacoreTag[] = [
    ...createApps.tags,
    ...writes.tags,
    ...searchReplace.tags,
    ...renames.tags,
    ...deletes.tags,
    ...deps.tags,
    ...commands.tags,
    ...execSql.tags,
  ];

  return {
    tags,
    chatSummary,
    textWithoutTags,
    hasUnclosedWrite: writes.hasUnclosed,
  };
}

export function summarizeTags(tags: MetacoreTag[]): string {
  if (tags.length === 0) return "no changes";
  const counts: Record<string, number> = {};
  for (const t of tags) counts[t.kind] = (counts[t.kind] ?? 0) + 1;
  const parts: string[] = [];
  if (counts.write) parts.push(`${counts.write} write${counts.write === 1 ? "" : "s"}`);
  if (counts["search-replace"])
    parts.push(`${counts["search-replace"]} patch${counts["search-replace"] === 1 ? "" : "es"}`);
  if (counts.rename) parts.push(`${counts.rename} rename${counts.rename === 1 ? "" : "s"}`);
  if (counts.delete) parts.push(`${counts.delete} delete${counts.delete === 1 ? "" : "s"}`);
  if (counts["add-dependency"]) parts.push(`${counts["add-dependency"]} add-dependency`);
  if (counts.command) parts.push(`${counts.command} command`);
  if (counts["create-app"])
    parts.push(`${counts["create-app"]} new project${counts["create-app"] === 1 ? "" : "s"}`);
  if (counts["execute-sql"]) parts.push(`${counts["execute-sql"]} SQL`);
  return parts.join(", ");
}
