const PublicStorageUrls = [
  "https://public.storage.spicylyrics.org/spicy-lyrics",
  "https://lcgateway.ps-ec1.spikerko.org/spicy-lyrics"
];

const ApiHosts = [
  "api.spicylyrics.org",
  "coregateway.spicylyrics.org",
  "lcgateway.spikerko.org"
];

const getVersionFromHost = (host) =>
  fetch(`https://${host}/version`).then(response => {
    if (!response.ok) throw new Error('Bad response');
    return response.text();
  });

const tryApiHosts = (hosts, idx = 0) => {
  if (idx >= hosts.length) {
    setTimeout(() => tryApiHosts(hosts), 2000);
    return;
  }
  getVersionFromHost(hosts[idx])
    .then(version => tryPublicStorageUrls(PublicStorageUrls, version))
    .catch(() => tryApiHosts(hosts, idx + 1));
};

const tryPublicStorageUrls = (urls, version, idx = 0) => {
  if (idx >= urls.length) {
    setTimeout(() => tryPublicStorageUrls(urls, version), 2000);
    return;
  }
  load(urls[idx], version)
    .catch(() => tryPublicStorageUrls(urls, version, idx + 1));
};

const load = async (baseUrl, version) => {
  window._spicy_lyrics_metadata = { LoadedVersion: version };
  return await import(`${baseUrl}${encodeURIComponent(`@${version}.mjs`)}`);
};

tryApiHosts(ApiHosts);