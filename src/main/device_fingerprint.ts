import { createHash } from "node:crypto";
import os from "node:os";

let cached: string | null = null;

/**
 * Stable per-machine fingerprint. Combines hostname, platform/arch, CPU model,
 * total memory (rounded), and the first non-loopback/non-virtual MAC address.
 * Hashed with SHA-256 so the raw values never leave the machine.
 *
 * Not tamper-proof — VM clones with the same MAC will produce the same
 * fingerprint. But it meaningfully prevents casual sharing and scales better
 * than the alternatives (no native deps, no Windows API calls).
 */
export function getDeviceFingerprint(): string {
  if (cached) return cached;

  const parts: string[] = [
    os.platform(),
    os.arch(),
    os.hostname(),
    os.cpus()?.[0]?.model ?? "",
    String(Math.round(os.totalmem() / (1024 * 1024 * 1024))), // rounded GB
  ];

  const ifaces = os.networkInterfaces();
  const macs: string[] = [];
  for (const name of Object.keys(ifaces).sort()) {
    for (const addr of ifaces[name] ?? []) {
      if (addr.internal) continue;
      if (!addr.mac || addr.mac === "00:00:00:00:00:00") continue;
      if (/virtualbox|vmware|hyper-v|vethernet/i.test(name)) continue;
      macs.push(addr.mac);
    }
  }
  parts.push(macs.sort().join(","));

  cached = createHash("sha256").update(parts.join("|")).digest("hex");
  return cached;
}
