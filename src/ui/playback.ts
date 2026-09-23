// playback.ts — 재생 상태와 화면용 진실값(q·L) 캐시.
// runner와 동일한 초기조건·dt로 1회만 전진 적분해 샘플별 q·L을 저장한다.
// runner와 별도 적분이지만 결정적(deterministic) 동일 연산이므로 일치한다.
// 전체 상태 재구성을 피하려고 실행 1회분의 q·L을 샘플마다 캐시한다.

import { rk4Step } from "../physics/integrator";
import { initialState } from "../physics/rigidBody";
import { DEFAULTS, type BodyParams } from "../physics/rigidBody";
import type { RunParameters, RunResult } from "../physics/runner";
import type { Quat, Vec3 } from "../physics/quaternion";

export type ViewKind = "front" | "top" | "side" | "3d";

export function bodyParamsOf(p: RunParameters): BodyParams {
  return {
    massKg: p.massKg,
    comDistanceM: p.comDistanceM,
    inertia: DEFAULTS.inertia,
    gravity: DEFAULTS.gravity,
    damping: p.damping ?? 0 // runner와 같은 적분을 쓰려고 함께 둔다.
  };
}

let current: RunResult | null = null;
let playIndex = 0;
let playing = false;
let raf = 0;
let playAccum = 0;
let view: ViewKind = "front";

let bodyParamsCache: BodyParams = {
  massKg: 1,
  comDistanceM: 0.1,
  inertia: DEFAULTS.inertia,
  gravity: DEFAULTS.gravity
};
let stateQCache: { q: Quat; L: Vec3 } = {
  q: [1, 0, 0, 0],
  L: [0, 0, 1]
};
let truthStates: { q: Quat; L: Vec3 }[] = [];

function rebuildTruth(p: RunParameters) {
  bodyParamsCache = bodyParamsOf(p);
  truthStates = [];
  let s = initialState((p.tiltDeg * Math.PI) / 180, p.spinRadPerSec, DEFAULTS.inertia);
  truthStates.push({
    q: [...s.q] as Quat,
    L: [...s.angularMomentumWorld] as Vec3
  });
  if (!current) return;
  // current.samples는 10ms 간격. 샘플 사이 스텝 수 = round(0.01/dt).
  const stride = Math.max(1, Math.round(0.01 / p.dt));
  let sampleIdx = 1;
  const totalSteps = current.steps;
  for (let i = 1; i <= totalSteps; i++) {
    s = rk4Step(bodyParamsCache, s, p.dt);
    if (i % stride === 0 || i === totalSteps) {
      truthStates.push({
        q: [...s.q] as Quat,
        L: [...s.angularMomentumWorld] as Vec3
      });
      sampleIdx++;
      if (sampleIdx >= current.samples.length) break;
    }
    if (!Number.isFinite(s.q[0])) break;
  }
  // 길이가 어긋나면 마지막 상태로 채운다.
  while (truthStates.length < (current?.samples.length ?? 1)) {
    truthStates.push(truthStates[truthStates.length - 1]);
  }
}

export function getRun(): RunResult | null {
  return current;
}

export function setRun(r: RunResult | null, startIndex: number): void {
  current = r;
  if (r) {
    rebuildTruth(r.parameters);
    playIndex = Math.min(startIndex, r.samples.length - 1);
  } else {
    playIndex = 0;
  }
  playAccum = 0;
}

/** 수치 오류 복원 등에서 실행 결과를 버린다. */
export function clearRun(): void {
  current = null;
  playIndex = 0;
  playAccum = 0;
}

export function getPlayIndex(): number {
  return playIndex;
}

export function setPlayIndex(i: number): void {
  if (!current) {
    playIndex = 0;
    return;
  }
  playIndex = Math.min(current.samples.length - 1, Math.max(0, i));
}

export function isPlaying(): boolean {
  return playing;
}

export function setPlaying(v: boolean): void {
  playing = v;
}

export function getRaf(): number {
  return raf;
}

export function setRaf(id: number): void {
  raf = id;
}

export function getPlayAccum(): number {
  return playAccum;
}

export function setPlayAccum(v: number): void {
  playAccum = v;
}

export function getView(): ViewKind {
  return view;
}

export function setView(v: ViewKind): void {
  view = v;
}

export function syncCacheToIndex(): void {
  if (!current) return;
  const idx = Math.min(playIndex, truthStates.length - 1, current.samples.length - 1);
  if (truthStates[idx]) stateQCache = truthStates[idx];
}

export interface RenderState {
  result: RunResult;
  index: number;
  q: Quat;
  L: Vec3;
  body: BodyParams;
}

/** 그리기·수치표가 쓸 현재 상태 묶음. 없으면 null. */
export function getRenderState(): RenderState | null {
  if (!current) return null;
  return {
    result: current,
    index: Math.min(playIndex, current.samples.length - 1),
    q: stateQCache.q,
    L: stateQCache.L,
    body: bodyParamsCache
  };
}
