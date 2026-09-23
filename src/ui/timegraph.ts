// timegraph.ts — 시간 그래프 렌더러. DOM·물리 계산에 의존하지 않고
// 그릴 캔버스와 표시할 실행 결과만 받는다 (공통 원칙 §4: 렌더러 분리).
// 축 높이 z(t, 실선)와 에너지 E(t, 파선)를 같은 캔버스에 그린다.
// 단위가 다르므로 각각 최소~최대로 정규화하고, 실제 값은
// 왼쪽(축 높이)·오른쪽(에너지) 눈금 글자로 읽는다. 색+선 모양+글자로 구분한다.

import type { RunResult } from "../physics/runner";

export function drawTimeGraph(
  canvas: HTMLCanvasElement,
  result: RunResult | null,
  playIndex: number
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 640;
  const cssH = Math.round((cssW * 6) / 16);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = cssW;
  const H = cssH;
  ctx.clearRect(0, 0, W, H);
  const padL = 44;
  const padR = 52;
  const padT = 10;
  const padB = 20;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  ctx.fillStyle = "#5a5a5a";
  ctx.font = "11px system-ui, sans-serif";
  if (!result || result.samples.length < 2) {
    ctx.fillText("실행하면 그래프가 그려집니다.", padL, padT + 14);
    return;
  }
  const samples = result.samples;
  const n = samples.length;
  const tMax = samples[n - 1].t;
  let zMin = Infinity;
  let zMax = -Infinity;
  let eMin = Infinity;
  let eMax = -Infinity;
  for (const s of samples) {
    if (s.axis[2] < zMin) zMin = s.axis[2];
    if (s.axis[2] > zMax) zMax = s.axis[2];
    if (s.energy < eMin) eMin = s.energy;
    if (s.energy > eMax) eMax = s.energy;
  }
  if (zMax - zMin < 1e-9) {
    zMin -= 0.5e-9;
    zMax += 0.5e-9;
  }
  if (eMax - eMin < 1e-9) {
    eMin -= 0.5e-9;
    eMax += 0.5e-9;
  }
  const X = (t: number) => padL + (t / Math.max(1e-9, tMax)) * iw;
  const Yz = (z: number) => padT + (1 - (z - zMin) / (zMax - zMin)) * ih;
  const Ye = (e: number) => padT + (1 - (e - eMin) / (eMax - eMin)) * ih;

  // 눈금 글자 (왼쪽: 축 높이, 오른쪽: 에너지).
  ctx.fillText(zMax.toFixed(3), 4, padT + 10);
  ctx.fillText(zMin.toFixed(3), 4, padT + ih);
  ctx.fillText(eMax.toFixed(2), padL + iw + 4, padT + 10);
  ctx.fillText(eMin.toFixed(2), padL + iw + 4, padT + ih);
  ctx.fillText("0s", padL, H - 6);
  ctx.fillText(`${tMax.toFixed(0)}s`, padL + iw - 20, H - 6);

  const line = (fn: (i: number) => number, style: string, dash: number[]) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = X(samples[i].t);
      const y = fn(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  line((i) => Ye(samples[i].energy), "#7a4a00", [6, 4]); // 에너지 파선
  line((i) => Yz(samples[i].axis[2]), "#111111", []); // 축 높이 실선

  // 현재 재생 위치 표시.
  const ct = samples[Math.min(playIndex, n - 1)].t;
  ctx.strokeStyle = "#002fa7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X(ct), padT);
  ctx.lineTo(X(ct), padT + ih);
  ctx.stroke();

  // 범례 글자.
  ctx.fillStyle = "#111";
  ctx.fillText("— 축 높이 z", padL + 4, padT + 12);
  ctx.fillStyle = "#7a4a00";
  ctx.fillText("- - 에너지 E", padL + 90, padT + 12);

  // 스크린리더용 요약 (수치표와 같은 값).
  const here = samples[Math.min(playIndex, n - 1)];
  canvas.setAttribute(
    "aria-label",
    `시간 그래프. 전체 ${tMax.toFixed(0)}초, 축 높이 ${zMin.toFixed(3)}~${zMax.toFixed(3)}, ` +
      `에너지 ${eMin.toFixed(2)}~${eMax.toFixed(2)}줄. 현재 t=${here.t.toFixed(2)}초.`
  );
}
