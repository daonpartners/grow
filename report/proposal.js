/* grow.ai.kr 리포트 생성기 · '제안서' 탭
   KB손해보험 상품제안서(설계제안서) PDF 1개 →
   ① 담보표가 있는 원본 장을 그대로(그림) + ② 보상제안서 2장(요약·진단비·수술사례 / 치료비)
   - 담보 읽기·약관 사전·금액 계산은 bosang.js(보잇과 공용)를 그대로 씀
   - PDF는 이 브라우저에서만 읽고 서버로 보내지 않음
*/
(function (G) {
  "use strict";
  const B = () => G.BOSANG;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- 1. PDF 읽기: 담보 + 담보표가 있는 원본 장 그림 ---------- */
  async function parse(file, lib) {
    const data = new Uint8Array(await file.arrayBuffer());
    const pages = await B().pdfLines(lib, data.slice());
    const p = B().parseKB(pages);
    const c = { fileName: file.name, name: p.insured || "", warns: p.warn.slice(), p, imgs: [] };
    if (!p.items.length) { c.error = p.warn[0] || "가입담보 표를 찾지 못했습니다. KB손해보험 상품제안서 PDF인지 확인해 주세요."; return c; }
    // 담보표 시작 장(보장명·가입금액 머리글) ~ 끝 장(보험료비중)
    let s = -1, e = -1;
    pages.forEach((ls, i) => {
      const t = ls.join("\n");
      if (s < 0 && /보장명\s+가입금액/.test(t)) s = i;
      if (s >= 0 && e < 0 && /보험료비중/.test(t)) e = i;
    });
    if (s < 0) s = 0;
    if (e < s) { e = s; pages.forEach((ls, i) => { if (i > s && ls.some(l => /보장명\s+가입금액/.test(l))) e = i; }); }
    const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
    for (let i = s; i <= e && i < doc.numPages; i++) {
      const pg = await doc.getPage(i + 1), vp = pg.getViewport({ scale: 2.2 });
      const cv = document.createElement("canvas"); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: cx, viewport: vp }).promise;
      c.imgs.push({ src: cv.toDataURL("image/jpeg", 0.92), w: cv.width, h: cv.height });
    }
    c.M = B().build(p);
    if (!c.M.D) c.warns.push("KB손해보험 상품만 보상 금액을 계산할 수 있습니다. (현재 약관 사전: KB손해보험)");
    if (c.M.unknown.length) c.warns.push("약관 사전에 없는 담보 " + c.M.unknown.length + "개는 보상제안서에서 뺐습니다: " + c.M.unknown.map(u => u.name).join(", "));
    if (c.M.tierMissing.length) c.warns.push("통합치료비 가입금액의 세부 지급표가 사전에 없어 일부 세부 금액을 비웠습니다.");
    return c;
  }

  /* ---------- 2. 화면 ---------- */
  const CSS = `
.page.orig{background:#fff;align-items:center;justify-content:center}
.page.orig img{max-width:100%;max-height:100%;display:block}
.page.bsp{padding:28px 34px 0;gap:8px;font-size:11px;line-height:1.45;color:#1f2937;background:#fff;--g:#0f766e;--gs:#e6f4f1;--c:#be123c;--cs:#fdecef;--b:#4338ca;--bsf:#eef0fd;--h:#c2410c;--hs:#fdf0e8;--o:#b45309}
.page.bsp .pfoot{margin:auto 0 0;flex:none}
.bsp .bs-dx{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.bsp .bs-dx>div{border-radius:8px;padding:5px 9px;display:flex;flex-direction:column;gap:1px;border-left:4px solid}
.bsp .bs-dx>div>span{font-size:10px;font-weight:700;color:#374151}.bsp .bs-dx>div>b{font-size:16px;line-height:1.2;white-space:nowrap}.bsp .bs-dx>div>small{font-size:9px;color:#6b7280}
.bsp .bs-dx>.c{background:var(--cs);border-color:var(--c)}.bsp .bs-dx>.c>b{color:var(--c)}
.bsp .bs-dx>.b{background:var(--bsf);border-color:var(--b)}.bsp .bs-dx>.b>b{color:var(--b)}
.bsp .bs-dx>.h{background:var(--hs);border-color:var(--h)}.bsp .bs-dx>.h>b{color:var(--h)}
.bsp .bs-dx>.g{background:var(--gs);border-color:var(--g)}.bsp .bs-dx>.g>b{color:var(--g)}
.bsp .bs-dx>.ic{grid-column:span 2}
.bsp .bs-ic{display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
.bsp .bs-cases{grid-template-columns:1fr 1fr 1fr;gap:6px}.bsp .bs-case{padding:6px 8px;gap:3px}.bsp .bs-case-h b{font-size:11.5px}.bsp .bs-pill{font-size:13.5px;padding:1px 7px}
.bsp .bs-row{grid-template-columns:78px 1fr 84px;padding:4px 0}
.bsp .bs-flow em{font-size:15px}.bsp .bs-ex em{font-size:21px}.bsp .bs-ex{padding:6px 10px}
`;
  function ensureCss() {
    if (document.getElementById("bs-style") == null && B().CSS) { const st = document.createElement("style"); st.id = "bs-style"; st.textContent = B().CSS; document.head.appendChild(st); }
    if (!document.getElementById("bsp-style")) { const st = document.createElement("style"); st.id = "bsp-style"; st.textContent = CSS; document.head.appendChild(st); }
  }

  function origPages(c) {
    return c.imgs.map(im => `<div class="page orig" data-fixed="1"><img src="${im.src}" alt="설계제안서 원본"></div>`).join("");
  }

  // a: {name,title,phone,org}, foot: 공통 하단(로고·담당) HTML
  function guidePages(c, a, foot) {
    const M = c.M, p = M.p, A = M.A, T = M.T, D = M.D;
    if (!D) return `<div class="page bsp"><h3>이 회사 상품은 아직 약관 사전이 없습니다</h3><p>현재 보상 금액 계산은 KB손해보험 상품만 됩니다. 위 설계제안서 원본만 활용해 주세요.</p>${foot}</div>`;
    const fmt = B().fmt, IC = B().IC_NAME;
    const has = k => A[k] > 0, v = k => A[k] || 0;
    const sum = arr => arr.reduce((x, y) => x + (y || 0), 0);
    const dsum = (...ks) => sum(ks.map(v));
    const insured = esc(c.name || p.insured || "고객");
    const chip = (label, amt, cls = "") => amt ? `<span class="bs-chip ${cls}">${label} <b>${typeof amt === "number" ? fmt(amt) : amt}</b></span>` : "";
    const chips = arr => arr.filter(Boolean).join("");
    const top = n => `<div class="bs-top"><span>${insured} 고객님 보험금예상안내서</span><span>보상제안 ${n}/2</span></div>`;
    const sec = (no, t) => `<h4 class="bs-sec g"><span>${no}</span>${t}</h4>`;

    /* ===== 1장: 요약 · 진단비 · 수술 사례 ===== */
    const icKeys = Object.keys(IC).filter(has);
    const icFirst = has("ic_digest") ? "ic_digest" : icKeys[0];
    const ciLimit = v("ci_hi") + v("ci_np");
    const kpi = (cls, t, big, sub) => `<div class="bs-k ${cls}"><span>${t}</span><b>${big}</b><small>${sub}</small></div>`;
    const kpis = [
      has("cancer") ? kpi("kc", "암 진단 즉시", fmt(v("cancer") + (icFirst ? v(icFirst) : 0)), `암진단 ${fmt(v("cancer"))}${icFirst ? " + 부위별 " + fmt(v(icFirst)) : ""}`) : "",
      ciLimit ? kpi("kc", "암 치료비 · 매년", fmt(ciLimit), "통합치료비 연간 한도 합") : "",
      has("brain") || has("heart1") ? kpi("kb", "뇌·심장 진단 즉시", fmt(Math.max(v("brain"), v("heart1"))), `뇌혈관 ${fmt(v("brain"))} · 심장 ${fmt(v("heart1"))}`) : "",
      has("circ") ? kpi("kh", "뇌·심장 치료비 · 매년", fmt(v("circ")), "순환계 통합치료 연 한도") : "",
    ].join("");
    const dx = (cls, t, amt, sub) => amt ? `<div class="${cls}"><span>${t}</span><b>${fmt(amt)}</b><small>${sub || ""}</small></div>` : "";
    const dxBox = [
      dx("c", "암 (유사암 제외)", v("cancer"), "진단 시 일시금 · 이후 보험료 납입면제"),
      icKeys.length ? `<div class="c ic"><span>통합암 · 부위별 (전이·재발 시 부위마다 다시 지급)</span><div class="bs-ic">${icKeys.map(k => chip(IC[k], v(k), "c")).join("")}</div></div>` : "",
      dx("c", "유사암 (갑상선암 등)", v("simcancer"), "계약일부터 보장"),
      dx("b", "뇌혈관질환", v("brain"), "뇌경색·뇌출혈·대뇌동맥류 등"),
      dx("h", "심장질환 (특정Ⅰ)", v("heart1"), "협심증·심방세동·심부전 등"),
      dx("h", "심장질환 (특정Ⅱ)", v("heart2"), "급성심근경색·심정지 소생"),
      dx("h", "부정맥 (I49)", v("arrhy"), ""),
      dx("b", "양성뇌종양", v("benignbrain"), ""),
      has("frac") || has("frac2") ? `<div class="g"><span>골절 (치아파절 포함)</span><b>${fmt(dsum("frac", "frac2"))}</b><small>${[has("frac5") ? "5대골절 +" + fmt(v("frac5")) : "", has("cast") ? "깁스 +" + fmt(v("cast")) : ""].filter(Boolean).join(" · ")}</small></div>` : "",
      dx("g", "화상", v("burn"), ""),
      dx("b", "외상성 특정 뇌손상·뇌출혈", dsum("tbi", "tbleed"), ""),
    ].filter(Boolean).join("");

    const cases = [];
    const card = (title, sub, total, totSub, parts, ref) => `<div class="bs-case"><div class="bs-case-h"><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</div><div class="bs-pill">${total}${totSub ? `<small>${totSub}</small>` : ""}</div></div><div class="bs-case-p">${chips(parts)}</div>${ref ? `<div class="bs-ref">${ref}</div>` : ""}</div>`;
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
    if (has("d2") || has("s116_6")) { const a2 = v("d2"), b2 = dsum("s116_6", "dsurg", "d1"); cases.push(card("요로 · 신장 결석", "", `${fmt(Math.min(a2, b2))}~${fmt(Math.max(a2, b2))}`, "", [chip("쇄석술 2종", a2, "t"), chip("요관내시경 116대Ⅵ+질병+1종", b2)], "분류표 87 · 쇄석술 = 2종 (116대·질병수술비는 쇄석술 제외)")); }
    if (has("frac") || has("frac2") || has("cast")) cases.push(card("뼈에 금이 가면", "골절 진단 시", fmt(dsum("frac", "frac2", "cast")) + "~", has("frac5") ? `5대골절 +${fmt(v("frac5"))}` : "", [chip("골절진단", v("frac")), chip("골절Ⅱ", v("frac2")), chip("깁스", v("cast")), has("isurg") ? chip("수술 시 상해수술", `${fmt(v("isurg"))}+1~5종`) : ""], "척추·골반·대퇴골 등 5대골절은 추가 지급"));
    if (has("flu")) cases.push(card("독감 (인플루엔자)", "항바이러스제 처방 · 연1회", fmt(v("flu")), "", [chip("독감 치료비", v("flu"))], "갱신형"));
    const typeRow = ["d1", "d2", "d3", "d4", "d5"].some(has) ? `<div class="bs-types"><span>질병 종수술비 (수술 1회당)</span>${[1, 2, 3, 4, 5].filter(i => has("d" + i)).map(i => `<em><small>${i}종</small>${fmt(v("d" + i))}</em>`).join("")}${has("dsurg") ? `<em class="g"><small>+ 질병수술비</small>${fmt(v("dsurg"))}</em>` : ""}</div>` : "";
    const agentLine = `<b>${esc(a.name || "[설계사 이름]")}</b>${a.title ? " " + esc(a.title) : ""} <span>소속</span> ${esc(a.org)}`;
    const p1 = `<div class="page bsp">${top(1)}
      <div class="bs-hero"><div class="bs-kk">INSURANCE BENEFIT GUIDE</div><h2>${insured} 고객님 보험금예상안내서</h2>
        <dl><dt>상품</dt><dd>${esc(D.company)} <b>${esc(p.product)}</b></dd><dt>담당설계사</dt><dd>${agentLine}</dd></dl>
        <p>${p.age ? `피보험자 ${esc(p.sex)} ${p.age}세 · ` : ""}${p.premium ? `월 보험료 ${p.premium.toLocaleString("ko-KR")}원 · ` : ""}앞 장 설계제안서의 가입금액 · 가입 1년 이후 지급액 기준</p></div>
      <div class="bs-kpis">${kpis}</div>
      ${dxBox ? sec("01", "진단받으면 바로 받는 돈 (진단비)") + `<div class="bs-dx">${dxBox}</div>` : ""}
      ${sec("02", "검진·생활 속에서 자주 받는 수술비")}
      ${typeRow}
      <div class="bs-cases">${cases.join("") || "<p>수술 담보가 없습니다.</p>"}</div>
      <p class="bs-note1">※ 같은 수술이라도 <b>진단받은 질병코드</b>와 <b>수술 방법(관혈·비관혈, 내시경·복강경·카테터 등)</b>에 따라 1~5종 분류와 116대 질병 해당 여부가 달라져 실제 받는 보험금이 위 금액과 다를 수 있습니다. 최종 지급은 약관과 보험사 심사에 따릅니다.</p>
      ${foot}</div>`;

    /* ===== 2장: 치료비 (암 · 뇌 · 심장) ===== */
    const H = T.ci_hi || {}, N = T.ci_np || {}, C = T.circ || {};
    const np2 = (x, y) => (x || 0) + (y || 0);
    const surgSum = (H.surg || 0) + (H.np_surg || 0) + (N.np_surg || 0) + v("dsurg") + v("d5");
    const robotSum = v("robot") + (H.np_robot || 0) + (N.np_robot || 0);
    const examSum = H.mri != null ? H.mri + H.pet + H.ct + H.us + H.endo + H.gene + H.biopsy + H.ngs : 0;
    const tierNote = M.tierMissing.length ? `<p class="bs-warn">통합치료비 가입금액(${M.tierMissing.map(k => fmt(A[k])).join(", ")})의 세부 지급표가 사전에 없어 세부 금액을 비웠습니다.</p>` : "";
    const srow = (no, title, sub, items, total, tsub) => `<div class="bs-row"><div class="bs-rn"><i>${no}</i><b>${title}</b><small>${sub}</small></div><div class="bs-ri">${chips(items)}</div><div class="bs-rt"><b>${total}</b>${tsub ? `<small>${tsub}</small>` : ""}</div></div>`;
    const cancer = has("ci_hi") || has("ci_np") || has("chemo") || has("rad") ? `
      <div class="bs-band c"><b>03</b><div><h3>암 치료비 — 치료할 때마다, 매년</h3><p>수술·항암약물·방사선·중환자실. 통합치료비는 매년 연간 한도가 다시 채워짐</p></div></div>${tierNote}
      <div class="bs-rows">
      ${H.mri != null ? srow("①", "검사", "연1회", [chip("MRI·PET·CT·초음파·내시경·유전자 각", H.mri), chip("조직병리", H.biopsy), chip("NGS 유전자패널", H.ngs)], fmt(examSum), "매년") : ""}
      ${srow("②", "수술", "할 때마다", [chip("급여 암수술", H.surg, "c"), (H.np_surg || N.np_surg) ? chip("비급여 암수술", [H.np_surg, N.np_surg].filter(Boolean).map(fmt).join("+"), "c") : "", chip("질병수술비", v("dsurg")), chip("근치수술 5종", v("d5"), "t"), has("robot") ? chip("로봇수술 시", `+${fmt(robotSum)}`, "o") : ""], fmt(surgSum), "회당")}
      ${srow("③", "항암치료", "매년 1회씩", [chip("항암약물", H.chemo), chip("항암방사선", H.rad), has("chemo") || has("rad") ? chip("첫 치료 추가", `각 ${fmt(Math.max(v("chemo"), v("rad")))}`) : "", chip("IMRT", H.imrt), np2(H.np_chemo, N.np_chemo) ? chip("비급여 약물·방사선 각", np2(H.np_chemo, N.np_chemo), "c") : "", np2(H.np_target, N.np_target) ? chip("표적항암", np2(H.np_target, N.np_target), "c") : "", np2(H.np_immune, N.np_immune) ? chip("면역항암", np2(H.np_immune, N.np_immune), "c") : "", np2(H.np_proton, N.np_proton) ? chip("양성자", np2(H.np_proton, N.np_proton), "c") : "", chip("CAR-T", v("cart"), "o")], ciLimit ? "최대 " + fmt(ciLimit) : "-", ciLimit ? "연간 한도 합" : "")}
      ${H.icu ? srow("④", "입원·회복", "매년", [chip("암 중환자실", H.icu), chip("중환자실 1일당", v("icu_d")), chip("통증완화", H.pain), chip("항암호르몬", H.horm), chip("재활 1일", H.rehab)], fmt(H.icu) + "+", "매년") : ""}
      ${has("simcancer") && H.simsurg ? srow("⑤", "갑상선암", "유사암", [chip("유사암수술", H.simsurg), chip("116대Ⅳ", v("s116_4"), "s"), chip("질병수술", v("dsurg")), chip("5종", v("d5"), "t"), has("robot_thy") ? chip("로봇 시", "+" + fmt(v("robot_thy") + np2(H.np_robot_thy, N.np_robot_thy)), "o") : "", has("thy_horm") ? chip("호르몬약 최초", v("thy_horm")) : ""], fmt(H.simsurg + v("s116_4") + v("dsurg") + v("d5")), "수술 1회") : ""}
      </div>
      <div class="bs-limbar">${has("ci_hi") ? `<div style="flex:${v("ci_hi")}"><b>암통합치료비 연 ${fmt(v("ci_hi"))}</b><small>검사·급여 수술·약물·방사선·중환자실</small></div>` : ""}${has("ci_np") ? `<div class="n" style="flex:${v("ci_np")}"><b>비급여 암통합치료비 연 ${fmt(v("ci_np"))}</b><small>비급여 수술·로봇·약물·방사선·표적·면역·양성자</small></div>` : ""}</div>` : "";
    const flow = (cls, steps) => `<div class="bs-flow ${cls}">${steps.filter(Boolean).map(s => `<div><i>${s[0]}</i><b>${s[1]}</b><em>${s[2]}</em><small>${s[3]}</small></div>`).join("")}</div>`;
    const ex = (cls, title, formula, total) => `<div class="bs-ex ${cls}"><div><b>${title}</b><small>${formula}</small></div><em>${total}</em></div>`;
    const opAdd = v("s116_1") + v("dsurg") + v("d3");
    const thrombAll = (C.thromb || 0) + opAdd, surgAll = (C.surg || 0) + opAdd;
    const brainEx = C.lysis_b ? v("brain") + C.lysis_b + C.mri + C.ct + C.pet + C.icu + v("icu_d") * 7 + thrombAll + C.anticoag + C.antiplt : 0;
    const heartEx = C.icu ? v("heart1") + C.mri + C.ct + C.pet + surgAll + C.icu + v("icu_d") * 2 + C.antiplt : 0;
    const brain = has("circ") || has("brain") ? `
      <div class="bs-band b"><b>04</b><div><h3>뇌 치료비 — 뇌경색·뇌출혈</h3><p>${has("circ") ? `신특정순환계질환 통합치료비 연 ${fmt(v("circ"))} (뇌·심장 합산, 매년 새로 채워짐)` : "뇌혈관질환 진단·수술"}</p></div></div>
      ${flow("b", [["진단", "뇌혈관질환", fmt(v("brain")), "일시금 · 1장 진단비"], C.lysis_b ? ["검사·혈전용해", "혈전용해 + 검사", fmt(C.lysis_b + C.mri + C.ct + C.pet), "연1회"] : null, C.icu ? ["중환자실", "종합병원", fmt(C.icu) + "+", `1일당 ${fmt(v("icu_d"))} 별도`] : null, C.thromb ? ["시술·수술", "혈전제거술", fmt(thrombAll), `순환계 ${fmt(C.thromb)} + 116대Ⅰ ${fmt(v("s116_1"))} + 질병 ${fmt(v("dsurg"))} + 3종 ${fmt(v("d3"))}`] : null, C.anticoag ? ["약·재활", "항응고·항혈소판", fmt(C.anticoag + C.antiplt + C.rehab * 20), "매년"] : null])}
      ${brainEx ? ex("b", "예시 · 뇌경색: 혈전용해 → 중환자실 7일 → 혈전제거술 → 약 처방", `진단 ${fmt(v("brain"))} + 혈전용해 ${fmt(C.lysis_b)} + 검사 ${fmt(C.mri + C.ct + C.pet)} + 중환자실 ${fmt(C.icu)} + 일당 ${fmt(v("icu_d") * 7)} + 혈전제거술 ${fmt(thrombAll)} + 약 ${fmt(C.anticoag + C.antiplt)}`, fmt(brainEx)) : ""}` : "";
    const heart = has("circ") || has("heart1") ? `
      <div class="bs-band h"><b>05</b><div><h3>심장 치료비 — 협심증·심근경색</h3><p>가슴 통증 → 진단 → 스텐트를 넣는 경우</p></div></div>
      ${flow("h", [["진단", "심장질환(특정Ⅰ)", fmt(v("heart1")), has("heart2") ? `심근경색이면 +${fmt(v("heart2"))}` : "일시금"], C.lysis_h ? ["검사·혈전용해", "혈전용해 + 검사", fmt(C.lysis_h + C.mri + C.ct + C.pet), "연1회"] : null, C.surg ? ["시술", "스텐트 삽입", fmt(surgAll), `순환계 ${fmt(C.surg)} + 116대Ⅰ ${fmt(v("s116_1"))} + 질병 ${fmt(v("dsurg"))} + 3종 ${fmt(v("d3"))}`] : null, C.icu ? ["중환자실", "종합병원", fmt(C.icu) + "+", `1일당 ${fmt(v("icu_d"))} 별도`] : null, C.antiplt ? ["약·재활", "항혈소판·재활", fmt(C.antiplt + C.rehab * 20) + "~", "매년"] : null])}
      ${heartEx ? ex("h", "예시 · 협심증: 스텐트 → 중환자실 2일 → 항혈소판제", `진단 ${fmt(v("heart1"))} + 검사 ${fmt(C.mri + C.ct + C.pet)} + 스텐트 ${fmt(surgAll)} + 중환자실 ${fmt(C.icu)} + 일당 ${fmt(v("icu_d") * 2)} + 항혈소판 ${fmt(C.antiplt)}`, fmt(heartEx)) : ""}` : "";
    const notice = `<div class="bs-box w"><div class="bs-boxh"><b>꼭 알아두실 점</b></div><ul><li>암은 계약일부터 <b>90일 뒤</b>부터 보장 (유사암은 계약일부터)</li>${has("ci_np") || has("ci_hi") || has("circ") ? "<li>통합치료비 · 116대질병수술비는 <b>가입 1년 미만 50%</b></li>" : ""}<li>진단비·중환자실 일당·종수술비·116대·질병수술비는 통합치료비 한도와 <b>별도</b>로 지급</li><li>스텐트·혈전제거술·코일색전술 같은 카테터 수술은 분류표 88-1(뇌·심장) <b>3종</b></li></ul></div>`;
    const common = `<p class="bs-common">금액은 ${esc(D.company)} 상품제안서(${p.no ? "청약번호 " + esc(p.no) + ", " : ""}${p.issued ? esc(p.issued) + " 발급" : ""})의 가입금액과 약관 지급 기준(가입 1년 이후)으로 계산했습니다. 기준 약관: ${esc(D.basis)}. 실제 지급 여부와 금액은 진단명·질병코드·수술 분류에 따라 달라지며 약관이 우선합니다. 가입 전 상품설명서와 약관을 반드시 확인하시기 바랍니다.</p>`;
    const p2 = `<div class="page bsp">${top(2)}${cancer}${brain}${heart}${notice}${common}${foot}</div>`;
    return p1 + p2;
  }

  function build(c, host, a, foot) {
    ensureCss();
    host.innerHTML = origPages(c) + guidePages(c, a, foot);
  }

  G.PROPOSAL = { parse, build };
})(window);
