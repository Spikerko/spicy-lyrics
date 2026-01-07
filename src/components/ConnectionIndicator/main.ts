import semver from "semver";
import type { Brand } from "../../types/Brand.d.ts";
import "./styles.scss";
import { Spicetify } from "@spicetify/bundler";
import { SOCKET_HOST } from "../../utils/Socket/main.ts";
import { Icons } from "../Styling/Icons.ts";

export type ConnectionIndicatorContainer = Brand<
  HTMLDivElement,
  "ConnectionIndicatorContainer"
>;

type CI_State =
  | "connected"
  | "disconnected"
  | "connect_error"
  | "reconnecting"
  | "reconnect_final_fail";

const LATENCY_THRESHOLDS = {
  GREAT: 310,
  OK: 460,
  BAD: 610,
} as const;

const CONNECTION_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 50;

const getRootContainer = () =>
  document.querySelector<HTMLElement>(".search-searchCategory-categoryGrid") ??
  document.querySelector<HTMLElement>(".oXVR9i6RwBlxmTHoe7ZP");

const getSpinnerIcon = (size: number) =>
  Icons.Spinner.replaceAll("{SIZE}", String(size));

const isAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${SOCKET_HOST}/httpapi/cstate`);
    const data = await response.json();
    return semver.satisfies(data.versions.client, ">=2.0.0");
  } catch {
    return true;
  }
};

const createConnectionIndicator =
  async (): Promise<ConnectionIndicatorContainer | null> => {
    if (!(await isAvailable())) return null;

    const container = document.createElement("div");
    container.classList.add("SL_ConnectionIndicator");
    container.innerHTML = `<div class="ci_root_wrapper">${getSpinnerIcon(
      14
    )}</div>`;

    return container as ConnectionIndicatorContainer;
  };

let ciContainerApplied = false;
let currentContainer: ConnectionIndicatorContainer | null = null;
let stateInitialized = false;
let wrapperTippy: ReturnType<typeof Spicetify.Tippy> | null = null;
let serverRegion: string | null = null;
let pendingState: CI_State | null = "disconnected";

const applyState = (state: CI_State): void => {
  if (!currentContainer) return;

  switch (state) {
    case "connected":
      serverRegion = null;
      currentContainer.innerHTML = `
        <div class="ci_root_wrapper">
            <span class="ci_title">Spicy Lyrics Connectivity</span>
            <div class="ci_latency_wrapper">
                <span class="ci_latency_txt">Latency:</span>
                <span class="ci_latency_value">${getSpinnerIcon(12)}</span>
                <div class="ci_latency_colori"></div>
            </div>
        </div>
      `.trim();
      break;
    case "disconnected":
      serverRegion = null;
      currentContainer.innerHTML = `<div class="ci_root_wrapper">${getSpinnerIcon(
        14
      )}</div>`;
      break;
    case "connect_error":
      currentContainer.innerHTML = `
        <div class="ci_root_wrapper">
            <span class="ci_title">Connection Error</span>
            <span class="ci_title_sm">Waiting for reconnection...</span>
            <div class="ci_latency_wrapper">${getSpinnerIcon(14)}</div>
        </div>
      `.trim();
      break;
    case "reconnecting":
      currentContainer.innerHTML = `
        <div class="ci_root_wrapper">
            <span class="ci_title">Reconnecting...</span>
            <div class="ci_latency_wrapper">${getSpinnerIcon(14)}</div>
        </div>
      `.trim();
      break;

    case "reconnect_final_fail":
      serverRegion = null;
      currentContainer.innerHTML = `
        <div class="ci_root_wrapper">
            <span class="ci_title">Disconnected. Reload the page to reconnect</span>
        </div>
      `.trim();
      break;
    default:
      // no-op
      break;
  }

  stateInitialized = true;
};

const setState = (state: CI_State): void => {
  if (!ciContainerApplied || !currentContainer) {
    pendingState = state;
    return;
  }

  applyState(state);
};

const appendConnectionIndicatorToDOM = (
  ciContainer: ConnectionIndicatorContainer
): void => {
  const rootContainer = getRootContainer();
  if (ciContainerApplied || !rootContainer) return;

  rootContainer.appendChild(ciContainer);
  ciContainerApplied = true;
  currentContainer = ciContainer;

  if (pendingState !== null) {
    applyState(pendingState);
    pendingState = null;
  }
};

export type CI_UpdateContent = {
  latencyMs: number;
  regionName?: string;
};

const waitForStateInitialized = async (): Promise<boolean> => {
  const startTime = Date.now();
  while (!stateInitialized && Date.now() - startTime < CONNECTION_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return stateInitialized;
};

const getLatencyClass = (latencyMs: number): string => {
  if (latencyMs <= LATENCY_THRESHOLDS.GREAT) return "cs_great";
  if (latencyMs <= LATENCY_THRESHOLDS.OK) return "cs_ok";
  if (latencyMs <= LATENCY_THRESHOLDS.BAD) return "cs_bad";
  return "cs_horrible";
};

const updateData = async (data: CI_UpdateContent): Promise<void> => {
  if (!ciContainerApplied || !currentContainer) return;
  if (!stateInitialized && !(await waitForStateInitialized())) return;

  if (data.regionName && !serverRegion) {
    serverRegion = data.regionName;
    wrapperTippy?.destroy();
    wrapperTippy = Spicetify.Tippy(currentContainer, {
      ...Spicetify.TippyProps,
      delay: [0, 100],
      allowHTML: true,
      content: `
        <div class="SL_ci_tippywrapper">
          <span>Connected to <b>${serverRegion}</b></span>
          <span class="ci_tippy_lbtext"><b>Why am I connected?</b> A lightweight connection is maintained to track active user count. No personal or account data is transmitted.</span>
          <span class="ci_tippy_lbtext">(Latency = Ping)</span>
        </div>
      `,
    });
  }

  const latencyText =
    currentContainer.querySelector<HTMLSpanElement>(".ci_latency_value");
  const latencyColorIndicator =
    currentContainer.querySelector<HTMLDivElement>(".ci_latency_colori");

  if (!latencyText || !latencyColorIndicator) return;

  latencyText.textContent = `${data.latencyMs}ms`;

  latencyColorIndicator.classList.remove(
    "cs_great",
    "cs_ok",
    "cs_bad",
    "cs_horrible"
  );
  latencyColorIndicator.classList.add(getLatencyClass(data.latencyMs));
};

export default {
  Create: createConnectionIndicator,
  Append: appendConnectionIndicatorToDOM,
  GetIsAppended: (): boolean => ciContainerApplied,
  GetElement: (): ConnectionIndicatorContainer | null => currentContainer,
  Update: updateData,
  SetState: setState,
};
