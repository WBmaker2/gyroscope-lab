// scene3d.ts — Three.js 3D 보기 (M4).
// 같은 계산 상태(q·L에서 뽑은 축·벡터)를 그린다. 화면 부드러움용 보간은 하지 않고
// 현재 샘플 상태를 그대로 그린다. 카메라 자동 회전은 없고 정면·위·옆만 둔다.
// WebGL이 실패하면 {ok:false}를 돌려주고 호출자가 2D로 머문다 (대체 화면).

import * as THREE from "three";
import type { BodyParams } from "../physics/rigidBody";
import { gravityTorque } from "../physics/rigidBody";
import type { Quat, Vec3 } from "../physics/quaternion";
import type { RunResult } from "../physics/runner";
import type { SimFlags } from "./sim2d";

export type CameraView = "front" | "top" | "side";

const ROD_LEN = 1.0;
const WHEEL_R = 0.32;
const PIVOT_Z = 0.15;

interface Scene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rod: THREE.Mesh;
  wheel: THREE.Mesh;
  arrowL: THREE.ArrowHelper;
  arrowTau: THREE.ArrowHelper;
  arrowG: THREE.ArrowHelper;
  trail: THREE.Line;
  pivot: THREE.Mesh;
}

let cached: Scene | null = null;
let cachedCanvas: HTMLCanvasElement | null = null;

function build(canvas: HTMLCanvasElement): Scene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0xffffff, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.01, 100);
  camera.up.set(0, 0, 1); // 물리 z가 위.

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd4d4d4, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(2, -3, 4);
  scene.add(sun);

  // 바닥 격자 (z=0 평면).
  const grid = new THREE.GridHelper(4, 14, 0xd4d4d4, 0xe5e5e5);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const ink = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 16), ink);
  pivot.position.set(0, 0, PIVOT_Z);
  scene.add(pivot);

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 12), ink);
  scene.add(rod);

  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.05, 40),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 })
  );
  // 테두리 선으로 원반을 또렷하게.
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(wheel.geometry),
    new THREE.LineBasicMaterial({ color: 0x111111 })
  );
  wheel.add(rim);
  scene.add(wheel);

  const arrowL = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.5, 0x005a00, 0.09, 0.05);
  const arrowTau = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.4, 0x7a4a00, 0.09, 0.05);
  const arrowG = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.4, 0xb00020, 0.09, 0.05);
  scene.add(arrowL, arrowTau, arrowG);

  // 축 끝점 궤적 (최대 400점).
  const trailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]);
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineDashedMaterial({ color: 0x999999, dashSize: 0.03, gapSize: 0.02 })
  );
  scene.add(trail);

  return { renderer, scene, camera, rod, wheel, arrowL, arrowTau, arrowG, trail, pivot };
}

function placeCamera(s: Scene, cam: CameraView): void {
  if (cam === "front") s.camera.position.set(0, -2.6, 1.0);
  else if (cam === "top") s.camera.position.set(0, 0, 3.0);
  else s.camera.position.set(2.6, 0, 1.0);
  s.camera.lookAt(0, 0, 0.55);
}

function toV(v: Vec3 | [number, number, number] | number[], z?: number): THREE.Vector3 {
  if (z !== undefined) return new THREE.Vector3(v[0], v[1], z);
  return new THREE.Vector3(v[0], v[1], v[2]);
}

function setArrow(arrow: THREE.ArrowHelper, origin: THREE.Vector3, dir: THREE.Vector3, len: number): void {
  if (dir.length() < 1e-9) {
    arrow.visible = false;
    return;
  }
  arrow.visible = true;
  arrow.position.copy(origin);
  arrow.setDirection(dir.clone().normalize());
  arrow.setLength(len, 0.09, 0.05);
}

export function render3d(
  canvas: HTMLCanvasElement,
  cam: CameraView,
  result: RunResult | null,
  playIndex: number,
  q: Quat,
  L: Vec3,
  body: BodyParams,
  flags: SimFlags
): { ok: true } | { ok: false; reason: string } {
  try {
    if (!cached || cachedCanvas !== canvas) {
      cached?.renderer.dispose();
      cached = build(canvas);
      cachedCanvas = canvas;
    }
    const s = cached;
    const w = canvas.clientWidth || 640;
    const h = Math.round((w * 3) / 4);
    s.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    s.renderer.setSize(w, h, false);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
    placeCamera(s, cam);

    if (!result) {
      s.renderer.render(s.scene, s.camera);
      return { ok: true };
    }
    const sample = result.samples[Math.min(playIndex, result.samples.length - 1)];
    const tip = toV(sample.axis).multiplyScalar(ROD_LEN).add(new THREE.Vector3(0, 0, PIVOT_Z));
    const mid = toV(sample.axis).multiplyScalar(ROD_LEN * 0.55).add(new THREE.Vector3(0, 0, PIVOT_Z));

    // 막대: pivot→tip.
    const pivotP = new THREE.Vector3(0, 0, PIVOT_Z);
    const dir = tip.clone().sub(pivotP);
    s.rod.position.copy(pivotP.clone().add(tip).multiplyScalar(0.5));
    s.rod.scale.set(1, dir.length(), 1);
    s.rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

    // 바퀴: 축 끝, 축에 수직인 원반.
    s.wheel.position.copy(tip);
    s.wheel.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      toV(sample.axis).normalize()
    );

    // 벡터 (방향만, 길이 고정). 파선은 LineDashedMaterial 대신 화살표+글자로 구분한다.
    // (3D 화살표 파선은 계산이 커서 색+라벨로 구분하고 2D에서 선 모양을 본다.)
    const tau = gravityTorque(body, { q, angularMomentumWorld: L });
    s.arrowL.visible = flags.showL;
    s.arrowTau.visible = flags.showTau;
    s.arrowG.visible = flags.showG;
    if (flags.showL) setArrow(s.arrowL, mid, toV(L), 0.55);
    if (flags.showTau) setArrow(s.arrowTau, mid, toV(tau), 0.45);
    if (flags.showG) setArrow(s.arrowG, mid, new THREE.Vector3(0, 0, -1), 0.45);

    // 궤적.
    if (flags.showTrail) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= playIndex && i < result.samples.length; i += 4) {
        const a = result.samples[i].axis;
        pts.push(new THREE.Vector3(a[0] * ROD_LEN, a[1] * ROD_LEN, a[2] * ROD_LEN + PIVOT_Z));
        if (pts.length >= 400) break;
      }
      s.trail.visible = pts.length > 1;
      s.trail.geometry.dispose();
      s.trail.geometry = new THREE.BufferGeometry().setFromPoints(pts.length > 1 ? pts : [tip, tip]);
      s.trail.computeLineDistances();
    } else {
      s.trail.visible = false;
    }

    s.renderer.render(s.scene, s.camera);
    return { ok: true };
  } catch (err) {
    cached = null;
    cachedCanvas = null;
    return { ok: false, reason: String(err) };
  }
}

/** 처음 한 번만 WebGL 가능 여부를 본다. */
export function webGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}
