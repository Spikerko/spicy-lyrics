import { Bundle } from "@spicetify/bundler/cli";
import { ProjectName } from "./config.ts";

Bundle({
  Type: "Development",
  Name: ProjectName,
  EntrypointFile: "./src/app.tsx",
  CustomBuildOptions: {
    skipGlobalReplacementRules: true,
    exposeComponentApis: true,
    exposeComponentApisMutation: true,
  }
});
