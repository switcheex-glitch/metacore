import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveInside } from "./file_tools";

describe("resolveInside", () => {
  const root = path.resolve("/tmp/myproj");

  it("resolves simple relative paths inside the project", () => {
    const abs = resolveInside(root, "src/App.tsx");
    expect(abs).toBe(path.resolve(root, "src/App.tsx"));
  });

  it("strips leading ./ prefix", () => {
    const abs = resolveInside(root, "./README.md");
    expect(abs).toBe(path.resolve(root, "README.md"));
  });

  it("normalizes Windows-style backslashes to forward slashes", () => {
    const abs = resolveInside(root, "src\\pages\\home.tsx");
    expect(abs).toBe(path.resolve(root, "src/pages/home.tsx"));
  });

  it("rejects .. escape attempts", () => {
    expect(() => resolveInside(root, "../secrets.txt")).toThrow(/escapes project root/);
  });

  it("rejects deeper .. escape attempts", () => {
    expect(() => resolveInside(root, "src/../../etc/passwd")).toThrow(/escapes project root/);
  });

  it("rejects absolute paths", () => {
    const absOutside = process.platform === "win32" ? "C:\\Windows\\System32" : "/etc/passwd";
    expect(() => resolveInside(root, absOutside)).toThrow(/escapes project root/);
  });

  it("allows nested paths", () => {
    const abs = resolveInside(root, "a/b/c/d.ts");
    expect(abs).toBe(path.resolve(root, "a/b/c/d.ts"));
  });
});
