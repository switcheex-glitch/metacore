import { describe, it, expect, vi, beforeEach } from "vitest";

const sent: Array<{ channel: string; payload: unknown }> = [];
const settingsStore: {
  autoApprovedMcpTools: Record<string, true>;
} = { autoApprovedMcpTools: {} };

vi.mock("@/ipc/ipc_host", () => ({
  safeSend: (_wc: unknown, channel: string, payload: unknown) => {
    sent.push({ channel, payload });
  },
}));

vi.mock("./settings", () => ({
  getSettings: () => ({ ...settingsStore }),
  updateSettings: (patch: Partial<typeof settingsStore>) => {
    if (patch.autoApprovedMcpTools) {
      settingsStore.autoApprovedMcpTools = { ...patch.autoApprovedMcpTools };
    }
  },
}));

import {
  requestConsent,
  resolveConsent,
  declineAllPending,
  clearSessionAccepted,
} from "./consent_service";

const fakeWc = {} as unknown as Parameters<typeof requestConsent>[0];

beforeEach(() => {
  sent.length = 0;
  settingsStore.autoApprovedMcpTools = {};
});

describe("consent_service", () => {
  it("sends consent:request and resolves true on accept-once", async () => {
    const p = requestConsent(fakeWc, {
      streamId: "s1",
      toolName: "write_file",
      toolDescription: "Write a file",
      preview: { summary: "src/App.tsx" },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.channel).toBe("consent:request");
    const payload = sent[0]!.payload as { id: string; toolName: string };
    expect(payload.toolName).toBe("write_file");

    resolveConsent(payload.id, "accept-once", "s1");
    await expect(p).resolves.toBe(true);
  });

  it("resolves false on decline", async () => {
    const p = requestConsent(fakeWc, {
      streamId: "s2",
      toolName: "edit_file",
      toolDescription: "Edit a file",
      preview: null,
    });
    const payload = sent[0]!.payload as { id: string };
    resolveConsent(payload.id, "decline", "s2");
    await expect(p).resolves.toBe(false);
  });

  it("accept-always persists to settings and auto-approves future calls in same stream", async () => {
    const p1 = requestConsent(fakeWc, {
      streamId: "s3",
      toolName: "add_dependency",
      toolDescription: "Add a dep",
      preview: null,
    });
    const payload = sent[0]!.payload as { id: string };
    resolveConsent(payload.id, "accept-always", "s3");
    await expect(p1).resolves.toBe(true);
    expect(settingsStore.autoApprovedMcpTools.add_dependency).toBe(true);

    sent.length = 0;
    const p2 = requestConsent(fakeWc, {
      streamId: "s3",
      toolName: "add_dependency",
      toolDescription: "Add a dep",
      preview: null,
    });
    await expect(p2).resolves.toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("auto-approves when tool already in persisted settings", async () => {
    settingsStore.autoApprovedMcpTools.delete_file = true;
    const p = requestConsent(fakeWc, {
      streamId: "s4",
      toolName: "delete_file",
      toolDescription: "",
      preview: null,
    });
    await expect(p).resolves.toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("declineAllPending resolves every pending request to false", async () => {
    const p1 = requestConsent(fakeWc, {
      streamId: "s5",
      toolName: "write_file",
      toolDescription: "",
      preview: null,
    });
    const p2 = requestConsent(fakeWc, {
      streamId: "s5",
      toolName: "edit_file",
      toolDescription: "",
      preview: null,
    });
    declineAllPending("abort");
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(false);
  });

  it("clearSessionAccepted removes stream-scoped accepts so new stream must prompt again", async () => {
    const p1 = requestConsent(fakeWc, {
      streamId: "s6",
      toolName: "run_tests",
      toolDescription: "",
      preview: null,
    });
    const id1 = (sent[0]!.payload as { id: string }).id;
    resolveConsent(id1, "accept-once", "s6");
    await p1;

    clearSessionAccepted("s6");
    sent.length = 0;

    const p2 = requestConsent(fakeWc, {
      streamId: "s6",
      toolName: "run_tests",
      toolDescription: "",
      preview: null,
    });
    expect(sent).toHaveLength(1);
    const id2 = (sent[0]!.payload as { id: string }).id;
    resolveConsent(id2, "decline", "s6");
    await expect(p2).resolves.toBe(false);
  });
});
