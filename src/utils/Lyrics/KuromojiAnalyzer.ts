// deno-lint-ignore-file no-explicit-any
import { RetrievePackage } from "../ImportPackage.ts";

const DictionaryUrl = "https://kuromoji.pkgs.spikerko.org";

let Analyzer: any;
let Loading: Promise<void> | undefined;

const build = async (): Promise<void> => {
  await RetrievePackage("Kuromoji", "1.0.0", "js");
  // The package is a script that sets window.kuromoji when it runs.
  for (let tries = 0; !(window as any).kuromoji; tries++) {
    if (tries > 200) throw new Error("Kuromoji didn't load");
    await new Promise((r) => setTimeout(r, 50));
  }
  Analyzer = await new Promise((resolve, reject) => {
    (window as any).kuromoji
      .builder({ dicPath: DictionaryUrl })
      .build((error: any, analyzer: any) => (error ? reject(error) : resolve(analyzer)));
  });
};

/**
 * Loads the tokenizer and its dictionary once. A failed load is forgotten, so
 * the next caller tries again (after a dropped connection, say).
 */
export const init = (): Promise<void> => {
  if (Analyzer !== undefined) return Promise.resolve();
  Loading ??= build().catch((error) => {
    Loading = undefined;
    throw error;
  });
  return Loading;
};

/** Whether the tokenizer is ready to use right now. */
export const isReady = (): boolean => Analyzer !== undefined;

export const parse = (text = ""): Promise<any> => {
  if (text.trim() === "" || Analyzer === undefined) {
    return Promise.resolve([]);
  }

  const result = Analyzer.tokenize(text) as any[];
  for (const token of result) {
    token.verbose = {
      word_id: token.word_id,
      word_type: token.word_type,
      word_position: token.word_position,
    };
    delete token.word_id;
    delete token.word_type;
    delete token.word_position;
  }

  return Promise.resolve(result);
};
