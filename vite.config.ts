import { defineConfig, loadEnv, type Plugin } from 'vite';

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
  return { base: './', server: { port: 5173 }, plugins: client ? [adsenseTag(client)] : [] };
});
