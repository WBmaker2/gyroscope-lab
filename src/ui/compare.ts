// compare.ts — 두 실행 비교 카드. 물리 계산에만 의존하고 DOM 구조는
// 호출자가 넘긴 카드 요소 안에서만 다룬다.

import { fastPrecessionApprox } from "../physics/rigidBody";
import type { RunResult } from "../physics/runner";
import { bodyParamsOf } from "./playback";

let runA: RunResult | null = null;
let runB: RunResult | null = null;

function terminationLabel(run: RunResult): string {
  if (run.terminationReason === "completed") return "완료(10 s)";
  if (run.terminationReason === "tiltLimit") return "기울기 초과 종료";
  if (run.terminationReason === "groundContact") return "바닥 접촉 종료(P1 감지)";
  return "수치 오류";
}

export function renderCompareCard(el: HTMLElement, run: RunResult | null, fallback: string): void {
  const empty = el.querySelector("[data-empty]") as HTMLElement;
  const body = el.querySelector("[data-body]") as HTMLElement;
  if (!run) {
    empty.hidden = false;
    empty.textContent = fallback;
    body.innerHTML = "";
    return;
  }
  empty.hidden = true;
  const p = run.parameters;
  const approx = fastPrecessionApprox(bodyParamsOf(p), p.spinRadPerSec);
  const meas = run.measuredPrecessionRadPerSec;
  const gap =
    meas == null ? null : Math.abs(meas - approx) / Math.max(1e-9, Math.abs(approx));
  const warn =
    meas == null
      ? `<p>실행이 짧아 근사와 견줄 측정이 없습니다. 더 긴 실행과 견주세요.</p>`
      : gap != null && gap > 0.2
        ? `<p><strong>근사가 어긋남:</strong> 느린 회전에서는 단순 세차 공식이 맞지 않을 수 있습니다 (차이 ${(gap * 100).toFixed(0)}%).</p>`
        : `<p>빠른 회전 근사 범위 안의 실행입니다.</p>`;
  const p1Note = [
    p.damping != null && p.damping > 0 ? "약한 감쇠 켜짐" : "",
    p.contact != null ? "접촉 감지 켜짐" : ""
  ]
    .filter((s) => s !== "")
    .join(" · ");
  body.innerHTML = `
    <table class="data">
      <tbody>
        <tr><th scope="row">조건</th><td class="nums">m=${p.massKg} kg, l=${p.comDistanceM} m, ω=${p.spinRadPerSec} rad/s, 기울기=${p.tiltDeg}°</td></tr>
        <tr><th scope="row">근사 Ω (비교용)</th><td class="nums">${approx.toFixed(3)} rad/s</td></tr>
        <tr><th scope="row">측정 Ω (수치)</th><td class="nums">${meas == null ? "측정 불가" : `${meas.toFixed(3)} rad/s`}</td></tr>
        <tr><th scope="row">에너지 드리프트</th><td class="nums">${(run.maxEnergyDrift * 100).toFixed(3)}% (목표 0.5% 이내)</td></tr>
        <tr><th scope="row">종료</th><td>${terminationLabel(run)}</td></tr>
      </tbody>
    </table>${warn}${p1Note === "" ? "" : `<p>P1: ${p1Note} (별도 모델).</p>`}`;
}

/** 현재 실행을 A/B 슬롯에 저장하고 카드를 다시 그린다. 저장할 결과가 없으면 false. */
export function saveCompareSlot(
  slot: "A" | "B",
  run: RunResult | null,
  cardEl: HTMLElement
): boolean {
  if (!run) return false;
  if (slot === "A") runA = run;
  else runB = run;
  renderCompareCard(cardEl, run, "");
  return true;
}

export function getCompare(slot: "A" | "B"): RunResult | null {
  return slot === "A" ? runA : runB;
}
