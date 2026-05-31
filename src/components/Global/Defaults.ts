export const isDev = false;

const Defaults = {
  lyrics: {
    api: {
      url: isDev ? "http://localhost:3000" : "https://api.spicylyrics.org",
    },
  },
};

export default Defaults;
