/* ══════════════════════════════════════════════
   다온 보장점검센터 — 공통 설정
   ★ 수정이 필요한 값은 전부 이 CONFIG 안에만 있습니다
   ══════════════════════════════════════════════ */

const CONFIG = {
  // 브랜드
  brand:      '다온 보장점검센터',
  owner:      '미래에셋금융서비스(주) 다온지사',
  addr:       '충남 아산시 탕정면 용머리길 22, 상가동 3층 301호',
  agencyNo:   '2014048012',      // 보험대리점 등록번호
  kakao:      'http://pf.kakao.com/_ZVtsX/chat',

  // 광고 심의 (준법 회신 후 기재)
  adReviewNo: '심의 진행 중',     // 예: 'ㅇㅇ-2026-0000호'
  adExpire:   '',                // 예: '2027-03-01'

  // 개인정보 보유기간
  keepTerm:   '상담 종료 후 1년'
};

/* n8n 웹훅 — 다온지사 전용 워크플로 "다온파트너스 웹리드 접수"
   (grow-crm-v2와 무관, daon.io.kr 계열 페이지 전용) */
const LEAD_ENDPOINTS = {
  health:  'https://daonpartners.app.n8n.cloud/webhook/daon-health-lead',
  auto:    'https://daonpartners.app.n8n.cloud/webhook/daon-auto-lead',
  fire:    'https://daonpartners.app.n8n.cloud/webhook/daon-fire-lead',
  pension: 'https://daonpartners.app.n8n.cloud/webhook/daon-pension-lead'
};

/* 컨설팅 팝업 - 4개 상품군 */
const CONSULT_CATS = [
  { k:'health',  t:'건강보험',   d:'암·뇌·심장·실손 등 보장 점검',
    interests:['암','뇌·심장','실손의료비','간병·치매','기타'] },
  { k:'auto',    t:'자동차보험', d:'갱신 시점 견적·특약 확인',
    interests:[] },
  { k:'fire',    t:'화재보험',   d:'주택·상가 화재 및 배상책임',
    interests:[] },
  { k:'pension', t:'연금·종신',  d:'노후 준비·사망 보장 점검',
    interests:['노후생활비','사망보장','상속·증여','기타'] }
];

/* 종목 정의 — 상품명·보험사명·보험료는 넣지 않습니다 */
const CATS = {
  cancer:   { t:'암',                d:'진단·수술·치료비 보장 확인' },
  cvd:      { t:'뇌·심장',           d:'뇌혈관·허혈성심장 보장 범위 확인' },
  care:     { t:'간병·치매',         d:'장기요양·간병 준비 상태 확인' },
  medical:  { t:'실손의료비',        d:'세대별 실손 및 중복 여부 확인' },
  driver:   { t:'운전자',            d:'벌금·형사합의금 준비 확인' },
  child:    { t:'자녀',              d:'성장기 보장 및 만기 확인' },
  fire:     { t:'주택 화재',         d:'거주 형태별 배상·재산 확인' },
  pension:  { t:'연금·노후',         d:'노후 준비 현황 점검' },
  review:   { t:'지금 가입한 보험 점검', d:'중복·공백·보험료 부담 확인' },
  claim:    { t:'보험금 청구가 막혔을 때', d:'거절·삭감 건 확인' },
  hidden:   { t:'숨은 보험금 찾기',  d:'미청구·휴면 보험금 조회 안내' },
  business: { t:'사업장 리스크',     d:'화재·배상·직원·휴업 점검' }
};

/* ── 공통 유틸 ── */
function $(s, r){ return (r || document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

function qs(k){
  return new URLSearchParams(location.search).get(k) || '';
}

/* 휴대전화 형식 자동 정리 */
function fmtPhone(v){
  var n = v.replace(/[^0-9]/g, '').slice(0, 11);
  if (n.length < 4) return n;
  if (n.length < 8) return n.slice(0,3) + '-' + n.slice(3);
  return n.slice(0,3) + '-' + n.slice(3,7) + '-' + n.slice(7);
}
function validPhone(v){
  return /^01[016789]-?\d{3,4}-?\d{4}$/.test(v.replace(/\s/g,''));
}

/* 유입경로 수집 (개인정보 아님) */
function trace(){
  var p = new URLSearchParams(location.search);
  return {
    m:        p.get('m')          || '',   // 설계사 추적코드
    source:   p.get('utm_source') || '',
    medium:   p.get('utm_medium') || '',
    campaign: p.get('utm_campaign') || '',
    ref:      (document.referrer || '').slice(0, 200),
    landed:   sessionStorage.getItem('insu_landed') || ''
  };
}

/* 접수번호 (고객코드 아님 — 고객 안내용 표시번호) */
function ticketNo(){
  var d = new Date(), p = function(n){ return String(n).padStart(2,'0'); };
  return 'DC-' + String(d.getFullYear()).slice(2) + p(d.getMonth()+1) + p(d.getDate())
       + '-' + String(Math.floor(Math.random()*9000)+1000);
}

/* ── 레거시 신청폼(apply.html) 호환용 — 보장분석(범용) 엔드포인트로 전송 ── */
async function sendLead(payload){
  var res = await fetch('https://daonpartners.app.n8n.cloud/webhook/daon-insurance-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text().catch(function(){ return ''; });
}

/* ── 신규 컨설팅 팝업용 — 카테고리별 실제 엔드포인트로 전송 ── */
async function sendCategoryLead(catKey, payload){
  var url = LEAD_ENDPOINTS[catKey];
  if (!url) throw new Error('unknown category: ' + catKey);
  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text().catch(function(){ return ''; });
}

/* ── 푸터 필수 표기 자동 삽입 ── */
function renderFooter(el){
  if (!el) return;
  el.innerHTML =
    '<div class="foot__in">' +
      '<h3>보험모집 관련 표기</h3>' +
      '<dl>' +
        '<dt>모집주체</dt><dd>' + CONFIG.owner + '</dd>' +
        '<dt>대리점 등록번호</dt><dd>' + CONFIG.agencyNo + '</dd>' +
      '</dl>' +
      '<p class="foot__notice">' +
        '본 사이트는 보험 상담 및 보장 점검 신청을 접수하는 페이지이며 보험료 산출·상품 추천·보험계약 청약은 제공하지 않습니다.' +
        ' 해당 모집종사자는 보험회사로부터 보험계약 체결권을 부여받은 금융상품판매대리·중개업자이며,' +
        ' 다수의 보험회사와 계약을 체결하고 대리·중개하는 보험대리점입니다.' +
        ' 보험계약 체결 전 상품설명서와 약관을 반드시 확인하시기 바랍니다.' +
        ' 기존 계약을 해지하고 새로 체결하면 인수가 거절되거나 보험료가 인상되거나 보장 내용이 달라질 수 있습니다.' +
        ' 보험금 지급은 지급한도와 면책사항 등에 따라 제한될 수 있습니다.' +
        ' 본 사이트는 금융소비자 보호에 관한 법률 및 소속 회사의 내부통제기준에 따른 광고 관련 절차를 준수합니다.' +
      '</p>' +
      '<div class="foot__c">© ' + new Date().getFullYear() + ' ' + CONFIG.brand + '</div>' +
    '</div>';
}

/* 첫 진입 시각 기록 (봇 판별용) */
if (!sessionStorage.getItem('insu_landed')) {
  sessionStorage.setItem('insu_landed', new Date().toISOString());
}
