import { defineConfig } from "vitest/config";

export default defineConfig({
  // The React binding (src/react, tests/react) uses the automatic JSX runtime —
  // tell esbuild to transform JSX so test files don't need an explicit
  // `import React`. Node-environment core tests are unaffected.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/deno/**"],
  },
});
