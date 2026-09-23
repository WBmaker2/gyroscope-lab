// datatable.ts — 수치표 렌더. 캔버스 그림의 텍스트 대안이다.
// 계산 상태 묶음만 받아서 DOM id에 채운다.

import {
  axisDirection,
  fastPrecessionApprox,
  gravityTorque,
  initialState,
  totalEnergy,
  DEFAULTS
} from "../physics/rigidBody";
import type { RunParameters } from "../physics/runner";
import { $, fmtVec } from "./dom";
import { bodyParamsOf, type RenderState } from "./playback";

/** 실행 중/후 표. 결과가 없으면 false. */
export function renderDataTable(rs: RenderState | null): boolean {
  if (!rs) return false;
  const sample = rs.result.samples[rs.index];
  const p = rs.result.parameters;
  const full = { q: rs.q, angularMomentumWorld: rs.L };
  const tau = gravityTorque(rs.body, full);
  const e = totalEnergy(rs.body, full);
  const approx = fastPrecessionApprox(rs.body, p.spinRadPerSec);
  $("d-t").textContent = `${sample.t.toFixed(2)} s`;
  $("d-axis").textContent = fmtVec(sample.axis);
  $("d-L").textContent = fmtVec(rs.L);
  $("d-tau").textContent = fmtVec([tau[0], tau[1], tau[2]]);
  const driftPct = rs.result.maxEnergyDrift * 100;
  const damped = (p.damping ?? 0) > 0;
  $("d-E").textContent =
    `${e.toFixed(4)} J · 드리프트 ${driftPct.toFixed(3)}%` +
    (damped ? " (감쇠 켜짐, 목표 미적용)" : " (목표 0.5% 이내)");
  const rpm = (p.spinRadPerSec * 60) / (2 * Math.PI);
  $("d-approx").textContent = `${approx.toFixed(3)} rad/s (비교용, ω=${p.spinRadPerSec} rad/s ≈ ${Math.round(rpm)} RPM)`;
  $("d-meas").textContent =
    rs.result.measuredPrecessionRadPerSec == null
      ? "측정 불가 (짧은 실행)"
      : `${rs.result.measuredPrecessionRadPerSec.toFixed(3)} rad/s (후반 50% 방위각 평균)`;
  return true;
}

/** 실행 전 표: 기본 조건의 초기값·근사만 미리 보여준다 (실측처럼 쓰지 않는다). */
export function renderInitialTable(p: RunParameters): void {
  const body = bodyParamsOf(p);
  const approx = fastPrecessionApprox(body, p.spinRadPerSec);
  $("d-approx").textContent = `${approx.toFixed(3)} rad/s (비교용)`;
  const s0 = initialState((p.tiltDeg * Math.PI) / 180, p.spinRadPerSec, DEFAULTS.inertia);
  const ax0 = axisDirection(s0);
  $("d-axis").textContent = fmtVec([ax0[0], ax0[1], ax0[2]]);
  $("d-L").textContent = fmtVec([s0.angularMomentumWorld[0], s0.angularMomentumWorld[1], s0.angularMomentumWorld[2]]);
  const tau0 = gravityTorque(body, s0);
  $("d-tau").textContent = fmtVec([tau0[0], tau0[1], tau0[2]]);
  $("d-E").textContent = `${totalEnergy(body, s0).toFixed(4)} J · 실행 전`;
}
