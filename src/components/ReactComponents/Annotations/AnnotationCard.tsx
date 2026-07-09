import { useStore } from "@nanostores/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageContainer } from "../../Pages/PageView.ts";
import { Icons } from "../../Styling/Icons.ts";
import {
  $annotationOpen,
  $currentAnnotations,
} from "../../../utils/Annotations/AnnotationState.ts";

function portalTarget(): HTMLElement {
  return PageContainer ?? document.body;
}

export default function AnnotationCard() {
  const open = useStore($annotationOpen);
  const annotations = useStore($currentAnnotations);
  const cardRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const lineAnnotations = useMemo(() => {
    if (!open) return [];
    return annotations.filter((item) => item.anchor.lineIndexStart === open.lineIndex);
  }, [annotations, open]);

  useEffect(() => {
    if (!open) return;
    const current = lineAnnotations.findIndex((item) => item.id === open.annotation.id);
    setIndex(Math.max(0, current));
  }, [lineAnnotations, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (cardRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.(".spicy-annotation-marker")) return;
      $annotationOpen.set(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") $annotationOpen.set(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    queueMicrotask(() => cardRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!open) return null;

  const current = lineAnnotations[index] ?? open.annotation;
  const rect = open.anchorRect;
  const top = rect.bottom + 12;
  const left = Math.min(Math.max(rect.left - 180, 16), window.innerWidth - 376);

  return createPortal(
    <div
      ref={cardRef}
      className="spicy-annotation-card"
      role="dialog"
      aria-modal="false"
      tabIndex={-1}
      style={{ top, left }}
    >
      <div className="spicy-annotation-card__header">
        <div>
          <p className="spicy-annotation-card__eyebrow">Genius annotation</p>
          <p className="spicy-annotation-card__fragment">{current.fragment}</p>
        </div>
        <button
          type="button"
          className="spicy-annotation-card__close"
          aria-label="Close annotation"
          onClick={() => $annotationOpen.set(null)}
        >
          {Icons.Close && <span dangerouslySetInnerHTML={{ __html: Icons.Close }} />}
        </button>
      </div>
      <p className="spicy-annotation-card__body">{current.text}</p>
      <div className="spicy-annotation-card__footer">
        {lineAnnotations.length > 1 && (
          <div className="spicy-annotation-card__pager">
            <button
              type="button"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
            >
              Prev
            </button>
            <span>
              {index + 1}/{lineAnnotations.length}
            </span>
            <button
              type="button"
              onClick={() => setIndex((value) => Math.min(lineAnnotations.length - 1, value + 1))}
              disabled={index >= lineAnnotations.length - 1}
            >
              Next
            </button>
          </div>
        )}
        {current.url && (
          <button
            type="button"
            className="spicy-annotation-card__link"
            onClick={() => window.open(current.url, "_blank")}
          >
            <span>View on Genius</span>
            <span
              dangerouslySetInnerHTML={{ __html: Icons.ArrowUpRight.replaceAll("{SIZE}", "14") }}
            />
          </button>
        )}
      </div>
    </div>,
    portalTarget()
  );
}
