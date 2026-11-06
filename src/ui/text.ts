import type Phaser from 'phaser';
import { ZOOM } from '../config';

export const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/** 모든 글자의 기본 스타일: 한글 폰트 + 어두운 외곽선으로 배경 위에서도 잘 보이게 */
export const BASE_TEXT = {
  fontFamily: FONT,
  fontStyle: 'bold',
  stroke: '#05030c',
  strokeThickness: 3,
  resolution: ZOOM,
};

/** 논리 좌표(640x360)를 그대로 쓰면서 캔버스는 2배 해상도로 그리도록 카메라 설정 */
export function setupCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setOrigin(0, 0).setZoom(ZOOM);
}
