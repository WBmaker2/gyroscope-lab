// main.ts — UI 조합. 의미 구조→토큰→반응형→상태→폴리시 순서.
// 렌더러·재생·비교·기록은 각 모듈에 있고, 여기서는 흐름만 잇는다.
// 접근성: 네이티브 컨트롤·visible focus(CSS)·dialog 초점 복귀·오류 role=alert·
// 캔버스 텍스트 대안(수치표·그래프 요약)·reduced-motion 정적 테두리·터치 44px(CSS).

import { runSimulation, ENGINE_VERSION, SCENARIO_VERSION } from "../physics/runner";
import { $ , webGLAvailable } from "./dom";
import { readParams, syncRangeInputs, pairNumericRange, validateToUI, PARAM_KEYS } from "./paramform";
import { renderDataTable, renderInitialTable } from "./datatable";
import {
  bodyParamsOf,
  clearRun,
  getPlayIndex,
  getPlayAccum,
  getRenderState,
  getRun,
  getView,
  isPlaying,
  setPlayAccum,
  setPlayIndex,
  setPlaying,
  setRaf,
  getRaf,
  setRun,
  setView,
  syncCacheToIndex
} from "./playback";
import { drawSim, type SimFlags } from "./sim2d";
import { drawTimeGraph as renderTimeGraph } from "./timegraph";
import type { CameraView } from "./scene3d";

/** 3D 모듈은 처음 누를 때만 내려받는다. 2D만 쓰면 three.js를 받지 않는다. */
let scene3dMod: typeof import("./scene3d") | null = null;

async function ensureScene3d(): Promise<boolean> {
  if (scene3dMod) return true;
  try {
    scene3dMod = await import("./scene3d");
    return true;
  } catch {
    return false;
  }
}
import { renderCompareCard, saveCompareSlot } from "./compare";
import {
  appendRecord,
  buildRecord,
  exportRecords,
  loadRecords,
  renderRecords,
  type StoredRecord
} from "./records";

type UiState = "ready" | "running" | "paused" | "completed" | "limitReached" | "groundContact" | "numericalError";

let uiState: UiState = "ready";
let lastFocusBeforeDialog: HTMLElement | null = null;
let records: StoredRecord[] = [];

const STATE_LABEL: Record<UiState, string> = {
  ready: "준비", running: "실행 중", paused: "정지됨",
  completed: "완료", limitReached: "기울기 초과 종료",
  groundContact: "바닥 접촉 종료", numericalError: "수치 오류"
};

const LOG_FALLBACK = `## 2026-09-23
- 팽이 연구소 P0 첫 화면을 만들었다. 예측→실험→비교→기록 흐름과 2D 투영·수치표를 제공한다.
- 계산 엔진(RK4, Δt=1/2000)과 화면을 분리했고, 빠른 회전 근사는 비교용으로만 표시한다.`;

function setUiState(s: UiState, text: string) {
  uiState = s;
  const line = $("status");
  line.dataset.state = s;
  $("status-badge").textContent = STATE_LABEL[s];
  $("status-text").textContent = text;
  ($("btn-pause") as HTMLButtonElement).disabled = s !== "running";
  ($("btn-run") as HTMLButtonElement).disabled = s === "running";
  // gi-pulse는 다음 행동 하나에만: 준비 상태에서만 실행 버튼 강조.
  for (const id of ["btn-run", "btn-start-top"]) {
    $(id).classList.remove("gi-pulse");
  }
  if (s === "ready") $("btn-run").classList.add("gi-pulse");
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = $("sim") as HTMLCanvasElement;
const canvas3d = $("sim3d") as HTMLCanvasElement;
const tcanvas = $("timegraph") as HTMLCanvasElement;

/** 3D 렌더가 한 번이라도 실패하면 2D로 고정한다 (대체 화면). */
let webglDead = false;
/** 3D 카메라 위치. 2D 정면·위·옆을 그대로 쓴다. 자동 회전은 없다. */
let cameraView: CameraView = "front";

function readFlags(): SimFlags {
  const checked = (id: string) => ($(id) as HTMLInputElement).checked;
  return {
    showL: checked("v-L"),
    showTau: checked("v-tau"),
    showG: checked("v-g"),
    showTrail: checked("v-trail")
  };
}

function draw() {
  const rs = getRenderState();
  if (getView() === "3d" && !webglDead && scene3dMod) {
    canvas.hidden = true;
    canvas3d.hidden = false;
    ($("webgl-note") as HTMLElement).hidden = true;
    const r = scene3dMod.render3d(
      canvas3d,
      cameraView,
      rs?.result ?? null,
      getPlayIndex(),
      rs?.q ?? [1, 0, 0, 0],
      rs?.L ?? [0, 0, 1],
      rs?.body ?? bodyParamsOf(readParams()),
      readFlags()
    );
    if (!r.ok) {
      // WebGL 실패: 2D로 돌아간다. 학습 핵심(수치·그래프)은 그대로 있다.
      webglDead = true;
      setView("front");
      syncViewButtons();
      ($("webgl-note") as HTMLElement).hidden = false;
      draw();
    }
    return;
  }
  canvas.hidden = false;
  canvas3d.hidden = true;
  drawSim(
    canvas,
    getView(),
    rs?.result ?? null,
    getPlayIndex(),
    readFlags(),
    rs?.q ?? [1, 0, 0, 0],
    rs?.L ?? [0, 0, 1],
    rs?.body ?? bodyParamsOf(readParams())
  );
}

/** 보기 버튼의 눌림 표시를 현재 view에 맞춘다. */
function syncViewButtons() {
  const v = getView();
  document
    .querySelectorAll<HTMLButtonElement>(".segmented [data-view]")
    .forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.view === v)));
}

