import { useStore } from "@nanostores/react";
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PageContainer } from "../../Pages/PageView.ts";
import { Icons } from "../../Styling/Icons.ts";
import {
  $annotationOpen,
  $currentAnnotations,
} from "../../../utils/Annotations/AnnotationState.ts";

export default function AnnotationDrawer() {
  const open = useStore($annotationOpen);
  const annotations = useStore($currentAnnotations);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") $annotationOpen.set(null);
    };
    document.addEventListener("keydown", onKeyDown);
    queueMicrotask(() => activeRef.current?.scrollIntoView({ block: "center" }));
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <aside className="spicy-annotation-drawer" role="dialog" aria-modal="false">
      <div className="spicy-annotation-drawer__header">
        <div>
          <p className="spicy-annotation-card__eyebrow">Genius</p>
          <h2>Annotations</h2>
        </div>
        <button
          type="button"
          className="spicy-annotation-card__close"
          aria-label="Close annotations"
          onClick={() => $annotationOpen.set(null)}
        >
          <span dangerouslySetInnerHTML={{ __html: Icons.Close }} />
        </button>
      </div>
      <div className="spicy-annotation-drawer__list">
        {annotations.map((annotation) => {
          const active = annotation.id === open.annotation.id;
          return (
            <button
              key={annotation.id}
              ref={active ? activeRef : undefined}
              type="button"
              className={`spicy-annotation-drawer__item${active ? " spicy-annotation-drawer__item--active" : ""}`}
              onClick={() =>
                $annotationOpen.set({
                  annotation,
                  lineIndex: annotation.anchor.lineIndexStart,
                  anchorRect: open.anchorRect,
                })
              }
            >
              <span>{annotation.fragment}</span>
              <small>{annotation.text}</small>
            </button>
          );
        })}
      </div>
    </aside>,
    PageContainer ?? document.body
  );
}
