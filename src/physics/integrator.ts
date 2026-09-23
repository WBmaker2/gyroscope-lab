// integrator.ts — L·q 연립 RK4 고정 스텝 적분. 렌더링과 분리된다.
// 상태: y = [Lx,Ly,Lz, qw,qx,qy,qz]. q는 매 전체 스텝 뒤 정규화한다.

import {
  quatMultiply,
  quatNormalize,
  quatToMatrix,
  matApplyVec,
  matTransposeVec,
  vecCross,
  type Quat,
  type Vec3
} from "./quaternion";
import type { BodyParams, BodyState } from "./rigidBody";
import { dampingTorque } from "./damping";

export interface Derivative {
  dL: Vec3;
  dq: Quat;
}

function derivative(p: BodyParams, q: Quat, L: Vec3): Derivative {
  const R = quatToMatrix(q);
  const lBody = matTransposeVec(R, L);
  const wBody: Vec3 = [
    lBody[0] / p.inertia.iPerp,
    lBody[1] / p.inertia.iPerp,
    lBody[2] / p.inertia.iAxis
  ];
  const wWorld = matApplyVec(R, wBody);
  // r = R (0,0,l), F = (0,0,-mg)
  const r: Vec3 = [R[0][2] * p.comDistanceM, R[1][2] * p.comDistanceM, R[2][2] * p.comDistanceM];
  const f: Vec3 = [0, 0, -p.massKg * p.gravity];
  const dL = vecCross(r, f);
  // P1 약한 감쇠: 켜져 있을 때만 점성 토크를 더한다. P0(0/없음)은 그대로.
  if (p.damping != null && p.damping > 0) {
    const dd = dampingTorque(p.damping, wWorld);
    dL[0] += dd[0];
    dL[1] += dd[1];
    dL[2] += dd[2];
  }
  // qdot = 0.5 * [0,w] ⊗ q
  const wq: Quat = [0, wWorld[0], wWorld[1], wWorld[2]];
  const qd = quatMultiply(wq, q);
  const dq: Quat = [0.5 * qd[0], 0.5 * qd[1], 0.5 * qd[2], 0.5 * qd[3]];
  return { dL, dq };
}

function addState(q: Quat, L: Vec3, dq: Quat, dL: Vec3, h: number): { q: Quat; L: Vec3 } {
  return {
    q: [q[0] + dq[0] * h, q[1] + dq[1] * h, q[2] + dq[2] * h, q[3] + dq[3] * h],
    L: [L[0] + dL[0] * h, L[1] + dL[1] * h, L[2] + dL[2] * h]
  };
}

/** RK4 한 스텝. 반환 상태의 q는 정규화된다. */
export function rk4Step(p: BodyParams, s: BodyState, dt: number): BodyState {
  const { q, angularMomentumWorld: L } = s;
  const k1 = derivative(p, q, L);
  const s2 = addState(q, L, k1.dq, k1.dL, dt / 2);
  const k2 = derivative(p, s2.q, s2.L);
  const s3 = addState(q, L, k2.dq, k2.dL, dt / 2);
  const k3 = derivative(p, s3.q, s3.L);
  const s4 = addState(q, L, k3.dq, k3.dL, dt);
  const k4 = derivative(p, s4.q, s4.L);

  const L2: Vec3 = [
    L[0] + (dt / 6) * (k1.dL[0] + 2 * k2.dL[0] + 2 * k3.dL[0] + k4.dL[0]),
    L[1] + (dt / 6) * (k1.dL[1] + 2 * k2.dL[1] + 2 * k3.dL[1] + k4.dL[1]),
    L[2] + (dt / 6) * (k1.dL[2] + 2 * k2.dL[2] + 2 * k3.dL[2] + k4.dL[2])
  ];
  const q2: Quat = quatNormalize([
    q[0] + (dt / 6) * (k1.dq[0] + 2 * k2.dq[0] + 2 * k3.dq[0] + k4.dq[0]),
    q[1] + (dt / 6) * (k1.dq[1] + 2 * k2.dq[1] + 2 * k3.dq[1] + k4.dq[1]),
    q[2] + (dt / 6) * (k1.dq[2] + 2 * k2.dq[2] + 2 * k3.dq[2] + k4.dq[2]),
    q[3] + (dt / 6) * (k1.dq[3] + 2 * k2.dq[3] + 2 * k3.dq[3] + k4.dq[3])
  ]);
  return { q: q2, angularMomentumWorld: L2 };
}

export function isFiniteState(s: BodyState): boolean {
  return [...s.q, ...s.angularMomentumWorld].every((v) => Number.isFinite(v));
}
