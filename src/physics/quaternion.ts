// quaternion.ts — 몸체→세계 회전 quaternion 연산.
// 규약: q = [w, x, y, z], Hamilton 곱, 좌변에 세계 각속도 quaternion을 곱한다.
// qdot = 0.5 * [0, omega_world] ⊗ q  (spec 10-gyroscope-lab §5)
// 곱 방향과 라이브러리 순서를 혼동하지 않도록 이 파일의 multiply 순서에 의존한다.

export type Quat = [number, number, number, number];
export type Vec3 = [number, number, number];

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw
  ];
}

export function quatNorm(q: Quat): number {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

export function quatNormalize(q: Quat): Quat {
  const n = quatNorm(q);
  if (!Number.isFinite(n) || n === 0) return [1, 0, 0, 0];
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function quatConjugate(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** axis(세계/몸체 좌표계 단위벡터 가정)를 angle만큼 회전시키는 quaternion. */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle / 2;
  const s = Math.sin(half);
  return [Math.cos(half), axis[0] * s, axis[1] * s, axis[2] * s];
}

/** 벡터 v를 q로 회전시킨다: v' = q ⊗ [0,v] ⊗ q*. */
export function quatRotateVector(q: Quat, v: Vec3): Vec3 {
  const vq: Quat = [0, v[0], v[1], v[2]];
  const t = quatMultiply(q, vq);
  const r = quatMultiply(t, quatConjugate(q));
  return [r[1], r[2], r[3]];
}

/** 회전행렬 R (몸체→세계). 열이 몸체 기저축의 세계 좌표다. */
export function quatToMatrix(q: Quat): [
  [number, number, number],
  [number, number, number],
  [number, number, number]
] {
  const [w, x, y, z] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
  ];
}

export function matTransposeVec(
  m: [
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ],
  v: Vec3
): Vec3 {
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]
  ];
}

export function matApplyVec(
  m: [
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ],
  v: Vec3
): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
