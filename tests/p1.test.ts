import { describe, expect, it } from "vitest";
import { DAMPING_COEFF } from "../src/physics/damping";
import { runSimulation } from "../src/physics/runner";

const base = {
  massKg: 1,
  comDistanceM: 0.1,
  tiltDeg: 15,
  spinRadPerSec: 100,
  dt: 1 / 2000,
  durationSec: 10
};

describe("P1 별도 모델 (기본 끔 = P0와 같음)", () => {
  it("감쇠 0은 미지정과 결과가 같다", () => {
    const a = runSimulation({ ...base });
    const b = runSimulation({ ...base, damping: 0, contact: null });
    expect(b.terminationReason).toBe(a.terminationReason);
    expect(b.maxEnergyDrift).toBe(a.maxEnergyDrift);
    expect(b.samples.length).toBe(a.samples.length);
  });

  it("약한 감쇠를 켜면 에너지가 줄어든다", () => {
    const r = runSimulation({ ...base, damping: DAMPING_COEFF });
    const first = r.samples[0].energy;
    const last = r.samples[r.samples.length - 1].energy;
    expect(r.terminationReason).not.toBe("numericalError");
    // c=0.0001, ω≈100이면 초당 약 1J씩 감소. 10초면 10% 넘게 준다.
    expect((first - last) / first).toBeGreaterThan(0.05);
  });

  it("지면 접촉 감지가 켜지면 닿을 때 groundContact로 끝난다", () => {
    // tilt 50°(UI 범위를 넘는 직접 호출), R=0.15, h=0.02이면 첫 스텝에 닿는다.
    // com.z=0.064, R·sin50°=0.115 → 림 최저점 -0.031+0.02 < 0.
    const r = runSimulation({
      ...base,
      tiltDeg: 50,
      contact: { wheelRadiusM: 0.15, pivotHeightM: 0.02 }
    });
    expect(r.terminationReason).toBe("groundContact");
    expect(r.samples.length).toBeGreaterThan(1); // 마지막 유효 상태 보존
  });

  it("접촉을 끄면 같은 조건에서 groundContact가 되지 않는다", () => {
    // 빠른 회전(100 rad/s)에서는 50° 기울기도 세차하며 버틴다. 접촉 감지만이
    // 실행을 끝내므로, 끄면 tiltLimit 또는 completed이고 groundContact가 아니다.
    const r = runSimulation({ ...base, tiltDeg: 50, contact: null });
    expect(r.terminationReason).not.toBe("groundContact");
  });
});
