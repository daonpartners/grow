/* 보잇 · 보상제안서 (grow.ai.kr 리포트 생성기 '제안서' 탭과 공용 — 원본: daonpartners/boit bosang.js. 사전·계산을 고치면 양쪽 모두 반영)
    (상품제안서 PDF → 회사 약관 기준 '아프면 실제로 얼마를 받는가' 안내서)
   - 상품제안서 PDF는 브라우저에서 글자만 읽음 (서버로 보내지 않음, 저장하지 않음)
   - 금액은 제안서의 가입금액 × 상품 보장 사전(약관에서 뽑은 지급 규칙)으로만 계산. 사전에 없는 담보는 '약관 확인 필요'로 표시
   - 상품 보장 사전: KB손해보험 건강보험 공통 (기준 약관: KB 5.10.10 플러스 건강보험(세만기)(무배당)(26.09), 2026-10-01 적용)
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
    company: "KB손해보험",
    basis: "KB 5.10.10 플러스 건강보험(세만기)(무배당)(26.09) 약관 (2026-10-01 적용)",
    match: p => /KB/.test(p.product || "") || p.company === "KB손해보험",
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
  function build(p) {
    const D = DICTS.find(d => d.match(p));
    const A = {}, unknown = [], used = [];
    if (D) for (const it of p.items) {
      if (it.group || it.amt == null) continue;
      const nm = it.name.replace(/\s+/g, "");
      const r = D.rules.find(([, re]) => re.test(nm));
      if (r) { if (r[0] !== "base") { A[r[0]] = (A[r[0]] || 0) + it.amt; used.push(it.name); } }
      else unknown.push(it);
    }
    const tierOf = k => { if (!D || !A[k]) return null; const t = D.tier[k] || {}; return t[A[k]] || null; };
    return { p, D, A, unknown, used, T: { ci_hi: tierOf("ci_hi"), ci_np: tierOf("ci_np"), circ: tierOf("circ") }, tierMissing: ["ci_hi", "ci_np", "circ"].filter(k => A[k] && !tierOf(k)) };
  }

  /* ---------------- 6. 안내서 그리기 ---------------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function render(M, agent, me) {
    me = me || {};
    const { p, A, T, D } = M; if (!D) return `<div class="a4 bs"><h3>이 회사 상품은 아직 상품 보장 사전이 없습니다</h3><p>약관을 등록하면 자동 계산됩니다. (현재 등록: KB손해보험)</p></div>`;
    const has = k => A[k] > 0, v = k => A[k] || 0;
    const sum = a => a.reduce((x, y) => x + (y || 0), 0);
    const dsum = (...ks) => sum(ks.map(v));
    const NP = 3;
    const pageTop = n => `<div class="bs-top"><span>${esc(p.insured)} 고객님 보험금예상안내서</span><span>${n}/${NP}</span></div>`;
    const foot = `<div class="bs-foot"><span>${agent}</span><span>기준 약관: ${esc(D.basis)}</span></div>`;
    const chip = (label, amt, cls = "") => amt ? `<span class="bs-chip ${cls}">${label} <b>${typeof amt === "number" ? fmt(amt) : amt}</b></span>` : "";
    const chips = arr => arr.filter(Boolean).join("");

    /* ===== 1장: 요약 + 생활 속 사례 ===== */
    const card = (title, sub, total, totSub, parts, ref) => `<div class="bs-case"><div class="bs-case-h"><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</div><div class="bs-pill">${total}${totSub ? `<small>${totSub}</small>` : ""}</div></div><div class="bs-case-p">${chips(parts)}</div>${ref ? `<div class="bs-ref">${ref}</div>` : ""}</div>`;
    const cases = [];
    const tp = k => ({ d1: "1종", d2: "2종", d3: "3종", d4: "4종", d5: "5종" }[k]);
    const base = k => [chip("질병수술비", v("dsurg")), chip(tp(k) + " 수술", v(k), "t")];
    if (has("dsurg") || has("d1")) { const t = dsum("dsurg", "d1"); cases.push(card("대장용종 제거", "건강검진 내시경 중", fmt(t), has("ben1") ? `첫 회 ${fmt(t + v("ben1"))}` : "", [...base("d1"), has("ben1") ? chip("첫 회 특정양성종양Ⅰ", v("ben1"), "o") : ""], "분류표 88-2 · 대장용종 내시경 절제 = 1종")); }
    if (has("d2")) { const t = dsum("dsurg", "d2"); cases.push(card("위·십이지장 용종 제거", "", fmt(t), has("ben2") ? `첫 회 ${fmt(t + v("ben2"))}` : "", [...base("d2"), has("ben2") ? chip("첫 회 특정양성종양Ⅱ", v("ben2"), "o") : ""], "분류표 88-2 · 복부장기 내시경 = 2종")); }
    if (has("d3") || has("s116_3")) {
      const t = dsum("s116_3", "dsurg", "d3"); cases.push(card("갑상선 결절(양성) 수술", "", fmt(t), has("ben1") ? `첫 회 ${fmt(t + v("ben1"))}` : "", [chip("116대Ⅲ", v("s116_3"), "s"), ...base("d3"), has("ben1") ? chip("첫 회 특정양성종양Ⅰ", v("ben1"), "o") : ""], "분류표 57 · 갑상선 관혈수술 = 3종"));
      const t2 = dsum("s116_3", "dsurg", "d2"); cases.push(card("허리·목 디스크 수술", "", t2 !== t ? `${fmt(Math.min(t, t2))}~${fmt(Math.max(t, t2))}` : fmt(t), "", [chip("116대Ⅲ", v("s116_3"), "s"), ...base("d3")], "분류표 9 · 추간판 관혈 = 3종 (내시경·경피적은 2종)"));
    }
    if (has("s116_4") || has("d3")) cases.push(card("담석 · 담낭 수술", "복강경 포함", fmt(dsum("s116_4", "dsurg", "d3")), "", [chip("116대Ⅳ", v("s116_4"), "s"), ...base("d3")], "분류표 36 · 담낭·담도 관혈 = 3종"));
    if (has("s116_4") || has("d1")) cases.push(card("축농증 · 편도 수술", "", fmt(dsum("s116_4", "dsurg", "d1")), "", [chip("116대Ⅳ", v("s116_4"), "s"), ...base("d1")], "분류표 15·17 · 부비강염 근본수술·편도 절제 = 1종"));
    if (has("s116_2") || has("d3")) cases.push(card("위·십이지장 궤양 수술", "", fmt(dsum("s116_2", "dsurg", "d3")) + (v("d4") > v("d3") ? "~" : ""), has("d4") ? `위 절제 시 4종 ${fmt(v("d4"))}` : "", [chip("116대Ⅱ", v("s116_2"), "s"), ...base("d3")], "분류표 34 · 위 관혈 = 3종 · 33 · 위 절제 = 4종"));
    if (has("s116_6") || has("d1")) cases.push(card("치핵(치질) · 치루 수술", "", fmt(dsum("s116_6", "dsurg", "d1")), "", [chip("116대Ⅵ", v("s116_6"), "s"), ...base("d1")], "분류표 44 · 치핵·치루 근본수술 = 1종"));
    if (has("d2") || has("s116_6")) { const a = v("d2"), b = dsum("s116_6", "dsurg", "d1"); cases.push(card("요로 · 신장 결석", "", `${fmt(Math.min(a, b))}~${fmt(Math.max(a, b))}`, "", [chip("쇄석술 2종", a, "t"), chip("요관내시경 116대Ⅵ+질병+1종", b)], "분류표 87 · 쇄석술 = 2종 (116대·질병수술비는 쇄석술 제외)")); }
    if (has("flu")) cases.push(card("독감 (인플루엔자)", "항바이러스제 처방 · 연1회", fmt(v("flu")), "", [chip("독감 치료비", v("flu"))], "갱신형"));
    if (has("frac") || has("frac2") || has("cast")) cases.push(card("뼈에 금이 가면", "골절 진단 시", fmt(dsum("frac", "frac2", "cast")) + "~", has("frac5") ? `5대골절 +${fmt(v("frac5"))}` : "", [chip("골절진단", v("frac")), chip("골절Ⅱ", v("frac2")), chip("깁스", v("cast")), has("isurg") ? chip("수술 시 상해수술", `${fmt(v("isurg"))}+1~5종`) : ""], "척추·골반·대퇴골 등 5대골절은 추가 지급"));

    const icParts = Object.keys(IC_NAME).filter(has);
    const icFirst = has("ic_digest") ? "ic_digest" : icParts[0];
    const ciLimit = v("ci_hi") + v("ci_np");
    const kpi = (cls, t, big, sub) => `<div class="bs-k ${cls}"><span>${t}</span><b>${big}</b><small>${sub}</small></div>`;
    const kpis = [
      has("cancer") ? kpi("kc", "암 진단 즉시", fmt(v("cancer") + (icFirst ? v(icFirst) : 0)), `암진단 ${fmt(v("cancer"))}${icFirst ? " + 부위별 " + fmt(v(icFirst)) : ""}`) : "",
      ciLimit ? kpi("kc", "암 치료비 · 매년", fmt(ciLimit), "통합치료비 연간 한도 합") : "",
      has("brain") || has("heart1") ? kpi("kb", "뇌·심장 진단 즉시", fmt(Math.max(v("brain"), v("heart1"))), `뇌혈관 ${fmt(v("brain"))} · 심장 ${fmt(v("heart1"))}`) : "",
      has("circ") ? kpi("kh", "뇌·심장 치료비 · 매년", fmt(v("circ")), "순환계 통합치료 연 한도") : "",
    ].join("");
    const typeRow = ["d1", "d2", "d3", "d4", "d5"].some(has) ? `<div class="bs-types"><span>질병 종수술비 (수술 1회당)</span>${[1, 2, 3, 4, 5].filter(i => has("d" + i)).map(i => `<em><small>${i}종</small>${fmt(v("d" + i))}</em>`).join("")}${has("dsurg") ? `<em class="g"><small>+ 질병수술비</small>${fmt(v("dsurg"))}</em>` : ""}</div>` : "";
    const p1 = `<div class="a4 bs">
      <div class="bs-hero"><div class="bs-kk">INSURANCE BENEFIT GUIDE</div><h2>${esc(p.insured)} 고객님 보험금예상안내서</h2>
        <dl><dt>상품</dt><dd>${esc(D.company)} <b>${esc(p.product)}</b></dd><dt>담당설계사</dt><dd><b>${esc(me.name || "")}</b>${me.org ? ` <span>소속</span> ${esc(me.org)}` : ""}</dd></dl>
        <p>${p.age ? `피보험자 ${esc(p.sex)} ${p.age}세 · ` : ""}가입 1년 이후 지급액 기준</p></div>
      <div class="bs-kpis">${kpis}</div>
      <h4 class="bs-sec g"><span>01</span>검진·생활 속에서 자주 받는 보험금</h4>
      ${typeRow}
      <div class="bs-cases">${cases.join("") || "<p>수술·진단 담보가 없습니다.</p>"}</div>
      <p class="bs-note1">※ 같은 수술이라도 <b>진단받은 질병코드</b>와 <b>수술 방법(관혈·비관혈, 내시경·복강경·카테터 등)</b>에 따라 1~5종 분류와 116대 질병 해당 여부가 달라져 실제 받는 보험금이 위 금액과 다를 수 있습니다. 최종 지급은 약관과 보험사 심사에 따릅니다.</p>
      ${foot}</div>`;

    /* ===== 2장: 암 + 갑상선암 ===== */
    const H = T.ci_hi || {}, N = T.ci_np || {};
    const surgSum = (H.surg || 0) + (H.np_surg || 0) + (N.np_surg || 0) + v("dsurg") + v("d5");
    const robotSum = v("robot") + (H.np_robot || 0) + (N.np_robot || 0);
    const examSum = H.mri != null ? H.mri + H.pet + H.ct + H.us + H.endo + H.gene + H.biopsy + H.ngs : 0;
    const tierNote = M.tierMissing.length ? `<p class="bs-warn">통합치료비 가입금액(${M.tierMissing.map(k => fmt(A[k])).join(", ")})의 세부 지급표가 사전에 없어 세부 금액을 비웠습니다.</p>` : "";
    const srow = (no, title, sub, items, total, tsub, cls = "") => `<div class="bs-row ${cls}"><div class="bs-rn"><i>${no}</i><b>${title}</b><small>${sub}</small></div><div class="bs-ri">${chips(items)}</div><div class="bs-rt"><b>${total}</b>${tsub ? `<small>${tsub}</small>` : ""}</div></div>`;
    const np2 = (a, b) => (a || 0) + (b || 0);
    const p2body = has("cancer") || has("ci_hi") ? `
      <div class="bs-band c"><b>02</b><div><h3>암 — 진단부터 매년 치료까지</h3><p>예: 위암·대장암(소화기관암). 치료비는 매년 다시 지급(연간 1회 항목)</p></div></div>${tierNote}
      <div class="bs-big3">
        <div><span>진단 즉시</span><b>${fmt(v("cancer") + (icFirst ? v(icFirst) : 0))}</b><small>일시금 + 이후 보험료 면제</small></div>
        <div><span>수술 1회</span><b>${fmt(surgSum)}</b><small>${robotSum ? `로봇수술이면 +${fmt(robotSum)}` : "수술할 때마다"}</small></div>
        <div><span>항암치료 · 매년</span><b>최대 ${fmt(ciLimit)}</b><small>통합치료비 연간 한도</small></div>
      </div>
      <div class="bs-rows">
      ${srow("①", "진단", "암 확정", [chip("암진단비", v("cancer"), "c"), icFirst ? chip(`통합암 · ${IC_NAME[icFirst]}`, v(icFirst), "c") : "", icFirst ? chip("전이 시 부위마다", "+" + fmt(v(icFirst))) : "", chip("보험료", "납입면제", "g")], fmt(v("cancer") + (icFirst ? v(icFirst) : 0)), "일시금")}
      ${H.mri != null ? srow("②", "검사", "연1회", [chip("MRI·PET·CT·초음파·내시경·유전자 각", H.mri), chip("조직병리", H.biopsy), chip("NGS 유전자패널", H.ngs)], fmt(examSum), "매년") : ""}
      ${srow("③", "수술", "할 때마다", [chip("급여 암수술", H.surg, "c"), (H.np_surg || N.np_surg) ? chip("비급여 암수술", [H.np_surg, N.np_surg].filter(Boolean).map(fmt).join("+"), "c") : "", chip("질병수술비", v("dsurg")), chip("근치수술 5종", v("d5"), "t"), has("robot") ? chip("로봇수술 시", `+${fmt(robotSum)}`, "o") : ""], fmt(surgSum), "회당")}
      ${srow("④", "항암치료", "매년 1회씩", [chip("항암약물", H.chemo), chip("항암방사선", H.rad), has("chemo") || has("rad") ? chip("첫 치료 추가", `각 ${fmt(Math.max(v("chemo"), v("rad")))}`) : "", chip("IMRT", H.imrt), np2(H.np_chemo, N.np_chemo) ? chip("비급여 약물·방사선 각", np2(H.np_chemo, N.np_chemo), "c") : "", np2(H.np_target, N.np_target) ? chip("표적항암", np2(H.np_target, N.np_target), "c") : "", np2(H.np_immune, N.np_immune) ? chip("면역항암", np2(H.np_immune, N.np_immune), "c") : "", np2(H.np_proton, N.np_proton) ? chip("양성자", np2(H.np_proton, N.np_proton), "c") : "", chip("CAR-T", v("cart"), "o")], "최대 " + fmt(ciLimit), "연간 한도 합")}
      ${H.icu ? srow("⑤", "입원·회복", "매년", [chip("암 중환자실", H.icu), chip("중환자실 1일당", v("icu_d")), chip("통증완화", H.pain), chip("항암호르몬", H.horm), chip("재활 1일", H.rehab)], fmt(H.icu) + "+", "매년") : ""}
      </div>
      <div class="bs-limbar">${has("ci_hi") ? `<div style="flex:${v("ci_hi")}"><b>암통합치료비 연 ${fmt(v("ci_hi"))}</b><small>검사·급여 수술·약물·방사선·중환자실 + 비급여 앞 금액</small></div>` : ""}${has("ci_np") ? `<div class="n" style="flex:${v("ci_np")}"><b>비급여 암통합치료비 연 ${fmt(v("ci_np"))}</b><small>비급여 수술·로봇·약물·방사선·표적·면역·양성자 뒤 금액</small></div>` : ""}</div>
      <p class="bs-small">한도와 별도: 암진단비 · 항암약물/방사선 첫 회 · 로봇암수술비 · CAR-T · 질병수술비 · 종수술비 · 질병중환자실 일당</p>` : `<p>암 관련 담보가 없습니다.</p>`;
    const thyRows = [
      ["유사암 진단비", fmt(v("simcancer"))],
      H.simsurg ? [`수술 (유사암수술 ${fmt(H.simsurg)} + 116대Ⅳ ${fmt(v("s116_4"))} + 질병수술 ${fmt(v("dsurg"))} + 5종 ${fmt(v("d5"))})`, fmt(H.simsurg + v("s116_4") + v("dsurg") + v("d5"))] : null,
      np2(H.np_surg_thy, N.np_surg_thy) ? ["비급여 수술 시", "+" + fmt(np2(H.np_surg_thy, N.np_surg_thy))] : null,
      has("robot_thy") ? ["로봇수술 시", "+" + fmt(v("robot_thy") + np2(H.np_robot_thy, N.np_robot_thy))] : null,
      has("thy_horm") ? [`호르몬약 (최초${H.simhorm ? " + 매년 " + fmt(H.simhorm) : ""})`, fmt(v("thy_horm") + (H.simhorm || 0))] : null,
    ].filter(Boolean);
    const thy = has("simcancer") ? `<div class="bs-box c"><div class="bs-boxh"><b>갑상선암 (유사암)이면</b><em>${fmt(v("simcancer") + (H.simsurg ? H.simsurg + v("s116_4") + v("dsurg") + v("d5") : 0))}~</em></div>${thyRows.map(r => `<div class="bs-kv"><span>${r[0]}</span><b>${r[1]}</b></div>`).join("")}</div>` : "";
    const notice = `<div class="bs-box w"><div class="bs-boxh"><b>꼭 알아두실 점</b></div><ul><li>암은 계약일부터 <b>90일 뒤</b>부터 보장 (유사암은 계약일부터)</li>${has("ci_np") || has("ci_hi") ? "<li>통합치료비 · 116대질병수술비는 <b>가입 1년 미만 50%</b></li>" : ""}<li>유사암(갑상선암 등)은 보험료 납입면제 대상 아님</li></ul></div>`;
    const p2 = `<div class="a4 bs big">${pageTop(2)}${p2body}<div class="bs-2col">${thy}${notice}</div>${foot}</div>`;

    /* ===== 3장: 뇌경색 + 협심증 ===== */
    const C = T.circ || {};
    const flow = (cls, steps) => `<div class="bs-flow ${cls}">${steps.filter(Boolean).map(s => `<div><i>${s[0]}</i><b>${s[1]}</b><em>${s[2]}</em><small>${s[3]}</small></div>`).join("")}</div>`;
    const ex = (cls, title, formula, total) => `<div class="bs-ex ${cls}"><div><b>${title}</b><small>${formula}</small></div><em>${total}</em></div>`;
    const opAdd = v("s116_1") + v("dsurg") + v("d3");   // 116대Ⅰ + 질병수술비 + 3종 (카테터·경피적 뇌·심장 수술, 분류표 88-1)
    const thrombAll = (C.thromb || 0) + opAdd, surgAll = (C.surg || 0) + opAdd;
    const brainEx = C.lysis_b ? v("brain") + C.lysis_b + C.mri + C.ct + C.pet + C.icu + v("icu_d") * 7 + thrombAll + C.anticoag + C.antiplt : 0;
    const coilEx = C.surg ? v("brain") + C.mri + C.ct + C.pet + surgAll : 0;
    const heartEx = C.icu ? v("heart1") + C.mri + C.ct + C.pet + surgAll + C.icu + v("icu_d") * 2 + C.antiplt : 0;
    const brainSec = has("brain") || has("circ") ? `
      <div class="bs-band b"><b>03</b><div><h3>뇌경색 — 진단부터 재활까지</h3><p>뇌경색·뇌출혈 등 뇌혈관질환으로 치료받는 경우</p></div></div>
      ${flow("b", [["진단", "뇌혈관질환", fmt(v("brain")), "일시금 · 이후 보험료 면제"], C.lysis_b ? ["검사·혈전용해", "혈전용해 + 검사", fmt(C.lysis_b + C.mri + C.ct + C.pet), "순환계 치료비 · 연1회"] : null, C.icu ? ["중환자실", "종합병원 중환자실", fmt(C.icu) + "+", `1일당 ${fmt(v("icu_d"))} 별도`] : null, C.thromb ? ["시술·수술", "혈전제거술", fmt(thrombAll), `순환계 ${fmt(C.thromb)} + 116대Ⅰ ${fmt(v("s116_1"))} + 질병 ${fmt(v("dsurg"))} + 3종 ${fmt(v("d3"))}`] : null, C.anticoag ? ["약·재활", "항응고·항혈소판", fmt(C.anticoag + C.antiplt + C.rehab * 20), "매년"] : null])}
      ${brainEx ? ex("b", "예시 ① · 혈전용해 → 중환자실 7일 → 혈전제거술 → 약 처방", `진단 ${fmt(v("brain"))} + 혈전용해 ${fmt(C.lysis_b)} + 검사 ${fmt(C.mri + C.ct + C.pet)} + 중환자실 ${fmt(C.icu)} + 일당 ${fmt(v("icu_d") * 7)} + 혈전제거술 ${fmt(thrombAll)}(순환계 ${fmt(C.thromb)}·116대Ⅰ ${fmt(v("s116_1"))}·질병 ${fmt(v("dsurg"))}·3종 ${fmt(v("d3"))}) + 약 ${fmt(C.anticoag + C.antiplt)}`, fmt(brainEx)) : ""}
      ${coilEx ? ex("b", "예시 ② · 대뇌동맥류 → 코일색전술 (카테터)", `진단 ${fmt(v("brain"))}(뇌혈관질환 I67) + 검사 ${fmt(C.mri + C.ct + C.pet)} + 코일색전술 ${fmt(surgAll)}(순환계 수술 ${fmt(C.surg)}·116대Ⅰ ${fmt(v("s116_1"))}·질병 ${fmt(v("dsurg"))}·3종 ${fmt(v("d3"))}) · 터진 동맥류(거미막하출혈)도 같은 담보`, fmt(coilEx)) : ""}` : "";
    const heartSec = has("heart1") || has("circ") ? `
      <div class="bs-band h"><b>04</b><div><h3>협심증 — 진단부터 재활까지</h3><p>가슴 통증 → 협심증 진단 → 스텐트를 넣는 경우</p></div></div>
      ${flow("h", [["진단", "심장질환(특정Ⅰ)", fmt(v("heart1")), has("heart2") ? `심근경색이면 +${fmt(v("heart2"))}` : "일시금"], C.lysis_h ? ["검사·혈전용해", "혈전용해 + 검사", fmt(C.lysis_h + C.mri + C.ct + C.pet), "순환계 치료비 · 연1회"] : null, C.surg ? ["시술", "스텐트 삽입", fmt(surgAll), `순환계 ${fmt(C.surg)} + 116대Ⅰ ${fmt(v("s116_1"))} + 질병 ${fmt(v("dsurg"))} + 3종 ${fmt(v("d3"))}`] : null, C.icu ? ["중환자실", "종합병원 중환자실", fmt(C.icu) + "+", `1일당 ${fmt(v("icu_d"))} 별도`] : null, C.antiplt ? ["약·재활", "항혈소판 · 재활", fmt(C.antiplt + C.rehab * 20) + "~", "매년"] : null])}
      ${heartEx ? ex("h", "예시 · 협심증 진단 → 스텐트 → 중환자실 2일 → 항혈소판제", `진단 ${fmt(v("heart1"))} + 검사 ${fmt(C.mri + C.ct + C.pet)} + 스텐트 ${fmt(surgAll)}(순환계 ${fmt(C.surg)}·116대Ⅰ ${fmt(v("s116_1"))}·질병 ${fmt(v("dsurg"))}·3종 ${fmt(v("d3"))}) + 중환자실 ${fmt(C.icu)} + 일당 ${fmt(v("icu_d") * 2)} + 항혈소판 ${fmt(C.antiplt)} · 혈전용해까지 하면 +${fmt(C.lysis_h)}`, fmt(heartEx)) : ""}` : "";
    const heartDx = `<div class="bs-box h"><div class="bs-boxh"><b>심장 진단비 한눈에</b><em>최대 ${fmt(v("heart1") + v("heart2") + v("arrhy"))}</em></div>${has("heart1") ? `<div class="bs-kv"><span>협심증·심방세동·심부전 등 (특정Ⅰ)</span><b>${fmt(v("heart1"))}</b></div>` : ""}${has("heart2") ? `<div class="bs-kv"><span>급성심근경색·심정지 소생 (특정Ⅱ)</span><b>${fmt(v("heart2"))}</b></div>` : ""}${has("arrhy") ? `<div class="bs-kv"><span>부정맥 (I49)</span><b>${fmt(v("arrhy"))}</b></div>` : ""}<small>각각 별도 · 각 최초 1회</small></div>`;
    const circLim = has("circ") ? `<div class="bs-box b"><div class="bs-boxh"><b>뇌·심장 치료비 연간 한도</b><em>연 ${fmt(v("circ"))}</em></div><p>신특정순환계질환 통합치료비 — 검사·혈전용해·수술·중환자실·약물·재활. 뇌와 심장 합산 한도이며 매년 새로 채워집니다. 진단비·중환자실 일당·종수술비·116대·질병수술비는 한도와 별도.</p></div>` : "";
    const common = `<p class="bs-common">금액은 ${esc(D.company)} 상품제안서(${p.no ? "청약번호 " + esc(p.no) + ", " : ""}${p.issued ? esc(p.issued) + " 발급" : ""})의 가입금액과 약관 지급 기준(가입 1년 이후)으로 계산했습니다. 종수술비는 약관 【별표55-1】 1~5종수술Ⅲ 분류표 기준이며, 스텐트·혈전제거술·코일색전술 같은 카테터 수술은 분류표 88-1(뇌·심장) 3종입니다. 실제 지급 여부와 금액은 진단명·질병코드·수술 분류에 따라 달라지며 약관이 우선합니다. 가입 전 상품설명서와 약관을 반드시 확인하시기 바랍니다.</p>`;
    const p3 = `<div class="a4 bs big">${pageTop(3)}${brainSec}${heartSec}<div class="bs-2col">${heartDx}${circLim}</div>${common}${foot}</div>`;
    return p1 + p2 + p3;
  }


  /* ---------------- 7. 화면 (보잇 index.html 의 보상제안서 메뉴) ---------------- */
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
  const S = { docs: [] };
  const $ = q => document.querySelector(q);
  const agentText = () => { try { return typeof agentLine === "function" ? agentLine().replace(/<[^>]+>/g, "") : ""; } catch (e) { return ""; } };
  function draw() {
    const box = $("#sheets-bosang"), list = $("#bs-list"); if (!box) return;
    const me = (() => { try { return { name: ME.name || "", org: [ME.company, ME.branch].filter(Boolean).join(" ") }; } catch (e) { return {}; } })();
    box.innerHTML = S.docs.map(d => render(d.M, esc(agentText()), me)).join("");
    list.innerHTML = S.docs.map((d, i) => `<div class="bsrow"><span><b>${esc(d.M.p.insured || "고객")}</b> · ${esc(d.M.p.product || d.file)}</span><span>${d.M.D ? `계산한 담보 ${d.M.used.length}개${d.M.unknown.length ? ` · <span style="color:var(--warn,#b45309)">사전에 없는 담보 ${d.M.unknown.length}개(안내서에서 제외)</span>` : ""}` : `<span style="color:var(--bad,#b91c1c)">상품 보장 사전 없음</span>`} <button class="btn" type="button" data-bsdel="${i}">빼기</button></span></div>`).join("") || `<p class="note" style="margin:0">회사별로 설계한 상품제안서 PDF를 올리면 고객용 안내서(A4 4장)가 만들어집니다. PDF는 이 기기에서만 읽고 저장하지 않습니다.</p>`;
    const un = S.docs.flatMap(d => d.M.unknown.map(u => u.name));
    $("#bs-unknown").innerHTML = un.length ? `<details><summary>사전에 없는 담보 ${un.length}개 보기 (설계사용 · 고객 안내서에는 나오지 않음)</summary><p class="note">${un.map(esc).join("<br>")}</p></details>` : "";
    $("#bs-pdf").disabled = !S.docs.length;
  }
  async function addFiles(files) {
    const msg = $("#bs-msg");
    if (!G.pdfjsLib) { msg.textContent = "PDF 도구를 불러오지 못했습니다. 새로고침 후 다시 시도하세요."; return; }
    for (const f of files) {
      msg.textContent = `${f.name} 읽는 중…`;
      try {
        const pages = await pdfLines(G.pdfjsLib, new Uint8Array(await f.arrayBuffer()));
        const p = parseKB(pages);
        if (!p.items.length) { msg.textContent = `${f.name}: ${p.warn[0] || "담보를 찾지 못했습니다."}`; continue; }
        S.docs.push({ file: f.name, M: build(p) });
        msg.textContent = `${f.name}: 담보 ${p.items.filter(i => !i.group).length}개를 읽었습니다.`;
      } catch (e) { msg.textContent = `${f.name}: PDF를 읽지 못했습니다${e && /password/i.test(e.name || e.message || "") ? " (암호가 걸린 PDF)" : ""}.`; }
    }
    draw();
  }
  async function savePdf() {
    const msg = $("#bs-msg"), b = $("#bs-pdf");
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
    if (!document.getElementById("bs-style")) { const st = document.createElement("style"); st.id = "bs-style"; st.textContent = CSS; document.head.appendChild(st); }
    const inp = $("#bs-file"); if (!inp) return;
    inp.addEventListener("change", e => { const fs = [...e.target.files]; e.target.value = ""; addFiles(fs); });
    $("#bs-pdf").addEventListener("click", savePdf);
    document.addEventListener("click", e => { const d = e.target.closest("[data-bsdel]"); if (d) { S.docs.splice(+d.dataset.bsdel, 1); draw(); } });
    draw();
  }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init(); }

  G.BOSANG = { pdfLines, parseKB, build, render, man, fmt, DICTS, KB_DICT, IC_NAME, CSS };
})(typeof window !== "undefined" ? window : globalThis);
