// runner.ts — P0 실행(10초) 샘플링·종료 판정·에너지 드리프트.
// 입력 검증(NaN·무한대·범위 밖·중복 실행 차단)은 호출 전에 validateParameters로 수행한다.

import { quatNorm } from "./quaternion";
import {
  axisAzimuth,
  axisDirection,
  angularVelocityWorld,
  DEFAULTS,
  initialState,
  totalEnergy,
  type BodyParams,
  type BodyState
} from "./rigidBody";
import { isFiniteState, rk4Step } from "./integrator";
import { isContact, type ContactParams } from "./contact";
import { comPositionWorld } from "./rigidBody";

export interface RunParameters {
  massKg: number;
  comDistanceM: number;
  tiltDeg: number;
  spinRadPerSec: number;
  dt: number;
  durationSec: number;
  /** P1 약한 감쇠 계수 c. 0/없음이면 P0 무감쇠와 같다. */
  damping?: number;
  /** P1 지면 접촉 감지. null/없음이면 P0처럼 계산하지 않는다. */
  contact?: ContactParams | null;
}

export interface RunSample {
  t: number;
  axis: [number, number, number];
  azimuth: number;
  energy: number;
  omega: [number, number, number];
}

export type TerminationReason = "completed" | "tiltLimit" | "groundContact" | "numericalError";

export interface RunResult {
  parameters: RunParameters;
  samples: RunSample[];
  energy0: number;
  maxEnergyDrift: number; // 상대값
  terminationReason: TerminationReason;
  measuredPrecessionRadPerSec: number | null; // 방위각 전개 기반, 없으면 null
  steps: number;
}

/** 엔진·시나리오 버전. 기록 재현용으로 저장된다 (공통 원칙 §4). */
export const ENGINE_VERSION = "0.2.0";
export const SCENARIO_VERSION = "precession-compare/2";

export const LIMITS = {
  massKg: { min: 0.5, max: 2 },
  comDistanceM: { min: 0.05, max: 0.2 },
  tiltDeg: { min: 5, max: 35 },
  spinRadPerSec: { min: 20, max: 240 },
  durationSec: { min: 1, max: 10 },
  wheelRadiusM: { min: 0.02, max: 0.15 },
  pivotHeightM: { min: 0.02, max: 0.3 }
} as const;

export function validateParameters(p: RunParameters): string[] {
  const errors: string[] = [];
  const check = (v: number, min: number, max: number, label: string, unit: string) => {
    if (!Number.isFinite(v)) errors.push(`${label}: 숫자(${unit})를 입력하세요.`);
    else if (v < min || v > max) errors.push(`${label}: ${min}~${max} ${unit} 범위로 입력하세요.`);
  };
  check(p.massKg, LIMITS.massKg.min, LIMITS.massKg.max, "질량", "kg");
  check(p.comDistanceM, LIMITS.comDistanceM.min, LIMITS.comDistanceM.max, "무게중심 거리", "m");
  check(p.tiltDeg, LIMITS.tiltDeg.min, LIMITS.tiltDeg.max, "초기 기울기", "°");
  check(p.spinRadPerSec, LIMITS.spinRadPerSec.min, LIMITS.spinRadPerSec.max, "축 각속도", "rad/s");
  if (p.contact != null) {
    check(p.contact.wheelRadiusM, LIMITS.wheelRadiusM.min, LIMITS.wheelRadiusM.max, "바퀴 반지름", "m");
    check(p.contact.pivotHeightM, LIMITS.pivotHeightM.min, LIMITS.pivotHeightM.max, "지지점 높이", "m");
  }
  if (p.dt !== DEFAULTS.dt) errors.push(`시간 간격: ${DEFAULTS.dt} s 고정입니다.`);
  return errors;
}

