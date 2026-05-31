import { Query } from "../../API/Query";

export async function ParseTTML(ttml: string): Promise<any | null> {
  try {
    const query = await Query([
      {
        operation: "parseTTML",
        variables: {
          ttml,
        },
      },
    ]);
    const queryResult = query.get("0");
    if (!queryResult) {
      return null;
    }

    if (queryResult.httpStatus !== 200) {
      return null;
    }

    if (!queryResult.data) {
      return null;
    }

    if (queryResult.format !== "json") {
      return null;
    }

    if (queryResult.data.error) {
      return null;
    }

    return queryResult.data;
  } catch (error) {
    return null;
  }
}
