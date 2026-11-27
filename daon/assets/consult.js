/* 보험물어봄 by 다온 — 상담 신청 페이지 공통 동작 (2026-11-11)
   각 페이지는 DaonConsult({...}) 한 번만 부르면 됩니다.
   - 연락받을 분(이름·휴대폰·생년월일), 연락 방법, 동의, 하단 표기(대리점·설계사 등록번호)는 여기서 자동으로 붙습니다.
   - <div class="seg" data-k="키"> 안의 버튼(data-v)은 한 개 고르기, <div class="opts multi" data-k="키">는 여러 개 고르기
   - data-if="키=값" 이 붙은 칸은 그 값을 골랐을 때만 보입니다.
*/
(function(){
  var KAKAO = 'https://pf.kakao.com/_ZVtsX/chat';
  var TEL = '0415341124';
  var PROFILE_API = 'https://daonpartners.app.n8n.cloud/webhook/daon-expert-profile';

  var LEGAL =
    '<div class="who">' +
      '<p><b>모집 보험대리점</b> 미래에셋금융서비스(주) · 대리점 등록번호 2014048012</p>' +
      '<p><b>담당 보험설계사</b> 김화진 · 설계사 등록번호 20150978060015</p>' +
      '<p><b>운영</b> 다온파트너스 · 충남 아산시 탕정면 용머리길 22, 상가동 3층 301호 · 041-534-1124</p>' +
    '</div>' +
    '<p>이 페이지는 보험 상담·가설계(견적) 신청 창구이며, 신청만으로 보험계약이 체결되지 않습니다.</p>' +
    '<p>보장 내용과 보험료는 보험회사의 인수 심사에 따라 달라질 수 있습니다. 계약 전 상품설명서와 약관을 반드시 확인하세요.</p>' +
    '<p>기존 계약을 해지하고 새로 가입하면 인수 거절, 보험료 인상, 보장 내용 변경 등 불이익이 있을 수 있습니다.</p>' +
    '<p>보험금은 약관의 지급 한도와 면책 사항에 따라 제한될 수 있으며, 고지 내용이 사실과 다르면 보험금 지급이 제한되거나 계약이 해지될 수 있습니다.</p>' +
    '<p>개인정보 보호책임자 다온파트너스 · 041-534-1124</p>';

  var LEGAL_DAON =
    '<div class="who">' +
      '<p><b>운영</b> 다온파트너스 · 충남 아산시 탕정면 용머리길 22, 상가동 3층 301호 · 041-534-1124</p>' +
    '</div>' +
    '<p>마케팅·제휴 서비스는 다온파트너스가 운영하며, 보험 가입 여부와 관계없이 모든 사장님께 같은 조건으로 제공합니다.</p>' +
    '<p>대가를 받고 작성하는 소개 글에는 \'광고\' 표시를 합니다. 실제 손님이 아닌 리뷰는 만들지 않습니다.</p>' +
    '<p>제휴 혜택의 내용과 이행은 각 제휴업체가 책임집니다.</p>' +
    '<p>개인정보 보호책임자 다온파트너스 · 041-534-1124</p>';

  function $(id){ return document.getElementById(id); }
  function v(id){ var e = $(id); return e ? (e.value || '').trim() : ''; }
  function digits(s){ return (s || '').replace(/\D/g, ''); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function fmtDate(el){
    var raw = el.value, d = digits(raw);
    if (raw.replace(/[\d.\-\s/]/g, '') !== '') return;           /* '3살' 같은 글자는 그대로 둠 */
    if (d.length === 8) el.value = d.slice(0,4) + '-' + d.slice(4,6) + '-' + d.slice(6,8);
  }
  function validDate(s, minY, maxY){
    var m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3], dt = new Date(y, mo - 1, d);
    return y >= minY && y <= maxY && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  window.DaonConsult = function(cfg){
    var params = new URLSearchParams(location.search);
    var code = params.get('m') || params.get('a') || '';
    var S = {}, PHOTOS = {}, FC = null;
    var nowY = new Date().getFullYear();

    /* ── 연락받을 분 · 동의 묶음 붙이기 ── */
    var who = cfg.whoTitle || '연락받으실 분';
    var host = document.querySelector('[data-contact]');
    if (host) host.outerHTML =
      '<section class="cs-sec" id="secContact">' +
        '<h2><span class="n">' + (cfg.contactNo || '✓') + '</span>' + esc(who) + '</h2>' +
        (cfg.whoDesc ? '<p class="desc">' + esc(cfg.whoDesc) + '</p>' : '') +
        '<div class="fl"><label for="uName">이름</label><input class="inp" id="uName" autocomplete="name" maxlength="20" placeholder="홍길동"></div>' +
        '<div class="fl"><label for="uPhone">휴대폰 번호</label><input class="inp" id="uPhone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="13" placeholder="010-0000-0000"></div>' +
        (cfg.noBirth ? '' : '<div class="fl"><label for="uBirth">생년월일 <small>숫자 8자리 · 예) 19800101</small></label><input class="inp" id="uBirth" inputmode="numeric" maxlength="10" placeholder="19800101"></div>') +
        '<div class="fl"><span class="lb">어떻게 연락드릴까요?</span><div class="seg" data-k="_way"><button type="button" data-v="전화">📞 전화</button><button type="button" data-v="카톡·문자">💬 카톡·문자</button></div></div>' +
        '<div class="fl" data-if="_way=전화"><span class="lb">통화 편한 시간</span><div class="seg" data-k="_time"><button type="button" data-v="언제든">언제든</button><button type="button" data-v="오전">오전</button><button type="button" data-v="오후">오후</button><button type="button" data-v="저녁">저녁</button></div></div>' +
        '<div class="fl"><label for="uMemo">더 남기실 말 <small>선택</small></label><textarea class="inp" id="uMemo" maxlength="500" placeholder="' + esc(cfg.memoHint || '궁금한 점이 있으면 적어주세요') + '"></textarea></div>' +
        '<label class="agree"><input type="checkbox" id="agree1"><div><b>[필수] 개인정보 수집·이용 동의</b><span>이름·휴대폰' + (cfg.noBirth ? '' : '·생년월일') + '과 입력한 내용을 보험 상담 목적으로만 이용하고, 상담 종료 후 1년간 보관한 뒤 파기합니다. 동의하지 않으면 신청할 수 없습니다.</span></div></label>' +
        '<label class="agree"><input type="checkbox" id="agree2"><div><b>[선택] 보험 상품·이벤트 안내 수신 동의</b><span>동의하지 않아도 상담은 그대로 진행됩니다.</span></div></label>' +
        '<p class="err" id="csErr"></p>' +
      '</section>';

    /* ── 하단 표기 · 버튼 · 완료 화면 ── */
    var legal = document.querySelector('.cs-legal'); if (legal) legal.innerHTML = cfg.operator === 'daon' ? LEGAL_DAON : LEGAL;
    if (cfg.noForm) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="cs-dock" id="csDock"><div class="in"><button type="button" class="cs-send" id="csSend">' + esc(cfg.sendText || '상담 신청하기') + '</button>' +
      '<a class="cs-kk" id="csKk" href="' + KAKAO + '" target="_blank" rel="noopener">카톡<br>문의</a></div></div>' +
      '<div class="cs-toast" id="csToast"></div>');
    var app = document.querySelector('.app');
    app.insertAdjacentHTML('beforeend',
      '<section class="cs-done hide" id="csDone"><div class="mk"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
      '<h2>신청이 접수되었습니다</h2><p id="csDoneMsg"></p><div class="nx" id="csDoneNx"></div>' +
      '<a class="k" id="csDoneK" href="' + KAKAO + '" target="_blank" rel="noopener">카카오톡으로 추가 내용 보내기</a><a class="h" href="/">보험물어봄 홈으로</a></section>');

    function toast(t){ var e = $('csToast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function(){ e.classList.remove('on'); }, 2400); }

    /* ── 고르기 버튼 ── */
    function refreshIf(){
      document.querySelectorAll('[data-if]').forEach(function(el){
        var ok = el.getAttribute('data-if').split('|').some(function(cond){
          var p = cond.split('='), k = p[0], val = p[1], cur = S[k];
          return Array.isArray(cur) ? cur.indexOf(val) >= 0 : cur === val;
        });
        el.classList.toggle('hide', !ok);
      });
    }
    document.querySelectorAll('[data-k]').forEach(function(g){
      var k = g.dataset.k, multi = g.classList.contains('multi');
      if (multi) S[k] = [];
      g.addEventListener('click', function(e){
        var b = e.target.closest('button'); if (!b || !g.contains(b)) return;
        var val = b.dataset.v;
        if (multi) {
          var none = g.dataset.none;
          if (none && val === none) S[k] = S[k].indexOf(none) >= 0 ? [] : [none];
          else {
            S[k] = S[k].filter(function(x){ return x !== none; });
            var i = S[k].indexOf(val); if (i >= 0) S[k].splice(i, 1); else S[k].push(val);
          }
          g.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', S[k].indexOf(x.dataset.v) >= 0); });
        } else {
          S[k] = val;
          g.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); });
        }
        $('csErr').classList.remove('on');
        refreshIf();
        if (cfg.onPick) cfg.onPick(k, S);
      });
    });
    /* 주소로 미리 고르기: ?pick=암,자동차 */
    (params.get('pick') || '').split(',').forEach(function(p){
      p = p.trim(); if (!p) return;
      document.querySelectorAll('[data-k] button').forEach(function(b){
        if (b.dataset.v === p || b.dataset.v.indexOf(p) === 0) b.click();
      });
    });
    refreshIf();

    /* 더 보기 */
    document.querySelectorAll('[data-open]').forEach(function(b){
      b.addEventListener('click', function(){ $(b.dataset.open).classList.remove('hide'); b.classList.add('hide'); });
    });

    /* ── 입력 정리 ── */
    $('uPhone').addEventListener('input', function(){
      var n = digits(this.value).slice(0, 11);
      this.value = n.length >= 8 ? n.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : (n.length >= 4 ? n.replace(/(\d{3})(\d{1,4})/, '$1-$2') : n);
    });
    document.querySelectorAll('[data-date]').forEach(function(el){ el.addEventListener('input', function(){ fmtDate(el); }); });
    if ($('uBirth')) $('uBirth').addEventListener('input', function(){ this.value = this.value.replace(/[^\d\-]/g, ''); fmtDate(this); });
    document.addEventListener('input', function(e){ if (e.target.classList && e.target.classList.contains('inp')) e.target.classList.remove('bad'); });

    /* 사진: 크게 찍힌 사진을 1000px로 줄여서 보냄 */
    document.querySelectorAll('[data-photo]').forEach(function(inp){
      var key = inp.dataset.photo, lab = inp.closest('.photo');
      inp.addEventListener('change', function(){
        var f = inp.files && inp.files[0]; if (!f) return;
        var img = new Image(), url = URL.createObjectURL(f);
        img.onload = function(){
          var r = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          PHOTOS[key] = c.toDataURL('image/jpeg', 0.82);
          var ph = lab.querySelector('.ph'); if (ph) ph.outerHTML = '<img alt="">';
          lab.querySelector('img').src = PHOTOS[key];
          lab.querySelector('b').textContent = '사진 바꾸기';
          URL.revokeObjectURL(url);
        };
        img.onerror = function(){ toast('사진을 읽지 못했어요. 카톡으로 보내주세요'); };
        img.src = url;
      });
    });

    /* 주소 검색 (다음 우편번호) */
    document.querySelectorAll('[data-addr]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var target = $(btn.dataset.addr), next = $(btn.dataset.next || '');
        if (!(window.daum && daum.Postcode)) { target.readOnly = false; target.placeholder = '주소를 직접 입력해 주세요'; target.focus(); return; }
        new daum.Postcode({ oncomplete: function(d){ target.value = d.roadAddress || d.jibunAddress || d.address; target.classList.remove('bad'); if (next) next.focus(); } }).open();
      });
    });

    /* 설계사 페이지에서 들어온 경우 담당 설계사 연결 */
    if (code && /^[0-9A-Za-z-]{3,20}$/.test(code)) {
      fetch(PROFILE_API + '?a=' + encodeURIComponent(code), {cache: 'no-store'}).then(function(r){ return r.json(); }).then(function(p){
        if (!p || !p.name) return; FC = p;
        var h = document.querySelector('.cs-hero');
        if (h) h.insertAdjacentHTML('beforeend', '<div class="cs-fc">' + (p.photo ? '<img src="' + esc(p.photo) + '" alt="">' : '') + '<div><b>담당 ' + esc(p.name) + ' 설계사</b><small>' + esc(p.title || '다온파트너스') + '</small></div></div>');
        if (p.kakao) { $('csKk').href = p.kakao; $('csDoneK').href = p.kakao; }
        if (p.phone) document.querySelectorAll('a[href^="tel:"]').forEach(function(a){ a.href = 'tel:' + digits(p.phone); });
      }).catch(function(){});
    }

    /* ── 신청 ── */
    function fail(msg, el){
      var e = $('csErr'); e.textContent = msg; e.classList.add('on'); toast(msg);
      if (typeof el === 'string') el = $(el);
      var tgt = el || e;
      if (el && el.classList.contains('inp')) el.classList.add('bad');
      tgt.scrollIntoView({behavior: 'smooth', block: 'center'});
      if (el && el.focus && el.tagName !== 'DIV' && el.tagName !== 'SECTION') setTimeout(function(){ el.focus({preventScroll: true}); }, 350);
      return false;
    }
    var api = {S: S, v: v, PHOTOS: PHOTOS, fail: fail, validDate: validDate, nowY: nowY};

    var sending = false;
    $('csSend').addEventListener('click', function(){
      if (sending) return;
      $('csErr').classList.remove('on');
      if (cfg.validate) { var r = cfg.validate(api); if (r) return fail(r[0], r[1]); }
      var name = v('uName'), phone = v('uPhone'), birth = v('uBirth');
      if (name.length < 2) return fail('이름을 입력해 주세요', 'uName');
      if (!/^01\d{8,9}$/.test(digits(phone))) return fail('휴대폰 번호를 확인해 주세요', 'uPhone');
      if (!cfg.noBirth && !validDate(birth, 1920, nowY)) return fail('생년월일 8자리를 입력해 주세요 (예: 19800101)', 'uBirth');
      if (!S._way) return fail('연락 방법(전화·카톡)을 골라주세요', document.querySelector('[data-k="_way"]'));
      if (!$('agree1').checked) return fail('개인정보 수집·이용에 동의해 주세요', $('agree1').closest('.agree'));

      var way = S._way + (S._way === '전화' && S._time ? ' · ' + S._time : '');
      var extra = ['연락 방법: ' + way, '광고수신: ' + ($('agree2').checked ? '동의' : '미동의')];
      if (FC) extra.push('담당: ' + FC.name + ' 설계사');
      var base = {
        name: name, phone: phone, birth: birth,
        contactWay: S._way === '전화' ? 'phone' : 'kakao', callTime: way,
        memo: v('uMemo'),
        extra: extra.join(' / '),
        origin: location.pathname, manager: code,
        consentRequired: true, consentMarketing: $('agree2').checked,
        utm_source: params.get('utm_source') || 'direct', utm_medium: params.get('utm_medium') || '', utm_campaign: params.get('utm_campaign') || '',
        referrer: document.referrer || '', submittedAt: new Date().toISOString()
      };
      var add = cfg.payload ? cfg.payload(api, base) : {};
      for (var k in add) base[k] = add[k];

      sending = true; var btn = $('csSend'); btn.disabled = true; btn.textContent = '접수 중…';
      fetch(cfg.api, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(base)})
        .then(function(r){ if (!r.ok) throw new Error('bad'); })
        .then(function(){
          document.querySelectorAll('.app > :not(.cs-top):not(#csDone)').forEach(function(el){ el.classList.add('hide'); });
          $('csDock').classList.add('hide'); $('csDone').classList.remove('hide');
          $('csDoneMsg').textContent = (FC ? FC.name + ' 설계사가 ' : '다온 보험설계사가 ') + (S._way === '전화' ? '확인 후 전화드립니다.' : '확인 후 카톡·문자로 연락드립니다.');
          $('csDoneNx').innerHTML = (cfg.doneTips || ['가입하신 보험증권이 있으면 미리 찾아두시면 상담이 빨라집니다.']).map(function(t){ return '<p>· ' + esc(t) + '</p>'; }).join('');
          window.scrollTo({top: 0, behavior: 'smooth'});
        })
        .catch(function(){
          sending = false; btn.disabled = false; btn.textContent = '다시 신청하기';
          if (cfg.kakaoFallback) {
            var t = '[' + document.title.split('|')[0].trim() + ']\n' + Object.keys(base).filter(function(k){ return typeof base[k] === 'string' && base[k] && ['origin','submittedAt','referrer','utm_source','utm_medium','utm_campaign','contactWay','manager'].indexOf(k) < 0 && base[k].indexOf('data:') !== 0; }).map(function(k){ return base[k]; }).join('\n');
            try { navigator.clipboard.writeText(t); } catch(e){}
            fail('접수 서버를 준비 중입니다. 내용을 복사했으니 카톡 상담창에 붙여넣어 주세요.');
            var w = window.open($('csKk').href, '_blank'); if (!w) location.href = $('csKk').href;
            return;
          }
          fail('접수하지 못했어요. 잠시 후 다시 시도하시거나 전화(041-534-1124)로 문의해 주세요.');
        });
    });
  };
})();
