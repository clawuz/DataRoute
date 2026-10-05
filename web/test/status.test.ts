import { describe, expect, it } from "vitest";
import { buildModel } from "../src/data/model";
import { dataState } from "../src/data/status";
import { FROM, makeDay } from "./helpers";

describe("dataState", () => {
  const now = FROM + 86400;
  it("loading without a model", () => {
    expect(dataState(null, now, false)).toBe("loading");
  });
  it("ok when fresh and the window is full", () => {
    expect(dataState(buildModel(makeDay()), now + 100, false)).toBe("ok");
  });
  it("delayed when status says so or data is older than 6 min", () => {
    expect(dataState(buildModel(makeDay({ status: { state: "delayed", lastSuccessAt: 0, error: "x" } })), now, false)).toBe("delayed");
    expect(dataState(buildModel(makeDay()), now + 361, false)).toBe("delayed");
  });
  it("collecting when the window is not full yet", () => {
    expect(dataState(buildModel(makeDay({ collectingSince: FROM + 3600 })), now, false)).toBe("collecting");
  });
  it("fixture is never delayed", () => {
    expect(dataState(buildModel(makeDay()), now + 99999, true)).toBe("ok");
  });
});
