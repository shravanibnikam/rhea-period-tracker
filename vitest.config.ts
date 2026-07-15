import { defineConfig } from "vitest/config";
import path from "path";

// Pin the timezone so date-derived golden-master snapshots are portable across
// machines/CI. The domain date logic is local-time based (utils.parseDate), so
// without this, cycle-day math drifts across DST boundaries. Set before workers
// spawn; also reasserted in tests/setup.ts.
process.env.TZ = "UTC";

// Vitest configuration for the Rhea test harness (M0.1).
// - `@` alias mirrors tsconfig/vite so tests import the same way as app code.
// - Default environment is `node` (the domain layer is pure and framework-free);
//   UI/DOM tests opt in per-file with `// @vitest-environment jsdom`.
// - Coverage thresholds start at 0 and are ratcheted up as milestones land
//   (the domain/crypto layers move to high coverage in Phase 1/2).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    env: { TZ: "UTC" },
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.spec.ts", "tests/**/*.spec.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**"],
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
    },
  },
});
