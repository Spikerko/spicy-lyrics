diff --git a/spice.config.ts b/spice.config.ts
index 7b4f836..509a82b 100644
--- a/spice.config.ts
+++ b/spice.config.ts
@@ -1,5 +1,5 @@
 import { defineConfig } from "@spicemod/creator";
-import { ProjectName, ProjectVersion } from "./tasks/config";
+import { ProjectName, ProjectVersion } from "./project/config";
 
 export default defineConfig({
   name: ProjectName,
diff --git a/src/app.tsx b/src/app.tsx
index aa0eda3..2a8423b 100644
--- a/src/app.tsx
+++ b/src/app.tsx
@@ -54,7 +54,7 @@ import UpdateDialog from "./components/ReactComponents/UpdateDialog.tsx";
 import { IsPIP, OpenPopupLyrics, ClosePopupLyrics } from "./components/Utils/PopupLyrics.ts";
 import ReactDOM from "react-dom/client";
 import { PopupModal } from "./components/Modal.ts";
-import { ProjectVersion } from "../tasks/config.ts";
+import { ProjectVersion } from "../project/config.ts";
 import { runThemeMatcher } from "./utils/themeMatcher.ts";
 
 async function main() {
diff --git a/tasks/config.ts b/tasks/config.ts
deleted file mode 100644
index 621ed29..0000000
--- a/tasks/config.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const ProjectName = "spicy-lyrics";
-export const ProjectVersion = "5.20.0";
\ No newline at end of file
