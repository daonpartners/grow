/* 어느 페이지에서나 홈(보험물어봄)으로 돌아가는 버튼. 화면 아래 고정 버튼이 있으면 그 위로 올라감 */
(function () {
  var p = location.pathname;
  if (p === '/daon/' || p === '/daon/index.html' || p === '/daon') return;
  var a = document.createElement('a');
  a.href = '/daon/';
  a.setAttribute('aria-label', '보험물어봄 홈으로 가기');
  a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg><span>홈</span>';
  a.style.cssText = 'position:fixed;left:14px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:6px;background:#0B1E42;color:#fff;font:800 14px Pretendard,-apple-system,sans-serif;padding:10px 16px 10px 13px;border-radius:999px;box-shadow:0 6px 18px rgba(11,30,66,.32);text-decoration:none;transition:bottom .2s';
  function lift() {
    var h = 0, W = window.innerWidth, H = window.innerHeight;
    var els = document.body.getElementsByTagName('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el === a || a.contains(el)) continue;
      var cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom >= H - 2 && r.width > W * 0.5 && r.height < H * 0.5) h = Math.max(h, H - r.top);
    }
    a.style.bottom = (h ? h + 10 : 16) + 'px';
  }
  function start() { document.body.appendChild(a); lift(); window.addEventListener('resize', lift); setInterval(lift, 2000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