function drawTimeGraph() {
  renderTimeGraph(tcanvas, getRun(), getPlayIndex());
}

function updateTable() {
  renderDataTable(getRenderState());
}

function refresh() {
  syncCacheToIndex();
  draw();
  drawTimeGraph();
  updateTable();
}

function stopLoop() {
  setPlaying(false);
  cancelAnimationFrame(getRaf());
}

function playLoop(last: number) {
  const current = getRun();
  if (!isPlaying() || !current) return;
  const now = performance.now();
  const elapsed = (now - last) / 1000;
  // 10초 실행을 약 10초에 재생 (1x). reduced-motion에서는 자동 재생하지 않는다.
  const advance = reducedMotion ? 0 : elapsed;
  const sampleDt = current.samples[1].t - current.samples[0].t;
  const stepFloat = advance / sampleDt;
  const accum = getPlayAccum() + stepFloat;
  const stepInt = Math.floor(accum);
  setPlayAccum(accum - stepInt);
  if (stepInt > 0) {
    setPlayIndex(getPlayIndex() + stepInt);
    refresh();
    if (getPlayIndex() >= current.samples.length - 1) {
      onTerminated(false);
      return;
    }
  }
  setRaf(requestAnimationFrame(() => playLoop(now)));
}

function doRun(fromStep = false) {
  const p = readParams();
  if (!validateToUI(p)) {
    setUiState("ready", "입력 범위를 확인하세요.");
    return;
  }
  stopLoop();
  try {
    setRun(runSimulation(p), fromStep ? 1 : 0);
  } catch (err) {
    showNumericalError("계산 중 오류가 발생했습니다. 초기값으로 되돌리세요.", String(err));
    return;
  }
  const current = getRun()!;
  refresh();
  if (current.terminationReason === "numericalError") {
    showNumericalError(
      "수치 적분이 실패했습니다. 마지막 유효 상태와 에너지 오차를 보존했습니다.",
      `drift=${(current.maxEnergyDrift * 100).toFixed(3)}% steps=${current.steps}`
    );
    return;
  }
  if (fromStep || reducedMotion) {
    setUiState("paused", `정지됨 · t=${current.samples[getPlayIndex()].t.toFixed(2)} s — 한 단계씩 진행하세요.`);
    return;
  }
  setPlaying(true);
  setUiState("running", `실행 중 · t=0.00 s / ${p.durationSec} s`);
  setRaf(requestAnimationFrame((t) => playLoop(t)));
  // 상태 텍스트를 주기적으로 갱신 (매 프레임이 아닌 250ms 간격).
  const tick = () => {
    const c = getRun();
    if (uiState !== "running" || !c) return;
    const s = c.samples[getPlayIndex()];
    $("status-text").textContent = `실행 중 · t=${s.t.toFixed(2)} s / ${c.parameters.durationSec} s`;
    if (uiState === "running") setTimeout(tick, 250);
  };
  setTimeout(tick, 250);
}

