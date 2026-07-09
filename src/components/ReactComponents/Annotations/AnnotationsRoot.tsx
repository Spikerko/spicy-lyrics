import { useStore } from "@nanostores/react";
import React from "react";
import { isSpicySidebarMode } from "../../Utils/SidebarLyrics.ts";
import { $annotationOpen } from "../../../utils/Annotations/AnnotationState.ts";
import AnnotationCard from "./AnnotationCard.tsx";
import AnnotationDrawer from "./AnnotationDrawer.tsx";

export default function AnnotationsRoot() {
  const open = useStore($annotationOpen);
  if (!open) return null;
  return isSpicySidebarMode ? <AnnotationDrawer /> : <AnnotationCard />;
}
