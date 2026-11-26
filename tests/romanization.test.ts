// Golden test for on-device romanization: every case in
// romanization-corpus.json goes through ProcessLyrics as a one-line Syllable
// song, and each syllable's romanization must match the corpus.
//
// The corpus format (see its "$format"): one string per syllable, a trailing
// space where a word gap follows. A case with `known.desktop` holds output
// that is known to differ from the target; the test expects that output
// instead, so it still catches changes, and fails once the target is reached
// (then delete the `known` entry).
//
// pinyin and the Greek table load at runtime from the package host, so the
// test fetches the same files once into node_modules/.cache. Offline, the
// cases that need them are skipped.
//
// Run: bun test tests/romanization.test.ts
// ROMANIZATION_DUMP=out.json also writes every case's actual output there, for
// reviewing a change before updating the corpus.
import { afterAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import kuromoji from "kuromoji";

type Case = {
  id: string;
  lang: string;
  syllables: string[];
  expected: string[];
  known?: Record<string, string[]>;
};

const root = join(import.meta.dir, "..");
const corpus: { cases: Case[] } = await Bun.file(
  join(import.meta.dir, "romanization-corpus.json")
).json();

const cacheDir = join(root, "node_modules", ".cache", "romanization-test");
const runtimePackages: Record<string, string> = {
  pinyin: "https://pkgs.spikerko.org/pinyin/pinyin@4.0.0.mjs",
  GreekRomanization: "https://pkgs.spikerko.org/GreekRomanization/GreekRomanization@1.0.0.js",
};
const unavailable = new Set<string>();
mkdirSync(cacheDir, { recursive: true });
for (const [name, url] of Object.entries(runtimePackages)) {
  const file = join(cacheDir, url.split("/").pop() as string);
  if (existsSync(file)) continue;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await Bun.write(file, await res.arrayBuffer());
  } catch (error) {
    unavailable.add(name);
    console.warn(
      `romanization test: ${name} couldn't be fetched (${error}), its cases are skipped`
    );
  }
}

const dicPath = join(root, "node_modules", "kuromoji", "dict") + "/";
(globalThis as any).window ??= globalThis;

mock.module("../src/utils/ImportPackage.ts", () => ({
  RetrievePackage: async (name: string, version: string, type: string) => {
    if (name === "Kuromoji") {
      (globalThis as any).kuromoji = { builder: () => kuromoji.builder({ dicPath }) };
      return {};
    }
    return import(join(cacheDir, `${name}@${version}.${type}`));
  },
}));
mock.module("../src/utils/Logger.ts", () => ({
  default: class {
    warn() {}
    info() {}
    debug() {}
    error() {}
  },
}));
mock.module("../src/utils/remoteConfig.ts", () => ({
  getRemoteConfig: () => ({ romanization: { dictionaryWaitMs: 60_000 } }),
}));
mock.module("../src/utils/experiments.ts", () => ({
  isExperimentEnabled: (id: string) => id === "romajiAsWritten",
}));
mock.module("../src/components/Pages/PageView.ts", () => ({ PageContainer: undefined }));

// Imported after the mocks, so it picks them up.
const { ProcessLyrics } = await import("../src/utils/Lyrics/ProcessLyrics.ts");

const needs: Record<string, string> = { zh: "pinyin", greek: "GreekRomanization" };

const romanize = async (syllables: string[]): Promise<string[]> => {
  const Syllables = syllables.map((text) => ({
    Text: text.trimEnd(),
    IsPartOfWord: !/\s$/.test(text),
  }));
  const lyrics = { Type: "Syllable", Content: [{ Type: "Vocal", Lead: { Syllables } }] };
  await ProcessLyrics(lyrics);
  return Syllables.map((s: any, i) => {
    const text = s.TransliteratedText ?? s.Text;
    const last = i === Syllables.length - 1;
    const gap = !last && (!s.IsPartOfWord || s.TransliteratedIsPartOfWord === false);
    return gap ? `${text} ` : text;
  });
};

const dump: Record<string, string[]> = {};

describe("romanization corpus", () => {
  for (const c of corpus.cases) {
    const skip = needs[c.lang] !== undefined && unavailable.has(needs[c.lang]);
    test.skipIf(skip)(c.id, async () => {
      const actual = await romanize(c.syllables);
      dump[c.id] = actual;
      expect(actual).toEqual(c.known?.desktop ?? c.expected);
    });
  }
  afterAll(async () => {
    if (process.env.ROMANIZATION_DUMP)
      await Bun.write(process.env.ROMANIZATION_DUMP, JSON.stringify(dump, null, 1));
  });
});