function onTerminated(userPaused: boolean) {
  stopLoop();
  const current = getRun();
  if (!current) {
    setUiState("ready", "조건을 정하고 시작을 누르세요.");
    return;
  }
  const s = current.samples[getPlayIndex()];
  if (userPaused) {
    setUiState("paused", `정지됨 · t=${s.t.toFixed(2)} s — 한 단계씩 진행할 수 있습니다.`);
    return;
  }
  if (current.terminationReason === "tiltLimit") {
    setUiState("limitReached", `축이 60°를 넘겨 종료 · t=${s.t.toFixed(2)} s — 조건을 낮추고 다시 실행하세요.`);
  } else if (current.terminationReason === "groundContact") {
    setUiState("groundContact", `바닥에 닿아 종료(P1 감지) · t=${s.t.toFixed(2)} s — 닿은 뒤 움직임은 계산하지 않습니다.`);
  } else {
    setUiState("completed", `완료 · t=${s.t.toFixed(2)} s — 비교 탭에 저장할 수 있습니다.`);
  }
  refresh();
}

function showNumericalError(title: string, detail: string) {
  stopLoop();
  setUiState("numericalError", `${title} (${detail})`);
  const box = $("error-box");
  box.innerHTML = "";
  const div = document.createElement("div");
  div.className = "alert";
  div.setAttribute("role", "alert");
  const h = document.createElement("h3");
  h.textContent = "수치 오류 — 실패를 성공으로 표시하지 않습니다";
  const pEl = document.createElement("p");
  pEl.textContent = `${title} ${detail}`;
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.type = "button";
  btn.textContent = "초기값으로 복원";
  btn.addEventListener("click", () => {
    ($("in-mass") as HTMLInputElement).value = "1";
    ($("in-dist") as HTMLInputElement).value = "0.1";
    ($("in-spin") as HTMLInputElement).value = "100";
    ($("in-tilt") as HTMLInputElement).value = "15";
    ($("p1-damping") as HTMLInputElement).checked = false;
    ($("p1-contact") as HTMLInputElement).checked = false;
    ($("in-pradius") as HTMLInputElement).value = "0.06";
    ($("in-pheight") as HTMLInputElement).value = "0.15";
    // P1을 끈 상태로 되돌린다.
    for (const id of ["in-pradius", "rg-pradius", "in-pheight", "rg-pheight"]) {
      ($(id) as HTMLInputElement).disabled = true;
    }
    syncRangeInputs();
    box.innerHTML = "";
    clearRun();
    draw();
    setUiState("ready", "초기값으로 복원했습니다. 다시 실행하세요.");
  });
  div.append(h, pEl, btn);
  box.appendChild(div);
  refresh();
}

/** 보기 버튼 동작. 3D 모듈은 처음 누를 때 내려받는다. */
async function onViewButton(b: HTMLButtonElement): Promise<void> {
  const v = b.dataset.view as "front" | "top" | "side" | "3d";
  if (v === "3d") {
    if (getView() === "3d") {
      // 3D를 다시 누르면 2D 정면으로 돌아온다.
      setView("front");
      cameraView = "front";
    } else if (webglDead || !webGLAvailable()) {
      // 3D 불가: 2D 정면에 머물고 이유를 알린다.
      webglDead = true;
      setView("front");
      ($("webgl-note") as HTMLElement).hidden = false;
    } else {
      $("status-text").textContent = "3D 준비 중…";
      const ok = await ensureScene3d();
      if (!ok) {
        webglDead = true;
        setView("front");
        ($("webgl-note") as HTMLElement).hidden = false;
      } else {
        setView("3d");
      }
    }
  } else if (getView() === "3d") {
    // 3D에서는 정면·위·옆이 카메라 위치가 된다. 자동 회전은 없다.
    cameraView = v;
  } else {
    setView(v);
  }
  syncViewButtons();
  draw();
}

