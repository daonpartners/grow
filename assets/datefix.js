/* 날짜 입력 보정 (2026-10-15)
   - 브라우저 기본 날짜칸은 연도에 6자리까지 들어가 20230520을 치면 202305-월-일이 됨
   - 모든 날짜칸을 숫자 입력칸으로 바꿔 8자리(20230520)를 치면 2023-05-20으로 자동 정리
   - 오른쪽 달력 버튼으로 기존처럼 달력에서도 고를 수 있음
   - 값 형식은 그대로 YYYY-MM-DD라 기존 화면 코드는 고칠 필요 없음
   - 날짜가 다 입력되기 전(예: 2023-05)에는 화면 코드에 값을 넘기지 않음 */
(function () {
  if (window.__dateFix) return; window.__dateFix = 1;
  var css = document.createElement('style');
  css.textContent =
    '.dfx{position:relative;display:inline-block;max-width:100%;vertical-align:middle}' +
    '.dfx.blk{display:block}' +
    '.dfx>input.dfx-in{padding-right:34px!important;box-sizing:border-box}' +
    '.dfx>.dfx-b{position:absolute;right:4px;top:50%;transform:translateY(-50%);border:0;background:none;cursor:pointer;font-size:15px;line-height:1;padding:4px;opacity:.75;color:inherit}' +
    '.dfx>.dfx-b:hover{opacity:1}' +
    '.dfx>.dfx-h{position:absolute;right:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;padding:0;margin:0}' +
    '.dfx>input.dfx-bad{outline:2px solid #d93025;outline-offset:-1px}';
  (document.head || document.documentElement).appendChild(css);

  function fmt(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 8);
    if (d.length > 6) return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
    if (d.length > 4) return d.slice(0, 4) + '-' + d.slice(4);
    return d;
  }
  function ok(el, v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var p = v.split('-').map(Number), t = new Date(p[0], p[1] - 1, p[2]);
    if (t.getFullYear() !== p[0] || t.getMonth() !== p[1] - 1 || t.getDate() !== p[2]) return false;
    var mn = el.getAttribute('data-dfx-min'), mx = el.getAttribute('data-dfx-max');
    if (mn && v < mn) return false;
    if (mx && v > mx) return false;
    return true;
  }
  function fire(el, type) { var e = new Event(type, { bubbles: true }); e.__dfx = 1; el.dispatchEvent(e); }

  function conv(el) {
    if (el.getAttribute('data-dfx')) return;
    el.setAttribute('data-dfx', '1');
    var val = el.value, mn = el.getAttribute('min'), mx = el.getAttribute('max');
    var pw = el.parentNode && el.parentNode.clientWidth, block = !!(el.closest && el.closest('.field')) || /width\s*:\s*100%/.test(el.getAttribute('style') || '') || (el.offsetWidth > 0 && pw && el.offsetWidth >= pw - 4);
    el.type = 'text';
    el.classList.add('dfx-in');
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('maxlength', '10');
    el.setAttribute('autocomplete', 'off');
    if (mn) el.setAttribute('data-dfx-min', mn);
    if (mx) el.setAttribute('data-dfx-max', mx);
    if (!el.getAttribute('placeholder')) el.setAttribute('placeholder', 'YYYYMMDD');
    el.value = val;
    var w = document.createElement('span');
    w.className = 'dfx' + (block ? ' blk' : '');
    if (el.style.width) { w.style.width = el.style.width; el.style.width = '100%'; }
    else if (block) el.style.width = '100%';
    else { w.style.width = '150px'; el.style.width = '100%'; }
    if (el.style.flex) { w.style.flex = el.style.flex; }
    el.parentNode.insertBefore(w, el);
    w.appendChild(el);
    var h = document.createElement('input');
    h.type = 'date'; h.className = 'dfx-h'; h.tabIndex = -1; h.setAttribute('aria-hidden', 'true');
    if (mn) h.min = mn; if (mx) h.max = mx;
    w.appendChild(h);
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'dfx-b'; b.setAttribute('aria-label', '달력에서 날짜 고르기'); b.textContent = '📅';
    if (el.disabled) b.disabled = true;
    w.appendChild(b);
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      h.value = ok(el, el.value) ? el.value : '';
      try { h.showPicker(); } catch (err) { h.style.pointerEvents = 'auto'; h.focus(); h.click(); }
    });
    h.addEventListener('change', function (e) {
      e.stopPropagation();
      if (!h.value) return;
      el.value = h.value; el.classList.remove('dfx-bad');
      fire(el, 'input'); fire(el, 'change');
    });
  }

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-dfx') || e.__dfx) return;
    var f = fmt(el.value);
    if (f !== el.value) el.value = f;
    if (f !== '' && !ok(el, f)) { e.stopImmediatePropagation(); if (f.length === 10) el.classList.add('dfx-bad'); }
    else el.classList.remove('dfx-bad');
  }, true);
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-dfx') || e.__dfx) return;
    if (el.value && !ok(el, el.value)) {
      el.value = ''; el.classList.add('dfx-bad');
      setTimeout(function () { el.classList.remove('dfx-bad'); }, 1500);
      fire(el, 'input');
    }
  }, true);

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('input[type=date]:not(.dfx-h)')) conv(root);
    var list = root.querySelectorAll('input[type=date]:not(.dfx-h)');
    for (var i = 0; i < list.length; i++) conv(list[i]);
  }
  function start() {
    scan(document);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) scan(ms[i].addedNodes[j]);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
