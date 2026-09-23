import { describe, expect, it } from "vitest";
import { quatNorm } from "../src/physics/quaternion";
import {
  angularVelocityWorld,
  axisDirection,
  gravityTorque,
  initialState,
  totalEnergy,
  DEFAULTS
} from "../src/physics/rigidBody";
import { rk4Step } from "../src/physics/integrator";
import { runSimulation } from "../src/physics/runner";

const body = {
  massKg: 1,
  comDistanceM: 0.1,
  inertia: DEFAULTS.inertia,
  gravity: DEFAULTS.gravity
};

describe("보존·경계 검사 (10-gyroscope-lab §10)", () => {
  it("g=0이면 세계 L이 일정하다", () => {
    const p = { ...body, gravity: 0 };
    let s = initialState(0.26, 100, body.inertia);
    const L0 = [...s.angularMomentumWorld] as [number, number, number];
    for (let i = 0; i < 2000; i++) s = rk4Step(p, s, 1 / 2000);
    const d = Math.hypot(
      s.angularMomentumWorld[0] - L0[0],
      s.angularMomentumWorld[1] - L0[1],
      s.angularMomentumWorld[2] - L0[2]
    );
    expect(d).toBeLessThan(1e-9);
  });

  it("구형 관성 텐서이면 ω와 L이 평행하다", () => {
    const spherical = {
      ...body,
      inertia: { iPerp: 0.01, iAxis: 0.01 }
    };
    const s = initialState(0.26, 60, spherical.inertia);
    const w = angularVelocityWorld(spherical, s);
    const L = s.angularMomentumWorld;
    const cross = [
      w[1] * L[2] - w[2] * L[1],
      w[2] * L[0] - w[0] * L[2],
      w[0] * L[1] - w[1] * L[0]
    ];
    expect(Math.hypot(cross[0], cross[1], cross[2]) / (Math.hypot(w[0], w[1], w[2]) * Math.hypot(L[0], L[1], L[2]))).toBeLessThan(
      1e-12
    );
  });

  it("축이 수직이고 횡각속도 0이면 중력 토크 0", () => {
    const s = initialState(0, 80, body.inertia);
    const tau = gravityTorque(body, s);
    expect(Math.hypot(tau[0], tau[1], tau[2])).toBeLessThan(1e-12);
  });

  it("Δt 절반 1초 결과가 수렴하고 q norm 오차 1e-10 이하", () => {
    const run = (dt: number) => {
      let s = initialState(0.26, 100, body.inertia);
      const n = Math.round(1 / dt);
      for (let i = 0; i < n; i++) s = rk4Step(body, s, dt);
      return s;
    };
    const a = run(1 / 2000);
    const b = run(1 / 4000);
    expect(Math.abs(quatNorm(a.q) - 1)).toBeLessThan(1e-10);
    expect(Math.abs(quatNorm(b.q) - 1)).toBeLessThan(1e-10);
    const dAxis = (() => {
      const ua = axisDirection(a);
      const ub = axisDirection(b);
      return Math.hypot(ua[0] - ub[0], ua[1] - ub[1], ua[2] - ub[2]);
    })();
    expect(dAxis).toBeLessThan(1e-4);
  });

  it("기본 조건 10초 에너지 드리프트 0.5% 이내", () => {
    const r = runSimulation({
      massKg: 1,
      comDistanceM: 0.1,
      tiltDeg: 15,
      spinRadPerSec: 100,
      dt: 1 / 2000,
      durationSec: 10
    });
    expect(r.terminationReason).not.toBe("numericalError");
    expect(r.maxEnergyDrift).toBeLessThan(0.005);
    expect(totalEnergy).toBeDefined();
    void expect(r.samples.length).toBeGreaterThan(500);
  });
});
