# Spicy Lyrics Security Audit

Date: 2026-04-03
Scope: Extension source review in `src/` and top-level config files

## Summary

This review found two high-severity architectural risks and several medium/low hardening issues.

- High: Runtime remote code execution surface via dynamic imports from a remote host.
- High: Spotify bearer token forwarding to non-Spotify infrastructure.
- Medium: Sensitive auth headers logged in developer mode.
- Low: `_blank` links without explicit `noopener,noreferrer`.
- Low: Generic modal accepts raw HTML content (future XSS footgun).

---

## Findings

### 1) High - Remote code execution via runtime dynamic imports

Severity: High

Description:
The extension dynamically imports JavaScript modules at runtime from a third-party host (`pkgs.spikerko.org`). Any compromise of that host, its delivery path, or DNS/TLS trust chain can result in attacker-controlled code execution in extension context.

Evidence:
- `src/utils/ImportPackage.ts`
  - `packagesUrl = "https://pkgs.spikerko.org"`
  - `await import(importUrl)`
- Active call sites:
  - `src/utils/Lyrics/ProcessLyrics.ts` (multiple `RetrievePackage(...)` calls)
  - `src/utils/Lyrics/KuromojiAnalyzer.ts` (multiple `RetrievePackage(...)` calls)

Impact:
Arbitrary code execution in the extension runtime, full compromise of extension logic and user data available to that context.

Recommendations:
- Prefer bundling all dependencies at build time.
- If remote loading is required, enforce strict integrity (hash/signature) and immutable version pinning.
- Restrict to a minimal, pinned host allowlist and fail closed on integrity mismatch.

---

### 2) High - Spotify bearer token forwarding to third-party backend(s)

Severity: High

Description:
The extension obtains Spotify access tokens and forwards them in custom auth headers to non-Spotify backend APIs. This expands credential trust boundaries and increases token exposure risk.

Evidence:
- Token acquisition and forwarding:
  - `src/utils/Lyrics/fetchLyrics.ts`
    - token fetched via `Platform.GetSpotifyAccessToken()`
    - passed as `"SpicyLyrics-WebAuth": \`Bearer ${Token}\``
- Backend target:
  - `src/components/Global/Defaults.ts` -> `https://api.spicylyrics.org`
  - `src/utils/API/Query.ts` -> POST `${host}/query`
- Additional fallback hosts in job path:
  - `src/utils/API/SendJob.ts`
    - `https://coregateway.spicylyrics.org`
    - `https://lcgateway.spikerko.org`

Context:
During investigation it was confirmed that the backend enforces this token: omitting the `auth` argument returns `400 auth argument Required`, and sending an invalid token returns `401 Spotify API error`. This indicates the backend uses the forwarded Spotify bearer token for upstream Spotify API calls on behalf of the user.

Impact:
Credential leakage risk and larger blast radius if any trusted backend/fallback host is compromised.

Recommendations:
- Avoid forwarding raw Spotify bearer tokens to third-party services.
- Use short-lived, scoped delegation tokens or server-side proxying patterns.
- Minimize trusted domains and remove unnecessary fallbacks.

---

### 3) Medium - Auth headers logged in developer mode

Severity: Medium

Description:
Query logging includes a `headers` object, which can contain bearer tokens. In developer mode this may leak credentials into logs.

Evidence:
- `src/utils/API/Query.ts`
  - `log.info("Sending Query request", { ..., headers });`

Impact:
Potential credential disclosure through console logs, screenshots, diagnostics, or shared logs.

Recommendations:
- Redact sensitive headers before logging (`Authorization`, `SpicyLyrics-WebAuth`, etc.).
- Consider logging only header names or a fixed safe subset.

---

### 4) Low - `_blank` usage without explicit `noopener,noreferrer`

Severity: Low

Description:
Some external links open with `_blank` but without explicit `noopener,noreferrer`.

Evidence:
- `src/components/ReactComponents/UpdateDialog.tsx`
- `src/utils/Lyrics/Global/Applyer.ts`

Impact:
Potential reverse-tabnabbing/opener abuse depending on runtime/browser behavior.

Recommendations:
- Use `window.open(url, "_blank", "noopener,noreferrer")` consistently.

---

### 5) Low (design risk) - Generic modal allows raw HTML string insertion

Severity: Low

Description:
The generic modal writes string content via `innerHTML`. This is currently mostly used with trusted content, but it is a high-risk sink if future code passes untrusted data.

Evidence:
- `src/components/Modal.ts`
  - `main.innerHTML = content` when `content` is a string

Impact:
Potential future DOM-XSS if untrusted strings are passed.

Recommendations:
- Prefer `Node` content only.
- If HTML strings are necessary, sanitize with a robust sanitizer before insertion.

---

## Notes

- Commented-out code paths were not treated as active vulnerabilities.
- Priority remediation should focus on Findings 1 and 2 due to direct compromise potential.

## Suggested Remediation Order

1. Remove or harden runtime remote module loading (`import()` from remote URLs).
2. Eliminate raw Spotify token forwarding to third-party domains.
3. Redact secrets from logs.
4. Apply `noopener,noreferrer` for all `_blank` opens.
5. Harden modal content API away from unsanitized HTML strings.
