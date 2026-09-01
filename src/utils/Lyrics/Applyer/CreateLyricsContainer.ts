import { QueueForceScroll } from "../../Scrolling/ScrollToActiveLine.ts";
import { ScrollSimplebar } from "../../Scrolling/Simplebar/ScrollSimplebar.ts";
import { destroyLyricsVirtualizer } from "../LyricsVirtualizer.ts";

type LyricsContainerReturnObject = {
  Container: HTMLElement;
  ResizeListener: ResizeObserver;
  Append: (AppendTo: HTMLElement) => void;
  Remove: () => void;
  Resize: () => void;
};

const LyricsContainerInstances = new Map<number, LyricsContainerReturnObject>();

let lastMapIndex = -1;

const CreateLyricsContainer = (): LyricsContainerReturnObject => {
  const Container = document.createElement("div");
  Container.classList.add("SpicyLyricsScrollContainer");

  lastMapIndex += 1;
  const currentIndex = lastMapIndex;

  // Coalesce to one pass per frame. Each ResizeObserver callback used to queue
  // its own rAF, so a burst (or anything that resizes the container every frame,
  // like the NPV card's open/close morph) stacked several SimpleBar
  // recalculate() calls — each a forced layout — onto the same frame.
  let resizeRAF: number | null = null;

  const Resize = () => {
    if (resizeRAF !== null) return;
    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = null;
      QueueForceScroll();
      ScrollSimplebar?.recalculate();
    });
  };

  const ResizeListener = new ResizeObserver(() => {
    Resize();
  });

  const Remove = () => {
    if (resizeRAF !== null) {
      cancelAnimationFrame(resizeRAF);
      resizeRAF = null;
    }
    ResizeListener.unobserve(Container.parentElement as HTMLElement);
    ResizeListener.disconnect();
    Container.remove();
    LyricsContainerInstances.delete(currentIndex);
  };

  const ReturnObject = {
    Container,
    ResizeListener,
    Append: (AppendTo: HTMLElement) => {
      AppendTo.appendChild(Container);
      ResizeListener.observe(Container.parentElement as HTMLElement);
    },
    Remove,
    Resize,
  };

  LyricsContainerInstances.set(currentIndex, ReturnObject);

  return ReturnObject;
};

const GetCurrentLyricsContainerInstance = (): LyricsContainerReturnObject | undefined => {
  if (lastMapIndex === -1) {
    return undefined;
  }
  return LyricsContainerInstances.get(lastMapIndex);
};

const DestroyAllLyricsContainers = () => {
  destroyLyricsVirtualizer();
  LyricsContainerInstances.forEach((Instance) => {
    Instance.Remove();
  });
  LyricsContainerInstances.clear();
  lastMapIndex = -1;
};

export { CreateLyricsContainer, DestroyAllLyricsContainers, GetCurrentLyricsContainerInstance };
