import Global from "../../../components/Global/Global.ts";
import { PageContainer } from "../../../components/Pages/PageView.ts";

const EventPrefix = "lyrics:";

const EmitNotApplyed = () => {
  Global.Event.evoke(`${EventPrefix}not-apply`, null);
};

const EmitApply = (Type: string, Content: any) => {
  PageContainer?.querySelector(
    ".LyricsContainer .LyricsContent"
  )?.classList.remove("HiddenTransitioned");
  Global.Event.evoke(`${EventPrefix}apply`, { Type, Content });
};

export { EmitApply, EmitNotApplyed };
