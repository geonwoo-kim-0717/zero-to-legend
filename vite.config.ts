import { defineConfig, loadEnv, type Plugin } from 'vite';
import { execSync } from 'node:child_process';

/** 시작 화면에 보일 빌드 번호: v0.<커밋 수> - 월.일 (짧은 해시). git이 없으면 날짜만 */
function buildLabel(): string {
  const d = new Date();
  const date = `${d.getMonth() + 1}.${d.getDate()}`;
  try {
    const git = (c: string) => execSync(`git ${c}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `v0.${git('rev-list --count HEAD')} - ${date} (${git('rev-parse --short HEAD')})`;
  } catch {
    return `v0 - ${date}`;
  }
}

/** 웹(AdSense) 빌드에서만 <head>에 AdSense 코드를 넣는다. AdSense 심사 봇은 HTML에 박힌 태그를 확인한다 */
function adsenseTag(client: string): Plugin {
  return {
    name: 'adsense-tag',
    transformIndexHtml(html) {
      const tag = `  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>\n`;
      return html.replace('</head>', `${tag}</head>`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const client = env.VITE_ADS === 'h5' ? env.VITE_ADSENSE_CLIENT : '';
  return { base: './', server: { port: 5173 }, plugins: client ? [adsenseTag(client)] : [], define: { __BUILD__: JSON.stringify(buildLabel()) } };
});
