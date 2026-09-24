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
import { showNumericalError as showNumericalErrorUI } from "./errors";
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
import { bindComparisonControls } from "./compare";
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

const LOG_FALLBACK = `## 2026-09-24
- 예측을 고른 뒤 실험하고, 완료 후 비교 단계로 이동할 수 있다.
- 2배 비교는 정확한 값을 유지하며, 범위를 넘으면 값을 자르지 않고 안내한다.
- 세차·토크·각운동량을 먼저 설명하고 계산 세부정보는 펼쳐서 확인한다.
- 실행 중 키보드 초점을 정지 버튼에 두고 상태 안내를 간결하게 했다.
- 3D 불러오기 상태와 예상·관찰·이유 기록 문장 틀을 추가했다.
- 엔진 v${ENGINE_VERSION} · 시나리오 ${SCENARIO_VERSION}`;

function setUiState(s: UiState, text: string) {
  const active = document.activeElement;
  const runButton = $("btn-run") as HTMLButtonElement;
  const pauseButton = $("btn-pause") as HTMLButtonElement;
  if (s === "running" && active === runButton) {
    pauseButton.disabled = false;
    pauseButton.focus();
  }
  const completionWrap = $("completion-link-wrap") as HTMLElement;
  completionWrap.hidden = s !== "completed";
  for (const id of ["btn-run", "btn-start-top", "completion-link", "btn-save-a", "btn-save-b", "btn-doublespin"]) {
    $(id).classList.remove("gi-pulse");
  }
  if (s === "completed") $("completion-link").classList.add("gi-pulse");
  uiState = s;
  const line = $("status");
  line.dataset.state = s;
  $("status-badge").textContent = STATE_LABEL[s];
  $("status-text").textContent = text;
  pauseButton.disabled = s !== "running";
  runButton.disabled = s === "running";
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
  if (!requirePrediction()) return;
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
    setUiState("paused", `t=${current.samples[getPlayIndex()].t.toFixed(2)} s — 한 단계씩 진행하세요.`);
    return;
  }
  setPlaying(true);
  setUiState("running", `t=0.00 s / ${p.durationSec} s`);
  setRaf(requestAnimationFrame((t) => playLoop(t)));
  // 상태 텍스트를 주기적으로 갱신 (매 프레임이 아닌 250ms 간격).
  const tick = () => {
    const c = getRun();
    if (uiState !== "running" || !c) return;
    const s = c.samples[getPlayIndex()];
    $("status-text").textContent = `t=${s.t.toFixed(2)} s / ${c.parameters.durationSec} s`;
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
    setUiState("paused", `t=${s.t.toFixed(2)} s — 한 단계씩 진행할 수 있습니다.`);
    return;
  }
  if (current.terminationReason === "tiltLimit") {
    setUiState("limitReached", `축이 60°를 넘겨 t=${s.t.toFixed(2)} s에 멈췄습니다. 조건을 낮추고 다시 실행하세요.`);
  } else if (current.terminationReason === "groundContact") {
    setUiState("groundContact", `t=${s.t.toFixed(2)} s에 바닥에 닿았습니다. 닿은 뒤 움직임은 계산하지 않습니다.`);
  } else {
    setUiState("completed", `t=${s.t.toFixed(2)} s까지 실행했습니다.`);
    ($("completion-link-wrap") as HTMLElement).hidden = false;
    ($("completion-link") as HTMLAnchorElement).focus();
  }
  refresh();
}

function requirePrediction(): boolean {
  const selected = document.querySelector('input[name="prediction"]:checked');
  if (selected) return true;
  setUiState("ready", "예측을 하나 선택한 뒤 실험을 시작하세요.");
  const first = document.querySelector<HTMLInputElement>('input[name="prediction"]');
  first?.focus();
  first?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  return false;
}

function showNumericalError(title: string, detail: string) {
  stopLoop();
  setUiState("numericalError", `${title} (${detail})`);
  showNumericalErrorUI(title, detail, () => {
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
    $("error-box").innerHTML = "";
    clearRun();
    draw();
    setUiState("ready", "초기값으로 복원했습니다. 다시 실행하세요.");
  });
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
      ($("three-status") as HTMLElement).textContent = "2D 보기로 돌아왔습니다.";
    } else if (webglDead || !webGLAvailable()) {
      // 3D 불가: 2D 정면에 머물고 이유를 알린다.
      webglDead = true;
      setView("front");
      ($("webgl-note") as HTMLElement).hidden = false;
      const threeStatus = $("three-status") as HTMLElement;
      threeStatus.hidden = false;
      threeStatus.textContent = "3D를 사용할 수 없어 2D 보기로 표시합니다.";
    } else {
      const threeStatus = $("three-status") as HTMLElement;
      threeStatus.hidden = false;
      threeStatus.textContent = "3D 보기를 불러오는 중입니다.";
      const ok = await ensureScene3d();
      if (!ok) {
        webglDead = true;
        setView("front");
        ($("webgl-note") as HTMLElement).hidden = false;
        threeStatus.textContent = "3D를 불러오지 못했습니다. 2D 보기로 표시합니다.";
      } else {
        setView("3d");
        threeStatus.textContent = "3D 보기를 불러왔습니다.";
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
    if (!requirePrediction()) return;
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
      setUiState("paused", `t=${s.t.toFixed(2)} s — 다음 단계로 진행할 수 있습니다.`);
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

  bindComparisonControls((message) => setUiState("ready", message));

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