function unwrap(phases: number[]): number[] {
  const out = [phases[0] ?? 0];
  for (let i = 1; i < phases.length; i++) {
    let d = phases[i] - phases[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    out.push(out[i - 1] + d);
  }
  return out;
}

/** 동기 실행. 10초·dt=1/2000 → 20000 스텝, 100Hz 샘플링(1000개). */
export function runSimulation(params: RunParameters): RunResult {
  const body: BodyParams = {
    massKg: params.massKg,
    comDistanceM: params.comDistanceM,
    inertia: DEFAULTS.inertia,
    gravity: DEFAULTS.gravity,
    damping: params.damping ?? 0 // P1: 0이면 P0 무감쇠와 같다.
  };
  const tiltRad = (params.tiltDeg * Math.PI) / 180;
  let state: BodyState = initialState(tiltRad, params.spinRadPerSec, body.inertia);
  const energy0 = totalEnergy(body, state);
  const cosLimit = Math.cos(DEFAULTS.maxTiltRad);

  const totalSteps = Math.round(params.durationSec / params.dt);
  const stride = Math.max(1, Math.round(0.01 / params.dt)); // 10ms 샘플
  const samples: RunSample[] = [];
  let maxDrift = 0;
  let reason: TerminationReason = "completed";
  let steps = 0;

  const pushSample = (t: number) => {
    const w = angularVelocityWorld(body, state);
    samples.push({
      t,
      axis: axisDirection(state),
      azimuth: axisAzimuth(state),
      energy: totalEnergy(body, state),
      omega: w
    });
  };
  pushSample(0);

  for (let i = 1; i <= totalSteps; i++) {
    state = rk4Step(body, state, params.dt);
    steps = i;
    if (!isFiniteState(state) || Math.abs(quatNorm(state.q) - 1) > 1e-6) {
      reason = "numericalError";
      break;
    }
    const e = totalEnergy(body, state);
    if (Number.isFinite(e) && Number.isFinite(energy0) && energy0 !== 0) {
      maxDrift = Math.max(maxDrift, Math.abs((e - energy0) / energy0));
    }
    if (i % stride === 0) pushSample(i * params.dt);
    const axis = axisDirection(state);
    if (axis[2] < cosLimit) {
      reason = "tiltLimit";
      pushSample(i * params.dt);
      break;
    }
    // P1 지면 접촉 감지: 켜져 있을 때만. 닿으면 끝낸다 (닿은 뒤는 계산 안 함).
    if (params.contact != null) {
      const com = comPositionWorld(body, state);
      if (isContact(params.contact, com, axis)) {
        reason = "groundContact";
        pushSample(i * params.dt);
        break;
      }
    }
  }

  // 측정 세차: 후반 50% 방위각 전개 기울기 (너테이션 평균화).
  let measured: number | null = null;
  if (samples.length > 10) {
    const half = samples.slice(Math.floor(samples.length / 2));
    const unwrapped = unwrap(half.map((s) => s.azimuth));
    const dtSpan = half[half.length - 1].t - half[0].t;
    if (dtSpan > 0) measured = (unwrapped[unwrapped.length - 1] - unwrapped[0]) / dtSpan;
  }
  return {
    parameters: params,
    samples,
    energy0,
    maxEnergyDrift: maxDrift,
    terminationReason: reason,
    measuredPrecessionRadPerSec: measured,
    steps
  };
}

/** 기록 포맷 (공통 원칙 §4). */
export function toRecord(
  appId: string,
  scenarioId: string,
  params: RunParameters,
  result: RunResult,
  prediction: string,
  explanation: string
) {
  return {
    schemaVersion: 1,
    appId,
    createdAt: new Date().toISOString(),
    scenarioId,
    scenarioVersion: SCENARIO_VERSION,
    engineVersion: ENGINE_VERSION,
    parameters: { ...params, inertiaPivot: { ...DEFAULTS.inertia } },
    seed: 0,
    observations: {
      terminationReason: result.terminationReason,
      maxEnergyDrift: result.maxEnergyDrift,
      measuredPrecessionRadPerSec: result.measuredPrecessionRadPerSec,
      sampleCount: result.samples.length
    },
    prediction,
    explanation
  };
}
