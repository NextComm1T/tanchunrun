import { describe, expect, it } from "vitest";

import {
  GPS_GAP_MS,
  MAX_ACCURACY_M,
  MIN_SAMPLE_INTERVAL_MS,
  RUN_START_CLOCK_TOLERANCE_MS,
  classifyFix,
  isWithinRunStart,
  resolveSegment,
  type Fix,
  type LastAccepted,
} from "./fix";

const LAST: LastAccepted = { recordedAt: 1_000_000, segment: 3 };

function fix(overrides: Partial<Fix> = {}): Fix {
  return {
    lat: 37.4842822,
    lng: 127.1121213,
    accuracy: 10,
    recordedAt: LAST.recordedAt + MIN_SAMPLE_INTERVAL_MS,
    ...overrides,
  };
}

describe("classifyFix", () => {
  it("accuracy 가 한계를 1m 넘으면 unusable", () => {
    expect(classifyFix(LAST, fix({ accuracy: MAX_ACCURACY_M + 1 }))).toBe(
      "unusable",
    );
  });

  it("좌표가 NaN 이면 unusable", () => {
    expect(classifyFix(LAST, fix({ lat: Number.NaN }))).toBe("unusable");
    expect(classifyFix(LAST, fix({ lng: Number.NaN }))).toBe("unusable");
  });

  it("좌표 범위를 벗어나면 unusable", () => {
    expect(classifyFix(LAST, fix({ lat: 91 }))).toBe("unusable");
  });

  it("직전 accept 로부터 999ms 면 downsample", () => {
    expect(classifyFix(LAST, fix({ recordedAt: LAST.recordedAt + 999 }))).toBe(
      "downsample",
    );
  });

  it("직전 accept 와 시각이 같거나 앞서면 duplicate", () => {
    expect(classifyFix(LAST, fix({ recordedAt: LAST.recordedAt }))).toBe(
      "duplicate",
    );
    expect(classifyFix(LAST, fix({ recordedAt: LAST.recordedAt - 1 }))).toBe(
      "duplicate",
    );
  });

  it("accuracy 30m · 직전 accept +1000ms 면 accept", () => {
    expect(
      classifyFix(
        LAST,
        fix({
          accuracy: MAX_ACCURACY_M,
          recordedAt: LAST.recordedAt + MIN_SAMPLE_INTERVAL_MS,
        }),
      ),
    ).toBe("accept");
  });

  it("못 쓸 값은 시각보다 먼저 걸린다 — 시각이 역전이어도 unusable", () => {
    expect(
      classifyFix(LAST, fix({ accuracy: 99, recordedAt: LAST.recordedAt - 1 })),
    ).toBe("unusable");
  });

  it("generation 의 첫 fix 는 값만 유효하면 accept", () => {
    expect(classifyFix(null, fix({ recordedAt: 0 }))).toBe("accept");
    expect(classifyFix(null, fix({ accuracy: 99 }))).toBe("unusable");
  });
});

describe("resolveSegment", () => {
  it("generation 의 첫 accept 는 0", () => {
    expect(resolveSegment(null, { recordedAt: 1 }, false)).toBe(0);
    expect(resolveSegment(null, { recordedAt: 1 }, true)).toBe(0);
  });

  it("gap pending 뒤의 accept 는 segment 를 하나 올린다", () => {
    expect(
      resolveSegment(LAST, { recordedAt: LAST.recordedAt + 1000 }, true),
    ).toBe(LAST.segment + 1);
  });

  it("무수신이 5000ms 를 넘으면 뒤늦게 끊는다", () => {
    expect(
      resolveSegment(
        LAST,
        { recordedAt: LAST.recordedAt + GPS_GAP_MS + 1 },
        false,
      ),
    ).toBe(LAST.segment + 1);
  });

  it("5000ms 이하이고 gap pending 도 아니면 같은 segment", () => {
    expect(
      resolveSegment(LAST, { recordedAt: LAST.recordedAt + GPS_GAP_MS }, false),
    ).toBe(LAST.segment);
  });
});

describe("isWithinRunStart — #145", () => {
  const STARTED_AT = 1_700_000_000_000;

  it("시작 이후의 fix 는 쓴다", () => {
    expect(isWithinRunStart(STARTED_AT, STARTED_AT)).toBe(true);
    expect(isWithinRunStart(STARTED_AT + 1, STARTED_AT)).toBe(true);
  });

  it("시작 직전이라도 허용치 안이면 쓴다 — 기기가 준 시작 직전 fix", () => {
    expect(
      isWithinRunStart(STARTED_AT - RUN_START_CLOCK_TOLERANCE_MS, STARTED_AT),
    ).toBe(true);
    expect(isWithinRunStart(STARTED_AT - 1000, STARTED_AT)).toBe(true);
  });

  it("허용치를 넘게 이르면 쓰지 않는다 — 번호를 주면 서버가 영영 거절한다", () => {
    expect(
      isWithinRunStart(
        STARTED_AT - RUN_START_CLOCK_TOLERANCE_MS - 1,
        STARTED_AT,
      ),
    ).toBe(false);
  });

  it("유한하지 않은 값은 쓰지 않는다", () => {
    expect(isWithinRunStart(Number.NaN, STARTED_AT)).toBe(false);
    expect(isWithinRunStart(STARTED_AT, Number.NaN)).toBe(false);
  });
});
