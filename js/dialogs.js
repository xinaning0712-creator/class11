// ============================================================
// 頁面自己的小視窗（取代瀏覽器的 prompt／confirm）
//  有些瀏覽器（例如 App 裡內建的瀏覽器、部分平板）會擋掉瀏覽器的跳出視窗，按了沒反應。
//  ask(…)  → 輸入文字，回傳字串；按取消回傳 null
//  sure(…) → 確認，回傳 true / false
// ============================================================
let box = null;

function build() {
  if (box) return box;
  const style = document.createElement('style');
  style.textContent = `
    dialog.ui-dlg { border: none; border-radius: 20px; padding: 0; width: min(440px, calc(100vw - 32px));
      background: var(--surface, #fff); color: var(--ink, #3f2830); box-shadow: 0 20px 50px rgba(0,0,0,.2); }
    dialog.ui-dlg::backdrop { background: rgba(40, 30, 20, .45); }
    .ui-dlg form { display: grid; gap: .9rem; padding: 1.4rem; }
    .ui-dlg .ui-msg { margin: 0; font-size: 1.15rem; line-height: 1.6; white-space: pre-line; }
    .ui-dlg input { width: 100%; min-height: 52px; padding: .5rem .9rem; border: 1.5px solid var(--line, #f0d6de);
      border-radius: 12px; background: #fff; font: inherit; font-size: 1.2rem; }
    .ui-dlg .ui-err { margin: -.4rem 0 0; color: #cf3b36; font-size: .95rem; min-height: 1.2em; }
    .ui-dlg .ui-row { display: flex; gap: .6rem; justify-content: flex-end; flex-wrap: wrap; }
    .ui-dlg .ui-row button { min-height: 48px; min-width: 96px; padding: .4rem 1.2rem; border-radius: 12px;
      font: inherit; font-size: 1.05rem; cursor: pointer; border: 1.5px solid var(--line, #f0d6de); background: var(--surface, #fff); color: inherit; }
    .ui-dlg .ui-row .ui-ok { background: var(--accent, #c25d7c); border-color: var(--accent, #c25d7c); color: #fff; }
    .ui-dlg .ui-row .ui-ok.danger { background: #cf3b36; border-color: #cf3b36; }`;
  document.head.append(style);
  box = document.createElement('dialog');
  box.className = 'ui-dlg';
  box.innerHTML = '<form method="dialog"><p class="ui-msg"></p><input type="text" autocomplete="off">'
    + '<p class="ui-err"></p><div class="ui-row"><button type="button" class="ui-no">取消</button>'
    + '<button type="submit" class="ui-ok">確定</button></div></form>';
  document.body.append(box);
  return box;
}

function open({ message, input, value = '', placeholder = '', ok = '確定', danger = false, check }) {
  const d = build();
  const msg = d.querySelector('.ui-msg'), inp = d.querySelector('input'), err = d.querySelector('.ui-err');
  const okBtn = d.querySelector('.ui-ok'), noBtn = d.querySelector('.ui-no'), form = d.querySelector('form');
  msg.textContent = message;
  inp.hidden = !input; err.hidden = !input; err.textContent = '';
  inp.value = value; inp.placeholder = placeholder;
  okBtn.textContent = ok; okBtn.classList.toggle('danger', danger);
  return new Promise((resolve) => {
    const done = (v) => {
      form.onsubmit = null; noBtn.onclick = null; d.oncancel = null;
      if (d.open) d.close();
      resolve(v);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!input) return done(true);
      const v = inp.value.trim();
      const problem = check ? check(v) : (v ? '' : '請輸入內容');
      if (problem) { err.textContent = problem; inp.focus(); return; }
      done(v);
    };
    noBtn.onclick = () => done(input ? null : false);
    d.oncancel = (e) => { e.preventDefault(); done(input ? null : false); };
    d.showModal();
    if (input) { inp.focus(); inp.select(); } else okBtn.focus();
  });
}

/* 輸入文字；check(v) 回傳錯誤訊息（空字串代表沒問題） */
export function ask(message, opts = {}) { return open({ ...opts, message, input: true }); }
/* 確認；danger: true 時確定鍵是紅色 */
export function sure(message, opts = {}) { return open({ ...opts, message, input: false }); }
