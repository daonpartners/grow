/* 보상제안서 공용 엔진 — grow.ai.kr/report/bosang.js 한 곳에만 둠
   - 쓰는 곳: grow.ai.kr 리포트 생성기 '제안서' 탭, 보잇(boit.ai.kr) 영업 › 보상제안서 (보잇은 이 주소를 그대로 불러옴)
   - 약관 사전(DICTS)을 여기에 추가하면 두 곳에 함께 반영됨
   - 설계서 읽기: 양식 등록 회사(KB손해보험)는 브라우저에서 직접, 그 밖의 회사는 AI(n8n 'daon-proposal-read')가 담보표를 원문 그대로 옮김
   - 약관 미등록 회사는 설계서 가입금액 그대로 보여 줌 (수술 종 분류·치료비 세부 지급액은 약관 등록 후)
*/
(function (G) {
  "use strict";

  /* ---------------- 1. PDF → 줄 ---------------- */
  async function pdfLines(lib, data) {
    const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p), tc = await pg.getTextContent();
      const rows = [];
      for (const it of tc.items) {
        const s = it.str; if (!s || !s.trim()) continue;
        const x = it.transform[4], y = it.transform[5], w = it.width || s.length * 5;
        let r = rows.find(r => Math.abs(r.y - y) < 2.5);
        if (!r) { r = { y, parts: [] }; rows.push(r); }
        r.parts.push({ x, w, s });
      }
      rows.sort((a, b) => b.y - a.y);
      pages.push(rows.map(r => {
        r.parts.sort((a, b) => a.x - b.x);
        let out = "", end = null;
        for (const t of r.parts) { if (end !== null && t.x - end > 6) out += "  "; else if (end !== null && t.x - end > 1.5) out += " "; out += t.s; end = t.x + t.w; }
        return out.replace(/\s+$/, "");
      }));
    }
    return pages;
  }

  /* ---------------- 2. 금액 ---------------- */
  // "4천만원"=4000, "1백50만원"=150, "1억5천만원"=15000, "30만원"=30  (단위: 만원)
  function man(t) {
    t = String(t || "").replace(/[,\s]/g, "");
    const m = t.match(/^(?:(\d+)억)?(?:(\d+)천)?(?:(\d+)백)?(\d+)?만?원$/); if (!m) return null;
    const [, e, c, b, r] = m; const v = (+e || 0) * 10000 + (+c || 0) * 1000 + (+b || 0) * 100 + (+r || 0);
    if (!e && !c && !b && !r) return null; return v;
  }
  const AMT = "((?:\\d+억)?(?:\\d+천)?(?:\\d+백)?\\d*만원|\\d+억원)";
  const fmt = v => v == null ? "" : v >= 10000 ? (v % 10000 ? (v / 10000).toFixed(1).replace(/\.0$/, "") + "억" : v / 10000 + "억") : v.toLocaleString("ko-KR") + "만";
  const won = v => fmt(v) + (v >= 10000 ? "" : "원");

  /* ---------------- 3. KB 상품제안서 읽기 ---------------- */
  const unbalanced = s => (String(s).match(/\(/g) || []).length > (String(s).match(/\)/g) || []).length;
  function parseKB(pages) {
    const all = pages.flat();
    const txt = all.join("\n");
    const out = { company: "KB손해보험", product: "", code: "", insured: "", age: null, sex: "", premium: null, no: "", issued: "", items: [], warn: [] };
    const pm = txt.match(/(KB[^\n]*?건강보험[^\n]*?\(\d\d\.\d\d\))(?:_[^\n]*?)?(?:\s|$)/); if (pm) out.product = pm[1].trim();
    const cm = txt.match(/해약환급금[^\n(]*\((\d{5})\)/) || txt.match(/장기 \d\d-(\d{5})-/); if (cm) out.code = cm[1];
    const im = txt.match(/([가-힣]{2,5})\s*피보험자님의 가입내용\s*\((\d{1,3})세\s*\|\s*(남|여)/); if (im) { out.insured = im[1]; out.age = +im[2]; out.sex = im[3]; }
    const no = txt.match(/청약번호\s*:?\s*(RQ[\d-]+)/) || txt.match(/(RQ\d\d-\d{6,})/); if (no) out.no = no[1];
    const iss = txt.match(/발급일시\s*:?\s*(\d{4}-\d\d-\d\d)/); if (iss) out.issued = iss[1];
    const pr = txt.match(/보험료\s*:\s*([\d,]+)원/) || txt.match(/1회 보험료\s*([\d,]+)원/); if (pr) out.premium = +pr[1].replace(/,/g, "");
    const rowRe = new RegExp("^\\s*(?:(\\d{1,3})\\s+|┖\\s*)?(.*?)\\s*" + AMT + "\\s+([\\d,]+)\\s+[\\d.]+\\s*(.*)$");
    const sumRe = /^\s*(\d{1,3})\s+(.*?)\s*가입\s*합계\s*[\d,]+/;
    let pend = "", pendNo = null, pendSub = false, last = null, inTable = false;
    for (const raw of all) {
      const l = raw.replace(/ /g, " ");
      if (/보장명\s+가입금액/.test(l)) { inTable = true; continue; }
      if (!inTable) continue;
      if (/보험료비중:|주의사항|상품제안서_116대|고객콜센터/.test(l)) { inTable = /보험료비중/.test(l) ? false : inTable; pend = ""; last = null; if (/보험료비중|상품제안서_116대/.test(l)) inTable = false; continue; }
      if (/^\s*RQ\d|장기 \d\d-\d{5}|\[계약자용\]|^\s*\(상담 및 문의\)|^\s*1544-|홈페이지/.test(l)) { last = null; continue; }
      const sm = l.match(sumRe);
      if (sm) { last = { no: +sm[1], name: (pend + sm[2]).trim(), amt: null, group: true, open: true }; out.items.push(last); pend = ""; continue; }
      const m = l.match(rowRe);
      if (m && man(m[3]) != null) {
        const isSub = /┖/.test(l) || pendSub;
        const name = (pend + " " + (m[2] || "")).replace(/┖/g, "").replace(/\s+/g, " ").trim();
        last = { no: m[1] ? +m[1] : (pendNo || null), name, amt: man(m[3]), prem: +m[4].replace(/,/g, ""), term: (m[5] || "").trim(), sub: isSub };
        out.items.push(last); pend = ""; pendNo = null; pendSub = false; continue;
      }
      let t = l.trim(); if (!t) continue;
      const TERM = /\s+(\d+년\/\d+년갱신|\(갱신종료:\d+세\)|\d+년\/\d+세|\d+년\/\d+년)\s*$/;
      while (TERM.test(t)) { const tm = t.match(TERM)[1]; if (last) last.term = (last.term + " " + tm).trim(); t = t.replace(TERM, "").trim(); }
      if (/^(\d+년\/|\(갱신종료|\d+년갱신)/.test(t)) { if (last) last.term = (last.term + " " + t).trim(); continue; }
      if (/^\d{1,3}\s/.test(t) || /^┖/.test(t)) { pendNo = /^\d/.test(t) ? +t.match(/^\d+/)[0] : null; pendSub = /^┖/.test(t); pend = t.replace(/^\d{1,3}\s+/, "").replace(/^┖\s*/, ""); last = null; continue; }
      // 앞 담보 이름의 괄호가 아직 안 닫혔으면 이어지는 줄, 닫혔으면 다음 담보의 첫 줄
      if (last && unbalanced(last.name) && !/^\d/.test(t)) { last.name = (last.name + t).replace(/\s+보장$/, "").trim(); continue; }
      if (pend && unbalanced(pend)) { pend += t; continue; }
      if (/^보장$/.test(t)) continue;
      pend = t; last = null;
    }
    out.items.forEach(i => { i.name = i.name.replace(/\s*보장$/, "").replace(/\s+/g, " ").trim(); });
    if (!out.items.length) out.warn.push("가입담보 표를 찾지 못했습니다. KB손해보험 '상품제안서_가입담보' PDF인지 확인하세요.");
    return out;
  }

  /* ---------------- 4. 상품 보장 사전 (KB손해보험 건강보험) ---------------- */
  // k: 담보 키, re: 제안서 보장명(공백 제거) 패턴. 금액은 가입금액 그대로(정액) — 통합치료비는 TIER 표 사용
  const KB_RULES = [
    ["cancer", /^암진단비\(유사암제외\)/], ["simcancer", /^유사암진단비/],
    ["ic_digest", /통합암진단비.*\(소화기관암진단비/], ["ic_lung", /통합암진단비.*\(폐암진단비/], ["ic_liver", /통합암진단비.*\(간암,?담낭암/],
    ["ic_blood", /통합암진단비.*\(혈액암진단비/], ["ic_head", /통합암진단비.*\(두경부암진단비/], ["ic_11", /통합암진단비.*\(11대특정암진단비/],
    ["ic_3high", /통합암진단비.*\(3대특정고액암진단비/], ["ic_genito", /통합암진단비.*\(생식기암및비뇨기관암/], ["ic_small", /통합암진단비.*\(특정소액암진단비/],
    ["stroke", /^뇌졸중진단비/], ["brainhem", /^뇌출혈진단비/], ["sbrain", /^특정뇌혈관질환/], ["ihd", /^허혈성심장질환진단비/], ["ami", /^급성심근경색(증)?진단비/],
    ["brain", /^뇌혈관질환진단비/], ["heart1", /^심장질환\(특정Ⅰ\)진단비/], ["heart2", /^심장질환\(특정Ⅱ\)진단비/], ["arrhy", /^부정맥질환\(Ⅰ49\)진단비|^부정맥질환\(I49\)진단비/],
    ["benignbrain", /^양성뇌종양진단비/],
    ["frac", /^골절진단비\(치아파절포함\)/], ["frac2", /^골절진단비Ⅱ/], ["frac5", /^5대골절진단비/], ["cast", /^깁스치료비/],
    ["tbi", /^외상성특정뇌손상진단비/], ["tbleed", /^외상성특정뇌출혈진단비/], ["burn", /^화상진단비/],
    ["dsurg", /^질병수술비\(/],
    ["d1", /^질병1~5종수술비Ⅱ\(매회지급\).*_1종$/], ["d2", /^질병1~5종수술비Ⅱ\(매회지급\).*_2종$/], ["d3", /^질병1~5종수술비Ⅱ\(매회지급\).*_3종$/], ["d4", /^질병1~5종수술비Ⅱ\(매회지급\).*_4종$/], ["d5", /^질병1~5종수술비Ⅱ\(매회지급\).*_5종$/],
    ["s116_1", /^116대질병수술비Ⅰ\(/], ["s116_2", /^116대질병수술비Ⅱ\(/], ["s116_3", /^116대질병수술비Ⅲ\(/], ["s116_4", /^116대질병수술비Ⅳ\(/], ["s116_5", /^116대질병수술비Ⅴ\(/], ["s116_6", /^116대질병수술비Ⅵ\(/],
    ["ben4", /^특정양성종양수술비Ⅳ/], ["ben3", /^특정양성종양수술비Ⅲ/], ["ben2", /^특정양성종양수술비Ⅱ/], ["ben1", /^특정양성종양수술비Ⅰ/],
    ["isurg", /^상해수술비\(/],
    ["i1", /^상해1~5종수술비\(매회지급\)_1종/], ["i2", /^상해1~5종수술비\(매회지급\)_2종/], ["i3", /^상해1~5종수술비\(매회지급\)_3종/], ["i4", /^상해1~5종수술비\(매회지급\)_4종/], ["i5", /^상해1~5종수술비\(매회지급\)_5종/],
    ["robot", /^다빈치로봇암수술비\(갑상선암및전립선암제외\)/], ["robot_thy", /^다빈치로봇갑상선암및전립선암수술비/],
    ["rad", /^항암방사선치료비\(/], ["chemo", /^항암약물치료비\(/], ["thy_horm", /^갑상선암호르몬약물허가치료비/], ["cart", /^카티\(CAR-T\)/],
    ["ci_hi", /^암통합치료비Plus\(종합병원\)\(고급형\)/], ["ci_np", /^비급여\(전액본인부담포함\)암통합치료비Plus\(종합병원\)/], ["circ", /^신특정순환계질환통합치료비Plus\(맞춤고지\)|^신특정순환계질환통합치료비Plus\(감액없음\)/],
    ["flu", /^독감\(인플루엔자\)항바이러스제치료비/], ["icu_d", /^질병중환자실입원일당/], ["icu_i", /^상해중환자실입원일당/],
    ["base", /^\[기본계약\]|^\[2종의무부가특약\]|보험료납입면제대상보장/],
  ];
  const IC_NAME = { ic_digest: "소화기관암", ic_lung: "폐암", ic_liver: "간·담낭·담도·췌장암", ic_blood: "혈액암", ic_head: "두경부암", ic_11: "11대특정암", ic_3high: "3대특정고액암", ic_genito: "생식기·비뇨기관암", ic_small: "특정소액암" };

  // 통합치료비 세부보장 지급금액 (보험계약일부터 1년이상 기준, 만원). 약관 특별약관 제1조 지급금액 표에서 옮김
  // ci_hi: 248. 암 통합치료비Plus(종합병원)(고급형) / ci_np: 251. 비급여(전액본인부담 포함) 암 통합치료비Plus(종합병원) / circ: 153. 신특정순환계질환 통합치료비Plus
  const TIER = {
    ci_hi: {
      5000: { mri: 5, pet: 5, ct: 5, us: 5, endo: 5, gene: 5, biopsy: 10, ngs: 100, surg: 500, simsurg: 100, rad: 500, simrad: 100, chemo: 500, simchemo: 100, horm: 50, simhorm: 10, icu: 250, simicu: 50, imrt: 500,
        np_surg: 500, np_surg_thy: 100, np_rad: 500, np_chemo: 500, np_robot: 500, np_robot_thy: 100, np_target: 1000, np_immune: 1000, np_proton: 1000, pain: 30, rehab: 2 },
      10000: { mri: 10, pet: 5, ct: 5, us: 5, endo: 5, gene: 5, biopsy: 20, ngs: 100, surg: 1000, simsurg: 200, rad: 1000, simrad: 200, chemo: 1000, simchemo: 200, horm: 100, simhorm: 20, icu: 500, simicu: 100, imrt: 750,
        np_surg: 1000, np_surg_thy: 200, np_rad: 1000, np_chemo: 1000, np_robot: 1000, np_robot_thy: 200, np_target: 2000, np_immune: 2000, np_proton: 2000, pain: 40, rehab: 2 },
    },
    ci_np: {
      8000: { np_surg: 1000, np_surg_thy: 200, np_rad: 1000, np_rad_thy: 200, np_chemo: 1000, np_chemo_thy: 200, np_robot: 1000, np_robot_thy: 200, np_target: 2000, np_immune: 2000, np_proton: 2000 },
    },
    circ: {
      5000: { mri: 5, ct: 5, pet: 5, crrt: 200, vent: 100, hypo: 100, ecmo: 1000, surg: 1000, thromb: 1000, lysis_b: 1000, lysis_h: 1000, icu: 500, rehab: 2, anticoag: 50, antiplt: 50 },
      8000: { mri: 10, ct: 5, pet: 5, crrt: 300, vent: 150, hypo: 100, ecmo: 1500, surg: 1500, thromb: 1500, lysis_b: 1500, lysis_h: 1500, icu: 750, rehab: 2, anticoag: 50, antiplt: 100 },
      10000: { mri: 10, ct: 5, pet: 5, crrt: 500, vent: 200, hypo: 100, ecmo: 2000, surg: 2000, thromb: 2000, lysis_b: 2000, lysis_h: 2000, icu: 1000, rehab: 2, anticoag: 50, antiplt: 100 },
    },
  };

  const KB_DICT = {
    // 진단비별 보장 질병(약관 분류표 기준). 약관 원문으로 확인한 것만 넣음 — 비어 있으면 안내서에 괄호 표기를 하지 않음
    // 2026-10-28 약관 원문 대조 입력 (분류표 항목명·분류번호 그대로). 특정뇌혈관질환(sbrain)은 이 약관에 없는 담보라 비워 둠
    scope: {
      brain: "【별표30】 거미막하출혈(I60)·뇌내출혈(I61)·기타 비외상성 두개내 출혈(I62)·뇌경색증(I63)·출혈 또는 경색증으로 명시되지 않은 뇌졸중(I64)·뇌경색증을 유발하지 않은 뇌전동맥의 폐쇄 및 협착(I65)·뇌경색증을 유발하지 않은 대뇌동맥의 폐쇄 및 협착(I66)·기타 뇌혈관 질환(I67)·달리 분류된 질환에서의 뇌혈관장애(I68)·뇌혈관질환의 후유증(I69)",
      stroke: "【별표14】 거미막하출혈(I60)·뇌내출혈(I61)·기타 비외상성 두개내 출혈(I62)·뇌경색증(I63)·뇌경색증을 유발하지 않은 뇌전동맥의 폐쇄 및 협착(I65)·뇌경색증을 유발하지 않은 대뇌동맥의 폐쇄 및 협착(I66)",
      brainhem: "【별표18】 거미막하출혈(I60)·뇌내출혈(I61)·기타 비외상성 두개내 출혈(I62)",
      ihd: "【별표31】 협심증(I20)·급성 심근경색증(I21)·후속 심근경색증(I22)·급성 심근경색증 후 특정 현존 합병증(I23)·기타 급성 허혈심장질환(I24)·만성 허혈심장병(I25)",
      ami: "【별표16】 급성심근경색증(I21)·후속 심근경색증(I22)·급성심근경색증 후 특정 현존 합병증(I23)",
      heart1: "【별표35】 협심증(I20)·기타 급성 허혈심장질환(I24)·만성 허혈심장병(I25)·급성 심장막염(I30)·심장막의 기타질환(I31)·달리 분류된 질환에서의 심장막염(I32)·급성 및 아급성 심내막염(I33)·상세불명 판막의 심내막염(I38)·급성 심근염(I40)·달리 분류된 질환에서의 심근염(I41)·발작성 빈맥(I47)·심방세동 및 조동(I48)·심부전(I50)",
      heart2: "【별표36】 급성 심근경색증(I21)·후속 심근경색증(I22)·급성 심근경색증 후 특정 현존 합병증(I23)·인공소생에 성공한 심장정지(I46.0)",
      arrhy: "【별표59】 기타 심장부정맥(I49)",
    },
    company: "KB손해보험",
    basis: "KB 5.10.10 플러스 건강보험(세만기)(무배당)(26.09) 약관 (2026-10-01 적용)",
    match: p => p.company === "KB손해보험" || (/KB/.test(p.product || "") && !/라이프|생명/.test(p.product || "")),
    rules: KB_RULES, tier: TIER,
    // 1~5종수술Ⅲ 분류표(【별표55-1】) · 116대질병 분류표(【별표17】~) 근거 문구
    ref: {
      t88_2: "1~5종수술Ⅲ 분류표 88-2: 대장 용종·양성신생물 내시경 절제는 1종",
      t88_2b: "1~5종수술Ⅲ 분류표 88-2: 복부장기 내시경 수술 2종",
      t57: "1~5종수술Ⅲ 분류표 57: 갑상선 관혈수술 3종",
      t9: "1~5종수술Ⅲ 분류표 9: 추간판 관혈수술 3종 (내시경·경피적이면 88-2 2종)",
      t36: "1~5종수술Ⅲ 분류표 36: 담낭·담도 관혈수술 3종 (복강경은 해당 부위 수술로 적용)",
      t15: "1~5종수술Ⅲ 분류표 15·17: 만성부비강염 근본수술·편도 절제 1종",
      t34: "1~5종수술Ⅲ 분류표 34: 기타 위 관혈수술 3종 · 33: 위 절제수술 4종",
      t44: "1~5종수술Ⅲ 분류표 44: 치핵·치루 근본수술 1종",
      t87: "1~5종수술Ⅲ 분류표 87: 체외충격파쇄석술 2종 (116대질병수술비는 쇄석술 제외)",
      t88_3: "1~5종수술Ⅲ 분류표 88-3: 비뇨기 내시경 수술 1종",
      t88_1: "1~5종수술Ⅲ 분류표 88-1: 뇌·심장 내시경·카테터 수술 3종",
      tc1: "1~5종수술Ⅲ 분류표 악성신생물 1: 관혈적 근치수술 5종 · 2: 내시경·카테터 수술 3종",
    },
  };
  const DICTS = [KB_DICT];

  /* ---------------- 5. 제안서 + 사전 → 금액 ---------------- */
  const isDx = nm => /진단/.test(nm) && !/수술|치료|입원|일당|간병|통원/.test(nm);
  const isCancerDx = nm => isDx(nm) && /암/.test(nm) && genClass(nm).g === "dx";
  function build(p) {
    const D = DICTS.find(d => d.match(p));
    const A = {}, unknown = [], used = [], cancerDx = [], rawDx = [];
    if (D) for (const it of p.items) {
      if (it.group || it.amt == null) continue;
      const nm = it.name.replace(/\s+/g, "");
      const r = D.rules.find(([, re]) => re.test(nm));
      // 암 진단비(암·전이암포함·고액암·재진단암 등)는 사전 여부와 관계없이 설계서 이름·가입금액 그대로 한 줄씩 (통합암 부위별은 칩으로 따로)
      const isIc = r && /^ic_/.test(r[0]);
      if (!isIc && isCancerDx(nm)) cancerDx.push(it);
      if (r) { if (r[0] !== "base") { A[r[0]] = (A[r[0]] || 0) + it.amt; used.push(it.name); } }
      else if (isCancerDx(nm)) used.push(it.name);
      else if (isDx(nm) && genClass(nm).g === "dx") { rawDx.push(it); used.push(it.name); }  // 사전에 없는 진단비도 설계서 가입금액으로 표시
      else unknown.push(it);
    }
    const tierOf = k => { if (!D || !A[k]) return null; const t = D.tier[k] || {}; return t[A[k]] || null; };
    return { p, D, A, unknown, used, cancerDx, rawDx, T: { ci_hi: tierOf("ci_hi"), ci_np: tierOf("ci_np"), circ: tierOf("circ") }, tierMissing: ["ci_hi", "ci_np", "circ"].filter(k => A[k] && !tierOf(k)) };
  }

  /* ---------------- 5-1. 화면 스타일 (안내서 공통) ---------------- */
  const CSS = `
.a4.bs{padding:30px 36px 24px;gap:9px;font-size:11px;line-height:1.45;color:#1f2937;--g:#0f766e;--gs:#e6f4f1;--c:#be123c;--cs:#fdecef;--b:#4338ca;--bsf:#eef0fd;--h:#c2410c;--hs:#fdf0e8;--o:#b45309}
.bs-top{display:flex;justify-content:space-between;font-size:10px;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:5px}
.bs-hero{background:linear-gradient(120deg,#0f766e,#115e59);color:#fff;border-radius:12px;padding:16px 20px}
.bs-kk{font-size:9.5px;letter-spacing:.2em;opacity:.8;font-weight:700}
.bs-hero h2{margin:4px 0 8px;font-size:24px;line-height:1.25;color:#fff}.bs-hero p{margin:6px 0 0;font-size:10px;opacity:.8}.bs-hero dl{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0;font-size:12px}.bs-hero dt{opacity:.75;font-weight:600}.bs-hero dd{margin:0}.bs-hero dd span{opacity:.75;margin:0 4px 0 8px}
.bs-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.bs-k{border-radius:10px;padding:9px 11px;display:flex;flex-direction:column;gap:1px;border-top:4px solid}
.bs-k span{font-size:10.5px;font-weight:600;color:#374151}.bs-k b{font-size:22px;line-height:1.2;white-space:nowrap}.bs-k small{font-size:9.5px;color:#6b7280}
.bs-k.kc{background:var(--cs);border-color:var(--c)}.bs-k.kc b{color:var(--c)}.bs-k.kb{background:var(--bsf);border-color:var(--b)}.bs-k.kb b{color:var(--b)}.bs-k.kh{background:var(--hs);border-color:var(--h)}.bs-k.kh b{color:var(--h)}
.bs-sec{display:flex;gap:8px;align-items:center;font-size:15px;margin:4px 0 0;color:#111827}.bs-sec span{background:var(--g);color:#fff;border-radius:6px;padding:1px 7px;font-size:12px}
.bs-types{display:flex;align-items:center;gap:6px;background:var(--gs);border-radius:8px;padding:6px 10px;font-size:10.5px;font-weight:600}
.bs-types span{margin-right:4px;color:var(--g)}.bs-types em{font-style:normal;background:#fff;border:1px solid #cfe7e2;border-radius:6px;padding:1px 8px;font-size:13px;font-weight:800;color:var(--g);display:flex;gap:4px;align-items:baseline}.bs-types em small{font-size:9.5px;color:#6b7280;font-weight:600}
.bs-cases{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.bs-case{border:1px solid #e5e7eb;border-radius:10px;padding:7px 10px;display:flex;flex-direction:column;gap:4px;break-inside:avoid}
.bs-case-h{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.bs-case-h b{font-size:12.5px}.bs-case-h small{display:block;font-size:9.5px;color:#6b7280}
.bs-pill{background:var(--g);color:#fff;border-radius:8px;padding:2px 9px;font-size:15px;font-weight:800;white-space:nowrap;text-align:right;line-height:1.3}.bs-pill small{display:block;font-size:9px;font-weight:600;opacity:.9}
.bs-case-p{display:flex;flex-wrap:wrap;gap:3px}
.bs-chip{display:inline-flex;gap:3px;align-items:baseline;background:#f3f4f6;border-radius:5px;padding:1px 6px;font-size:9.8px;color:#374151;white-space:nowrap}.bs-chip b{font-weight:700;color:#111827}
.bs-chip.t{background:var(--gs)}.bs-chip.t b{color:var(--g)}.bs-chip.s{background:#eef2ff}.bs-chip.o{background:#fef3c7}.bs-chip.o b{color:var(--o)}.bs-chip.c{background:var(--cs)}.bs-chip.c b{color:var(--c)}.bs-chip.g{background:var(--gs)}
.bs-ref{font-size:8.8px;color:#9ca3af}
.bs-note1{margin:0;font-size:10.3px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 10px}
.bs-band{display:flex;gap:10px;align-items:center;border-radius:10px;padding:9px 14px;color:#fff}.bs-band>b{font-size:22px;opacity:.85}.bs-band h3{margin:0;font-size:16px;color:#fff}.bs-band p{margin:0;font-size:10px;opacity:.9}
.bs-band.c{background:linear-gradient(120deg,#be123c,#9f1239)}.bs-band.b{background:linear-gradient(120deg,#4338ca,#3730a3)}.bs-band.h{background:linear-gradient(120deg,#c2410c,#9a3412)}
.bs-big3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.bs-big3 div{background:var(--cs);border-radius:10px;padding:8px 12px;display:flex;flex-direction:column}.bs-big3 span{font-size:10.5px;font-weight:600}.bs-big3 b{font-size:24px;color:var(--c);line-height:1.2;white-space:nowrap}.bs-big3 small{font-size:9.5px;color:#6b7280}
.bs-rows{display:flex;flex-direction:column}
.bs-row{display:grid;grid-template-columns:86px 1fr 86px;gap:8px;align-items:center;border-bottom:1px solid #f1f1f1;padding:5px 0}
.bs-rn i{font-style:normal;color:var(--c);font-weight:800;margin-right:3px}.bs-rn b{font-size:12px}.bs-rn small{display:block;font-size:9.5px;color:#6b7280}
.bs-ri{display:flex;flex-wrap:wrap;gap:3px}.bs-rt{text-align:right}.bs-rt b{display:block;font-size:15px;color:var(--c);white-space:nowrap}.bs-rt small{font-size:9px;color:#6b7280}
.bs-limbar{display:flex;gap:4px;border-radius:8px;overflow:hidden}.bs-limbar div{background:#fbd5dc;padding:6px 10px;display:flex;flex-direction:column}.bs-limbar div.n{background:#f8a5b5}.bs-limbar b{font-size:11.5px;color:#881337}.bs-limbar small{font-size:9px;color:#4b5563}
.bs-small{margin:0;font-size:9.8px;color:#6b7280}
.bs-2col{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bs-box{border-radius:10px;padding:8px 11px;border:1px solid #e5e7eb;display:flex;flex-direction:column;gap:3px}
.bs-box.c{background:var(--cs);border-color:#f9c7d1}.bs-box.w{background:#fffbeb;border-color:#fde68a}.bs-box.h{background:var(--hs);border-color:#f8cfb3}.bs-box.b{background:var(--bsf);border-color:#c7cbf7}
.bs-boxh{display:flex;justify-content:space-between;align-items:baseline}.bs-boxh b{font-size:12px}.bs-boxh em{font-style:normal;font-size:16px;font-weight:800}
.bs-box.c .bs-boxh em{color:var(--c)}.bs-box.h .bs-boxh em{color:var(--h)}.bs-box.b .bs-boxh em{color:var(--b)}
.bs-kv{display:flex;justify-content:space-between;gap:8px;font-size:10.3px}.bs-kv b{white-space:nowrap}
.bs-box ul{margin:0;padding-left:15px;font-size:10.3px}.bs-box p{margin:0;font-size:10px}.bs-box small{font-size:9.5px;color:#6b7280}
.bs-flow{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
.bs-flow div{position:relative;border-radius:8px;padding:6px 8px;display:flex;flex-direction:column;gap:1px}
.bs-flow.b div{background:var(--bsf)}.bs-flow.h div{background:var(--hs)}
.bs-flow i{font-style:normal;font-size:9.5px;font-weight:700;color:#fff;border-radius:4px;padding:0 5px;align-self:flex-start}.bs-flow.b i{background:var(--b)}.bs-flow.h i{background:var(--h)}
.bs-flow b{font-size:10.5px}.bs-flow em{font-style:normal;font-size:17px;font-weight:800;white-space:nowrap}.bs-flow.b em{color:var(--b)}.bs-flow.h em{color:var(--h)}.bs-flow small{font-size:9px;color:#6b7280}
.bs-ex{display:flex;justify-content:space-between;align-items:center;gap:10px;border-radius:10px;padding:8px 12px;border:2px dashed}
.bs-ex.b{border-color:#a5acf2;background:#f7f8ff}.bs-ex.h{border-color:#f4b48c;background:#fffaf6}
.bs-ex b{display:block;font-size:11px}.bs-ex small{font-size:9.5px;color:#4b5563}.bs-ex em{font-style:normal;font-size:26px;font-weight:900;white-space:nowrap}.bs-ex.b em{color:var(--b)}.bs-ex.h em{color:var(--h)}
.bs-warn{border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;padding:5px 10px;font-size:10px;margin:0}
.bs-common{margin:0;font-size:9.3px;color:#6b7280}
.bs-foot{margin-top:auto;border-top:1px solid #e5e7eb;padding-top:5px;font-size:9px;color:#6b7280;display:flex;justify-content:space-between;gap:12px}
#bs-list .bsrow{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line,#e5e5e5);padding:6px 0;font-size:13px}
.a4.bs.big{gap:14px;font-size:12px}
.big .bs-band{padding:12px 16px}.big .bs-band h3{font-size:20px}.big .bs-band p{font-size:11.5px}.big .bs-band>b{font-size:26px}
.big .bs-big3 div{padding:12px 14px}.big .bs-big3 span{font-size:12px}.big .bs-big3 b{font-size:31px}.big .bs-big3 small{font-size:10.5px}
.big .bs-row{grid-template-columns:100px 1fr 104px;padding:9px 0}.big .bs-rn b{font-size:14px}.big .bs-rn small{font-size:10.5px}.big .bs-rt b{font-size:18px}.big .bs-rt small{font-size:10px}
.big .bs-chip{font-size:11.3px;padding:2px 8px}.big .bs-ri{gap:5px}
.big .bs-limbar div{padding:9px 12px}.big .bs-limbar b{font-size:13px}.big .bs-limbar small{font-size:10.3px}
.big .bs-small{font-size:10.8px}
.big .bs-box{padding:12px 14px;gap:5px}.big .bs-boxh b{font-size:14px}.big .bs-boxh em{font-size:20px}.big .bs-kv{font-size:11.8px}.big .bs-box ul{font-size:11.8px}.big .bs-box ul li{margin:2px 0}.big .bs-box p{font-size:11.5px}.big .bs-box small{font-size:10.5px}
.big .bs-flow{gap:7px}.big .bs-flow div{padding:10px 10px;gap:3px}.big .bs-flow i{font-size:10.5px}.big .bs-flow b{font-size:12px}.big .bs-flow em{font-size:21px}.big .bs-flow small{font-size:10px}
.big .bs-ex{padding:11px 15px}.big .bs-ex b{font-size:12.5px}.big .bs-ex small{font-size:10.8px}.big .bs-ex em{font-size:32px}
.big .bs-common{font-size:10.3px}`;

  /* ---------------- 6. 보험사 이름 맞추기 ---------------- */
  const COMPANIES = [
    ["KB손해보험", /KB\s*손해보험|KB\s*손보|KB손해|kbinsure\.co\.kr/i], ["메리츠화재", /메리츠\s*화재|메리츠/], ["DB손해보험", /DB\s*손해보험|DB\s*손보/], ["현대해상", /현대\s*해상/],
    ["삼성화재", /삼성\s*화재/], ["한화손해보험", /한화\s*손해보험|한화\s*손보/], ["흥국화재", /흥국\s*화재/], ["롯데손해보험", /롯데\s*손해보험|롯데\s*손보/],
    ["하나손해보험", /하나\s*손해보험|하나\s*손보/], ["NH농협손해보험", /농협\s*손해보험|농협\s*손보|NH\s*손보/], ["MG손해보험", /MG\s*손해보험|MG\s*손보/], ["AIG손해보험", /AIG/],
    ["라이나손해보험", /라이나\s*손해보험|라이나\s*손보/], ["캐롯손해보험", /캐롯/],
    ["삼성생명", /삼성\s*생명/], ["한화생명", /한화\s*생명/], ["교보생명", /교보\s*생명/], ["신한라이프", /신한\s*라이프/], ["미래에셋생명", /미래에셋\s*생명/],
    ["동양생명", /동양\s*생명/], ["흥국생명", /흥국\s*생명/], ["ABL생명", /ABL/], ["DB생명", /DB\s*생명/], ["KDB생명", /KDB\s*생명/], ["NH농협생명", /농협\s*생명|NH\s*생명/],
    ["KB라이프생명", /KB\s*라이프/], ["메트라이프생명", /메트라이프|MetLife/i], ["라이나생명", /라이나\s*생명/], ["AIA생명", /AIA/], ["처브라이프", /처브/], ["iM라이프", /iM\s*라이프|DGB\s*생명/], ["하나생명", /하나\s*생명/], ["푸본현대생명", /푸본/], ["BNP파리바카디프", /카디프/],
  ];
  function companyOf(s) { s = String(s || ""); const hit = COMPANIES.map(([n, re]) => { const m = s.match(re); return m ? { n, i: m.index } : null; }).filter(Boolean).sort((a, b) => a.i - b.i)[0]; return hit ? hit.n : ""; }

  /* ---------------- 7. 금액 (모든 회사 표기) → 만원 ---------------- */
  function manAny(t) {
    let s = String(t || "").replace(/[\s,]/g, ""); if (!s) return null;
    let d = s.match(/^(\d+)원?$/); if (d) { const n = +d[1]; return n >= 10000 && n % 10000 === 0 ? n / 10000 : (n >= 10000 ? Math.round(n / 1000) / 10 : null); }
    const k = man(s.replace(/원?$/, "원")); if (k != null) return k;
    let m = s.match(/^(\d+(?:\.\d+)?)억(?:(\d+)천)?(?:(\d+)백)?(\d+)?만?원?$/); if (m) return Math.round(+m[1] * 10000) + (+m[2] || 0) * 1000 + (+m[3] || 0) * 100 + (+m[4] || 0);
    m = s.match(/^(\d+(?:\.\d+)?)(천만|백만|십만|만)원?$/); if (m) return Math.round(+m[1] * { 천만: 1000, 백만: 100, 십만: 10, 만: 1 }[m[2]]);
    return null;
  }

  /* ---------------- 8. 양식 미등록 회사: AI가 담보표를 원문 그대로 옮김 (n8n) ---------------- */
  const AI_URL = "https://daonpartners.app.n8n.cloud/webhook/daon-proposal-read";
  const AMT_LINE = /\d[\d,.]*\s*(억|천만|백만|만)\s*원?|\d{1,3}(,\d{3}){2,}\s*원?/;
  async function aiRead(pages) {
    // 보낼 쪽 고르기: ① 앞쪽 가입담보표 ② 세부 지급표(특약 안내사항·세부보장·'- 항목 : 금액' 목록) ③ 남는 자리에 그 밖의 금액 있는 쪽
    //  (메리츠처럼 담보 설명 쪽이 길게 이어지면 뒤쪽 세부 지급표가 글자 수 한도에 밀려 빠지던 문제)
    const DET = /안내사항|세부보장항목|통합치료항목|세부보장\s*지급|[-·]\s*[^:\n]{2,40}\s*:\s*(수술\s*1회당\s*)?[\d,]+\s*(만|천만|백만|억)?원|수술\s*1회당\s*[\d,]+\s*(만|천만|백만)?원/;
    const info = pages.map((ls, i) => { const t = ls.join("\n"); return { i, n: ls.filter(l => AMT_LINE.test(l)).length, det: DET.test(t), ref: /해약환급금\s*예시/.test(t) }; });
    const first = info.filter(x => x.i === 0 || (x.n >= 1 && !x.ref && x.i < 8)).map(x => x.i);
    const det = info.filter(x => x.det && !x.ref && first.indexOf(x.i) < 0).map(x => x.i);
    const rest = info.filter(x => x.n >= 2 && !x.ref && first.indexOf(x.i) < 0 && det.indexOf(x.i) < 0).map(x => x.i);
    const chosen = [];
    let size = 0; for (const i of first.concat(det, rest)) { const len = pages[i].join("\n").length + 12; if (size + len > 58000) continue; chosen.push(i); size += len; }
    chosen.sort((a, b) => a - b);
    let text = ""; for (const i of chosen) text += `[${i + 1}쪽]\n` + pages[i].join("\n") + "\n";
    const r = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) throw { code: "ai", msg: (d && d.error) || "담보표를 읽지 못했습니다." };
    return d;
  }

  /* ---------------- 9. 설계서 PDF → 담보 + 원본 담보표 장 그림 ---------------- */
  // 반환: { p, imgs, source:'form'|'ai', warns }
  async function readProposal(file, lib) {
    const data = new Uint8Array(await file.arrayBuffer());
    const pages = await pdfLines(lib, data.slice());
    const flat = pages.flat().join("\n");
    if (flat.replace(/\s/g, "").length < 50) throw { code: "noText", msg: "글자를 읽을 수 없는 PDF입니다 (스캔 이미지). 보험사 시스템에서 내려받은 PDF를 올려 주세요." };
    const warns = [];
    let p = null, source = "form";
    const co = companyOf(pages.slice(0, 2).flat().join("\n")) || companyOf(flat);
    if (co === "KB손해보험") { const k = parseKB(pages); if (k.items.length) p = k; }
    if (!p) {
      source = "ai";
      const d = await aiRead(pages);
      const items = d.items.map((x, i) => ({ no: i + 1, name: x.name, amt: manAny(x.amt), amtText: x.amt, prem: +(String(x.prem || "").replace(/[^\d]/g, "")) || null, term: x.term || "" }));
      // 세부보장이 딸린 머리줄(예: 26종 …치료비 → ┗ 세부 담보들)은 가입금액이 없는 게 정상이라 경고에서 뺌
      const isHead = x => items.some(y => y !== x && /\[/.test(y.name) && y.name.replace(/\s+/g, "").slice(0, 14) === x.name.replace(/\s+/g, "").slice(0, 14));
      items.forEach(x => { if (isHead(x)) x.amt = null; });  // 머리줄 숫자는 보험료일 때가 있음 (AI가 단위를 붙여도 가입금액으로 쓰지 않음)
      const bad = items.filter(x => x.amt == null && x.amtText && !isHead(x));
      if (bad.length) warns.push("가입금액 표기를 계산하지 못한 담보 " + bad.length + "개: " + bad.map(x => x.name + "(" + x.amtText + ")").join(", "));
      p = { company: companyOf(d.company) || co || d.company || "", product: d.product || "", code: "", insured: d.insured || "", age: d.age || null, sex: d.sex || "", premium: d.premium || null, no: "", issued: "", items, warn: [], details: (d.details || []).map(t => ({ rider: t.rider, rows: (t.rows || []).map(r => ({ item: r.item, freq: r.freq || "", amt: manAny(r.amt), amtText: r.amt })) })) };
      warns.push("AI가 담보표를 읽었습니다. 왼쪽 목록의 담보명·가입금액이 원본(앞 장)과 같은지 꼭 확인해 주세요.");
    }
    p.company = p.company || co || "";
    // 원본에서 담보표가 있는 장: 담보 이름이 2개 이상 나오는 장, 처음~끝 (최대 4장)
    const keys = p.items.filter(i => !i.group).map(i => i.name.replace(/\s+/g, "").slice(0, 9)).filter(k => k.length >= 3);
    const hit = pages.map(ls => { const t = ls.join("").replace(/\s+/g, ""); return keys.filter(k => t.indexOf(k) !== -1).length; });
    let s = hit.findIndex(n => n >= 2), e = -1; hit.forEach((n, i) => { if (n >= 2) e = i; });
    if (s < 0) { s = 0; e = 0; } if (e - s > 3) e = s + 3;
    const doc = await lib.getDocument({ data, isEvalSupported: false }).promise, imgs = [];
    for (let i = s; i <= e && i < doc.numPages; i++) {
      const pg = await doc.getPage(i + 1), vp = pg.getViewport({ scale: 2.2 });
      const cv = document.createElement("canvas"); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: cx, viewport: vp }).promise;
      imgs.push({ src: cv.toDataURL("image/jpeg", 0.92), w: cv.width, h: cv.height });
    }
    return { p, imgs, source, warns };
  }

  /* ---------------- 10. 약관 미등록 회사: 담보 이름으로 묶기 (금액은 설계서 가입금액 그대로) ---------------- */
  // 보상제안서에 싣는 '중심 담보'만 고름 (대표 지시 10-28: 굵직한 것만, 설계서를 그대로 옮기지 않음)
  // [키, 묶음, 패턴(공백 제거한 담보명)] — 위에서부터 먼저 맞는 것. 묶음 null = 안내서에서 뺌
  const GEN = [
    ["nurse", "care", /간병인|간병비|간병지원|간호·?간병/],
    ["dem_tx", "dem", /레켐비|도나네맙|치매.*(표적|치료비|약물)/],
    ["dem", "dem", /(치매|경도인지|장기요양).*(진단|보장)|장기요양/],
    ["drv", "drv", /벌금|교통사고처리|변호사선임|운전자/],
    ["skip", null, /포인트|생활비|생활자금|생활지원|납입면제|입원일당|입원비|중환자실|일당|통원|골절|화상|깁스|양성뇌종양|외상성|배상책임|가전|대상포진|독감|특정양성종양|기본계약/],
    ["ci_np", "txc", /비급여.*암|암.*비급여/],
    ["ci", "txc", /암.*(통합치료|주요치료|치료비)|항암|표적|면역항암|양성자|중입자|카티|다빈치로봇/],
    ["circ", "txb", /(순환계|2대질환|2대질병|뇌심|심뇌|뇌혈관|허혈|심장|혈전).*(치료비|주요치료|통합치료|치료)/],
    ["cancer", "dx", /(암).*진단/],
    ["brain", "dx", /(뇌혈관|뇌졸중|뇌경색|뇌출혈).*진단/],
    ["heart", "dx", /(허혈|심근경색|심장질환|협심증|부정맥).*진단/],
    ["dtype", "surg", /질병.*[1-5]\s*~?\s*[1-5]?종.*수술|질병.*종수술/],
    ["itype", "surg", /상해.*[1-5]\s*~?\s*[1-5]?종.*수술|상해.*종수술/],
    ["nsurg", "surg", /\d+대.*수술/],
    ["surg", "surg", /^(질병|상해)수술비/],
    ["death", "base", /사망|후유장해/],
  ];
  // 안내서 묶음 (이 순서로, 담보가 있는 묶음만 보여 줌)
  const GROUPS = { dx: "진단받으면 받는 돈 (진단비)", txc: "암 치료비", txb: "뇌·심장 치료비", dem: "치매", surg: "수술할 때 받는 돈 (수술비)", care: "간병인", drv: "운전자", base: "사망·후유장해" };
  const GCLS = { dx: "c", txc: "c", txb: "h", dem: "b", surg: "g", care: "b", drv: "g", base: "" };
  const GKPI = { dx: "진단비", txc: "암 치료비", txb: "뇌·심장 치료비", dem: "치매", surg: "수술비", care: "간병인", drv: "운전자", base: "사망·후유장해" };
  function genClass(name) { const n = String(name).replace(/\s+/g, ""); const r = GEN.find(([, , re]) => re.test(n)); return r ? { k: r[0], g: r[1] } : { k: "skip", g: null }; }

  /* ---------------- 5-2. 계산: 약관 등록 회사는 사전, 미등록은 가입금액 그대로 ---------------- */
  function build2(p) {
    const M = build(p);
    M.items = p.items.filter(i => !i.group && i.amt != null).map(i => Object.assign({}, i, genClass(i.name))).filter(i => i.g && !(i.g === "base" && i.amt < 1000));
    return M;
  }

  /* ---------------- 11. 보상제안서 2장 ---------------- */
  const escH = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function origPages(imgs) { return (imgs || []).map(im => `<div class="page a4 orig" data-fixed="1"><img src="${im.src}" alt="설계서 원본"></div>`).join(""); }

  // opt: { insured, agent:{name,title,org}, foot }
  function render2(M, opt) {
    opt = opt || {};
    const p = M.p, a = opt.agent || {};
    const insured = escH(opt.insured || p.insured || "고객");
    const fmtv = fmt;
    const agentLine = `<b>${escH(a.name || "[설계사 이름]")}</b>${a.title ? " " + escH(a.title) : ""}${a.org ? ` <span>소속</span> ${escH(a.org)}` : ""}`;
    const basis = M.D ? M.D.basis : "약관 등록 전 — 설계서 가입금액 기준";
    const foot = opt.foot || `<div class="bs-foot"><span>${escH([a.name, a.title, a.org].filter(Boolean).join(" "))}</span><span>기준: ${escH(basis)}</span></div>`;
    const top = n => `<div class="bs-top"><span>${insured} 고객님 보험금예상안내서</span><span>보상제안 ${n}/2</span></div>`;
    const sec = (no, t) => `<h4 class="bs-sec g"><span>${no}</span>${t}</h4>`;
    const hero = (note) => `<div class="bs-hero"><div class="bs-kk">INSURANCE BENEFIT GUIDE</div><h2>${insured} 고객님 보험금예상안내서</h2>
        <dl><dt>상품</dt><dd>${escH(p.company)} <b>${escH(p.product)}</b></dd><dt>담당설계사</dt><dd>${agentLine}</dd></dl>
        <p>${p.age ? `피보험자 ${escH(p.sex)} ${p.age}세 · ` : ""}${p.premium ? `월 보험료 ${Number(p.premium).toLocaleString("ko-KR")}원 · ` : ""}${note}</p></div>`;
    if (M.D) return renderKB(M, { insured, top, sec, hero, foot, fmt: fmtv });

    /* ===== 약관 미등록 회사: '왜 이 상품인가' — 보험료 비중 + 공식 통계 순위별 보상 사례 =====
       담보와 사례의 연결은 설계서 담보명에 그 질병·수술 이름이 적힌 것만 (추정 연결 없음) */
    return renderCases(M, { insured, top, sec, hero, foot, fmt: fmtv });
  }

  // 공식 통계 (사례 순위의 근거) — 새 통계가 나오면 여기만 고침
  const STATS = {
    death: "국가데이터처 「2025년 사망원인통계」(2026.9.22)",
    cancer: "보건복지부·국립암센터 「2023년 국가암등록통계」(2026.1.20)",
    surg: "국민건강보험공단 「2025년 주요수술 통계연보」(2026.8.31)",
  };
  const SURG_CASES = [
    { t: "백내장 수술", s: "수술 건수 1위 · 연 692,126건", re: /백내장/ },
    { t: "허리·목 디스크 수술", s: "일반척추수술 2위 · 연 199,147건", re: /추간판|디스크|척추/ },
    { t: "치핵(치질) 수술", s: "수술 건수 4위 · 연 151,864건", re: /치핵|치질/ },
    { t: "담낭 절제술 (담석 등)", s: "수술 건수 5위 · 연 103,817건", re: /담낭|담석/ },
  ];
  const AGE_SURG = [ // 연령대별 최다 수술 (같은 통계연보)
    [a => a <= 9, { t: "편도 절제술", s: "9세 이하 최다 수술", re: /편도/ }],
    [a => a >= 10 && a <= 19, { t: "충수(맹장) 수술", s: "10대 최다 수술", re: /충수|맹장/ }],
    [a => a >= 40 && a <= 49, { t: "치핵(치질) 수술", s: "40대 최다 수술 · 전체 4위", re: /치핵|치질/ }],
    [a => a >= 50, { t: "백내장 수술", s: "50대 이상 최다 수술 · 전체 1위", re: /백내장/ }],
  ];

  function renderCases(M, U) {
    const p = M.p, fmt2 = U.fmt;
    const nm = i => String(i.name).replace(/\s+/g, "");
    // 담보명 줄이기 (화면용): 가입형태·환급형·고지형 같은 괄호, '무배당', '_1종' 등은 빼고 보장 이름만
    const short = t => {
      t = String(t).replace(/\((건강가입|간편가입|일반가입|맞춤고지|감액없음)\)/g, "");
      const m = t.match(/^(.*?)\[(.+)\](.*)$/); if (m) t = /(비|금|일당)/.test(m[2]) ? m[2] : m[1].trim() + "(" + m[2] + ")";
      t = t.replace(/^\s*\(?무배당\)?\s*/, "").replace(/\([^()]*(해약환급금|갱신|고지|납입면제|가입형)[^()]*\)/g, "").replace(/_\s*\d종/g, "").replace(/_/g, " ");
      const sp = t.trim().split(/\s+/); // '특약명 보험금명' 꼴이면 보험금명(뒤쪽)을 앞에
      const k = sp.findIndex((w, x) => x > 0 && /(보험금|진단비|치료비|수술비|일당|급여금)/.test(w));
      if (k > 0 && /특약/.test(sp.slice(0, k).join(""))) t = sp.slice(k).join(" ");
      return t.replace(/\s+/g, " ").trim();
    };
    const RAW = (p.items || []).filter(i => !i.group && i.amt != null && i.amt > 0 && !/포인트/.test(nm(i)));
    const find = (...res) => RAW.filter(i => res.every(re => re.test(nm(i))));
    const sumA = arr => arr.reduce((x, i) => x + i.amt, 0);
    const uniq = arr => [...new Set(arr)];
    const chipI = (i, cls) => `<div class="bs-li ${cls || ""}"><span>${escH(short(i.name))}</span><b>${fmt2(i.amt)}</b></div>`;
    const card = (title, sub, pill, pillSub, chips, ref, cls, tx) => `<div class="bs-case ${cls || ""}"><div class="bs-case-h"><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</div>${pill ? `<div class="bs-pill">${pill}${pillSub ? `<small>${pillSub}</small>` : ""}</div>` : ""}</div><div class="bs-lis">${chips.join("")}</div>${tx ? `<div class="bs-txw"><i>치료받을 때 — 항목마다 정해진 금액</i>${tx}</div>` : ""}${ref ? `<div class="bs-ref">${ref}</div>` : ""}</div>`;

    // ── 수술 공통: 질병수술비(제외 조건 없는 것 / 있는 것), 1~5종 질병수술비
    const dsAll = find(/^질병수술비/), dsPlain = dsAll.filter(i => !/제외/.test(nm(i)));
    const dtype = RAW.filter(i => /질병[1-5]종|질병.*[1-5]종.*수술/.test(nm(i)) && !/상해/.test(nm(i)));
    const typeNote = dtype.length ? `+ 1~5종 질병수술비 ${fmt2(Math.min(...dtype.map(i => i.amt)))}~${fmt2(Math.max(...dtype.map(i => i.amt)))} (몇 종인지는 약관 수술분류표)` : "";
    const surgOf = re => RAW.filter(i => /수술비/.test(nm(i)) && !/수술후/.test(nm(i)) && re.test(nm(i)) && !/^질병수술비/.test(nm(i)));

    // ── 1) 이 설계의 핵심: 보험료가 어디에 쓰이나
    const BUCKET = [["수술", /수술/], ["암", /암/], ["뇌·심장", /뇌|심장|순환계|심근|허혈/], ["간병·입원", /간병|간호|입원|일당/], ["치매", /치매|인지|장기요양|레켐비/], ["운전자", /벌금|교통사고|변호사|운전/], ["사망·장해", /사망|장해/]];
    const prems = RAW.map(i => ({ i, w: +(String(i.prem || "").replace(/[^\d]/g, "")) || 0 })).filter(x => x.w);
    const tot = prems.reduce((x, y) => x + y.w, 0);
    const byB = {}; prems.forEach(({ i, w }) => { const b = (BUCKET.find(([, re]) => re.test(nm(i))) || ["기타"])[0]; byB[b] = (byB[b] || 0) + w; });
    const ranked = Object.entries(byB).filter(([b, w]) => b !== "기타" && w / tot >= 0.01).sort((x, y) => y[1] - x[1]).slice(0, 3);
    const WHY = { "암": "암은 사망원인 1위", "뇌·심장": "심장질환 사망원인 2위 · 뇌혈관질환 4위", "수술": "백내장 수술만 한 해 69만 건", "간병·입원": "입원 시 간병비 부담", "치매": "", "운전자": "", "사망·장해": "" };
    const core = tot && ranked.length ? `<div class="bs-blk"><div class="bs-core"><div class="bs-core-h"><b>이 설계의 중심 — ${escH(ranked[0][0])}</b><span>월 보험료 ${Number(p.premium || tot).toLocaleString("ko-KR")}원 중 어디에 쓰이나 (설계서 담보별 보험료 기준)</span></div><div class="bs-core-t">${ranked.map(([b, w], k) => `<div class="${k ? "" : "on"}"><span>${escH(b)}</span><b>${Math.round(w / tot * 100)}%</b><small>${WHY[b] || ""}</small></div>`).join("")}</div></div></div>` : "";

    // ── 2) 큰 병 사례 (사망원인·암 발생 순위)
    const big = [];
    const sex = p.sex || "", age = +p.age || 0;
    const cancerDx = find(/암.*진단|암진단/).filter(i => !/유사암|소액암|갑상선|기타피부|제자리|경계성/.test(nm(i).replace(/유사암제외/g, "")) || /유사암제외/.test(nm(i)));
    const icParts = cancerDx.filter(i => /^통합암/.test(nm(i))), otherDx = cancerDx.filter(i => !/^통합암/.test(nm(i)));
    const caTx = find(/암/, /통합치료|주요치료/).filter(i => !/생활비/.test(nm(i)));
    // 설계서 '특약 안내사항' 세부 지급표: 치료 항목마다 정해진 금액 (AI가 원문 그대로 옮긴 것)
    const key = t => String(t || "").replace(/\((건강가입|간편가입|일반가입|맞춤고지|감액없음)\)/g, "").replace(/[\s()]/g, "").replace(/특약안내사항|특별약관안내사항|안내사항|특약|특별약관/g, "");
    const detOf = i => (p.details || []).find(t => { const a = key(t.rider), b = key(i.name); return a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0); });
    const lab = t => String(t).replace(/^▶\s*/, "").replace(/비급여\(전액본인부담\s*포함\)\s*/g, "비급여 ").replace(/암\(유사암제외\)\s*/g, "").replace(/\s+/g, " ").trim();
    const isSim = t => /유사암|기타피부암|갑상선|특정암\s*다빈치|제자리|경계성/.test(String(t).replace(/(유사암|특정암)\s*제외/g, ""));
    const txRows = (i, wantSim) => {
      const d = detOf(i); if (!d) return null;
      const rows = d.rows.filter(r => r.amt && !/한도/.test(r.item) && (wantSim ? isSim(r.item) : !isSim(r.item)));
      const lim = d.rows.find(r => /한도/.test(r.item) && r.amt);
      return { rows, lim };
    };
    const txBox = (items, wantSim, cls) => items.map(i => {
      const t = txRows(i, wantSim);
      if (!t || !t.rows.length) return `<div class="bs-txr"><b>${escH(short(i.name))}</b><span>가입금액 ${fmt2(i.amt)} · 치료 항목마다 정해진 금액 지급 (항목·금액은 설계서 특약 안내사항·약관)</span></div>`;
      const big = t.rows.filter(r => r.amt >= 100), sm = t.rows.filter(r => r.amt < 100);
      return `<div class="bs-txr"><b>${escH(short(i.name))}</b><div class="bs-case-p">${big.map(r => `<span class="bs-chip ${cls || "o"}">${escH(lab(r.item))} <small>${escH(r.freq)}</small> <b>${fmt2(r.amt)}</b></span>`).join("")}${sm.length ? `<span class="bs-chip">검사·재활 등 ${sm.length}개 항목 <b>${fmt2(Math.min(...sm.map(r => r.amt)))}~${fmt2(Math.max(...sm.map(r => r.amt)))}</b></span>` : ""}</div>${t.lim ? `<small>연간 총 지급 한도 ${fmt2(t.lim.amt)}</small>` : ""}</div>`;
    }).join("");
    const caSpecial = find(/중입자|양성자/);
    const caTxSum = sumA(caTx);
    const rep = sex === "여" ? { t: "유방암", s: "여성 암 발생 1위", re: /유방/ } : sex === "남" ? { t: "전립선암", s: "남성 암 발생 1위", re: /전립선/ } : { t: "폐암", s: "암 발생 2위 (1위 갑상선암)", re: /폐암/ };
    if (cancerDx.length || caTx.length) {
      const icOne = icParts.length ? [icParts.slice().sort((x, y) => y.amt - x.amt)[0]] : [];
      const typeTx = find(rep.re, /항암|방사선|약물/);
      const surgC = dsPlain.concat(surgOf(rep.re));
      const lump = sumA(otherDx) + sumA(icOne) + sumA(surgC);
      big.push(card(`${rep.t} 진단·치료`, `${rep.s} · 암은 사망원인 1위`, lump ? fmt2(lump) : "", lump ? "진단·수술 시" : "",
        [...otherDx.map(i => chipI(i, "c")), icParts.length ? `<div class="bs-li c"><span>통합암진단비 (해당 암 구분)</span><b>${fmt2(icOne[0].amt)}</b></div>` : "", ...surgC.map(i => chipI(i, "t")), ...typeTx.map(i => chipI(i)), ...caSpecial.map(i => chipI(i))],
        icParts.length > 1 ? `통합암은 암 구분(${icParts.length}개)별로 따로 지급 — ${rep.t}이 어느 구분인지는 약관 분류표` : "", "c", caTx.length ? txBox(caTx, false) : ""));
    }
    const thyDx = find(/유사암진단|갑상선암진단/), thyTx = find(/갑상선암/, /치료|약물|호르몬/).filter(i => !/\(기타피부암\)/.test(nm(i)));
    if (thyDx.length || thyTx.length) {
      const lump = sumA(thyDx) + sumA(dsPlain) + sumA(surgOf(/갑상선/));
      big.push(card("갑상선암", "암 발생 1위 (유사암)", lump ? fmt2(lump) : "", lump ? "진단·수술 시" : "", [...thyDx.map(i => chipI(i, "c")), ...dsPlain.map(i => chipI(i, "t")), ...surgOf(/갑상선/).map(i => chipI(i, "t")), ], "", "c", (thyTx.length || caTx.length) ? (thyTx.length ? `<div class="bs-txr"><b>갑상선암 치료 담보</b><div class="bs-lis">${thyTx.map(i => chipI(i, "o")).join("")}</div></div>` : "") + txBox(caTx.filter(i => { const t = txRows(i, true); return t && t.rows.length; }), true) : ""));
    }
    const circ = find(/순환계/, /치료/);
    const heartDx = find(/(심장|심근경색|허혈|협심증)/, /진단/), heartS = surgOf(/심장/), heartTx = find(/심장/, /치료/).filter(i => !/수술/.test(nm(i)));
    if (heartDx.length || heartS.length || heartTx.length) {
      const lump = sumA(heartDx) + sumA(heartS) + sumA(dsPlain);
      const tx = sumA(circ) + sumA(heartTx);
      big.push(card("심장질환 (협심증·심근경색 등)", "사망원인 2위", lump ? fmt2(lump) : "", lump ? "진단·수술 시" : "", [...heartDx.map(i => chipI(i, "c")), ...heartS.map(i => chipI(i, "t")), ...dsPlain.map(i => chipI(i, "t")), ], circ.length ? "순환계 치료비는 그 질병이 약관의 순환계질환 분류표에 들 때" : "", "h", tx ? txBox(circ.concat(heartTx), false, "o") : ""));
    }
    const brainDx = find(/(뇌혈관|뇌졸중|뇌경색|뇌출혈)/, /진단/), brainS = surgOf(/뇌혈관|뇌졸중|뇌출혈|뇌경색/), brainTx = find(/(뇌혈관|뇌졸중)/, /치료/).filter(i => !/수술/.test(nm(i)));
    if (brainDx.length || brainS.length || brainTx.length) {
      const lump = sumA(brainDx) + sumA(brainS) + sumA(dsPlain);
      const tx = sumA(circ) + sumA(brainTx);
      big.push(card("뇌혈관질환 (뇌경색·뇌출혈 등)", "사망원인 4위", lump ? fmt2(lump) : "", lump ? "진단·수술 시" : "", [...brainDx.map(i => chipI(i, "c")), ...brainS.map(i => chipI(i, "t")), ...dsPlain.map(i => chipI(i, "t")), ], circ.length ? "순환계 치료비는 그 질병이 약관의 순환계질환 분류표에 들 때" : "", "b", tx ? txBox(circ.concat(brainTx), false, "o") : ""));
    }
    // 심장·뇌 이름이 붙은 담보 없이 순환계 치료비만 있으면 한 장으로
    if (circ.length && !heartDx.length && !heartS.length && !heartTx.length && !brainDx.length && !brainS.length && !brainTx.length)
      big.push(card("심장·뇌혈관질환 치료 (순환계)", "심장질환 사망원인 2위 · 뇌혈관질환 4위", "", "", [], "그 질병이 약관의 순환계질환 분류표에 들 때 지급", "h", txBox(circ, false, "o")));
    const dem = find(/치매|경도인지|장기요양|레켐비|도나네맙/);
    if (dem.length) big.push(card("치매·장기요양", "", fmt2(Math.max(...dem.map(i => i.amt))) , "가장 큰 담보", dem.map(i => chipI(i, "c")), "", "b"));

    // ── 3) 많이 받는 수술 Top 3 (나이를 알면 그 연령대 최다 수술을 맨 앞에)
    const list = SURG_CASES.slice();
    const ag = age ? (AGE_SURG.find(([f]) => f(age)) || [])[1] : null;
    if (ag) { const k = list.findIndex(c => String(c.re) === String(ag.re)); if (k >= 0) list.splice(k, 1); list.unshift(ag); }
    const surgCards = (dsAll.length || dtype.length || RAW.some(i => /수술/.test(nm(i)))) ? list.map(c => {
      const sp = surgOf(c.re), pay = dsAll.concat(sp);
      if (!pay.length && !dtype.length) return "";
      return card(c.t, c.s, pay.length ? fmt2(sumA(pay)) : "", pay.length ? "수술 1회" : "", [...dsAll.map(i => chipI(i, "t")), ...sp.map(i => chipI(i, "s"))], "", "g");
    }).filter(Boolean).slice(0, 3) : [];

    // ── 4) 간병인 · 운전자
    const care = find(/간병인|간호·?간병|간호간병/).filter(i => !/181일이상/.test(nm(i)));
    const careCard = care.length ? card("입원해서 간병이 필요할 때", "", `하루 ${fmt2(Math.max(...care.map(i => i.amt)))}`, "가장 큰 담보 기준", care.map(i => chipI(i, "b")), "간병인 사용·간호간병통합서비스 중 실제 이용한 쪽 담보로 지급 · 지급 일수 한도는 담보명 참고", "b") : "";
    const drv = find(/벌금|교통사고처리|변호사선임/);
    const drvCard = drv.length ? card("운전 중 사고로 형사 책임을 질 때", "", fmt2(sumA(drv)), "담보 합 (한도)", drv.map(i => chipI(i, "g")), "", "g") : "";

    let no = 0;
    const blockOf = (t, cards, cls, note) => cards.length ? `<div class="bs-blk">${U.sec(String(++no).padStart(2, "0"), t)}<div class="bs-cases cx ${cls || ""} n${cards.length}">${cards.join("")}</div>${note ? `<p class="bs-small">${note}</p>` : ""}</div>` : "";
    const body = blockOf("큰 병에 걸리면 받는 돈", big, "two", typeNote ? "수술을 받으면 " + typeNote : "") + blockOf("많이 받는 수술 Top 3", surgCards, "", typeNote ? "위 금액에 " + typeNote.replace(/^\+ /, "") + "가 더해질 수 있습니다." : "") + blockOf("간병·운전", [careCard, drvCard].filter(Boolean), "two");
    const yak = `<div class="bs-blk bs-box w bs-yak"><div class="bs-boxh"><b>${escH(p.company || "이 보험사")} 약관 등록 전 안내</b></div><p>금액은 설계서 <b>가입금액 그대로</b>이며, 사례에는 담보명에 그 질병·수술 이름이 적힌 담보만 넣었습니다. 치료비는 설계서 특약 안내사항의 <b>항목별 지급금액</b>(계약일부터 1년 경과 이후 기준)을 옮겼습니다. 몇 종 수술인지, 감액기간 같은 지급 조건은 약관에 따릅니다.</p></div>`;
    const src = `<p class="bs-blk bs-common">통계 출처: ${STATS.death} · ${STATS.cancer} · ${STATS.surg}. 금액은 ${escH(p.company)} 설계서(${escH(p.product)})의 가입금액이며, 실제 지급 여부와 금액은 진단명·질병코드·수술 분류와 약관에 따릅니다.</p>`;
    return `<div class="page a4 bs bsp" data-bsflow="1">${U.top(1)}${U.hero("설계서 가입금액 기준")}
      ${core}${body || `<p class="bs-small">설계서에서 사례로 보여드릴 담보를 찾지 못했습니다.</p>`}
      ${yak}${src}${U.foot}</div>`;
  }

  // 같은 담보의 세부보장(담보명[세부]…)은 한 칸으로 묶음 — 이름은 설계서 그대로
  function subGroups(arr) {
    const sp = i => { const m = String(i.name).match(/^(.*?)\[(.+)\](.*)$/); return m ? { pre: m[1].trim(), part: m[2].trim(), post: m[3].trim() } : null; };
    const by = {};
    arr.forEach(i => { const k = sp(i); if (k) (by[k.pre + "|" + k.post] = by[k.pre + "|" + k.post] || []).push({ i, part: k.part }); });
    const out = [], done = new Set();
    arr.forEach(i => {
      if (done.has(i)) return;
      const k = sp(i), g = k && by[k.pre + "|" + k.post];
      if (g && g.length >= 2) { g.forEach(x => done.add(x.i)); out.push({ title: k.pre + (k.post ? " " + k.post : ""), parts: g, same: g.every(x => x.i.amt === g[0].i.amt) }); }
      else { done.add(i); out.push({ i }); }
    });
    return out;
  }

  // 화면에 붙인 뒤 호출: 넘치는 묶음(.bs-blk)을 다음 장으로 넘기고 '보상제안 n/N' 번호를 다시 매김
  function reflow(host) {
    if (!host) return;
    [...host.querySelectorAll('.bsp[data-bsflow="1"]')].forEach(pg => {
      let cur = pg, guard = 0;
      while (cur.scrollHeight > cur.clientHeight + 1 && guard++ < 20) {
        // 안내 상자 하나 때문에 넘치면 새 장을 만들지 않고 상자만 뺌 (맨 아래 한 줄 안내문이 같은 내용을 담고 있음)
        const yak = cur.querySelector(":scope > .bs-yak");
        if (yak) { yak.style.display = "none"; if (cur.scrollHeight <= cur.clientHeight + 1) { yak.remove(); break; } yak.style.display = ""; }
        const blks = [...cur.querySelectorAll(":scope > .bs-blk")];
        if (blks.length < 2) break;
        const nx = document.createElement("div"); nx.className = cur.className; nx.removeAttribute("data-bsflow");
        const topEl = cur.querySelector(":scope > .bs-top"), footEl = [...cur.children].pop();
        if (topEl) nx.appendChild(topEl.cloneNode(true));
        const foot2 = footEl.cloneNode(true); nx.appendChild(foot2);
        cur.after(nx);
        // 넘칠 때까지 뒤에서부터 하나씩 옮김
        while (cur.scrollHeight > cur.clientHeight + 1 && cur.querySelectorAll(":scope > .bs-blk").length > 1) {
          const last = [...cur.querySelectorAll(":scope > .bs-blk")].pop();
          nx.insertBefore(last, nx.querySelector(":scope > .bs-blk") || foot2);
        }
        cur = nx;
      }
    });
    const ps = [...host.querySelectorAll(".bsp")];
    ps.forEach((pg, i) => { const t = pg.querySelector(".bs-top span:last-child"); if (t) t.textContent = `보상제안 ${i + 1}/${ps.length}`; });
  }


  /* KB손해보험 (약관 사전 등록): 1장 요약·진단비·수술사례 / 2장 치료비 */
  function renderKB(M, U) {
    const { p, A, T, D } = M, fmt2 = U.fmt;
    const has = k => A[k] > 0, v = k => A[k] || 0;
    const sum = arr => arr.reduce((x, y) => x + (y || 0), 0);
    const dsum = (...ks) => sum(ks.map(v));
    const chip = (label, amt, cls = "") => amt ? `<span class="bs-chip ${cls}">${label} <b>${typeof amt === "number" ? fmt2(amt) : amt}</b></span>` : "";
    const chips = arr => arr.filter(Boolean).join("");
    const icKeys = Object.keys(IC_NAME).filter(has);
    const icFirst = has("ic_digest") ? "ic_digest" : icKeys[0];
    const dxName = n => escH(String(n).replace(/\s+/g, " ").trim());
    const cList = (M.cancerDx || []).filter(i => !/유사암진단|소액암|갑상선암진단|제자리암|경계성/.test(i.name.replace(/\s+/g, "")) || /유사암제외/.test(i.name.replace(/\s+/g, "")));
    const byAmt = arr => arr.slice().sort((a, b) => b.amt - a.amt)[0] || null;
    const cMain = byAmt(cList.filter(i => /유사암제외|일반암|^암진단/.test(i.name.replace(/\s+/g, "")))) || byAmt(cList);
    // 통합암: 설계서의 담보명(부위 앞부분)을 그대로 제목으로
    const icItems = (p.items || []).filter(i => !i.group && D && D.rules.some(([k, re]) => /^ic_/.test(k) && re.test(i.name.replace(/\s+/g, ""))));
    const icTitle = icItems.length ? [...new Set(icItems.map(i => i.name.replace(/\s+/g, " ").replace(/\s*[(_]\s*(소화기관암|폐암|간암|혈액암|두경부암|11대|3대|생식기|특정소액).*$/, "").trim()))].join(" · ") : "통합암진단비";
    const ciLimit = v("ci_hi") + v("ci_np");
    const kpi = (cls, t, big, sub) => `<div class="bs-k ${cls}"><span>${t}</span><b>${big}</b><small>${sub}</small></div>`;
    const kpis = [
      cMain || icFirst ? kpi("kc", "암 진단 즉시", fmt2((cMain ? cMain.amt : 0) + (icFirst ? v(icFirst) : 0)), [cMain ? dxName(cMain.name) + " " + fmt2(cMain.amt) : "", icFirst ? "통합암 " + IC_NAME[icFirst] + " " + fmt2(v(icFirst)) : ""].filter(Boolean).join(" + ")) : "",
      ciLimit ? kpi("kc", "암 치료비 · 매년", fmt2(ciLimit), "통합치료비 연간 한도 합") : "",
      has("brain") || has("heart1") ? kpi("kb", "뇌·심장 진단 즉시", fmt2(Math.max(v("brain"), v("heart1"))), `뇌혈관 ${fmt2(v("brain"))} · 심장 ${fmt2(v("heart1"))}`) : "",
      has("circ") ? kpi("kh", "뇌·심장 치료비 · 매년", fmt2(v("circ")), "순환계 통합치료 연 한도") : "",
    ].join("");
    const SC = (D && D.scope) || {};
    const dx = (cls, t, amt, sub, k) => amt ? `<div class="${cls}"><span>${t}${k && SC[k] ? `<em>(${SC[k]})</em>` : ""}</span><b>${fmt2(amt)}</b>${k && SC[k] ? "" : `<small>${sub || ""}</small>`}</div>` : "";
    // 사전에 없는 진단비 담보도 설계서 가입금액 그대로 진단비 칸에 보여 줌 (진단 시 일시금)
    const cancerBox = (M.cancerDx || []).map(i => `<div class="c"><span>${dxName(i.name)}</span><b>${fmt2(i.amt)}</b><small>설계서 가입금액 · 진단 시 일시금</small></div>`);
    const dxOther = (M.rawDx || []).filter(u => u.amt).map(u => `<div class="g"><span>${dxName(u.name)}</span><b>${fmt2(u.amt)}</b><small>설계서 가입금액</small></div>`);
    const dxBox = [
      ...cancerBox,
      icKeys.length ? `<div class="c ic"><span>${escH(icTitle)} <em>(약관 제2조: 암 구분별 최초 1회의 진단에 한하여 각각 지급)</em></span><div class="bs-ic">${icKeys.map(k => chip(IC_NAME[k], v(k), "c")).join("")}</div></div>` : "",
      dx("b", "뇌혈관질환", v("brain"), "뇌경색·뇌출혈·대뇌동맥류 등", "brain"),
      dx("b", "뇌졸중", v("stroke"), "", "stroke"),
      dx("b", "뇌출혈", v("brainhem"), "", "brainhem"),
      dx("b", "특정뇌혈관질환", v("sbrain"), "", "sbrain"),
      dx("h", "허혈성심장질환", v("ihd"), "", "ihd"),
      dx("h", "급성심근경색", v("ami"), "", "ami"),
      dx("h", "심장질환 (특정Ⅰ)", v("heart1"), "협심증·심방세동·심부전 등", "heart1"),
      dx("h", "심장질환 (특정Ⅱ)", v("heart2"), "급성심근경색·심정지 소생", "heart2"),
      dx("h", "부정맥 (I49)", v("arrhy"), "", "arrhy"),
    ].concat(dxOther).filter(Boolean).join("");
    const cases = [];
    const card = (title, sub, total, totSub, parts, ref) => `<div class="bs-case"><div class="bs-case-h"><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</div><div class="bs-pill">${total}${totSub ? `<small>${totSub}</small>` : ""}</div></div><div class="bs-case-p">${chips(parts)}</div>${ref ? `<div class="bs-ref">${ref}</div>` : ""}</div>`;
    const tp = k => ({ d1: "1종", d2: "2종", d3: "3종", d4: "4종", d5: "5종" }[k]);
    const base = k => [chip("질병수술비", v("dsurg")), chip(tp(k) + " 수술", v(k), "t")];
    if (has("dsurg") || has("d1")) { const t = dsum("dsurg", "d1"); cases.push(card("대장용종 제거", "건강검진 내시경 중", fmt2(t), has("ben1") ? `첫 회 ${fmt2(t + v("ben1"))}` : "", [...base("d1"), has("ben1") ? chip("첫 회 특정양성종양Ⅰ", v("ben1"), "o") : ""], "분류표 88-2 · 대장용종 내시경 절제 = 1종")); }
    if (has("d2")) { const t = dsum("dsurg", "d2"); cases.push(card("위·십이지장 용종 제거", "", fmt2(t), has("ben2") ? `첫 회 ${fmt2(t + v("ben2"))}` : "", [...base("d2"), has("ben2") ? chip("첫 회 특정양성종양Ⅱ", v("ben2"), "o") : ""], "분류표 88-2 · 복부장기 내시경 = 2종")); }
    if (has("d3") || has("s116_3")) {
      const t = dsum("s116_3", "dsurg", "d3"); cases.push(card("갑상선 결절(양성) 수술", "", fmt2(t), has("ben1") ? `첫 회 ${fmt2(t + v("ben1"))}` : "", [chip("116대Ⅲ", v("s116_3"), "s"), ...base("d3"), has("ben1") ? chip("첫 회 특정양성종양Ⅰ", v("ben1"), "o") : ""], "분류표 57 · 갑상선 관혈수술 = 3종"));
      const t2 = dsum("s116_3", "dsurg", "d2"); cases.push(card("허리·목 디스크 수술", "", t2 !== t ? `${fmt2(Math.min(t, t2))}~${fmt2(Math.max(t, t2))}` : fmt2(t), "", [chip("116대Ⅲ", v("s116_3"), "s"), ...base("d3")], "분류표 9 · 추간판 관혈 = 3종 (내시경·경피적은 2종)"));
    }
    if (has("s116_4") || has("d3")) cases.push(card("담석 · 담낭 수술", "복강경 포함", fmt2(dsum("s116_4", "dsurg", "d3")), "", [chip("116대Ⅳ", v("s116_4"), "s"), ...base("d3")], "분류표 36 · 담낭·담도 관혈 = 3종"));
    if (has("s116_4") || has("d1")) cases.push(card("축농증 · 편도 수술", "", fmt2(dsum("s116_4", "dsurg", "d1")), "", [chip("116대Ⅳ", v("s116_4"), "s"), ...base("d1")], "분류표 15·17 · 부비강염 근본수술·편도 절제 = 1종"));
    if (has("s116_2") || has("d3")) cases.push(card("위·십이지장 궤양 수술", "", fmt2(dsum("s116_2", "dsurg", "d3")) + (v("d4") > v("d3") ? "~" : ""), has("d4") ? `위 절제 시 4종 ${fmt2(v("d4"))}` : "", [chip("116대Ⅱ", v("s116_2"), "s"), ...base("d3")], "분류표 34 · 위 관혈 = 3종 · 33 · 위 절제 = 4종"));
    if (has("s116_6") || has("d1")) cases.push(card("치핵(치질) · 치루 수술", "", fmt2(dsum("s116_6", "dsurg", "d1")), "", [chip("116대Ⅵ", v("s116_6"), "s"), ...base("d1")], "분류표 44 · 치핵·치루 근본수술 = 1종"));
    if (has("d2") || has("s116_6")) { const a2 = v("d2"), b2 = dsum("s116_6", "dsurg", "d1"); cases.push(card("요로 · 신장 결석", "", `${fmt2(Math.min(a2, b2))}~${fmt2(Math.max(a2, b2))}`, "", [chip("쇄석술 2종", a2, "t"), chip("요관내시경 116대Ⅵ+질병+1종", b2)], "분류표 87 · 쇄석술 = 2종 (116대·질병수술비는 쇄석술 제외)")); }
    if (has("frac") || has("frac2") || has("cast")) cases.push(card("뼈에 금이 가면", "골절 진단 시", fmt2(dsum("frac", "frac2", "cast")) + "~", has("frac5") ? `5대골절 +${fmt2(v("frac5"))}` : "", [chip("골절진단", v("frac")), chip("골절Ⅱ", v("frac2")), chip("깁스", v("cast")), has("isurg") ? chip("수술 시 상해수술", `${fmt2(v("isurg"))}+1~5종`) : ""], "척추·골반·대퇴골 등 5대골절은 추가 지급"));
    if (has("flu")) cases.push(card("독감 (인플루엔자)", "항바이러스제 처방 · 연1회", fmt2(v("flu")), "", [chip("독감 치료비", v("flu"))], "갱신형"));
    const typeRow = ["d1", "d2", "d3", "d4", "d5"].some(has) ? `<div class="bs-types"><span>질병 종수술비 (수술 1회당)</span>${[1, 2, 3, 4, 5].filter(i => has("d" + i)).map(i => `<em><small>${i}종</small>${fmt2(v("d" + i))}</em>`).join("")}${has("dsurg") ? `<em class="g"><small>+ 질병수술비</small>${fmt2(v("dsurg"))}</em>` : ""}</div>` : "";
    const p1 = `<div class="page a4 bs bsp">${U.top(1)}${U.hero("앞 장 설계서의 가입금액 · 가입 1년 이후 지급액 기준")}
      <div class="bs-kpis">${kpis}</div>
      ${dxBox ? U.sec("01", "진단받으면 바로 받는 돈 (진단비)") + `<div class="bs-dx">${dxBox}</div>` : ""}
      ${cases.length || typeRow ? `${U.sec(dxBox ? "02" : "01", "검진·생활 속에서 자주 받는 수술비")}${typeRow}<div class="bs-cases">${cases.join("")}</div>` : ""}
      ${cases.length || typeRow ? `<p class="bs-note1">※ 같은 수술이라도 <b>진단받은 질병코드</b>와 <b>수술 방법(관혈·비관혈, 내시경·복강경·카테터 등)</b>에 따라 1~5종 분류와 116대 질병 해당 여부가 달라져 실제 받는 보험금이 위 금액과 다를 수 있습니다. 최종 지급은 약관과 보험사 심사에 따릅니다.</p>` : ""}
      ${U.foot}</div>`;

    const H = T.ci_hi || {}, N = T.ci_np || {}, C = T.circ || {};
    const np2 = (x, y) => (x || 0) + (y || 0);
    const surgSum = (H.surg || 0) + (H.np_surg || 0) + (N.np_surg || 0) + v("dsurg") + v("d5");
    const robotSum = v("robot") + (H.np_robot || 0) + (N.np_robot || 0);
    const examSum = H.mri != null ? H.mri + H.pet + H.ct + H.us + H.endo + H.gene + H.biopsy + H.ngs : 0;
    const tierNote = M.tierMissing.length ? `<p class="bs-warn">통합치료비 가입금액(${M.tierMissing.map(k => fmt2(A[k])).join(", ")})의 세부 지급표가 사전에 없어 세부 금액을 비웠습니다.</p>` : "";
    const srow = (no, title, sub, items, total, tsub) => `<div class="bs-row"><div class="bs-rn"><i>${no}</i><b>${title}</b><small>${sub}</small></div><div class="bs-ri">${chips(items)}</div><div class="bs-rt"><b>${total}</b>${tsub ? `<small>${tsub}</small>` : ""}</div></div>`;
    const cancer = has("ci_hi") || has("ci_np") || has("chemo") || has("rad") ? `
      <div class="bs-band c"><b>03</b><div><h3>암 치료비 — 치료할 때마다, 매년</h3><p>수술·항암약물·방사선·중환자실. 통합치료비는 매년 연간 한도가 다시 채워짐</p></div></div>${tierNote}
      <div class="bs-rows">
      ${H.mri != null ? srow("①", "검사", "연1회", [chip("MRI·PET·CT·초음파·내시경·유전자 각", H.mri), chip("조직병리", H.biopsy), chip("NGS 유전자패널", H.ngs)], fmt2(examSum), "매년") : ""}
      ${srow("②", "수술", "할 때마다", [chip("급여 암수술", H.surg, "c"), (H.np_surg || N.np_surg) ? chip("비급여 암수술", [H.np_surg, N.np_surg].filter(Boolean).map(fmt2).join("+"), "c") : "", chip("질병수술비", v("dsurg")), chip("근치수술 5종", v("d5"), "t"), has("robot") ? chip("로봇수술 시", `+${fmt2(robotSum)}`, "o") : ""], fmt2(surgSum), "회당")}
      ${srow("③", "항암치료", "매년 1회씩", [chip("항암약물", H.chemo), chip("항암방사선", H.rad), has("chemo") || has("rad") ? chip("첫 치료 추가", `각 ${fmt2(Math.max(v("chemo"), v("rad")))}`) : "", chip("IMRT", H.imrt), np2(H.np_chemo, N.np_chemo) ? chip("비급여 약물·방사선 각", np2(H.np_chemo, N.np_chemo), "c") : "", np2(H.np_target, N.np_target) ? chip("표적항암", np2(H.np_target, N.np_target), "c") : "", np2(H.np_immune, N.np_immune) ? chip("면역항암", np2(H.np_immune, N.np_immune), "c") : "", np2(H.np_proton, N.np_proton) ? chip("양성자", np2(H.np_proton, N.np_proton), "c") : "", chip("CAR-T", v("cart"), "o")], ciLimit ? "최대 " + fmt2(ciLimit) : "-", ciLimit ? "연간 한도 합" : "")}
      ${H.icu ? srow("④", "입원·회복", "매년", [chip("암 중환자실", H.icu), chip("중환자실 1일당", v("icu_d")), chip("통증완화", H.pain), chip("항암호르몬", H.horm), chip("재활 1일", H.rehab)], fmt2(H.icu) + "+", "매년") : ""}
      ${has("simcancer") && H.simsurg ? srow("⑤", "갑상선암", "유사암", [chip("유사암수술", H.simsurg), chip("116대Ⅳ", v("s116_4"), "s"), chip("질병수술", v("dsurg")), chip("5종", v("d5"), "t"), has("robot_thy") ? chip("로봇 시", "+" + fmt2(v("robot_thy") + np2(H.np_robot_thy, N.np_robot_thy)), "o") : "", has("thy_horm") ? chip("호르몬약 최초", v("thy_horm")) : ""], fmt2(H.simsurg + v("s116_4") + v("dsurg") + v("d5")), "수술 1회") : ""}
      </div>
      <div class="bs-limbar">${has("ci_hi") ? `<div style="flex:${v("ci_hi")}"><b>암통합치료비 연 ${fmt2(v("ci_hi"))}</b><small>검사·급여 수술·약물·방사선·중환자실</small></div>` : ""}${has("ci_np") ? `<div class="n" style="flex:${v("ci_np")}"><b>비급여 암통합치료비 연 ${fmt2(v("ci_np"))}</b><small>비급여 수술·로봇·약물·방사선·표적·면역·양성자</small></div>` : ""}</div>` : "";
    const plus = arr => arr.filter(([, a]) => a).map(([l, a]) => `${l} ${fmt2(a)}`).join(" + ");
    const flow = (cls, steps) => `<div class="bs-flow ${cls}">${steps.filter(Boolean).map(s => `<div><i>${s[0]}</i><b>${s[1]}</b><em>${s[2]}</em><small>${s[3]}</small></div>`).join("")}</div>`;
    const ex = (cls, title, formula, total) => `<div class="bs-ex ${cls}"><div><b>${title}</b><small>${formula}</small></div><em>${total}</em></div>`;
    const opAdd = v("s116_1") + v("dsurg") + v("d3");
    const thrombAll = (C.thromb || 0) + opAdd, surgAll = (C.surg || 0) + opAdd;
    const brainEx = C.lysis_b ? v("brain") + C.lysis_b + C.mri + C.ct + C.pet + C.icu + v("icu_d") * 7 + thrombAll + C.anticoag + C.antiplt : 0;
    const heartEx = C.icu ? v("heart1") + C.mri + C.ct + C.pet + surgAll + C.icu + v("icu_d") * 2 + C.antiplt : 0;
    const brain = has("circ") || has("brain") ? `
      <div class="bs-band b"><b>04</b><div><h3>뇌 치료비 — 뇌경색·뇌출혈</h3><p>${has("circ") ? `신특정순환계질환 통합치료비 연 ${fmt2(v("circ"))} (뇌·심장 합산, 매년 새로 채워짐)` : "뇌혈관질환 진단·수술"}</p></div></div>
      ${flow("b", [has("brain") ? ["진단", "뇌혈관질환", fmt2(v("brain")), "일시금 · 1장 진단비"] : null, C.lysis_b ? ["검사·혈전용해", "혈전용해 + 검사", fmt2(C.lysis_b + C.mri + C.ct + C.pet), "연1회"] : null, C.icu ? ["중환자실", "종합병원", fmt2(C.icu) + "+", `1일당 ${fmt2(v("icu_d"))} 별도`] : null, C.thromb ? ["시술·수술", "혈전제거술", fmt2(thrombAll), plus([["순환계", C.thromb], ["116대Ⅰ", v("s116_1")], ["질병", v("dsurg")], ["3종", v("d3")]])] : null, C.anticoag ? ["약·재활", "항응고·항혈소판", fmt2(C.anticoag + C.antiplt + C.rehab * 20), "매년"] : null])}
      ${brainEx ? ex("b", "예시 · 뇌경색: 혈전용해 → 중환자실 7일 → 혈전제거술 → 약 처방", plus([["진단", v("brain")], ["혈전용해", C.lysis_b], ["검사", C.mri + C.ct + C.pet], ["중환자실", C.icu], ["일당", v("icu_d") * 7], ["혈전제거술", thrombAll], ["약", C.anticoag + C.antiplt]]), fmt2(brainEx)) : ""}` : "";
    const heart = has("circ") || has("heart1") ? `
      <div class="bs-band h"><b>05</b><div><h3>심장 치료비 — 협심증·심근경색</h3><p>가슴 통증 → 진단 → 스텐트를 넣는 경우</p></div></div>
      ${flow("h", [has("heart1") ? ["진단", "심장질환(특정Ⅰ)", fmt2(v("heart1")), has("heart2") ? `심근경색이면 +${fmt2(v("heart2"))}` : "일시금"] : null, C.lysis_h ? ["검사·혈전용해", "혈전용해 + 검사", fmt2(C.lysis_h + C.mri + C.ct + C.pet), "연1회"] : null, C.surg ? ["시술", "스텐트 삽입", fmt2(surgAll), plus([["순환계", C.surg], ["116대Ⅰ", v("s116_1")], ["질병", v("dsurg")], ["3종", v("d3")]])] : null, C.icu ? ["중환자실", "종합병원", fmt2(C.icu) + "+", `1일당 ${fmt2(v("icu_d"))} 별도`] : null, C.antiplt ? ["약·재활", "항혈소판·재활", fmt2(C.antiplt + C.rehab * 20) + "~", "매년"] : null])}
      ${heartEx ? ex("h", "예시 · 협심증: 스텐트 → 중환자실 2일 → 항혈소판제", plus([["진단", v("heart1")], ["검사", C.mri + C.ct + C.pet], ["스텐트", surgAll], ["중환자실", C.icu], ["일당", v("icu_d") * 2], ["항혈소판", C.antiplt]]), fmt2(heartEx)) : ""}` : "";
    const notice0 = `<div class="bs-box w"><div class="bs-boxh"><b>꼭 알아두실 점</b></div><ul>${(M.cancerDx || []).length || has("ci_hi") || has("ci_np") ? "<li>암은 계약일부터 <b>90일 뒤</b>부터 보장 (유사암은 계약일부터)</li>" : ""}${has("ci_np") || has("ci_hi") || has("circ") ? "<li>통합치료비 · 116대질병수술비는 <b>가입 1년 미만 50%</b></li>" : ""}${has("ci_np") || has("ci_hi") || has("circ") ? "<li>진단비·중환자실 일당·종수술비·116대·질병수술비는 통합치료비 한도와 <b>별도</b>로 지급</li>" : ""}${has("circ") || has("d3") ? "<li>스텐트·혈전제거술·코일색전술 같은 카테터 수술은 분류표 88-1(뇌·심장) <b>3종</b></li>" : ""}</ul></div>`;
    const notice = /<li>/.test(notice0) ? notice0 : "";
    // 사전에 없는 담보(간병인·치매 등)도 설계서 이름·가입금액 그대로 보여 줌 — 진단비는 1장 진단비 칸에 이미 있음
    const others = subGroups((M.unknown || []).filter(i => i.amt && genClass(i.name).g && genClass(i.name).g !== "dx" && !(genClass(i.name).g === "base" && i.amt < 1000)));
    const otherBox = others.length ? `<div class="bs-blk">${U.sec("+", "그 밖의 주요 담보 (설계서 가입금액)")}<div class="bs-gl g">${others.map(r => r.parts ? `<div><span>${escH(r.title)} <small>(세부 ${r.parts.length}개)</small></span><b>${r.same ? "각 " + fmt2(r.parts[0].i.amt) : fmt2(Math.min(...r.parts.map(x => x.i.amt))) + "~" + fmt2(Math.max(...r.parts.map(x => x.i.amt)))}</b></div>` : `<div><span>${escH(r.i.name)}</span><b>${fmt2(r.i.amt)}</b></div>`).join("")}</div></div>` : "";
    const common = `<p class="bs-common">금액은 ${escH(D.company)} 상품제안서(${p.no ? "청약번호 " + escH(p.no) + ", " : ""}${p.issued ? escH(p.issued) + " 발급" : ""})의 가입금액과 약관 지급 기준(가입 1년 이후)으로 계산했습니다. 기준 약관: ${escH(D.basis)}. 약관 사전에 없는 담보는 설계서 가입금액 그대로 표시했습니다. 실제 지급 여부와 금액은 진단명·질병코드·수술 분류에 따라 달라지며 약관이 우선합니다.</p>`;
    const blk = h => h ? `<div class="bs-blk">${h}</div>` : "";
    const p2 = `<div class="page a4 bs bsp" data-bsflow="1">${U.top(2)}${blk(cancer)}${blk(brain)}${blk(heart)}${otherBox}${blk(notice)}${blk(common)}${U.foot}</div>`;
    return p1 + p2;
  }


  /* ---------------- 12. 화면 스타일 (보잇·grow 공용) ---------------- */
  const CSS2 = `
.page.orig,.a4.orig{background:#fff;padding:0;align-items:center;justify-content:center}
.page.orig img,.a4.orig img{max-width:100%;max-height:100%;display:block}
.page.bsp,.a4.bsp{padding:28px 34px 0;gap:8px;font-size:11px;line-height:1.45;color:#1f2937;background:#fff;--g:#0f766e;--gs:#e6f4f1;--c:#be123c;--cs:#fdecef;--b:#4338ca;--bsf:#eef0fd;--h:#c2410c;--hs:#fdf0e8;--o:#b45309}
.bsp .pfoot{margin:auto 0 0;flex:none}.bsp .bs-foot{margin-top:auto;margin-bottom:14px}
.bsp h3,.bsp h4{color:inherit}
.bsp .bs-dx{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
.bsp .bs-hero{padding:12px 18px}.bsp .bs-hero h2{font-size:21px;margin:2px 0 6px}.bsp .bs-k{padding:6px 10px}.bsp .bs-k b{font-size:19px}
.bsp .bs-case-p{gap:2px}.bsp .bs-ref{font-size:8.4px}.bsp .bs-sec{font-size:13.5px;margin:2px 0 0}
.bsp .bs-dx>div{border-radius:8px;padding:5px 9px;display:flex;flex-direction:column;gap:1px;border-left:4px solid}
.bsp .bs-dx>div>span{font-size:10px;font-weight:700;color:#374151}.bsp .bs-dx>div>b{font-size:16px;line-height:1.2;white-space:nowrap}.bsp .bs-dx>div>small{font-size:9px;color:#6b7280}
.bsp .bs-dx>.c{background:var(--cs);border-color:var(--c)}.bsp .bs-dx>.c>b{color:var(--c)}
.bsp .bs-dx>.b{background:var(--bsf);border-color:var(--b)}.bsp .bs-dx>.b>b{color:var(--b)}
.bsp .bs-dx>.h{background:var(--hs);border-color:var(--h)}.bsp .bs-dx>.h>b{color:var(--h)}
.bsp .bs-dx>.g{background:var(--gs);border-color:var(--g)}.bsp .bs-dx>.g>b{color:var(--g)}
.bsp .bs-dx>.ic{grid-column:span 2}
.bsp .bs-dx>div>span em{font-style:normal;font-weight:500;font-size:8.6px;color:#6b7280;margin-left:3px;line-height:1.3}
.bsp .bs-ic{display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
.bsp .bs-cases{grid-template-columns:1fr 1fr 1fr;gap:6px}.bsp .bs-case{padding:6px 8px;gap:3px}.bsp .bs-case-h b{font-size:11.5px}.bsp .bs-pill{font-size:13.5px;padding:1px 7px}
/* 사례 카드(약관 미등록 회사) — 크게·한 줄씩 */
.bsp .bs-cases.cx{grid-template-columns:1fr 1fr;gap:9px}.bsp .bs-cases.cx.n1{grid-template-columns:1fr}
.bsp .bs-cases.cx>.bs-case:last-child:nth-child(odd){grid-column:1/-1}
.bsp .bs-cases.cx:not(.two).n3{grid-template-columns:1fr 1fr 1fr}.bsp .bs-cases.cx:not(.two).n3>.bs-case:last-child{grid-column:auto}
.bsp .cx .bs-case{padding:10px 13px;gap:6px;border-radius:12px}
.bsp .cx .bs-case-h b{font-size:15px}.bsp .cx .bs-case-h small{font-size:11px;margin-top:1px}
.bsp .cx .bs-pill{font-size:19px;padding:3px 11px}.bsp .cx .bs-pill small{font-size:9.5px}
.bs-lis{display:flex;flex-direction:column}
.bs-li{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:4px 2px;border-bottom:1px solid #f0f1f3;font-size:12.3px;color:#1f2937}
.bs-li:last-child{border-bottom:0}.bs-li b{white-space:nowrap;font-size:13.5px;color:#111827}
.bs-li.c b{color:var(--c)}.bs-li.t b{color:var(--g)}.bs-li.s b{color:#4338ca}.bs-li.b b{color:var(--b)}.bs-li.o b{color:var(--o)}.bs-li.g b{color:var(--g)}
.bsp .cx .bs-txw>i{font-size:11.5px}.bsp .cx .bs-txr>b{font-size:11.5px}.bsp .cx .bs-txr>small,.bsp .cx .bs-txr>span{font-size:10.5px}
.bsp .cx .bs-txw .bs-chip{font-size:11.3px;padding:2px 8px}.bsp .cx .bs-txw .bs-chip b{font-size:12px}.bsp .cx .bs-chip small{font-size:9.5px}
.bsp .cx .bs-ref{font-size:10px}
.bsp .bs-core-t b{font-size:24px}.bsp .bs-core-t span{font-size:12px}.bsp .bs-core-t small{font-size:10.5px}.bsp .bs-core-h b{font-size:16px}
.bsp .bs-row{grid-template-columns:78px 1fr 84px;padding:4px 0}
.bsp .bs-flow em{font-size:15px}.bsp .bs-ex em{font-size:21px}.bsp .bs-ex{padding:6px 10px}
.bsp .bs-gl{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.bsp .bs-gl>div{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #eef0f2;padding:4px 2px;font-size:10.8px}
.bsp .bs-gl>div>span{color:#374151}.bsp .bs-gl>div>b{white-space:nowrap;font-size:12px}
.bsp .bs-gl.c>div>b{color:var(--c)}.bsp .bs-gl.h>div>b,.bsp .bs-gl.h .bs-subh b{color:var(--h)}.bsp .bs-gl.c .bs-subh b{color:var(--c)}.bsp .bs-gl.g .bs-subh b{color:var(--g)}.bsp .bs-gl.b .bs-subh b{color:var(--b)}
.bsp .bs-gl>div.bs-sub{grid-column:1/-1;display:flex;flex-direction:column;gap:3px;padding:5px 2px}
.bs-subh{display:flex;justify-content:space-between;gap:8px}.bs-subh span{font-weight:600;color:#374151}.bs-subh b{white-space:nowrap;font-size:12px}
.bs-subp{display:flex;flex-wrap:wrap;gap:3px}.bs-subp em{font-style:normal;font-size:9.6px;background:#f3f4f6;border-radius:5px;padding:1px 6px;color:#374151}.bs-subp em b{font-size:10px}
.bs-blk{display:flex;flex-direction:column;gap:8px}
.bsp .bs-cases.two{grid-template-columns:1fr 1fr}.bsp .bs-cases>div{min-width:0}.bsp .bs-case .bs-chip{white-space:normal}.bsp .bs-case .bs-chip b{white-space:nowrap}.bs-txw{display:flex;flex-direction:column;gap:3px;border-top:1px dashed #e5e7eb;padding-top:4px}.bs-txw>i{font-style:normal;font-size:9.8px;font-weight:700;color:var(--o)}.bs-txr{display:flex;flex-direction:column;gap:2px}.bs-txr>b{font-size:10px;color:#374151}.bs-txr>span,.bs-txr>small{font-size:9px;color:#6b7280}.bs-chip small{font-size:8.6px;color:#6b7280}.bs-case.c{border-left:3px solid var(--c)}.bs-case.h{border-left:3px solid var(--h)}.bs-case.b{border-left:3px solid var(--b)}.bs-case.g{border-left:3px solid var(--g)}
.bs-case.c .bs-pill{background:var(--c)}.bs-case.h .bs-pill{background:var(--h)}.bs-case.b .bs-pill{background:var(--b)}
.bs-core{border-radius:10px;background:var(--gs);padding:9px 12px;display:flex;flex-direction:column;gap:6px}.bs-core-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}.bs-core-h b{font-size:14px;color:var(--g)}.bs-core-h span{font-size:9.5px;color:#6b7280}
.bs-core-t{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.bs-core-t>div{background:#fff;border-radius:8px;padding:6px 9px;display:flex;flex-direction:column}.bs-core-t>div.on{outline:2px solid var(--g)}.bs-core-t span{font-size:10.5px;font-weight:600}.bs-core-t b{font-size:20px;color:var(--g);line-height:1.2}.bs-core-t small{font-size:9px;color:#6b7280}.bs-k.kg{background:var(--gs);border-color:var(--g)}.bs-k.kg b{color:var(--g)}.bsp .bs-gl.g>div>b{color:var(--g)}.bsp .bs-gl.b>div>b{color:var(--b)}
`;
  function ensureCss() {
    if (typeof document === "undefined") return;
    if (!document.getElementById("bs-style")) { const st = document.createElement("style"); st.id = "bs-style"; st.textContent = CSS + CSS2; document.head.appendChild(st); }
  }

  /* ---------------- 13. 보잇 화면 (index.html 의 보상제안서 메뉴: bsg-*) ---------------- */
  const S = { docs: [] };
  const $ = q => document.querySelector(q);
  function meInfo() { try { const m = G.BOIT_ME ? G.BOIT_ME() : {}; return { name: m.name || "", title: "", org: [m.company, m.branch].filter(Boolean).join(" ") }; } catch (e) { return {}; } }
  function draw() {
    const box = $("#sheets-bosang"), list = $("#bsg-list"); if (!box || !list) return;
    const me = meInfo();
    box.innerHTML = S.docs.map(d => origPages(d.imgs) + render2(d.M, { agent: me, insured: d.M.p.insured })).join("");
    reflow(box);
    list.innerHTML = S.docs.map((d, i) => `<div class="bsrow"><span><b>${escH(d.M.p.insured || "고객")}</b> · ${escH(d.M.p.company)} ${escH(d.M.p.product || d.file)}</span><span>${d.M.D ? `약관 계산 ${d.M.used.length}개${d.M.unknown.length ? ` · <span style="color:var(--warn,#b45309)">사전에 없는 담보 ${d.M.unknown.length}개</span>` : ""}` : `<span style="color:var(--warn,#b45309)">약관 등록 전 · 가입금액 기준</span>`}${d.source === "ai" ? " · AI 읽기(원본 대조 필요)" : ""} <button class="btn" type="button" data-bsdel="${i}">빼기</button></span></div>`).join("") || `<p class="note" style="margin:0">보험사 설계서(가입제안서) PDF를 올리면 원본 담보표 + 보상제안서 2장이 만들어집니다.</p>`;
    const un = S.docs.flatMap(d => (d.warns || []).concat(d.M.D ? d.M.unknown.map(u => "약관 사전에 없어 설계서 가입금액 그대로 표시: " + u.name) : []));
    const ub = $("#bsg-unknown"); if (ub) ub.innerHTML = un.length ? `<details open><summary>확인할 내용 ${un.length}개 (설계사용)</summary><p class="note">${un.map(escH).join("<br>")}</p></details>` : "";
    const pb = $("#bsg-pdf"); if (pb) pb.disabled = !S.docs.length;
  }
  async function addFiles(files) {
    const msg = $("#bsg-msg");
    if (!G.pdfjsLib) { msg.textContent = "PDF 도구를 불러오지 못했습니다. 새로고침 후 다시 시도하세요."; return; }
    for (const f of files) {
      msg.textContent = `${f.name} 읽는 중… (양식이 등록되지 않은 회사는 AI가 읽어 10~20초 걸립니다)`;
      try {
        const r = await readProposal(f, G.pdfjsLib);
        S.docs.push({ file: f.name, M: build2(r.p), imgs: r.imgs, source: r.source, warns: r.warns });
        msg.textContent = `${f.name}: 담보 ${r.p.items.filter(i => !i.group).length}개를 읽었습니다.`;
      } catch (e) { msg.textContent = `${f.name}: ${e && e.msg ? e.msg : "PDF를 읽지 못했습니다" + (e && /password/i.test(e.name || e.message || "") ? " (암호가 걸린 PDF)" : "") + "."}`; }
    }
    draw();
  }
  async function savePdf() {
    const msg = $("#bsg-msg"), b = $("#bsg-pdf");
    if (!G.html2canvas || !G.jspdf) { msg.textContent = "PDF 도구를 불러오지 못했습니다."; return; }
    let dl = null; try { dl = typeof DL !== "undefined" ? DL : null; } catch (e) { }
    if (!dl) { msg.textContent = "이 화면에서는 파일 저장을 지원하지 않습니다."; return; }
    b.disabled = true;
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const pages = [...$("#sheets-bosang").querySelectorAll(".a4")], pdf = new G.jspdf.jsPDF({ unit: "mm", format: "a4" });
      for (let i = 0; i < pages.length; i++) {
        msg.textContent = `PDF를 만드는 중… ${i + 1}/${pages.length}장`;
        const cv = await G.html2canvas(pages[i], { scale: 2, backgroundColor: "#ffffff" });
        if (i) pdf.addPage(); pdf.addImage(cv.toDataURL("image/jpeg", .92), "JPEG", 0, 0, 210, 297);
      }
      const nm = (S.docs[0] && S.docs[0].M.p.insured) || "고객";
      const d = new Date(), ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
      await dl.save({ filename: `보험금예상안내서_${nm}_${ymd}.pdf`, data: pdf.output("blob") });
      msg.textContent = "저장했습니다.";
    } catch (e) { msg.textContent = e && e.code === "declined" ? "저장을 취소했습니다." : "PDF 저장에 실패했습니다. 다시 시도해 주세요."; }
    finally { b.disabled = !S.docs.length; }
  }
  function init() {
    ensureCss();
    const inp = $("#bsg-file"); if (!inp) return;
    inp.addEventListener("change", e => { const fs = [...e.target.files]; e.target.value = ""; addFiles(fs); });
    $("#bsg-pdf").addEventListener("click", savePdf);
    document.addEventListener("click", e => { const d = e.target.closest("[data-bsdel]"); if (d) { S.docs.splice(+d.dataset.bsdel, 1); draw(); } });
    draw();
  }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init(); }

  G.BOSANG = { reflow, subGroups, pdfLines, parseKB, build, build2, readProposal, render2, origPages, ensureCss, companyOf, manAny, genClass, GROUPS, man, fmt, DICTS, KB_DICT, IC_NAME, AI_URL };
})(typeof window !== "undefined" ? window : globalThis);
