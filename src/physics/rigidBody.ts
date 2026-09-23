// rigidBody.ts — 고정 지지점 축대칭 강체의 순수 계산 함수.
// DOM·Canvas·Three.js에 의존하지 않는다 (공통 원칙 §4).

import {
  matApplyVec,
  matTransposeVec,
  quatFromAxisAngle,
  quatRotateVector,
  quatToMatrix,
  vecCross,
  vecDot,
  type Quat,
  type Vec3
} from "./quaternion";

export interface InertiaPivot {
  iPerp: number; // I_perp (kg·m²)
  iAxis: number; // I_axis (kg·m²)
}

export interface BodyParams {
  massKg: number;
  comDistanceM: number;
  inertia: InertiaPivot;
  gravity: number; // 9.81
  /** P1 약한 감쇠 계수 c (N·m·s). 0/없음이면 P0 무감쇠와 같다. */
  damping?: number;
}

export interface BodyState {
  q: Quat; // 몸체→세계
  angularMomentumWorld: Vec3; // L_world
}

export const DEFAULTS = {
  massKg: 1,
  comDistanceM: 0.1,
  gravity: 9.81,
  inertia: { iPerp: 0.02, iAxis: 0.01 } as InertiaPivot,
  dt: 1 / 2000,
  durationSec: 10,
  /** 축이 이 각도를 넘으면 종료 (P0 지면 접촉 미계산, 허용 기울기 초과 종료). */
  maxTiltRad: (60 * Math.PI) / 180
};

/** 초기 상태: 기울기 tiltRad만큼 y축 회전 + 몸체 z축 스핀 spinRadPerSec. */
export function initialState(tiltRad: number, spinRadPerSec: number, inertia: InertiaPivot): BodyState {
  const q = quatFromAxisAngle([0, 1, 0], tiltRad);
  const R = quatToMatrix(q);
  // L_body = I * omega_body, omega_body = (0,0,spin)
  const lBody: Vec3 = [0, 0, inertia.iAxis * spinRadPerSec];
  const L: Vec3 = matApplyVec(R, lBody);
  return { q, angularMomentumWorld: L };
}

/** 세계 각속도 ω = R I^-1 R^T L. */
export function angularVelocityWorld(p: BodyParams, s: BodyState): Vec3 {
  const R = quatToMatrix(s.q);
  const lBody = matTransposeVec(R, s.angularMomentumWorld);
  const wBody: Vec3 = [
    lBody[0] / p.inertia.iPerp,
    lBody[1] / p.inertia.iPerp,
    lBody[2] / p.inertia.iAxis
  ];
  return matApplyVec(R, wBody);
}

/** 무게중심 위치 r_world = R (0,0,l). */
export function comPositionWorld(p: BodyParams, s: BodyState): Vec3 {
  return quatRotateVector(s.q, [0, 0, p.comDistanceM]);
}

/** 중력 토크 τ = r × (0,0,-mg). */
export function gravityTorque(p: BodyParams, s: BodyState): Vec3 {
  const r = comPositionWorld(p, s);
  const f: Vec3 = [0, 0, -p.massKg * p.gravity];
  return vecCross(r, f);
}

/** 전 에너지 E = 0.5 ω·L + m g r_z. */
export function totalEnergy(p: BodyParams, s: BodyState): number {
  const w = angularVelocityWorld(p, s);
  const r = comPositionWorld(p, s);
  return 0.5 * vecDot(w, s.angularMomentumWorld) + p.massKg * p.gravity * r[2];
}

/** 대칭축 방향 (세계). */
export function axisDirection(s: BodyState): Vec3 {
  return quatRotateVector(s.q, [0, 0, 1]);
}

/** 빠른 회전 근사 Ω ≈ m g l / (I_axis ω_spin). 비교용이며 실제 결과로 표시 금지. */
export function fastPrecessionApprox(p: BodyParams, spinRadPerSec: number): number {
  return (p.massKg * p.gravity * p.comDistanceM) / (p.inertia.iAxis * spinRadPerSec);
}

/** 방위각(세차 측정용): atan2(axisY, axisX). */
export function axisAzimuth(s: BodyState): number {
  const a = axisDirection(s);
  return Math.atan2(a[1], a[0]);
}
