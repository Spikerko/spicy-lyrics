import { resolve, join } from "https://deno.land/std/path/mod.ts";
import { ensureDir } from "https://deno.land/std/fs/mod.ts";

import { Bundle } from "@spicetify/bundler/cli";
import { ProjectName } from "./config.ts";

const version = Deno.args[0];
if (!version) {
  console.error("Usage: deno task build <version> [outputDir]");
  Deno.exit(1);
}

const targetDir = Deno.args[1];
const defaultDist = resolve("./dist");
const outputFile = `${ProjectName}@${version}.mjs`;

// ReleaseBundle calls Deno.exit(0) when done and isn't properly awaited,
// so we intercept the exit to write the version file and optionally copy output.
const originalExit = Deno.exit;
Deno.exit = (async (code?: number) => {
  try {
    await Deno.writeTextFile(join(defaultDist, "version"), version);

    if (targetDir) {
      const dest = resolve(targetDir);
      await ensureDir(dest);
      await Deno.copyFile(join(defaultDist, outputFile), join(dest, outputFile));
      await Deno.writeTextFile(join(dest, "version"), version);
      console.log(`Copied build to ${dest}`);
    }
  } catch (err) {
    console.error("Error copying build output:", err);
  }
  originalExit(code);
}) as typeof Deno.exit;

// Bundle builds to ./dist by default. ReleaseBundle will call Deno.exit(0) when done.
Bundle({
  Type: "Release",
  Name: ProjectName,
  Version: version,
  EntrypointFile: "./src/app.tsx",
  CustomBuildOptions: {
    skipGlobalReplacementRules: true,
  }
});
