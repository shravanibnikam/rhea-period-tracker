import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

// Flat ESLint config (M0.1 / RHEA-002).
// The `import/no-restricted-paths` rule is wired but constrains nothing yet;
// the layer-boundary zones (§3.1) are added as the kernel/domain/data layers
// land in Phase 1 (RHEA-022 onward). Stylistic/type-looseness rules are kept at
// `warn` so the current tree lints clean without a mass rewrite.
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "supabase/**",
      "tests/**",
      "**/*.config.{ts,js}",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
        node: true,
      },
    },
    rules: {
      // Layer boundaries (§3.1), grown as Phase-1 layers land (RHEA-022+).
      // kernel/ is the zero-dependency leaf: it may not import ANY other layer.
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/kernel",
              from: "./src",
              except: ["./kernel"],
              message: "kernel/ is the zero-dependency leaf; it imports nothing outside itself.",
            },
            {
              target: "./src/domain",
              from: "./src",
              except: ["./domain", "./kernel"],
              message: "domain/ is pure: it may import only kernel/ (no I/O, no framework, no crypto).",
            },
            {
              target: "./src/crypto",
              from: "./src",
              except: ["./crypto", "./kernel"],
              message:
                "crypto/ may import only kernel/ (+ libsodium). Audited-lib-only; testable with KATs in isolation (ADR-0005).",
            },
            {
              target: "./src/data",
              from: "./src",
              except: ["./data", "./domain", "./kernel", "./crypto"],
              message:
                "data/ may import only kernel/, domain/, and crypto/ (envelope/AEAD types) — no app, no sync, no views.",
            },
            {
              target: "./src/sync",
              from: "./src",
              except: ["./sync", "./data", "./domain", "./kernel", "./crypto"],
              message:
                "sync/ may import only kernel/, domain/, data/, crypto/ (never app/views; wire access only via Transport).",
            },
          ],
        },
      ],
      // Kept as warnings for now; tightened as the codebase is refactored.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
