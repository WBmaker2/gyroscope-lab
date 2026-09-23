// damping.ts — 약한 감쇠 별도 모델 (P1).
// P0(무감쇠)과 섞지 않는다. 켤 때만 점성 토크 τ_d = -c·ω_world를 더한다.
// c는 고정 가정값(DAMPING_COEFF)이며 입력으로 받지 않는다. 단위 N·m·s.

import type { Vec3 } from "./quaternion";

export const DAMPING_COEFF = 0.0001;

export function dampingTorque(coeff: number, omegaWorld: Vec3): Vec3 {
  return [-coeff * omegaWorld[0], -coeff * omegaWorld[1], -coeff * omegaWorld[2]];
}
