// paramform.ts — 조건 입력 폼 읽기·검사·동기화.
// 숫자↔슬라이더 동기화는 드래그 대체 조작이다.
// 오류는 색이 아닌 글자(role=alert, aria-invalid)로 알린다 (WCAG 3.3.1).

import { DEFAULTS } from "../physics/rigidBody";
import { DAMPING_COEFF } from "../physics/damping";
import { validateParameters, type RunParameters } from "../physics/runner";
import { $ } from "./dom";

export const PARAM_KEYS = ["mass", "dist", "spin", "tilt", "pradius", "pheight"] as const;

export function readParams(): RunParameters {
  const num = (id: string) => {
    const v = Number(($( `in-${id}`) as HTMLInputElement).value);
    return Number.isFinite(v) ? v : NaN;
  };
  const contactOn = ($("p1-contact") as HTMLInputElement | null)?.checked ?? false;
  return {
    massKg: num("mass"),
    comDistanceM: num("dist"),
    tiltDeg: num("tilt"),
    spinRadPerSec: num("spin"),
    dt: DEFAULTS.dt,
    durationSec: DEFAULTS.durationSec,
    damping: (($("p1-damping") as HTMLInputElement | null)?.checked ?? false) ? DAMPING_COEFF : 0,
    contact: contactOn
      ? { wheelRadiusM: num("pradius"), pivotHeightM: num("pheight") }
      : null
  };
}

function showFieldError(inputId: string, errId: string, msg: string | null) {
  const input = $(`in-${inputId}`) as HTMLInputElement;
  const err = $(errId);
  if (!msg) {
    err.hidden = true;
    err.textContent = "";
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  } else {
    err.hidden = false;
    err.textContent = msg;
    err.setAttribute("role", "alert");
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", `${errId} hint-${inputId}`);
  }
}

export function validateToUI(p: RunParameters): boolean {
  const errs = validateParameters(p);
  const byField: Record<string, string | null> = {
    mass: null, dist: null, tilt: null, spin: null
  };
  for (const e of errs) {
    if (e.startsWith("질량")) byField.mass = e;
    else if (e.startsWith("무게중심")) byField.dist = e;
    else if (e.startsWith("초기 기울기")) byField.tilt = e;
    else if (e.startsWith("축 각속도")) byField.spin = e;
  }
  showFieldError("mass", "e-mass", byField.mass);
  showFieldError("dist", "e-dist", byField.dist);
  showFieldError("tilt", "e-tilt", byField.tilt);
  showFieldError("spin", "e-spin", byField.spin);
  // P1 오류는 묶음 안내 하나에 글자로 알린다.
  const p1Errs = errs.filter((e) => e.startsWith("바퀴") || e.startsWith("지지점"));
  const p1Box = $("e-p1");
  if (p1Errs.length === 0) {
    p1Box.hidden = true;
    p1Box.textContent = "";
  } else {
    p1Box.hidden = false;
    p1Box.textContent = p1Errs.join(" ");
    p1Box.setAttribute("role", "alert");
  }
  const box = $("error-box");
  box.innerHTML = "";
  const dtErr = errs.find((e) => e.startsWith("시간 간격"));
  if (dtErr) {
    const div = document.createElement("div");
    div.className = "alert";
    div.setAttribute("role", "alert");
    div.innerHTML = `<h3>입력 오류</h3><p>${dtErr}</p>`;
    box.appendChild(div);
  }
  return errs.length === 0;
}

export function syncRangeInputs(): void {
  for (const n of PARAM_KEYS) {
    const ni = $(`in-${n}`) as HTMLInputElement;
    const ri = $(`rg-${n}`) as HTMLInputElement;
    ri.value = ni.value;
  }
  const spin = Number(($("in-spin") as HTMLInputElement).value);
  if (Number.isFinite(spin)) {
    $("rpm-hint").textContent = `≈ ${Math.round((spin * 60) / (2 * Math.PI))} RPM`;
  }
}

/** 숫자↔슬라이더 쌍을 묶는다. P1 입력도 같은 함수로 묶는다. */
export function pairNumericRange(key: string, onChange: () => void): void {
  const ni = $(`in-${key}`) as HTMLInputElement;
  const ri = $(`rg-${key}`) as HTMLInputElement;
  ni.addEventListener("input", () => {
    ri.value = ni.value;
    onChange();
  });
  ri.addEventListener("input", () => {
    ni.value = ri.value;
    onChange();
  });
}
