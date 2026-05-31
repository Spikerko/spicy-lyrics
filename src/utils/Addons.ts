function DeepFreeze<T extends Record<string, any>>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") {
    // Base case: Return primitives as they are
    return obj as any;
  }

  // Create a copy of the object or array
  const clone: Record<string, any> = Array.isArray(obj) ? [] : {};

  // Recursively copy and freeze properties
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    clone[key] = DeepFreeze(value); // Deep copy and freeze the value
  });

  // Freeze the cloned object
  return Object.freeze(clone) as Readonly<T>;
}

function IsPlaying() {
  const state = Spicetify?.Player?.isPlaying?.();
  return state;
}

function TOP_ApplyLyricsSpacer(Container: HTMLElement) {
  const div = document.createElement("div");
  div.classList.add("TopSpacer");
  Container.appendChild(div);
}

function BOTTOM_ApplyLyricsSpacer(Container: HTMLElement) {
  const div = document.createElement("div");
  div.classList.add("BottomSpacer");
  Container.appendChild(div);
}

function GetContainerHeight(Container: HTMLElement) {
  const style = globalThis.getComputedStyle(Container);
  let height = parseFloat(style.marginTop);

  for (const child of Array.from(Container.children)) {
    if (child instanceof HTMLElement) {
      const childStyle = globalThis.getComputedStyle(child);
      height +=
        child.offsetHeight + parseFloat(childStyle.marginTop) + parseFloat(childStyle.marginBottom);
    }
  }

  return height;
}

export const ArabicPersianRegex = /[\u0600-\u06FF]/;

export {
  DeepFreeze,
  IsPlaying,
  TOP_ApplyLyricsSpacer,
  BOTTOM_ApplyLyricsSpacer,
  GetContainerHeight,
};
