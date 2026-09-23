import { describe, expect, it } from "vitest";
import { runSimulation } from "../src/physics/runner";

// 성능 회귀 검사 (공통 원칙 §6-4).
// 느슨한 상한만 둔다. 정확한 수치는 docs/PERF.md에 기록한다.
describe("성능 예산", () => {
  it("10초 실행이 10초보다 빨리 끝난다", () => {
    const t0 = performance.now();
    const r = runSimulation({
      massKg: 1,
      comDistanceM: 0.1,
      tiltDeg: 15,
      spinRadPerSec: 100,
      dt: 1 / 2000,
      durationSec: 10
    });
    const ms = performance.now() - t0;
    console.log(`10초 시뮬레이션 계산 시간: ${ms.toFixed(1)} ms (${r.steps} 스텝)`);
    expect(ms).toBeLessThan(10000);
  });

  it("스텝당 평균이 넉넉히 1ms 아래다", () => {
    const t0 = performance.now();
    const r = runSimulation({
      massKg: 1,
      comDistanceM: 0.1,
      tiltDeg: 35,
      spinRadPerSec: 20,
      dt: 1 / 2000,
      durationSec: 10
    });
    const ms = performance.now() - t0;
    const perStep = ms / Math.max(1, r.steps);
    console.log(`스텝당 평균: ${(perStep * 1000).toFixed(1)} μs`);
    expect(perStep).toBeLessThan(1);
  });
});
