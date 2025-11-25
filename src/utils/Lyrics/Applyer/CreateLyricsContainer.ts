import { GetContainerHeight } from "../../Addons.ts";
import { QueueForceScroll, SetWaitingForHeight } from "../../Scrolling/ScrollToActiveLine.ts";
import { ScrollSimplebar } from "../../Scrolling/Simplebar/ScrollSimplebar.ts";

type LyricsContainerReturnObject = {
  Container: HTMLElement;
  ResizeListener: ResizeObserver;
  Append: (AppendTo: HTMLElement) => void;
  Remove: () => void;
  Resize: () => void;
};

const LyricsContainerInstances = new Map<number, LyricsContainerReturnObject>();

let lastMapIndex = -1;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CreateLyricsContainer = (): LyricsContainerReturnObject => {
  const Container = document.createElement("div");
  Container.classList.add("SpicyLyricsScrollContainer");

  lastMapIndex += 1;
  const currentIndex = lastMapIndex;

  const Resize = () => {
    (async () => {
      /* Container.style.height = `0px`;

            await delay(150);
            let Height = GetContainerHeight(Container);
            Container.style.height = `${Height}px`;

            // Schedule first scrollbar recalculation (effective at T=150ms + 100ms = 250ms from Resize call)
            // This runs independently and does not block the subsequent operations in this async function.
            delay(100).then(() => ScrollSimplebar?.recalculate());

            // Continue with the next part of the sequence, 50ms after the 150ms point
            // (effective at T=150ms + 50ms = 200ms from Resize call)
            await delay(50);
            Container.style.height = `0px`; // This occurs before the first ScrollSimplebar?.recalculate()

            // Effective at T=200ms + 110ms = 310ms from Resize call
            await delay(110);
            Height = GetContainerHeight(Container);
            Container.style.height = `${Height}px`;
            QueueForceScroll();

            // Effective at T=310ms + 100ms = 410ms from Resize call
            await delay(100);
            ScrollSimplebar?.recalculate(); */

      await delay(95);
      const Height = GetContainerHeight(Container);
      Container.style.height = `${Height}px`;
      ScrollSimplebar?.recalculate();
      await delay(10);
      QueueForceScroll();
      await delay(5);
      SetWaitingForHeight(false);

      await delay(125);
      Container.style.height = `${GetContainerHeight(Container)}px`;
      ScrollSimplebar?.recalculate();
      await delay(10);
      QueueForceScroll();
    })();
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
      Container.style.height = `${GetContainerHeight(Container)}px`;
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
  LyricsContainerInstances.forEach((Instance) => {
    Instance.Remove();
  });
  LyricsContainerInstances.clear();
  lastMapIndex = -1;
};

export { CreateLyricsContainer, DestroyAllLyricsContainers, GetCurrentLyricsContainerInstance };
