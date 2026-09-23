// contact.ts — 지면 접촉 감지 별도 모델 (P1).
// P0는 접촉을 계산하지 않는다. 이 모델은 접촉 ‘감지’만 한다.
// 바퀴를 축에 수직인 원반(반지름 R)으로 보고, 림 최저점이 지면에 닿으면
// 그때 실행을 끝낸다. 닿은 뒤 움직임(튐·미끄럼·마찰)은 계산하지 않는다.
// R·지지점 높이는 가정값이라 화면에 ‘가정’이라고 밝힌다.

import type { Vec3 } from "./quaternion";

export interface ContactParams {
  /** 바퀴 반지름 R (m). 가정값. */
  wheelRadiusM: number;
  /** 지지점의 지면 위 높이 h (m). 가정값. */
  pivotHeightM: number;
}

/** 지지점 기준 림 최저점 z. 양수면 공중, 0 이하면 접촉. */
export function rimLowestZ(contact: ContactParams, comWorld: Vec3, axis: Vec3): number {
  const sinTilt = Math.sqrt(Math.max(0, 1 - axis[2] * axis[2]));
  return contact.pivotHeightM + comWorld[2] - contact.wheelRadiusM * sinTilt;
}

export function isContact(contact: ContactParams, comWorld: Vec3, axis: Vec3): boolean {
  return rimLowestZ(contact, comWorld, axis) <= 0;
}
