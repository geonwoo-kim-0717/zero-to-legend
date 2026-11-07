export const VIEW_W = 640;
export const VIEW_H = 360;

export const PLAYER = {
  speed: 140,
  maxHp: 100,
  radius: 6,
  pickupRadius: 48,
  hurtInvuln: 0.6,
  dashSpeedMul: 3.5,
  dashTime: 0.15,
  dashInvuln: 0.2,
  dashCooldown: 3,
};

export const MAX_ENEMIES = 600;
export const GRID_CELL = 48;

export const COLORS = {
  cyan: 0x00f0ff,
  magenta: 0xff2bd6,
  yellow: 0xfff23a,
  orange: 0xff8a1f,
  green: 0x39ff88,
  bg: 0x07060f,
  gridLine: 0x2a1747,
};

/** 공간 분할 질의 시 여유 반경 (가장 큰 적인 보스 반지름 이상) */
export const MAX_ENEMY_RADIUS = 28;

/** 실제 캔버스는 논리 해상도의 2배로 그려 글자를 선명하게 한다 */
export const ZOOM = 2;
