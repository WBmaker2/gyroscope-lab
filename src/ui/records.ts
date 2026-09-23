// records.ts — 실험 기록 저장·표시·내보내기.
// 저장 형식은 공통 원칙 §4의 기록 포맷을 따른다 (버전·입력·관측 포함).
// localStorage에는 개인 식별 정보 없이 실험 기록만 둔다.
// 저장 불가 시 현재 세션 + JSON 내보내기를 쓴다.

import { toRecord, type RunParameters, type RunResult } from "../physics/runner";
import { $ } from "./dom";

export interface StoredRecord {
  createdAt: string;
  prediction: string;
  params: RunParameters;
  termination: string;
  memo: string;
  engineVersion: string;
  scenarioVersion: string;
  observations: {
    terminationReason: string;
    maxEnergyDrift: number;
    measuredPrecessionRadPerSec: number | null;
    sampleCount: number;
  };
}

const LS_KEY = "gyroscope-lab.records.v1";

export function loadRecords(): StoredRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as StoredRecord[];
  } catch {
    /* 저장 불가 시 현재 세션만 사용 (공통 원칙 §4). */
  }
  return [];
}

function persist(records: StoredRecord[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch {
    /* 저장 불가 — 세션 + 내보내기 (공통 원칙 §4) */
  }
}

export function storageOK(): boolean {
  try {
    localStorage.setItem("__probe", "1");
    localStorage.removeItem("__probe");
    return true;
  } catch {
    return false;
  }
}

/** 전체 기록 형식을 그대로 저장한다. 화면 표시는 그 일부를 읽는다. */
export function buildRecord(
  p: RunParameters,
  result: RunResult,
  prediction: string,
  memo: string
): StoredRecord {
  const full = toRecord("gyroscope-lab", "precession-compare", p, result, prediction, memo);
  return {
    createdAt: full.createdAt,
    prediction,
    params: p,
    termination: result.terminationReason,
    memo,
    engineVersion: full.engineVersion,
    scenarioVersion: full.scenarioVersion,
    observations: full.observations
  };
}

export function appendRecord(records: StoredRecord[], rec: StoredRecord): void {
  records.push(rec);
  persist(records);
}

export function renderRecords(records: StoredRecord[]): void {
  $("record-status").textContent = `저장된 기록 ${records.length}개 (${storageOK() ? "이 브라우저에만 저장" : "저장 불가 — 세션 + JSON 내보내기 사용"}).`;
  const table = $("record-table") as HTMLTableElement;
  const tb = table.querySelector("tbody")!;
  tb.innerHTML = "";
  table.hidden = records.length === 0;
  for (const r of records.slice().reverse()) {
    const tr = document.createElement("tr");
    const cond = `ω=${r.params.spinRadPerSec}, 기울기=${r.params.tiltDeg}°`;
    for (const txt of [new Date(r.createdAt).toLocaleString("ko-KR"), r.prediction || "(예측 없음)", cond, r.termination]) {
      const td = document.createElement("td");
      td.textContent = txt;
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
}

export function exportRecords(records: StoredRecord[]): void {
  const blob = new Blob([JSON.stringify({ schemaVersion: 1, appId: "gyroscope-lab", records }, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gyroscope-lab-records.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