function init() {
  records = loadRecords();

  // 숫자↔슬라이더 동기화 (드래그 대체 조작).
  for (const key of PARAM_KEYS) pairNumericRange(key, syncRangeInputs);

  // P1: 접촉 감지를 켜야 반지름·높이를 고를 수 있다.
  const contactBox = $("p1-contact") as HTMLInputElement;
  const syncP1Enabled = () => {
    const on = contactBox.checked;
    for (const id of ["in-pradius", "rg-pradius", "in-pheight", "rg-pheight"]) {
      ($(id) as HTMLInputElement).disabled = !on;
    }
  };
  contactBox.addEventListener("change", syncP1Enabled);
  syncP1Enabled();

  document.querySelectorAll<HTMLButtonElement>(".segmented [data-view]").forEach((b) => {
    b.addEventListener("click", () => {
      void onViewButton(b);
    });
  });
  for (const id of ["v-L", "v-tau", "v-g", "v-trail"]) {
    $(id).addEventListener("change", draw);
  }

  $("btn-run").addEventListener("click", () => doRun(false));
  $("btn-start-top").addEventListener("click", () => {
    document.querySelector("#h-lab")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    $("btn-run").focus();
    doRun(false);
  });
  $("btn-pause").addEventListener("click", () => onTerminated(true));
  $("btn-step").addEventListener("click", () => {
    const current = getRun();
    if (!current) {
      doRun(true);
      return;
    }
    stopLoop();
    setPlayIndex(getPlayIndex() + 1);
    refresh();
    const s = current.samples[getPlayIndex()];
    if (getPlayIndex() >= current.samples.length - 1) {
      onTerminated(false);
    } else {
      setUiState("paused", `정지됨 · t=${s.t.toFixed(2)} s`);
    }
  });
  $("btn-reset").addEventListener("click", () => {
    stopLoop();
    setPlayIndex(0);
    ($("error-box") as HTMLElement).innerHTML = "";
    if (getRun()) refresh();
    else draw();
    setUiState("ready", "시점으로 복귀했습니다. 다시 실행하세요.");
  });

  // 탭이 숨겨지면 계산(재생)을 멈춘다 (공통 원칙 §4).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && uiState === "running") onTerminated(true);
  });

  const needRun = () => {
    if (!getRun()) {
      $("status-text").textContent = "먼저 실행하세요. 저장할 결과가 없습니다.";
      return null;
    }
    return getRun()!;
  };
  $("btn-save-a").addEventListener("click", () => {
    const r = needRun();
    if (r) saveCompareSlot("A", r, $("card-a"));
  });
  $("btn-save-b").addEventListener("click", () => {
    const r = needRun();
    if (r) saveCompareSlot("B", r, $("card-b"));
  });
  $("btn-doublespin").addEventListener("click", () => {
    const spin = $(`in-spin`) as HTMLInputElement;
    const v = Number(spin.value);
    if (Number.isFinite(v)) {
      spin.value = String(Math.min(120, v * 2));
      syncRangeInputs();
      $("status-text").textContent = `회전 속도를 ${(spin.value as string)} rad/s로 바꿨습니다. 실행 후 B에 저장하세요.`;
      ($("btn-run") as HTMLButtonElement).focus();
    }
  });

  $("btn-save-record").addEventListener("click", () => {
    const current = getRun();
    if (!current) {
      $("record-status").textContent = "먼저 실행하세요. 저장할 결과가 없습니다.";
      return;
    }
    const memo = ($("memo") as HTMLTextAreaElement).value.trim();
    const pred = (document.querySelector('input[name="prediction"]:checked') as HTMLInputElement | null)?.value ?? "";
    appendRecord(records, buildRecord(readParams(), current, pred, memo));
    ($("memo") as HTMLTextAreaElement).value = "";
    renderRecords(records);
    $("record-status").textContent += " 저장했습니다.";
  });
  $("btn-export").addEventListener("click", () => exportRecords(records));

  // 업데이트 내역 dialog — 네이티브 <dialog>의 포커스 진입/복귀를 사용한다.
  const dialog = $("log-dialog") as HTMLDialogElement;
  $("open-log").addEventListener("click", async () => {
    lastFocusBeforeDialog = document.activeElement as HTMLElement;
    const bodyEl = $("log-body");
    try {
      const res = await fetch("docs/UPDATELOG.md", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      bodyEl.innerHTML = "";
      const pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.textContent = text.slice(0, 4000);
      bodyEl.appendChild(pre);
    } catch {
      bodyEl.innerHTML = "";
      const pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.textContent = LOG_FALLBACK;
      bodyEl.appendChild(pre);
    }
    dialog.showModal();
    ($("close-log") as HTMLButtonElement).focus();
  });
  $("close-log").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    (lastFocusBeforeDialog ?? ($("open-log") as HTMLElement)).focus();
  });

  window.addEventListener("resize", () => {
    draw();
    drawTimeGraph();
  });

  // 초기 수치표: 기본 조건의 근사값만 미리 표시 (실측처럼 쓰지 않는다).
  renderInitialTable(readParams());
  $("engine-ver").textContent = `엔진 v${ENGINE_VERSION} · 시나리오 ${SCENARIO_VERSION}`;

  // gi-pulse는 한 버튼에만.
  renderRecords(records);
  setUiState("ready", "조건을 정하고 시작을 누르세요.");
  // 첫 화면의 시작 버튼이 초기 강조를 가진다.
  $("btn-run").classList.remove("gi-pulse");
  $("btn-start-top").classList.add("gi-pulse");
  draw();
  drawTimeGraph();
}

document.addEventListener("DOMContentLoaded", init);
