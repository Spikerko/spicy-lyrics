// deno-lint-ignore-file no-async-promise-executor no-explicit-any
import { RetrievePackage } from "../ImportPackage.ts";

RetrievePackage("Kuromoji", "1.0.0", "js")
  .catch(() => {});

let Analyzer: any;
export const init = (): Promise<void> => {
  if (Analyzer !== undefined) {
    return Promise.resolve();
  }

  return new Promise(async (resolve, reject) => {
    await RetrievePackage("Kuromoji", "1.0.0", "js");
    while (!(window as any).kuromoji) {
      await new Promise((r) => setTimeout(r, 50));
    }
    (window as any).kuromoji.builder({
      dicPath: "https://kuromoji.pkgs.spikerko.org",
    }).build((error: any, analyzer: any) => {
      if (error) {
        return reject(error);
      }

      Analyzer = analyzer;
      resolve();
    });
  });
};
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
