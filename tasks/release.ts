import { Bundle } from "@spicetify/bundler/cli";
import { ProjectName, ProjectVersion } from "./config.ts";

Bundle({
  Type: "Release",
  Name: ProjectName,
  Version: ProjectVersion,
  EntrypointFile: "./src/app.tsx",
  CustomBuildOptions: {
    skipGlobalReplacementRules: true,
  }
});