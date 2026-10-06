import Global from "../../../components/Global/Global.ts";
import { PageContainer } from "../../../components/Pages/PageView.ts";
import { HideLyricsSkeleton } from "../LyricsSkeleton.ts";

const EventPrefix = "lyrics:";

const EmitNotApplyed = () => {
  Global.Event.evoke(`${EventPrefix}not-apply`, null);
};


const EmitApply = (Type: string, Content: any) => {
  PageContainer?.querySelector(
    ".LyricsContainer .LyricsContent"
  )?.classList.remove("HiddenTransitioned");
  HideLyricsSkeleton();
  Global.Event.evoke(`${EventPrefix}apply`, { Type, Content });
};

export { EmitApply, EmitNotApplyed };
