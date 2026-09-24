import { $ } from "./dom";

/** Shows a numerical failure and lets the caller restore its initial values. */
export function showNumericalError(title: string, detail: string, onRestore: () => void): void {
  const box = $("error-box");
  box.innerHTML = "";
  const div = document.createElement("div");
  div.className = "alert";
  div.setAttribute("role", "alert");
  const h = document.createElement("h3");
  h.textContent = "수치 오류 — 실패를 성공으로 표시하지 않습니다";
  const p = document.createElement("p");
  p.textContent = `${title} ${detail}`;
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.type = "button";
  btn.textContent = "초기값으로 복원";
  btn.addEventListener("click", onRestore);
  div.append(h, p, btn);
  box.appendChild(div);
}
