import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Query } from "../../../../utils/API/Query.ts";
import { PopupModal } from "../../../Modal.ts";
import { Icons } from "../../../Styling/Icons.ts";

// ErrorBoundary wrapper for safest rendering
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    // @ts-ignore aaa
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    // @ts-ignore aaa
    if (this.state.error) {
      return (
        <div style={{ color: "red" }}>
          Error: {String((this as any).state.error)}
        </div>
      );
    }
    // @ts-ignore aaa
    return this.props.children;
  }
}

// Types (unchanged)
type TTMLProfileData = {
  data?: {
    banner?: string;
    avatar?: string;
    displayName?: string;
    username?: string;
    id?: string;
    interfaceContent?: any;
  };
  type?: "maker" | "uploader" | "mixed";
};
type TTMLProfileResponse = {
  profile?: TTMLProfileData;
};
type ProfileDisplayProps = { userId: string; hasProfileBanner: boolean };

/**
 * Converts a hex color string (e.g. "#ff00aa" or "#f0a") to an RGB array [r, g, b].
 * Returns null if the input is invalid.
 * @param hex string hex color
 */
function hexToRgb(hex: string, cssFormat: boolean = false): string | [number, number, number] | null {
  if (typeof hex !== "string") return null;
  let cleanHex = hex.trim().replace(/^#/, "");
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
    return null;
  }
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return (cssFormat ? `${r}, ${g}, ${b}` : [r, g, b]);
}


// ----- Skeleton Loader Components -----
function ProfileSkeleton({ hasProfileBanner }: { hasProfileBanner: boolean }) {
  return (
    <div
      className={
        "ttml-profile-container ttml-profile-root-sort-of-skeleton" +
        (hasProfileBanner ? " ttml-profile-container-has-banner" : "")
      }
    >
      <div className="slm w-60 h-92 hidden-modal-header-style"></div>
      <div className="ttml-profile-header-styled profile-skeleton-header">
        {hasProfileBanner && (
          <div className="ttml-profile-banner-skeleton skeleton"></div>
        )}
        <div className="ttml-profile-avatar-container-styled">
          <div className="ttml-profile-avatar-skeleton skeleton"></div>
        </div>
        <div className="ttml-profile-meta-styled">
          <div className="ttml-profile-displayname-skeleton skeleton"></div>
          <div className="ttml-profile-username-skeleton skeleton"></div>
        </div>
      </div>
      <div className="ttml-profile-web-link">
        <div
          className="ttml-profile-web-text skeleton"
          style={{
            width: "70%",
            maxWidth: "480px",
            height: "22px",
            margin: "0 auto 1rem",
            borderRadius: "999px",
          }}
        ></div>
        <div
          className="ttml-profile-web-button skeleton"
          style={{
            width: "148px",
            height: "36px",
            margin: "0 auto",
            borderRadius: "999px",
          }}
        ></div>
      </div>
    </div>
  );
}

