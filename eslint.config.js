// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions are Deno and type-checked by `supabase functions serve`, not by the app toolchain.
    ignores: ["dist/*", "supabase/functions/**"],
  }
]);
