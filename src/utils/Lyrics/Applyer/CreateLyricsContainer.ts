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

  const Resize = () => {
    requestAnimationFrame(() => {
      QueueForceScroll();
      ScrollSimplebar?.recalculate();
    });
  };

  const ResizeListener = new ResizeObserver(() => {
    Resize();
  });

  const Remove = () => {
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
