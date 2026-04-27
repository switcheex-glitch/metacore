import { describe, it, expect } from "vitest";
import { parseMetacoreResponse, summarizeTags } from "./response_processor";

describe("parseMetacoreResponse", () => {
  it("extracts metacore-write with path and content", () => {
    const text = `Here you go:

<metacore-write path="src/App.tsx" description="New App">
import React from "react";
export default function App() { return <div>Hi</div>; }
</metacore-write>

Done.`;
    const r = parseMetacoreResponse(text);
    expect(r.tags).toHaveLength(1);
    expect(r.tags[0]).toMatchObject({
      kind: "write",
      path: "src/App.tsx",
      description: "New App",
    });
    expect((r.tags[0] as { content: string }).content).toContain("export default function App");
    expect(r.textWithoutTags).not.toContain("<metacore-write");
    expect(r.textWithoutTags).toContain("Here you go");
    expect(r.textWithoutTags).toContain("Done.");
    expect(r.hasUnclosedWrite).toBe(false);
  });

  it("handles multiple metacore-write blocks", () => {
    const text = `
<metacore-write path="a.ts" description="a">const a = 1;
</metacore-write>
<metacore-write path="b.ts" description="b">const b = 2;
</metacore-write>
`;
    const r = parseMetacoreResponse(text);
    expect(r.tags.filter((t) => t.kind === "write")).toHaveLength(2);
    expect((r.tags[0] as { path: string }).path).toBe("a.ts");
    expect((r.tags[1] as { path: string }).path).toBe("b.ts");
  });

  it("parses self-closing rename and delete", () => {
    const text = `<metacore-rename from="src/old.tsx" to="src/new.tsx" />
<metacore-delete path="src/gone.tsx" />`;
    const r = parseMetacoreResponse(text);
    const rename = r.tags.find((t) => t.kind === "rename");
    const del = r.tags.find((t) => t.kind === "delete");
    expect(rename).toMatchObject({ from: "src/old.tsx", to: "src/new.tsx" });
    expect(del).toMatchObject({ path: "src/gone.tsx" });
  });

  it("parses add-dependency with multiple packages", () => {
    const text = `<metacore-add-dependency packages="zod react-hook-form clsx" />`;
    const r = parseMetacoreResponse(text);
    const dep = r.tags.find((t) => t.kind === "add-dependency");
    expect(dep).toMatchObject({
      kind: "add-dependency",
      packages: ["zod", "react-hook-form", "clsx"],
    });
  });

  it("parses execute-sql block", () => {
    const text = `<metacore-execute-sql description="create users">
CREATE TABLE users (id uuid PRIMARY KEY);
</metacore-execute-sql>`;
    const r = parseMetacoreResponse(text);
    const sql = r.tags.find((t) => t.kind === "execute-sql");
    expect(sql).toMatchObject({ description: "create users" });
    expect((sql as { sql: string }).sql).toContain("CREATE TABLE users");
  });

  it("extracts chat summary into its own field and strips it from text", () => {
    const text = `Adding auth.

<metacore-chat-summary>Add Supabase login</metacore-chat-summary>`;
    const r = parseMetacoreResponse(text);
    expect(r.chatSummary).toBe("Add Supabase login");
    expect(r.textWithoutTags).not.toContain("metacore-chat-summary");
    expect(r.textWithoutTags).toContain("Adding auth.");
  });

  it("flags unclosed metacore-write for retry", () => {
    const text = `<metacore-write path="src/Partial.tsx" description="incomplete">
import React from "react";
// stream cut off here`;
    const r = parseMetacoreResponse(text);
    expect(r.hasUnclosedWrite).toBe(true);
  });

  it("leaves text clean when there are no tags", () => {
    const text = `Just a plain response with no tags.`;
    const r = parseMetacoreResponse(text);
    expect(r.tags).toHaveLength(0);
    expect(r.textWithoutTags).toBe("Just a plain response with no tags.");
    expect(r.chatSummary).toBeNull();
  });

  it("preserves indentation and whitespace inside content", () => {
    const text = `<metacore-write path="x.ts" description="x">
function foo() {
  return {
    nested: true,
  };
}
</metacore-write>`;
    const r = parseMetacoreResponse(text);
    const content = (r.tags[0] as { content: string }).content;
    expect(content).toContain("  return {");
    expect(content).toContain("    nested: true,");
  });

  it("unescapes HTML entities in attributes", () => {
    const text = `<metacore-write path="q.ts" description="a &quot;quoted&quot; desc">x</metacore-write>`;
    const r = parseMetacoreResponse(text);
    expect((r.tags[0] as { description: string }).description).toBe('a "quoted" desc');
  });
});

describe("summarizeTags", () => {
  it("summarizes counts in English", () => {
    expect(
      summarizeTags([
        { kind: "write", path: "a", description: null, content: "" },
        { kind: "write", path: "b", description: null, content: "" },
        { kind: "delete", path: "c" },
      ]),
    ).toBe("2 writes, 1 delete");
  });

  it("returns 'no changes' on empty input", () => {
    expect(summarizeTags([])).toBe("no changes");
  });
});
