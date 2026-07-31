import config from "@lhm/eslint-config";

export default [
  ...config,
  {
    ignores: ["next-env.d.ts", ".next/**", "next.config.ts"],
  },
];
