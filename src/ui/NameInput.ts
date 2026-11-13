import { NAME_MAX, NAME_MIN, cleanName } from '../systems/Leaderboard';
import { t } from '../i18n';

/**
 * 닉네임 입력 창. 캔버스 위에 진짜 입력칸을 띄운다 (휴대폰 자판·한글 입력이 그대로 되게).
 * 확인하면 다듬은 닉네임, 취소하면 null.
 */
export function askName(current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(7,6,15,.82);font-family:"Noto Sans KR",sans-serif;touch-action:auto';
    const box = document.createElement('form');
    box.style.cssText = 'background:#0d0820;border:2px solid #ff2bd6;padding:18px 20px;display:flex;flex-direction:column;gap:12px;width:min(320px,86vw);box-sizing:border-box';
    const title = document.createElement('div');
    title.textContent = t('lb.name.title');
    title.style.cssText = 'color:#ff2bd6;font-weight:900;font-size:18px';
    const hint = document.createElement('div');
    hint.textContent = t('lb.name.hint', { a: NAME_MIN, b: NAME_MAX });
    hint.style.cssText = 'color:#8a7aa8;font-size:13px';
    const input = document.createElement('input');
    input.id = 'ztl-nickname';
    input.type = 'text';
    input.value = current;
    input.maxLength = NAME_MAX * 2;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.cssText = 'background:#07060f;color:#e8f7ff;border:1px solid #3a2466;padding:10px 12px;font:700 18px "Noto Sans KR",sans-serif;outline:none;width:100%;box-sizing:border-box';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
    const mk = (label: string, bg: string, fg: string, type: 'button' | 'submit') => {
      const b = document.createElement('button');
      b.type = type;
      b.textContent = label;
      b.style.cssText = `background:${bg};color:${fg};border:0;padding:8px 18px;font:700 14px "Noto Sans KR",sans-serif;cursor:pointer`;
      return b;
    };
    const cancel = mk(t('lb.name.cancel'), '#2a2040', '#e8f7ff', 'button');
    const ok = mk(t('lb.name.ok'), '#fff23a', '#07060f', 'submit');
    row.append(cancel, ok);
    box.append(title, hint, input, row);
    wrap.append(box);
    document.body.append(wrap);
    const stop = (e: Event) => e.stopPropagation(); // 게임이 자판·터치를 가로채지 않게
    for (const ev of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup']) wrap.addEventListener(ev, stop);
    const done = (v: string | null) => {
      wrap.remove();
      resolve(v);
    };
    const check = () => {
      const v = cleanName(input.value);
      ok.style.opacity = v ? '1' : '.4';
      return v;
    };
    input.addEventListener('input', check);
    check();
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = check();
      if (v) done(v);
      else input.focus();
    });
    cancel.addEventListener('click', () => done(null));
    wrap.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') done(null);
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  });
}
