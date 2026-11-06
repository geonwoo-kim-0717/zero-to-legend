import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // 스토어에 한 번 올리면 바꿀 수 없는 앱 ID. 첫 업로드 전에 원하는 이름으로 정할 것
  appId: 'com.zerotolegend.game',
  appName: 'Zero to Legend',
  webDir: 'dist',
  android: { backgroundColor: '#07060f' },
  plugins: {
    AdMob: {},
  },
};

export default config;
