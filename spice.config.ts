import { defineConfig } from "@spicemod/creator";
import { ProjectName, ProjectVersion } from "./project/config";

export default defineConfig({
  name: ProjectName,
  version: ProjectVersion,
  framework: "react",
  linter: "oxlint",
  template: "extension",
  packageManager: "bun",
  cssId: "slstyles",
  esbuildOptions: {
    legalComments: "inline",
  },
});