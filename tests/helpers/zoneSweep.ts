import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
// esbuild is the TypeScript transformer Vite (a devDependency) already uses.
import { build } from "esbuild";
import { ZONE_SWEEP_MARKER, type SweepZone, type ZoneSweepPayload } from "./invariance";

// Runs the domain in other timezones. Vitest pins TZ=UTC for every spec
// (vitest.config.ts sets process.env.TZ and test.env.TZ, tests/setup.ts
// re-sets it), and assigning process.env.TZ inside a test is not a reliable
// way to change zone: Node ignores the assignment in worker threads, and
// Dates built at import time (fixtures) keep the instants of the zone they
// were built in. So each zone gets its own Node process, whose environment is
// set before it starts.
//
// The child entry (./zoneSweepChild.ts: domain + fixtures + projection) is
// bundled in memory with esbuild, which resolves "@/..." through
// tsconfig.json's paths as Vite's alias does, and fed to `node` on stdin.
// Nothing is written to disk and no Vite or Vitest config is loaded in the
// child, so nothing in it can pin the zone back to UTC.

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CHILD_ENTRY = fileURLToPath(new URL("./zoneSweepChild.ts", import.meta.url));
const CHILD_TIMEOUT_MS = 60_000;

async function bundleChild(): Promise<string> {
  const result = await build({
    entryPoints: [CHILD_ENTRY],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    tsconfig: path.join(REPO_ROOT, "tsconfig.json"),
    absWorkingDir: REPO_ROOT,
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

function runChild(code: string, zone: SweepZone): Promise<ZoneSweepPayload> {
  return new Promise((resolve, reject) => {
    // The child's whole environment is its zone: nothing else is inherited
    // (no NODE_OPTIONS, no coverage hooks).
    const child = spawn(process.execPath, ["--input-type=module", "-"], {
      env: { TZ: zone },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: CHILD_TIMEOUT_MS,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.stdin.on("error", () => {}); // a child that dies early is reported by "close"
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      const line = stdout.split("\n").find((l) => l.startsWith(ZONE_SWEEP_MARKER));
      if (exitCode !== 0 || line === undefined) {
        reject(
          new Error(
            `zone-sweep child for ${zone} failed (exit ${exitCode}, signal ${signal}):\n${stderr}${stdout}`,
          ),
        );
        return;
      }
      resolve(JSON.parse(line.slice(ZONE_SWEEP_MARKER.length)) as ZoneSweepPayload);
    });
    child.stdin.end(code);
  });
}

/** Evaluates every scenario (and its translations) once per zone, each zone in its own process. */
export async function runZoneSweep(
  zones: readonly SweepZone[],
): Promise<Record<SweepZone, ZoneSweepPayload>> {
  const code = await bundleChild();
  const payloads = await Promise.all(zones.map((zone) => runChild(code, zone)));
  return Object.fromEntries(zones.map((zone, i) => [zone, payloads[i]])) as Record<
    SweepZone,
    ZoneSweepPayload
  >;
}
