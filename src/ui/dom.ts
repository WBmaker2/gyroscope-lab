// dom.ts — 작은 DOM·서식 도우미. 다른 UI 모듈이 공유한다.

export const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export function fmtVec(v: [number, number, number] | number[], digits = 3): string {
  return `(${v.map((x) => (x as number).toFixed(digits)).join(", ")})`;
}

/** 처음 한 번만 WebGL 가능 여부를 본다. three.js 없이 판단한다. */
export function webGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}
