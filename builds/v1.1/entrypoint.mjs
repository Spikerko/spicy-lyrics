const PUBLIC_STORAGE_HOST = "public.storage.spicylyrics.org";
const API_HOST = "api.spicylyrics.org";

const getVersionFromHost = (host) =>
  fetch(`https://${host}/version`).then((response) => {
    if (!response.ok) throw new Error("Bad response");
    return response.text();
  });

const loadExtension = async (baseUrl, version) => {
  window._spicy_lyrics_metadata = { LoadedVersion: version };
  return await import(`${baseUrl}${encodeURIComponent(`@${version}.mjs`)}`);
};

const showVersionError = () => {
  Spicetify.PopupModal.display({
    title: "",
    content: `
      <div style="text-align: center; padding: 16px 0;">
        <h2 style="margin: 0 0 12px; font-size: 1.75rem; font-weight: 600;">
          Spicy Lyrics failed to load
        </h2>
        <p style="margin: 0 0 16px; opacity: 0.7;">
          We couldn't connect after multiple attempts.
        </p>
        <p style="margin: 0 0 8px;">
          Please check your network connection and our
          <a href="https://status.spicylyrics.org" style="text-decoration: underline; font-weight: 600;">Status Page</a>
          for any ongoing maintenance.
        </p>
        <p style="margin: 16px 0 0; font-size: 0.9rem; opacity: 0.7;">
          Still having issues? Reach out on our
          <a href="https://discord.com/invite/uqgXU5wh8j" style="text-decoration: underline; font-weight: 600;">Discord</a>
        </p>
      </div>
    `,
    isLarge: true,
  });
};

const showImportError = () => {
  Spicetify.PopupModal.display({
    title: "",
    content: `
      <div style="text-align: center; padding: 16px 0;">
        <h2 style="margin: 0 0 12px; font-size: 1.75rem; font-weight: 600;">
          Spicy Lyrics failed to initialize
        </h2>
        <p style="margin: 0 0 16px; opacity: 0.7;">
          The extension couldn't be loaded properly.
        </p>
        <p style="margin: 0 0 8px;">
          Try restarting Spotify or updating Spicetify to the latest version.
        </p>
        <p style="margin: 16px 0 0; font-size: 0.9rem; opacity: 0.7;">
          If the problem continues, let us know on our
          <a href="https://discord.com/invite/uqgXU5wh8j" style="text-decoration: underline; font-weight: 600;">Discord</a>
        </p>
      </div>
    `,
    isLarge: true,
  });
};

const load = async (apiHost) => {
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      if (
        Spicetify !== undefined &&
        Spicetify.React !== undefined &&
        Spicetify.ReactDOM !== undefined &&
        Spicetify.ReactDOMServer !== undefined &&
        Spicetify.PopupModal !== undefined
      ) {
        clearInterval(interval);
        resolve();
      }
    }, 10);
  });

  let version;
  let lastError;

  for (let i = 0; i < 10; i++) {
    try {
      version = await getVersionFromHost(apiHost);
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!version) {
    console.error(`[Spicy Lyrics] [Entry] Failed to fetch version after 10 attempts:`, lastError);
    showVersionError();
    return;
  }

  for (let i = 0; i < 3; i++) {
    try {
      await loadExtension(`https://${PUBLIC_STORAGE_HOST}/spicy-lyrics`, version);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  console.error(`[Spicy Lyrics] [Entry] Failed to import extension after 10 attempts:`, lastError);
  showImportError();
};

load(API_HOST);