import nextConfig from "eslint-config-next";

// eslint-config-next 16+ ships a native ESLint 9 flat config array (bundling
// core-web-vitals + typescript-eslint rules already) — no FlatCompat/legacy
// shim needed. See docs/DECISIONS.md.
const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["workers/**", ".agents/**", ".claude/**"],
  },
];

export default eslintConfig;
