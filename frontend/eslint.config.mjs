import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

const config = [
  ...next,
  ...ts,
  {
    rules: {
      // `const { drop: _, ...rest } = obj` is how fields get dropped here; the underscore says so.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  { ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts", "src/lib/openapi.ts"] },
];

export default config;
