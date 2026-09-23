// sim2d.ts — 2D 투영 렌더러. DOM 입력(체크박스)과 물리 계산에는 의존하지 않고
// 그릴 값(결과·인덱스·q·L·바디·보기·표시 플래그)만 받는다.

import { gravityTorque } from "../physics/rigidBody";
import type { BodyParams } from "../physics/rigidBody";
import type { Quat, Vec3 } from "../physics/quaternion";
import type { RunResult } from "../physics/runner";
import type { ViewKind } from "./playback";

export interface SimFlags {
  showL: boolean;
  showTau: boolean;
  showG: boolean;
  showTrail: boolean;
}

function project(v: [number, number, number], view: ViewKind): [number, number] {
  if (view === "front") return [v[0], v[2]];
  if (view === "top") return [v[0], v[1]];
  return [v[1], v[2]]; // side·3d(대체 표시)
}

export function drawSim(
  canvas: HTMLCanvasElement,
  view: ViewKind,
  result: RunResult | null,
  playIndex: number,
  flags: SimFlags,
  q: Quat,
  L: Vec3,
  body: BodyParams
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 640;
  const cssH = Math.round((cssW * 3) / 4);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = cssW;
  const H = cssH;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2 + 10;
  const s = Math.min(W, H) * 0.34;

  // 지지점
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy + s + 18);
  ctx.lineTo(cx + 14, cy + s + 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + s + 18);
  ctx.lineTo(cx, cy + s + 6);
  ctx.stroke();

  if (!result) {
    // 초기 안내 (수치는 표 참조).
    ctx.fillStyle = "#5a5a5a";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("조건을 정하고 실행을 누르세요.", 16, 28);
    return;
  }
  const sample = result.samples[Math.min(playIndex, result.samples.length - 1)];

  const axis = sample.axis;
  const [ax, ay] = project(axis, view);
  const tipX = cx + ax * s;
  const tipY = cy - ay * s;
  const midX = cx + ax * s * 0.55;
  const midY = cy - ay * s * 0.55;

  // 궤적 (축 끝점 trail)
  if (flags.showTrail) {
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= playIndex && i < result.samples.length; i += 4) {
      const a = result.samples[i].axis;
      const [px, py] = project(a, view);
      const X = cx + px * s;
      const Y = cy - py * s;
      if (!started) {
        ctx.moveTo(X, Y);
        started = true;
      } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 막대 (지지점→축 끝). pivot P0=(cx, cy + s*0.15) → tip
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const px0 = cx;
  const py0 = cy + s * 0.15;
  ctx.beginPath();
  ctx.moveTo(px0, py0);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // 바퀴 (축 끝의 원반 스케치)
  const ang = Math.atan2(tipY - py0, tipX - px0);
  const facing = view === "front" ? Math.abs(axis[1]) : view === "top" ? Math.abs(axis[2]) : Math.abs(axis[0]);
  const r = s * 0.32;
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(ang + Math.PI / 2);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * (0.28 + 0.72 * Math.min(1, facing)), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 벡터 화살표
  const arrow = (x0: number, y0: number, dx: number, dy: number, style: string, dash: number[], label: string) => {
    const len = Math.hypot(dx, dy) || 1;
    const arrowLen = s * 0.42;
    const ux = dx / len;
    const uy = dy / len;
    const x1 = x0 + ux * arrowLen;
    const y1 = y0 + uy * arrowLen;
    ctx.strokeStyle = style;
    ctx.fillStyle = style;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    const ha = 9;
    const a = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ha * Math.cos(a - 0.42), y1 - ha * Math.sin(a - 0.42));
    ctx.lineTo(x1 - ha * Math.cos(a + 0.42), y1 - ha * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText(label, x1 + 6, y1 - 6);
  };

  const fullState = { q, angularMomentumWorld: L };
  const tau = gravityTorque(body, fullState);
  const [Lx, Ly] = project([L[0], L[1], L[2]], view);
  const [Tx, Ty] = project([tau[0], tau[1], tau[2]], view);
  if (flags.showL) arrow(midX, midY, Lx, -Ly, "#005a00", [], "L");
  if (flags.showTau) arrow(midX, midY, Tx, -Ty, "#7a4a00", [6, 4], "τ");
  if (flags.showG) {
    if (view === "top") {
      ctx.strokeStyle = "#b00020";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(midX, midY, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#b00020";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText("mg(아래)", midX + 12, midY + 4);
    } else {
      arrow(midX, midY, 0, 1, "#b00020", [2, 4], "mg");
    }
  }

  // 시간 표시
  ctx.fillStyle = "#111";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(`t = ${sample.t.toFixed(2)} s`, 12, H - 12);
}