// Main Profile Display
function ProfileDisplaySafe({ userId, hasProfileBanner }: ProfileDisplayProps) {
  const userQuery = useQuery<TTMLProfileResponse, Error>({
    queryKey: ["ttml-user-query", userId],
    queryFn: async () => {
      const req = await Query([
        {
          operation: "ttmlProfile",
          variables: { userId, referrer: "lyricsCreditsView" },
        },
      ]);
      const profile = req.get("0");
      if (!profile) throw new Error("ttmlProfile not found in response");
      if (profile.httpStatus !== 200)
        throw new Error(`ttmlProfile returned status ${profile.httpStatus}`);
      if (profile.format !== "json")
        throw new Error(
          `ttmlProfile returned type ${profile.format}, expected json`
        );
      if (!profile.data)
        throw new Error("ttmlProfile responseData is missing");
      if (!profile.data?.profile?.data)
        throw Object.assign(new Error("ttmlProfile doesn't exist"), {
          noRetry: true,
        });
      return profile.data;
    },
    // deno-lint-ignore no-explicit-any
    retry(failureCount, error: any) {
      // If error has noRetry, do not retry
      if (error && error.noRetry) return false;
      return failureCount < 3;
    },
  });

  const profile: TTMLProfileData = userQuery.data?.profile || {};

  const userPronouns =
    profile?.data?.interfaceContent?.profileDetails?.pronouns;
  const username = profile?.data?.username ?? "";

  const openWebProfile = React.useCallback(() => {
    if (!username) return;
    const url = `https://spicylyrics.org/${encodeURIComponent(username)}`;
    globalThis.open?.(url, "_blank", "noopener,noreferrer");
  }, [username]);

  /* React.useEffect(() => {
    if (profile?.data?.banner) {
      const modalContainer = document.querySelector<HTMLElement>(
        ".GenericModal .main-embedWidgetGenerator-container:has(.ttml-profile-container .ttml-profile-banner-styled)"
      );
      if (modalContainer && typeof profile.data.banner === "string") {
        modalContainer.style.setProperty("--banner-url-bg", `url(${profile.data.banner})`);
      }
    }
  }, [profile?.data?.banner]); */

  if (userQuery.isLoading) {
    return <ProfileSkeleton hasProfileBanner={hasProfileBanner} />;
  }
  if (userQuery.isError) {
    return (
      <div className="ttml-profile-error">
        Error:{" "}
        {userQuery.error instanceof Error
          ? userQuery.error.message
          : String(userQuery.error)}
      </div>
    );
  }

  return (
    <>
      {/* <div className="fixed-node-container">
        <div
          className={`profile-point ${
            typeof profile?.data?.banner === "string" && profile.data.banner
              ? "type-banner"
              : "type-generic"
          }`}
        >
          {typeof profile?.data?.banner === "string" && profile.data.banner && (
            <img
              src={profile.data.banner}
              className="profile-point-banner"
              alt="Banner"
            />
          )}
        </div>
      </div> */}
      <div
        className={`ttml-profile-container${
          profile?.data?.interfaceContent?.color_config?.type
            ? ` profile-bg-type-${profile?.data?.interfaceContent?.color_config?.type}`
            : ""
        }`}
        style={
          profile?.data?.interfaceContent?.color_config?.type === "gradient"
            ? {
                "--from-color": hexToRgb(
                  profile?.data?.interfaceContent?.color_config?.color?.from ??
                    `#000000`,
                  true
                ),
                "--to-color": hexToRgb(
                  profile?.data?.interfaceContent?.color_config?.color?.to ??
                    `#000000`,
                  true
                ),
                "--bg-rotation":
                  profile?.data?.interfaceContent?.color_config?.color
                    ?.rotation ?? "156deg",
              }
            : profile?.data?.interfaceContent?.color_config?.type === "static"
            ? {
                "--target-color": hexToRgb(
                  profile?.data?.interfaceContent?.color_config?.color
                    ?.target ?? `#000000`,
                  true
                ),
              }
            : {}
        }
      >
        <div className="slm w-60 h-92 hidden-modal-header-style scroll-x-hidden"></div>

        <div className="modal-controls">
          <div className="controls-close-modal">
            <button
              type="button"
              aria-label="Close"
              className="main-trackCreditsModal-closeBtn"
              onClick={() => PopupModal.hide()}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 32 32"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Close</title>
                <path
                  d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143"
                  fill="currentColor"
                  fillRule="evenodd"
                ></path>
              </svg>
            </button>
          </div>
        </div>

        {/* Banner/Profile */}
        <div className="ttml-profile-header-styled">
          {typeof profile?.data?.banner === "string" && profile.data.banner && (
            <img
              src={profile.data.banner}
              className="ttml-profile-banner-styled"
              alt="Banner"
            />
          )}
          <div className="ttml-profile-avatar-container-styled">
            {typeof profile?.data?.avatar === "string" &&
              profile.data.avatar && (
                <img
                  src={profile.data.avatar}
                  className="ttml-profile-avatar-styled"
                  alt="Avatar"
                />
              )}
          </div>
          <div className="ttml-profile-meta-styled">
            <div className="ttml-profile-displayname-styled">
              {profile?.data?.displayName ?? ""}
            </div>
            <div className="ttml-profile-username-styled">
              {profile?.data?.username ?? ""}
              {/* <span className="ttml-profile-id-styled">
                ({profile?.data?.id ?? ""})
              </span> */}

              {userPronouns ? (
                <>
                  <span className="_dotSpacer_"></span>
                  <span className="ttml-profile-pronouns-styled">
                    {userPronouns}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Web client link */}
        <div className="ttml-profile-web-link">
          <p className="ttml-profile-web-text">
            {username
              ? `View ${username}'s full TTML Profile on our web client`
              : "View this user's full TTML Profile on our web client"}
          </p>
          <button
            type="button"
            className="ttml-profile-web-button"
            onClick={openWebProfile}
            disabled={!username}
          >
            Open Profile
            <span
              className="ttml-profile-web-button-icon"
              dangerouslySetInnerHTML={{
                __html: Icons.ArrowUpRight.replace(/{SIZE}/g, "16"),
              }}
            />
          </button>
        </div>
      </div>
    </>
  );
}

// Export wrapped with error boundary for safety
const ProfileDisplayExport = (props: ProfileDisplayProps) => (
  <ErrorBoundary>
    <ProfileDisplaySafe {...props} />
  </ErrorBoundary>
);
export default ProfileDisplayExport;
