/* ══════════════════════════════════════════════
   사업자보험 상담신청 — 공통 설정
   ★ 백엔드(n8n·Notion) 없이 동작합니다.
     입력값은 서버로 전송·저장되지 않고,
     브라우저 안에서 요약문으로 정리되어
     카카오톡 채널 대화창에 붙여넣도록 안내합니다.
   ★ 수정할 값은 전부 이 파일 안에만 있습니다.
   ══════════════════════════════════════════════ */

const CONFIG = {
  brand:      '사업자보험 상담신청',
  owner:      '미래에셋금융서비스 그로우사업부',
  agencyNo:   '2014048012',

  kakao:      'http://pf.kakao.com/_uAKiX/chat',

  keepTerm:   '카카오톡 채널로 전달된 뒤 별도 저장하지 않음'
};

/* ══════════════════════════════════════════════
   상품 목록
   각 상품의 플래그:
     biz      = 업종 선택 필요
     prop     = 평수·임차자가·층수·가스 필요
     staff    = 직원 수 필요
     assets   = 시설비용·재고자산 필요
     personal = 개인상품 (사업장 정보 없이 개인정보만 입력)
   ══════════════════════════════════════════════ */
const PRODUCTS = [
  // ── 일반/화재보험 ──
  { id:'f1', cat:'fire', name:'화재보험(다중이용업소·재난배상 포함)', biz:true, prop:true, staff:true, assets:true },
  { id:'f2', cat:'fire', name:'승강기 배상책임보험', biz:true, prop:true, staff:false, assets:false },
  { id:'f3', cat:'fire', name:'어린이놀이시설 배상책임보험', biz:true, prop:true, staff:false, assets:false },
  { id:'f4', cat:'fire', name:'생산물배상책임보험', biz:true, prop:false, staff:true, assets:false },
  { id:'f5', cat:'fire', name:'영업배상책임보험', biz:true, prop:true, staff:true, assets:false },
  { id:'f6', cat:'fire', name:'직업배상책임보험', biz:true, prop:false, staff:false, assets:false },
  { id:'f7', cat:'fire', name:'기타배상책임보험', biz:true, prop:false, staff:false, assets:false },
  { id:'f8', cat:'fire', name:'직원상해(단체)보험', biz:true, prop:false, staff:true, assets:false },

  // ── 중대재해 ──
  { id:'s1', cat:'safety', name:'중대재해 위험성평가 상담 신청', biz:true, prop:false, staff:true, assets:false },

  // ── 건강/자동차 (개인상품) ──
  { id:'l1', cat:'life', name:'건강보험', personal:true },
  { id:'l2', cat:'life', name:'자동차보험', personal:true },
  { id:'l3', cat:'life', name:'연금보험', personal:true },
  { id:'l4', cat:'life', name:'종신보험', personal:true }
];

const CAT_TABS = [
  { k:'fire',   t:'일반/화재보험' },
  { k:'safety', t:'중대재해 위험성평가' },
  { k:'life',   t:'건강/자동차' }
];

/* 업종 대분류 → 소분류 */
const BIZ_TREE = {
  '음식점':      ['한식','중식','일식','양식','고기구이','분식','카페·베이커리','치킨·호프','기타 음식점'],
  '소매·판매':    ['편의점','마트·슈퍼','의류·잡화','미용용품','기타 판매업'],
  '서비스·미용':  ['미용실·네일','피부관리·마사지','세탁소','기타 서비스'],
  '학원·교육':    ['공부방·교습소','예체능학원','어학원','기타 교육'],
  '숙박':        ['모텔·여관','펜션·게스트하우스','기타 숙박'],
  '제조·공장':    ['식품가공','금속·기계','기타 제조'],
  '사무실·전문직': ['사무실','전문직 사무소'],
  '기타':        ['기타 업종']
};

/* ── 유틸 ── */
function $(s, r){ return (r || document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

function fmtPhone(v){
  var n = v.replace(/[^0-9]/g, '').slice(0, 11);
  if (n.length < 4) return n;
  if (n.length < 8) return n.slice(0,3) + '-' + n.slice(3);
  return n.slice(0,3) + '-' + n.slice(3,7) + '-' + n.slice(7);
}
function validPhone(v){ return /^01[016789]-?\d{3,4}-?\d{4}$/.test(v.replace(/\s/g,'')); }

function fmtBizNo(v){
  var n = v.replace(/[^0-9]/g, '').slice(0, 10);
  if (n.length < 4) return n;
  if (n.length < 6) return n.slice(0,3) + '-' + n.slice(3);
  return n.slice(0,3) + '-' + n.slice(3,5) + '-' + n.slice(5);
}
function validBizNo(v){ return /^\d{3}-?\d{2}-?\d{5}$/.test(v.replace(/\s/g,'')); }

function fmtBirth(v){
  var n = v.replace(/[^0-9]/g, '').slice(0, 8);
  if (n.length < 5) return n;
  if (n.length < 7) return n.slice(0,4) + '-' + n.slice(4);
  return n.slice(0,4) + '-' + n.slice(4,6) + '-' + n.slice(6);
}
function validBirth(v){
  var n = v.replace(/-/g,'');
  return /^\d{8}$/.test(n) && +n.slice(0,4) >= 1930 && +n.slice(0,4) <= new Date().getFullYear();
}

function fmtMoney(v){
  var n = v.replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('ko-KR');
}
function moneyValue(v){ return v.replace(/[^0-9]/g, ''); }

/* 클립보드 복사 (실패 시 폴백) */
async function copyText(text){
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e2) { return false; }
  }
}

function renderFooter(el){
  if (!el) return;
  el.innerHTML =
    '<div class="foot__in">' +
      '<h3>보험모집 관련 표기</h3>' +
      '<dl>' +
        '<dt>모집주체</dt><dd>' + CONFIG.owner + '</dd>' +
        '<dt>대리점 등록번호</dt><dd>' + CONFIG.agencyNo + '</dd>' +
      '</dl>' +
      '<ul>' +
        '<li>카카오톡 상담 연결 안내 페이지이며, 보험료 산출·상품 추천·청약은 제공하지 않습니다.</li>' +
        '<li>모집종사자는 보험회사로부터 체결권을 부여받은 금융상품판매대리·중개업자입니다.</li>' +
        '<li>다수 보험회사와 계약을 체결해 대리·중개하는 보험대리점입니다.</li>' +
        '<li>계약 전 상품설명서와 약관을 반드시 확인하세요.</li>' +
        '<li>기존 계약 해지 후 재가입 시 인수 거절·보험료 인상·보장 변경이 있을 수 있습니다.</li>' +
        '<li>보험금은 지급한도·면책사항에 따라 제한될 수 있습니다.</li>' +
        '<li>입력 내용은 저장되지 않으며 카카오톡 상담용 요약문으로만 사용됩니다.</li>' +
      '</ul>' +
      '<div class="foot__c">© ' + new Date().getFullYear() + ' ' + CONFIG.brand + '</div>' +
    '</div>';
}
