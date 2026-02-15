import { Bundle } from "@spicetify/bundler/cli";
import { ProjectName } from "./config.ts";

const version = Deno.args[0];
if (!version) {
  console.error("Usage: deno task build <version>");
  Deno.exit(1);
}

await Bundle({
  Type: "Release",
  Name: ProjectName,
  Version: version,
  EntrypointFile: "./src/app.tsx",
  CustomBuildOptions: {
    skipGlobalReplacementRules: true,
  }
});

await Deno.writeTextFile("./dist/version", version);
