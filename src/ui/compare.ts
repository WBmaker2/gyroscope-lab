// compare.ts — A/B 결과 표시와 같은 조건에서 두 배 실행을 준비한다.

import { fastPrecessionApprox } from "../physics/rigidBody";
import type { RunResult } from "../physics/runner";
import { bodyParamsOf, getRun } from "./playback";
import { $ } from "./dom";
import { syncRangeInputs } from "./paramform";

let runA: RunResult | null = null;
let runB: RunResult | null = null;

function terminationLabel(run: RunResult): string {
  if (run.terminationReason === "completed") return "완료(10 s)";
  if (run.terminationReason === "tiltLimit") return "기울기 초과 종료";
  if (run.terminationReason === "groundContact") return "바닥 접촉으로 종료";
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
    </table>${warn}${p1Note === "" ? "" : `<p>추가 조건: ${p1Note}.</p>`}`;
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

/** Prepares an exact two-times run while keeping every saved A condition fixed. */
export function bindDoubleSpinButton(onPrepared: (message: string) => void): void {
  $("btn-doublespin").addEventListener("click", () => {
    const spin = $("in-spin") as HTMLInputElement;
    const aParams = getCompare("A")?.parameters;
    const v = aParams?.spinRadPerSec ?? Number(spin.value);
    const doubled = v * 2;
    if (Number.isFinite(v) && v >= 20 && v <= 240 && doubled <= 240) {
      if (aParams) {
        for (const [key, value] of [["mass", aParams.massKg], ["dist", aParams.comDistanceM], ["tilt", aParams.tiltDeg]] as const) {
          ($(`in-${key}`) as HTMLInputElement).value = String(value);
        }
        ($("p1-damping") as HTMLInputElement).checked = (aParams.damping ?? 0) > 0;
        ($("p1-contact") as HTMLInputElement).checked = aParams.contact != null;
        if (aParams.contact) {
          ($("in-pradius") as HTMLInputElement).value = String(aParams.contact.wheelRadiusM);
          ($("in-pheight") as HTMLInputElement).value = String(aParams.contact.pivotHeightM);
        }
        ($("p1-contact") as HTMLInputElement).dispatchEvent(new Event("change"));
      }
      spin.value = String(doubled);
      syncRangeInputs();
      onPrepared(`회전 속도를 ${spin.value} rad/s로 바꿨습니다. 실행 후 B에 저장하세요.`);
      $("btn-doublespin").classList.remove("gi-pulse");
      ($("btn-run") as HTMLButtonElement).focus();
    } else {
      $("status-text").textContent = !Number.isFinite(v) || v < 20 || v > 240
        ? "현재 각속도가 허용 범위 20~240 rad/s에 있는지 확인하세요."
        : `현재값의 정확한 2배(${doubled} rad/s)는 허용 범위 20~240 rad/s를 벗어납니다. A 실행을 120 rad/s 이하로 설정해 저장한 뒤 다시 준비하세요.`;
      spin.focus();
    }
  });
}

export function bindComparisonControls(onPrepared: (message: string) => void): void {
  const saveCurrent = (slot: "A" | "B") => {
    const run = getRun();
    if (!run) {
      $("status-text").textContent = "먼저 실행하세요. 저장할 결과가 없습니다.";
      return;
    }
    const saved = saveCompareSlot(slot, run, $(`card-${slot.toLowerCase()}`));
    if (!saved) return;
    $(`btn-save-${slot.toLowerCase()}`).classList.remove("gi-pulse");
    if (slot === "A") $("btn-doublespin").classList.add("gi-pulse");
  };
  $("btn-save-a").addEventListener("click", () => saveCurrent("A"));
  $("btn-save-b").addEventListener("click", () => saveCurrent("B"));
  bindDoubleSpinButton(onPrepared);
  $("completion-link").addEventListener("click", () => {
    $("completion-link").classList.remove("gi-pulse");
    $(getCompare("A") ? "btn-save-b" : "btn-save-a").classList.add("gi-pulse");
  });
}
