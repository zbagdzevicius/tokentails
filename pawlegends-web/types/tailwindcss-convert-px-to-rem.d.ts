// The package ships CommonJS without type declarations.
declare module "tailwindcss-convert-px-to-rem" {
  import type { Config } from "tailwindcss";

  const plugin: NonNullable<Config["plugins"]>[number];
  export default plugin;
}
