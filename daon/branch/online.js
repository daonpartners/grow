/* 다온지사 지사페이지 · 온라인 자동화 (daon.io.kr/branch) — 보잇 online.js 복사본 (2026-11-19)
   차이: 로그인 = 다온 CRM 접속코드 (토큰 "daon:접속코드" → n8n boit-daon-auth 확인), 저장 = 이 기기 IndexedDB(branch/index.html)
   원본: daonpartners/boit online.js — 고칠 때 둘 다 맞출 것

   (원본 설명) 보잇 · 온라인 자동화 (2026-11-12)
   설계사 블로그·카페 운영을 돕는 자동화 모음. 지금 쓸 수 있는 것: 블로그 키워드 조사, 콘텐츠 계획, 글 만들기(AI 글·정보 이미지·실사 사진·심의번호·배너), 필수기재 배너.
   키워드 조사: n8n '보잇 키워드 조사 API' (POST boit-keyword {token, keywords[], related})
     - 월간 검색량: 네이버 검색광고 API (keywordstool)
     - 경쟁도: 네이버 API HUB 블로그 검색 상위 10개 중 제목에 키워드를 그대로 넣은 글 수, 상위글 나이(중앙값)
     - 검색 결과 글 본문은 저장하지 않고 AI에 넣지 않음 (NAVER API HUB 이용 조건)
   필수기재 배너: 설계사별 배너 이미지(일반·기업/리쿠르팅/개인 건강보험) 등록 → 글 끝에 붙일 때 이미지 복사/다운로드. ME.oa.banners {gen,rec,hlt} = {img:dataURL,name,at}
   저장: ME.oa = {last, plan[], banners} (app_state 클라우드 저장에 포함)
   2026-11-18 업그레이드: 채널(블로그/카페)·글 길이·정보 이미지 0~6·사진 0~3 선택, 네이버 작성 점검(브라우저 계산), 인스타·쓰레드 변환(action sns, SNS 심의번호 후 복사), 작성 규칙은 oa-rules.json (n8n이 매번 읽음)
   원칙: 보험 관련 글은 광고 → 회사 준법감시 심의 후 게시 (금융소비자보호법 제22조). 심의번호 없는 글은 '발행'으로 바꿀 수 없음.
*/
(function(){
"use strict";
const $=s=>document.querySelector(s);
const E=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const td=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const fmt=n=>Number(n||0).toLocaleString("ko-KR");
const API="https://daonpartners.app.n8n.cloud/webhook/boit-keyword";
function D(){ try{ if(!ME.oa||typeof ME.oa!=="object") ME.oa={}; if(!Array.isArray(ME.oa.plan)) ME.oa.plan=[]; return ME.oa; }catch(e){ window.__OA=window.__OA||{plan:[]}; return window.__OA; } }
let TAB="home", BUSY=false, GBUSY=false, FLT="todo";
const VC={"최적":"var(--ok)","가능":"var(--c2)","어려움":"var(--warn)","포화":"var(--bad)","허수":"var(--muted)"};
const ST=["예정","초안","심의중","발행"];
const TOPICS=["화재보험","배상책임보험","자동차보험","운전자보험","실손보험","암보험","간병인보험","치매보험","어린이보험","펫보험","보험금 청구","소상공인 보험"];
const FREQ=[["day","매일"],["wk5","평일"],["wk3","주 3회"],["wk1","주 1회"]];
const WD="일월화수목금토";

function root(){ return $("#oa-root"); }
/* 화면 구조 (2026-11-18 대표 요청으로 개편)
   처음: 무엇을 만들까요? [블로그 글][카페 글][질문 답변글][고객 후기 정리] + 내가 만든 글 + (키워드·발행 계획 / 필수기재 배너)
   → 종류 고르면 글쓰기 한 화면: ① 어떤 글 ② 키워드 ③ 말투 ④ 분량·이미지 → [글 만들기] → 확인 → (심의) → 복사 */
const KINDS={blog:{t:"블로그 글",ic:"📝",d:"네이버 블로그 정보 글 + 이미지",tag:"보험 글은 심의 · 생활 글은 바로 게시"},
  cafe:{t:"카페 글",ic:"☕",d:"네이버 카페 게시판용 정보 글",tag:"보험 글은 심의 · 생활 글은 바로 게시"},
  qa:{t:"질문·답변글",ic:"💬",d:"실제 질문에 답하거나, 자주 받는 질문 15개를 뽑아 설계사 이름으로 답변",tag:"보험 답변은 심의 후 게시"},
  review:{t:"고객 후기 정리",ic:"⭐",d:"고객이 직접 겪은 내용을 읽기 좋게 다듬기",tag:"고객 본인이 직접 게시"},
  recruit:{t:"리쿠르팅 글",ic:"🤝",d:"설계사 시장·이직·생존 전략, 신입·경력·관리자 모집 글",tag:"회사 내규에 따라 심의"}};
/* 리쿠르팅 글 (2026-11-19 대표 요청): 주제·모집 대상 고르기 → 글 만들기. 소득 보장·과장 금지, 사실은 '우리 조직 사실' 칸에 적은 것만 */
const RTOPICS=[["시장","보험설계사 시장 지금 어떤가"],["영업","요즘 영업 시장·고객 변화"],["필수","설계사에게 꼭 필요한 것"],["이직","이직할 때 꼭 알아야 할 것"],["모집","전국 사업단장·본부장·경력·신입 모집"],["DB","받는 DB vs 만드는 고객"],["채널","고객 길을 여러 개로"],["현장","행사·병원·산모교실·제휴 영업"],["장기","오래 일하는 설계사의 조건"],["선택","회사 고를 때 먼저 볼 것"],["생존","70만 명 중 살아남는 설계사 전략"]];
const RTARGETS=["신입","경력","사업단장·본부장","워킹맘·경력단절","전체"];
const DISC_R="※ 수입·지원 조건은 개인 실적과 회사 위촉 규정에 따라 다르며, 위촉 전 계약서로 반드시 확인하시기 바랍니다.";
const discOf=p=>kindOf(p)==="recruit"?DISC_R:DISC;
let WKIND="blog";
const kindOf=p=>p&&p.kind?p.kind:(p&&p.style&&p.style.ch==="카페"?"cafe":"blog");
const needRev=p=>{ const k=kindOf(p); return k==="review"?false:k==="qa"?true:p.ins!==false; }; /* recruit: ins=심의 여부 */
const STL=p=>p.st==="완료"?["완료","ok"]:p.st==="심의중"?["심의중","mid"]:["작성중","draft"];
function render(){
  const R=root(); if(!R) return;
  R.innerHTML=`<div id="oa-top"></div><div id="oa-body"></div>`;
  const T=$("#oa-top"), back=`<button class="btn sm" type="button" data-oat="home">← 처음으로</button>`;
  if(TAB==="plan"||TAB==="do"){ const todo=D().plan.filter(p=>p.st!=="발행").length;
    T.innerHTML=`<div class="oa-bar">${back}<h2>키워드·발행 계획</h2></div>
      <div class="oa-chips" style="margin:0 0 14px">${[["plan","① 키워드 찾기"],["do",`② 내 계획 ${todo}`]].map(([k,t])=>`<button type="button" class="oa-chip${TAB===k?" on":""}" data-oat="${k}">${t}</button>`).join("")}</div>`; }
  else if(TAB==="banner") T.innerHTML=`<div class="oa-bar">${back}<h2>필수기재 배너</h2></div>`;
  else if(TAB==="more") T.innerHTML=`<div class="oa-bar">${back}<h2>자동화 목록</h2></div>`;
  ({home:vHome,plan:vPlanMake,do:vDo,write:vWrite,banner:vBanner,more:vMore}[TAB]||vHome)();
}
function vHome(){
  const B=$("#oa-body"), L=POSTS().slice().reverse(), todo=D().plan.filter(p=>p.st!=="발행").length;
  B.innerHTML=`<h2 class="oa-h">무엇을 만들까요?</h2>
  <div class="oa-kinds">${Object.entries(KINDS).map(([k,v])=>`<button type="button" class="oa-kind" data-oak="${k}"><span class="ic">${v.ic}</span><b>${v.t}</b><span class="d">${v.d}</span><em>${v.tag}</em></button>`).join("")}</div>
  <div class="panel" style="margin-top:16px">
    <h2 id="oa-mylist" style="margin:0 0 6px">내가 만든 글 <small class="note">${L.length}편 · 이 기기에 저장 · 열어서 이어 쓰기·고치기</small></h2>
    ${L.length?`<div class="oa-kl">${L.map(x=>{ const k=KINDS[kindOf(x)]||KINDS.blog, s=STL(x); return `<div class="oa-kr"><div style="min-width:0"><b>${E((x.out&&x.out.title)||x.kw||k.t)}</b><small class="note">${k.ic} ${k.t} · ${E(x.at)}${x.no?" · 심의 "+E(x.no):""}</small></div>
      <span class="row" style="gap:6px;flex-wrap:nowrap"><span class="oa-st ${s[1]}">${s[0]}</span><button class="btn sm primary" type="button" data-owo="${x.id}">열기</button><button class="btn sm" type="button" data-owd="${x.id}">삭제</button></span></div>`; }).join("")}</div>`
      :`<p class="note" style="margin:0">아직 만든 글이 없습니다. 위에서 만들 글을 고르세요.</p>`}
  </div>
  <div class="oa-subs">
    <button type="button" class="oa-sub" data-oat="plan"><b>📅 키워드·발행 계획</b><span>잘 검색되는 키워드를 찾고 날짜별로 정리${todo?` · 할 일 ${todo}`:""}</span></button>
    <button type="button" class="oa-sub" data-oat="banner"><b>🏷 필수기재 배너</b><span>심의 글 끝에 붙이는 등록번호 배너</span></button>
  </div>`;
}
const ymdOf=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const md=s=>{ if(!s) return "날짜 없음"; const d=new Date(s+"T00:00:00"); return (d.getMonth()+1)+"/"+d.getDate()+"("+WD[d.getDay()]+")"; };
function GS(){ const o=D(); if(!o.gen||typeof o.gen!=="object") o.gen={}; const g=o.gen; if(!Array.isArray(g.topics)) g.topics=["화재보험","간병인보험"]; if(!g.weeks) g.weeks=2; if(!g.freq) g.freq="wk3"; if(!g.start){ const t=new Date(); t.setDate(t.getDate()+1); g.start=ymdOf(t); } if(g.custom==null) g.custom=""; return g; }
function genDates(g){ const out=[], s=new Date(g.start+"T00:00:00"); if(isNaN(s)) return out;
  for(let i=0;i<g.weeks*7;i++){ const d=new Date(s); d.setDate(s.getDate()+i); const w=d.getDay();
    if(g.freq==="day"||(g.freq==="wk5"&&w>0&&w<6)||(g.freq==="wk3"&&(w===1||w===3||w===5))||(g.freq==="wk1"&&w===1)) out.push(ymdOf(d)); }
  return out; }
function genTopics(g){ return [...new Set([...g.topics,...String(g.custom||"").split(/[,\n]+/).map(s=>s.trim()).filter(s=>s.length>=2)])].slice(0,6); }

/* ---------- 1. 계획 만들기 ---------- */
function vPlanMake(){
  const B=$("#oa-body"), g=GS(), ds=genDates(g), tp=genTopics(g);
  B.innerHTML=`<div class="panel">
    <h2 style="margin:0 0 10px">주제·기간 고르면 키워드와 날짜를 자동으로</h2>
    <div class="oa-lb">주제 <small class="note">여러 개</small></div>
    <div class="oa-chips">${TOPICS.map(t=>`<button type="button" class="oa-chip${g.topics.includes(t)?" on":""}" data-gt="${E(t)}">${E(t)}</button>`).join("")}</div>
    <input id="oa-gc" class="oa-in" maxlength="60" value="${E(g.custom)}" placeholder="직접 입력 (쉼표로) 예: 식당 화재보험, 학원 배상책임">
    <div class="oa-when">
      <div><div class="oa-lb">기간</div><div class="oa-chips">${[1,2,4].map(w=>`<button type="button" class="oa-chip${g.weeks===w?" on":""}" data-gw="${w}">${w}주</button>`).join("")}</div></div>
      <div><div class="oa-lb">글 올리는 날</div><div class="oa-chips">${FREQ.map(([k,t])=>`<button type="button" class="oa-chip${g.freq===k?" on":""}" data-gf="${k}">${t}</button>`).join("")}</div></div>
      <div><div class="oa-lb">시작일</div><input id="oa-gs" class="oa-in" type="date" value="${E(g.start)}" style="max-width:200px;margin:0"></div>
    </div>
    <p class="oa-sum">올릴 날 <b>${ds.length}일</b>${ds.length?` · ${md(ds[0])} ~ ${md(ds[ds.length-1])}`:""}${tp.length?` · 주제 ${tp.length}개`:""}</p>
    <button class="btn primary" type="button" id="oa-gen" style="width:100%" ${GBUSY||!tp.length?"disabled":""}>${GBUSY?"키워드 조사 중… (1분 안팎)":tp.length?"키워드 추천 받기":"주제를 고르면 키워드를 추천합니다"}</button>
    <p class="note" id="oa-gmsg" style="margin:8px 0 0"></p>
  </div>
  ${vCand(ds)}
  <details class="panel oa-more" style="margin-top:14px" ${D().last?"":""}><summary>키워드 직접 조사하기</summary><div id="oa-kwbox"></div></details>`;
  vKw();
}
async function genPlan(){
  if(GBUSY) return; const g=GS(), ds=genDates(g), tp=genTopics(g); const msg=t=>{ const m=$("#oa-gmsg"); if(m) m.textContent=t; };
  if(!tp.length||!ds.length) return;
  const t0=await tok(); if(!t0) return msg("지사페이지에 다시 로그인해 주세요.");
  GBUSY=true; vPlanMake();
  // 주제 하나에 검색어 4개(주제·추천·가입·비교)로 나눠 조사 → 연관 키워드 최대 80개 (서버가 한 번에 20개까지만 줌) (2026-11-18)
  const SUF=["","추천","가입","비교"];
  const call=async kw=>{ try{ const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t0,keywords:[kw],related:20})}); const j=JSON.parse(await r.text()); return j&&j.ok&&Array.isArray(j.rows)?j.rows:[]; }catch(e){ return []; } };
  const one=async topic=>{ const L=await Promise.all(SUF.map(x=>call(x?topic+" "+x:topic))), seen=new Set(), out=[];
    L.flat().forEach(r=>{ const k=String(r.keyword).replace(/\s+/g,""); if(!seen.has(k)){ seen.add(k); out.push(r); } }); return out; };
  const res=await Promise.all(tp.map(one));
  // '안 쓴 계획 지우고 새로 짜기'가 켜져 있으면 그 계획의 키워드도 다시 추천 대상에 넣음
  const rep=GS().rep!==false, have=new Set(D().plan.filter(p=>!(rep&&idle(p))).map(p=>p.keyword)), used=new Set(), O={"최적":0,"가능":1,"어려움":2};
  const pools=tp.map((topic,i)=>{ const cores=topic.split(/\s+/).map(s=>s.replace(/보험$/,"")).filter(s=>s.length>=2);
    return res[i].filter(r=>O[r.verdict]!=null&&!have.has(r.keyword)&&(r.type==="입력"||!cores.length||cores.some(c=>String(r.keyword).replace(/\s+/g,"").includes(c.replace(/\s+/g,"")))))
      .sort((a,b)=>O[a.verdict]-O[b.verdict]||b.search-a.search).map(r=>Object.assign({topic},r)); });
  // 주제별로 번갈아 좋은 순서로 줄 세움 → 올릴 날 수만큼 미리 체크. 고르기는 설계사가 함 (2026-11-17)
  const order=[]; let left=true;
  while(left){ left=false; for(const pool of pools){ while(pool.length){ const r=pool.shift(); if(!used.has(r.keyword)){ used.add(r.keyword); order.push(r); left=true; break; } } } }
  GBUSY=false;
  if(!order.length){ vPlanMake(); return msg(res.every(r=>!r.length)?"키워드를 가져오지 못했습니다. 잠시 후 다시 눌러 주세요.":"새로 넣을 만한 키워드가 없습니다. 주제를 바꾸거나 아래에 직접 넣어 주세요."); }
  const C=CAND(), mine=C.filter(c=>c.mine||c.from==="kw");
  D().cand=[...mine,...order.filter(r=>!mine.some(c=>c.keyword===r.keyword)).map(r=>({keyword:r.keyword,verdict:r.verdict,search:r.search,topic:r.topic,on:false}))];
  let need=Math.max(0,ds.length-D().cand.filter(c=>c.on).length); D().cand.forEach(c=>{ if(!c.on&&need>0&&!c.mine){ c.on=true; need--; } });
  vPlanMake(); msg(`추천 키워드 ${order.length}개 · 올릴 날 수(${ds.length}일)만큼 좋은 순서로 미리 체크했습니다. 체크를 바꾸거나 직접 넣은 뒤 [계획에 넣기]를 누르세요.`);
  const cb=$("#oa-cand"); if(cb) cb.scrollIntoView({behavior:"smooth",block:"start"});
}
/* ---------- 1-0. 키워드 고르기 (추천·조사·직접 입력 모두 여기 모아서 체크) ---------- */
const idle=p=>p.st==="예정"&&!p.post; // 아직 글을 안 쓴 계획
function CAND(){ const o=D(); if(!Array.isArray(o.cand)) o.cand=[]; return o.cand; }
function candAdd(r,from){ const C=CAND(), k=String(r.keyword||"").trim().slice(0,30); if(k.length<2) return false; const ex=C.find(c=>c.keyword===k); if(ex){ ex.on=true; return false; }
  C.push({keyword:k,verdict:r.verdict||"",search:r.search||0,topic:r.topic||"",on:true,mine:from==="mine",from}); return true; }
function vCand(ds){
  const C=CAND(), on=C.filter(c=>c.on), have=new Set(D().plan.map(p=>p.keyword));
  const over=on.length-ds.length;
  return `<div class="panel" id="oa-cand" style="margin-top:14px">
    <div class="row between" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">키워드 고르기 <small class="note">${C.length?`${C.length}개 중 ${on.length}개 선택`:"추천을 받거나 직접 넣으세요"}</small></h2>
      ${C.length?`<div class="row" style="gap:6px"><button class="btn sm" type="button" data-oacs="best">최적·가능만</button><button class="btn sm" type="button" data-oacs="none">모두 해제</button><button class="btn sm" type="button" data-oacs="clear">목록 비우기</button></div>`:""}</div>
    <div class="row" style="gap:6px;margin-top:10px;flex-wrap:nowrap"><input id="oa-ck" class="oa-in" maxlength="60" placeholder="내 키워드 직접 넣기 (쉼표로 여러 개)" style="flex:1;min-width:0;margin:0"><button class="btn sm" type="button" id="oa-cadd" style="white-space:nowrap">넣기</button></div>
    ${C.length?`<div class="oa-kl" style="margin-top:10px">${C.map((c,i)=>`<label class="oa-kr oa-cr${c.on?" on":""}"><input type="checkbox" data-oacc="${i}" ${c.on?"checked":""}>
      <div style="flex:1;min-width:0"><b>${E(c.keyword)}</b> ${c.verdict?`<b style="color:${VC[c.verdict]||"inherit"}">${E(c.verdict)}</b>`:`<small class="note">${c.mine?"직접 입력":"미조사"}</small>`}${have.has(c.keyword)?` <small class="note">· 이미 계획에 있음</small>`:""}
      <small class="note">${c.search?`월 ${fmt(c.search)}회`:""}${c.topic?` · ${E(c.topic)}`:""}</small></div>
      <span class="row" style="gap:2px;flex-wrap:nowrap"><button class="btn sm" type="button" data-oacu="${i}" title="위로" ${i?"":"disabled"}>▲</button><button class="btn sm" type="button" data-oacx="${i}" title="목록에서 빼기">✕</button></span></label>`).join("")}</div>`:""}
    ${D().plan.some(idle)?`<label class="row" style="gap:8px;margin-top:10px;font-size:13.5px;flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" id="oa-crep" ${GS().rep!==false?"checked":""} style="width:18px;height:18px;flex:none;margin-top:1px"> <span>지난번에 넣고 아직 글을 안 쓴 계획 <b>${D().plan.filter(idle).length}개</b>는 지우고 새로 짜기 <small class="note">(초안·심의·발행한 글은 그대로)</small></span></label>`:""}
    <p class="oa-sum" style="margin-top:10px">선택 <b>${on.length}개</b> · 올릴 날 <b>${ds.length}일</b>${on.length&&ds.length?` → 위에서부터 ${md(ds[0])}부터 순서대로 배정`:""}${over>0?` · 남는 ${over}개는 날짜 없이 넣음`:""}</p>
    <button class="btn primary" type="button" id="oa-cput" style="width:100%" ${on.length?"":"disabled"}>선택한 ${on.length}개 계획에 넣기</button>
    <p class="note" style="margin:6px 0 0">넣은 뒤에도 [② 내 계획]에서 키워드·날짜를 하나씩 바꾸거나 지울 수 있습니다.</p>
  </div>`; }
function candPut(){ const ds=genDates(GS()), C=CAND(), on=C.filter(c=>c.on); let n=0, i=0, dup=0, gone=0;
  if(GS().rep!==false&&D().plan.some(idle)){ const P=D().plan; gone=P.filter(idle).length; for(let k=P.length-1;k>=0;k--) if(idle(P[k])) P.splice(k,1); }
  const taken=new Set(D().plan.filter(p=>p.date).map(p=>p.date)), free=ds.filter(d=>!taken.has(d));
  for(const c of on){ if(D().plan.some(p=>p.keyword===c.keyword)){ dup++; continue; } addPlan(c); const p=D().plan[D().plan.length-1]; p.date=free[i++]||""; p.topic=c.topic||""; n++; }
  D().cand=C.filter(c=>!c.on);
  FLT="todo"; TAB="do"; render(); const m=$("#oa-dmsg"); if(m) m.textContent=(gone?`안 쓴 기존 계획 ${gone}개를 지우고 `:"")+`${n}편을 계획에 넣었습니다.`+(dup?` (이미 있는 키워드 ${dup}개는 뺐습니다)`:"")+(n>free.length?` 날짜가 모자라 ${n-free.length}편은 날짜 없이 넣었습니다.`:""); }

function keepKw(){ const op=!!($(".oa-more")&&$(".oa-more").open), y=window.scrollY; vPlanMake(); const d=$(".oa-more"); if(d&&op) d.open=true; window.scrollTo(0,y); }
/* ---------- 1-1. 키워드 직접 조사 ---------- */
function vKw(){
  const B=$("#oa-kwbox"); if(!B) return; const L=D().last;
  B.innerHTML=`<div style="margin-top:10px">
    <textarea id="oa-k" class="oa-ta" rows="3" maxlength="800" placeholder="키워드 한 줄에 하나 (최대 20개)">${E(L&&L.input||"")}</textarea>
    <div class="row" style="margin-top:8px;gap:8px;align-items:center;flex-wrap:wrap"><select id="oa-r" class="oa-in" style="width:auto">${[0,5,10,20].map(n=>`<option value="${n}" ${(L&&L.related===n)||(!L&&n===10)?"selected":""}>${n?"연관 "+n+"개 더":"입력한 것만"}</option>`).join("")}</select><button class="btn primary" type="button" id="oa-go" ${BUSY?"disabled":""}>${BUSY?"조사 중…":"조사하기"}</button><span class="note" id="oa-msg"></span></div>
  </div><div id="oa-res"></div>`;
  if(L&&Array.isArray(L.rows)) vRes(L);
}
function vRes(L){
  const R=$("#oa-res"); if(!R) return;
  const inPlan=k=>D().plan.some(p=>p.keyword===k)||CAND().some(c=>c.keyword===k&&c.on);
  R.innerHTML=`<div class="row between" style="margin-top:14px;gap:8px;flex-wrap:wrap"><b>결과 <small class="note">${E((L.at||"").slice(0,10))} · ${L.rows.length}개</small></b><button class="btn sm" type="button" id="oa-addall">최적·가능 모두 고르기</button></div>
    <div class="oa-kl">${L.rows.map((r,i)=>`<div class="oa-kr"><div><b>${E(r.keyword)}</b> <b style="color:${VC[r.verdict]||"inherit"}">${E(r.verdict)}</b><small class="note">월 ${fmt(r.search)}회 · 상위10 제목일치 ${r.hits} · 상위글 ${fmt(r.age)}일</small></div>
      ${inPlan(r.keyword)?`<span class="note">고름</span>`:`<button class="btn sm" type="button" data-oaadd="${i}">고르기</button>`}</div>`).join("")}</div>
    <details class="oa-help" style="margin-top:10px"><summary>판정 기준</summary>
      <ul><li><b>최적</b>: 상위 10개 중 제목에 키워드 그대로 0~3개, 월 검색 100↑</li><li><b>가능</b> 4~6개 · <b>어려움</b> 7~8개 · <b>포화</b> 9~10개 · <b>허수</b> 월 검색 20↓</li></ul></details>`;
}
async function runKw(){
  if(BUSY) return;
  const raw=($("#oa-k")||{}).value||"", rel=parseInt(($("#oa-r")||{}).value,10)||0;
  const kws=[...new Set(raw.split(/[\n,]+/).map(s=>s.trim()).filter(s=>s.length>=2))].slice(0,20);
  const msg=t=>{ const m=$("#oa-msg"); if(m) m.textContent=t; };
  if(!kws.length) return msg("키워드를 한 개 이상 입력하세요.");
  const t0=await tok(); if(!t0) return msg("지사페이지에 다시 로그인해 주세요.");
  BUSY=true; vKw(); $("#oa-k").value=raw;
  let r;
  try{ const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t0,keywords:kws,related:rel})});
    const t=await res.text(); try{ r=JSON.parse(t); }catch(e){ r={ok:false,error:"서버 응답을 읽지 못했습니다. ("+res.status+") 잠시 후 다시 눌러 주세요."}; } }
  catch(e){ r={ok:false,error:"연결에 실패했습니다. 인터넷 연결을 확인해 주세요."}; }
  BUSY=false;
  if(r&&r.ok&&Array.isArray(r.rows)){ D().last={input:raw,related:rel,at:r.at||new Date().toISOString(),rows:r.rows}; vKw(); }
  else { vKw(); $("#oa-k").value=raw; msg((r&&r.error)||"조사하지 못했습니다."); }
}
function addPlan(r){ const P=D().plan; if(P.some(p=>p.keyword===r.keyword)) return false;
  P.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),keyword:r.keyword,verdict:r.verdict,search:r.search,ch:"블로그",date:"",st:"예정",no:"",url:"",memo:"",added:td()}); return true; }

/* ---------- 2. 쓰고 발행 ---------- */
function vDo(){
  const B=$("#oa-body"), P=D().plan;
  P.sort((a,b)=>String(a.date||"9").localeCompare(String(b.date||"9")));
  const L=P.filter(p=>FLT==="all"||(FLT==="done"?p.st==="발행":p.st!=="발행"));
  const today=td();
  const SL={"예정":["쓸 차례","draft"],"초안":["작성중","draft"],"심의중":["심의중","mid"],"발행":["발행","ok"]};
  const act=p=>{ if(p.st==="발행") return p.url?`<a class="btn sm" href="${E(p.url)}" target="_blank" rel="noopener">글 보기</a>`:`<button class="btn sm" type="button" data-oaurl="${p.id}">주소 넣기</button>`;
    return `<button class="btn sm primary" type="button" data-oaw="${p.id}">${p.st==="예정"?"글 쓰기":p.st==="심의중"?"심의번호 넣기":"이어 쓰기"}</button>`; };
  B.innerHTML=`<div class="row between" style="gap:8px;flex-wrap:wrap"><div class="oa-chips" style="margin:0">${[["todo","할 일"],["done","발행 완료"],["all","전체"]].map(([k,t])=>`<button type="button" class="oa-chip${FLT===k?" on":""}" data-oaf="${k}">${t} ${k==="todo"?P.filter(p=>p.st!=="발행").length:k==="done"?P.filter(p=>p.st==="발행").length:P.length}</button>`).join("")}</div>
    <div class="row" style="gap:6px"><input id="oa-nk" class="oa-in" placeholder="키워드 직접 추가" maxlength="30" style="width:150px;margin:0"><button class="btn sm" type="button" id="oa-nadd">추가</button></div></div>
  <p class="note" id="oa-dmsg" style="margin:8px 0 0"></p>
  ${L.length?`<div class="panel oa-plist" style="margin-top:10px">${L.map(p=>{ const s=SL[p.st]||SL["예정"], late=p.date&&p.date<today&&p.st!=="발행"; return `<div class="oa-prow${late?" late":""}" data-oap="${p.id}">
      <span class="d">${md(p.date)}</span>
      <div class="k"><b>${E(p.keyword)}</b>${p.verdict?` <small style="color:${VC[p.verdict]||"inherit"}">${E(p.verdict)}</small>`:""}${p.ch==="카페"?` <small class="note">카페</small>`:""}</div>
      <span class="oa-st ${s[1]}">${s[0]}</span>
      <span class="a">${act(p)}</span>
      <details class="oa-pd"><summary>수정</summary><div class="oa-pf">
        <label>키워드<input data-f="keyword" value="${E(p.keyword)}" maxlength="30"></label>
        <label>올릴 날<input type="date" data-f="date" value="${E(p.date)}"></label>
        <label>채널<select data-f="ch">${["블로그","카페"].map(c=>`<option ${p.ch===c?"selected":""}>${c}</option>`).join("")}</select></label>
        <label>올린 글 주소<input data-f="url" value="${E(p.url)}" placeholder="https://blog.naver.com/…" maxlength="300"></label>
      </div><button class="btn sm" type="button" data-oadel="${p.id}" style="margin-top:8px">계획에서 삭제</button></details>
    </div>`; }).join("")}</div>
    ${P.some(idle)?`<button class="btn sm" type="button" id="oa-idel" style="margin-top:10px">아직 안 쓴 계획 모두 지우기</button>`:""}`
  :`<div class="panel" style="margin-top:12px;text-align:center"><p class="note" style="margin:0 0 10px">${FLT==="done"?"발행한 글이 아직 없습니다.":"할 일이 없습니다."}</p><button class="btn primary" type="button" data-oat="plan">키워드 찾기</button></div>`}`;
}

/* ---------- 3. 내 필수기재 배너 ---------- */
const BN=[["gen","일반·기업"],["rec","리쿠르팅"],["hlt","개인 건강보험"]];
const BNAME=k=>(BN.find(x=>x[0]===k)||BN[0])[1];
function BNS(){ const o=D(); if(!o.banners||typeof o.banners!=="object") o.banners={}; const b=o.banners; if(b.kid&&!b.hlt){ b.hlt=b.kid; } delete b.kid; return b; }
/* 고른 배너가 없으면 등록된 다른 배너를 씀 (하나만 올려도 모든 글에 사용) */
function BIMG(k){ const S=BNS(); k=k==="kid"?"hlt":(k||"gen"); if(S[k]&&S[k].img) return S[k]; for(const [x] of BN) if(S[x]&&S[x].img) return S[x]; return null; }
function vBanner(){
  const B=$("#oa-body"), S=BNS();
  B.innerHTML=`<div class="panel">
    <h2 style="margin:0 0 4px">내 필수기재 배너</h2>
    <p class="note" style="margin:0 0 12px">회사에서 받은 배너 이미지 등록 · 하나만 올리면 모든 글에 같은 배너 사용</p>
    <div class="oa-bgrid">${BN.map(([k,t])=>{ const b=S[k]; return `<div class="oa-bslot">
      <b>${t}</b>
      ${b&&b.img?`<img src="${b.img}" alt="${E(t)} 필수기재 배너"><small class="note">${E(b.name||"")} · ${E(b.at||"")}</small>
        <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm primary" type="button" data-oabc="${k}">이미지 복사</button><button class="btn sm" type="button" data-oabd="${k}">내려받기</button><label class="btn sm" style="cursor:pointer">바꾸기<input type="file" accept="image/png,image/jpeg,image/webp" data-oabu="${k}" hidden></label><button class="btn sm" type="button" data-oabx="${k}">삭제</button></div>`
      :`<label class="oa-bdrop">이미지 올리기 (PNG·JPG)<input type="file" accept="image/png,image/jpeg,image/webp" data-oabu="${k}" hidden></label>`}
    </div>`; }).join("")}</div>
    <span class="note" id="oa-bmsg"></span>
    <details class="oa-help" style="margin-top:12px"><summary>네이버 글에 붙이는 방법</summary>
      <ul><li>글 작성이 끝나면 <b>이미지 복사</b>를 누른 뒤, 네이버 글쓰기 화면 맨 끝을 클릭하고 <b>Ctrl+V</b>(휴대폰은 길게 눌러 붙여넣기)를 누르세요.</li>
      <li>붙여넣기가 안 되면 <b>내려받기</b>로 저장한 뒤 네이버 글쓰기의 사진 버튼으로 올리세요.</li>
      <li>글 만들기의 [심의번호 넣고 복사]에서 글마다 배너를 고를 수 있습니다.</li></ul></details>
  </div>`;
}
function loadImg(file){ return new Promise((ok,no)=>{ if(!file||!/^image\//.test(file.type)) return no(new Error("이미지 파일만 올릴 수 있습니다."));
  if(file.size>8*1024*1024) return no(new Error("8MB 이하 이미지만 올릴 수 있습니다."));
  const rd=new FileReader(); rd.onload=()=>{ const im=new Image(); im.onload=()=>{
      const W=Math.min(1200,im.naturalWidth), H=Math.round(im.naturalHeight*W/im.naturalWidth);
      const c=document.createElement("canvas"); c.width=W; c.height=H; const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,W,H); g.drawImage(im,0,0,W,H);
      let u=c.toDataURL("image/png"); if(u.length>900000) u=c.toDataURL("image/jpeg",0.92); if(u.length>1400000) u=c.toDataURL("image/jpeg",0.8);
      ok(u); }; im.onerror=()=>no(new Error("이미지를 읽지 못했습니다.")); im.src=rd.result; };
  rd.onerror=()=>no(new Error("파일을 읽지 못했습니다.")); rd.readAsDataURL(file); }); }
function toPng(u){ return new Promise((ok,no)=>{ const im=new Image(); im.onload=()=>{ const c=document.createElement("canvas"); c.width=im.naturalWidth; c.height=im.naturalHeight; c.getContext("2d").drawImage(im,0,0); c.toBlob(b=>b?ok(b):no(new Error("변환 실패")),"image/png"); }; im.onerror=()=>no(new Error("이미지 오류")); im.src=u; }); }
async function copyBanner(k,btn){
  const b=BIMG(k); if(!b){ alert("먼저 '내 필수기재 배너'에서 배너 이미지를 올려 주세요."); TAB="banner"; render(); return; }
  try{ if(!navigator.clipboard||!window.ClipboardItem) throw new Error("x"); const blob=await toPng(b.img); await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);
    const o=btn.textContent; btn.textContent="복사됨 — 글 끝에 붙여넣기"; setTimeout(()=>btn.textContent=o,1800); }
  catch(e){ if(confirm("이 브라우저에서는 이미지 복사가 안 됩니다. 내려받아서 사진으로 올릴까요?")) dlBanner(k); }
}
function dlBanner(k){ const b=BIMG(k); if(!b) return; const a=document.createElement("a"); a.href=b.img; a.download="필수기재배너_"+BNAME(k).replace(/·/g,"")+(b.img.indexOf("image/png")>0?".png":".jpg"); document.body.appendChild(a); a.click(); a.remove(); }
window.OA_BANNER=k=>{ const b=BIMG(k); return b&&b.img||""; };

/* ---------- 3-1. 글 만들기 (AI 보험 블로그 글 + 정보 이미지 + 실사 사진) ----------
   흐름: 주제·스타일 → AI 글·이미지 생성 → 심의용 복사 → 심의번호 입력 → 하단 배너 붙여 최종글 복사
   서버: n8n '보잇 보험 블로그 글 AI' (POST boit-blog-write {token, action write|photo}) · 설계사별 하루 글 5편·사진 12장
   저장: ME.oa.posts[] (글·이미지 설계만, 최근 30편) / AI 사진은 이 기기 IndexedDB(boit-oa) — 다른 기기에서는 다시 만들어야 함
   원칙: 이미지 안에 회사·지점·상품명 넣지 않음. 심의번호 없이는 최종글 복사 불가. */
const WAPI="https://daonpartners.app.n8n.cloud/webhook/boit-blog-write";
/* 자주 받는 질문 15개 (n8n '보잇 자주 받는 질문 제목 15개 (AI)', POST boit-qtitles {token, kw}) — 설계사 명의 Q&A용 */
const QAPI="https://daonpartners.app.n8n.cloud/webhook/boit-qtitles";
let QBUSY=false;
async function qGen(){ const kw=String(($("#ow-qkw")||{}).value||"").trim(), box=$("#ow-qlist"); if(!box) return;
  if(kw.length<2){ box.innerHTML=`<p class="note" style="margin:8px 0 0">키워드를 두 글자 이상 넣어 주세요.</p>`; return; }
  if(QBUSY) return; const t0=await tok(); if(!t0){ box.innerHTML=`<p class="note" style="margin:8px 0 0">다시 로그인해 주세요.</p>`; return; }
  QBUSY=true; const b=$("#ow-qgen"); if(b){ b.disabled=true; b.textContent="뽑는 중…"; } box.innerHTML=`<p class="note" style="margin:8px 0 0">질문을 뽑고 있습니다 (10초 안팎)…</p>`;
  let j=null; try{ const r=await fetch(QAPI,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t0,kw})}); j=JSON.parse(await r.text()); }catch(e){ j=null; }
  QBUSY=false; if(b){ b.disabled=false; b.textContent="다시 뽑기"; }
  if(!j||!j.ok||!Array.isArray(j.groups)){ box.innerHTML=`<p class="note" style="margin:8px 0 0;color:var(--bad)">${E((j&&j.error)||"질문을 뽑지 못했습니다. 다시 눌러 주세요.")}</p>`; return; }
  box.innerHTML=j.groups.map(g=>`<div class="oa-qg"><small>${E(g.intent)}</small>${g.items.map(q=>`<button type="button" class="oa-chip" data-owq="${E(q)}">${E(q)}</button>`).join("")}</div>`).join("")+(j.left!=null?`<p class="note" style="margin:6px 0 0">오늘 남은 횟수 ${j.left}회</p>`:"");
  const k=$("#ow-kw"); if(k&&!k.value){ k.value=kw; saveForm(); } }
const GENS=["여성","남성"];
const TYPES=[["전문형","약관·제도 근거 해설"],["상담사례형","상담에서 자주 받는 질문 중심"],["강의형","단계별로 가르치듯"],["친근형","이웃에게 말하듯 쉽게"],["뉴스해설형","제도 변경·발표 풀이"]];
const THEMES={navy:["네이비","#1f3a68","#2c5aa0","#f08a24","#f3f6fb"],green:["그린","#1d5c4a","#2f8a6c","#f2b134","#eef7f2"],coral:["코랄","#a8474a","#df7a68","#ffcf66","#fdf1ee"],purple:["퍼플","#4b3a8c","#7a5cc8","#ffb547","#f4f1fb"],pink:["로즈","#a3445f","#d9789a","#ffd27a","#fcf0f4"],brown:["브라운","#5e4634","#9a7655","#e7b765","#f8f3ec"],charcoal:["차콜","#262a31","#4a515c","#e9b44c","#f2f3f5"],sky:["스카이","#1d5fa8","#3b8fd9","#ffc94d","#eef5fc"],mint:["민트","#127a72","#2fb3a3","#ffb74d","#ecf8f6"],orange:["오렌지","#b4531a","#ef8a3c","#2f6db5","#fff3ea"]};
const CHS=["블로그","카페"], LENS=[["짧게","1,200~1,500자"],["보통","1,800~2,500자"],["길게","2,800~3,500자"]];
const WDEF={gender:"여성",type:"전문형",theme:"navy",ch:"블로그",len:"보통",ni:"5",np:"2"};
const DISC="※ 이 글은 보험설계사(모집종사자)의 개인 의견이며, 구체적인 보장 내용은 해당 상품의 약관과 상품설명서를 반드시 확인하시기 바랍니다.";
let WCUR=null, WBUSY=false, PHB={};
/* 내 이미지 (2026-11-19 대표 요청): 글 어디든 내가 가진 이미지를 직접 넣기. 블록 {t:"uimg",id,cap}, 파일은 이 기기 IndexedDB "<글id>_<id>" */
let UIMG={}, UIMODE=false, UIAT=null;
function POSTS(){ const o=D(); if(!Array.isArray(o.posts)) o.posts=[]; return o.posts; }
function curPost(){ return POSTS().find(p=>p.id===WCUR)||null; }
/* IndexedDB (사진) */
const IDB={db:null,open(){ if(this.db) return Promise.resolve(this.db); return new Promise((ok,no)=>{ try{ const r=indexedDB.open("boit-oa",1); r.onupgradeneeded=()=>r.result.createObjectStore("ph"); r.onsuccess=()=>{ this.db=r.result; ok(this.db); }; r.onerror=()=>no(r.error); }catch(e){ no(e); } }); },
  put(k,v){ return this.open().then(db=>new Promise(ok=>{ const t=db.transaction("ph","readwrite"); t.objectStore("ph").put(v,k); t.oncomplete=()=>ok(true); t.onerror=()=>ok(false); })).catch(()=>false); },
  get(k){ return this.open().then(db=>new Promise(ok=>{ const r=db.transaction("ph").objectStore("ph").get(k); r.onsuccess=()=>ok(r.result||null); r.onerror=()=>ok(null); })).catch(()=>null); },
  del(k){ return this.open().then(db=>{ db.transaction("ph","readwrite").objectStore("ph").delete(k); }).catch(()=>{}); } };
async function loadPhotos(p){ if(!p||!p.out) return; for(let n=1;n<=(p.out.photos||[]).length;n++){ const k=p.id+"_"+n; if(!PHB[k]){ const v=await IDB.get(k); if(v) PHB[k]=v; } }
  for(const b of (p.out.blocks||[])){ if(b.t==="uimg"){ const k=p.id+"_"+b.id; if(!UIMG[k]){ const v=await IDB.get(k); if(v) UIMG[k]=v; } } } }
function shrinkImg(file){ return new Promise((ok,no)=>{ const fr=new FileReader(); fr.onload=()=>{ const im=new Image(); im.onload=()=>{ const M=1600, r=Math.min(1,M/Math.max(im.width,im.height)), c=document.createElement("canvas"); c.width=Math.round(im.width*r); c.height=Math.round(im.height*r); const x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height); x.drawImage(im,0,0,c.width,c.height); ok(c.toDataURL("image/jpeg",0.88)); }; im.onerror=()=>no(new Error("img")); im.src=fr.result; }; fr.onerror=()=>no(fr.error); fr.readAsDataURL(file); }); }
async function addUimg(file){ const p=curPost(); if(!p||!p.out||UIAT==null) return; if(!/^image\//.test(file.type)){ alert("이미지 파일만 넣을 수 있습니다."); return; }
  let u; try{ u=await shrinkImg(file); }catch(e){ alert("이미지를 읽지 못했습니다."); return; }
  const id="u"+Date.now().toString(36), k=p.id+"_"+id; UIMG[k]=u; await IDB.put(k,u);
  p.out.blocks.splice(UIAT+1,0,{t:"uimg",id,cap:""}); UIAT=null; drawPost(p); }

/* 정보 이미지 (캔버스) — 회사명 없음, 색상 테마 */
const CF='Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
/* 글씨체 (2026-11-19): 모두 Google Fonts 무료 글꼴(SIL 오픈 폰트 라이선스, 상업적 사용 가능). one=굵기 하나뿐인 글꼴 */
const FONTS=[["basic","기본",CF],["serif","명조",'"Noto Serif KR",serif'],["bold","굵은 제목",'"Black Han Sans",sans-serif',1],["dohyeon","도현",'"Do Hyeon",sans-serif',1],["round","둥근",'"Jua",sans-serif',1],["gowun","고운돋움",'"Gowun Dodum",sans-serif',1],["hand","손글씨",'"Nanum Pen Script",cursive',1]];
const FONTOF=k=>FONTS.find(f=>f[0]===k)||FONTS[0];
(function(){ try{ if(document.getElementById("oa-fonts")) return; const l=document.createElement("link"); l.id="oa-fonts"; l.rel="stylesheet"; l.href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700;900&family=Black+Han+Sans&family=Do+Hyeon&family=Jua&family=Gowun+Dodum&family=Nanum+Pen+Script&display=swap"; document.head.appendChild(l); }catch(e){} })();
async function loadFont(p){ try{ const st=stOf(p), F=FONTOF(st.font); if(F[0]==="basic"||!document.fonts||!p||!p.out) return false;
  const txt=(p.out.images||[]).map(i=>[i.label,i.title,i.sub].concat(i.items||[]).concat(i.left?[i.left.title].concat(i.left.items||[]):[]).concat(i.right?[i.right.title].concat(i.right.items||[]):[]).join(" ")).join(" ")+"✓0123456789";
  const key=F[0]+"|"+txt; loadFont.done=loadFont.done||{}; if(loadFont.done[key]) return false;
  const fam=F[2].split(",")[0]; await Promise.all(["400","500","700","800"].map(w=>document.fonts.load(`${F[3]?"400":w} 40px ${fam}`,txt))); loadFont.done[key]=1; return true; }catch(e){ return false; } }
function wl(x,t,w){ const out=[]; String(t||"").split("\n").forEach(par=>{ let cur=""; Array.from(par).forEach(ch=>{ const s=cur+ch; if(x.measureText(s).width>w&&cur){ const sp=cur.lastIndexOf(" "); if(sp>0&&cur.length-sp<10){ out.push(cur.slice(0,sp)); cur=cur.slice(sp+1)+ch; } else { out.push(cur); cur=ch; } } else cur=s; }); out.push(cur); }); return out; }
function dt(x,t,X,Y,w,lh,max){ let ls=wl(x,t,w); if(max&&ls.length>max){ ls=ls.slice(0,max); ls[max-1]=ls[max-1].slice(0,-1)+"…"; } ls.forEach((l,i)=>x.fillText(l,X,Y+i*lh)); return ls.length*lh; }
function rr(x,X,Y,w,h,r){ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+w,Y,X+w,Y+h,r); x.arcTo(X+w,Y+h,X,Y+h,r); x.arcTo(X,Y+h,X,Y,r); x.arcTo(X,Y,X+w,Y,r); x.closePath(); }
/* 정보 이미지 (캔버스) — 비율·컨셉·색상·배경 선택 (2026-11-18). 회사명 없음. AI 비용 없음 (브라우저에서 그림) */
const RATIOS=[["sq","정사각 1:1",1080,1080],["pt","세로 4:5",1080,1350],["ls","가로 3:2",1200,800],["wd","와이드 16:9",1280,720]];
const CONCEPTS=[["grad","그라데이션"],["mini","미니멀"],["pastel","파스텔 카드"],["paper","노트"],["bold","꽉 찬 단색"],["dark","다크"]];
const BGS=[["plain","무늬 없음"],["dot","도트"],["grid","격자"],["wave","물결"],["photo","내 사진"]];
const DES=["theme","concept","ratio","bg","bgid","dim","font"];
const BGIMG={};
/* 내 배경 모음 (2026-11-18): 설계사가 가진 배경 이미지를 올려 두고 글마다 골라 씀. 이미지 = 이 기기 IndexedDB(bgl_id), 목록 = ME.oa.bglist */
const BGL={}, BGLURL={}; const DIMS=[["강","진하게"],["중","보통"],["약","연하게"],["0","덮지 않음"]];
function BGLIST(){ const o=D(); if(!Array.isArray(o.bglist)) o.bglist=[]; return o.bglist; }
let BGLOADING=false;
async function loadBgl(){ if(BGLOADING) return false; BGLOADING=true; let n=0;
  for(const b of BGLIST()){ if(BGL[b.id]) continue; const u=await IDB.get("bgl_"+b.id); if(!u) continue; BGLURL[b.id]=u;
    await new Promise(ok=>{ const im=new Image(); im.onload=()=>{ BGL[b.id]=im; n++; ok(); }; im.onerror=ok; im.src=u; }); }
  BGLOADING=false; return n>0; }
function bgImgOf(st,pid){ st=dstyle(st); if(st.bg!=="photo") return null; return (st.bgid&&BGL[st.bgid])||(pid&&BGIMG[pid])||null; }
function dstyle(st){ return Object.assign({theme:"navy",concept:"grad",ratio:"sq",bg:"plain",dim:"중",font:"basic"},st||{}); }
function card(spec,stIn,img){
  const st=dstyle(typeof stIn==="string"?{theme:stIn}:stIn), T=THEMES[st.theme]||THEMES.navy, A=T[1],B=T[2],O=T[3],S=T[4], C=st.concept;
  const R=RATIOS.find(r=>r[0]===st.ratio)||RATIOS[0], W=R[2], H=R[3], s=Math.min(W/1080,H/900), M=Math.round(80*Math.min(W/1080,1.15)), CW=W-2*M;
  const c=document.createElement("canvas"); c.width=W; c.height=H; const x=c.getContext("2d"); const k=spec.kind, cover=k==="thumb"||k==="cta";
  const it=(spec.items||[]).slice(0,W>H?5:6), dark=C==="dark"||C==="bold"||(C==="grad"&&cover);
  const EL=spec.el||{}, INK=(EL.items&&EL.items.c)||(dark?"#fff":"#1b2333"), MU=dark?"rgba(255,255,255,.78)":"#5b6577", TT=dark?"#fff":(C==="paper"?"#1b2333":A);
  const PANEL=C==="dark"||C==="bold"?"rgba(255,255,255,.10)":C==="pastel"?"#fff":C==="paper"?"rgba(255,255,255,.7)":S;
  const FN=FONTOF(st.font), F=(w,sz)=>`${FN[3]?400:w} ${Math.round(sz*(FN[0]==="hand"?1.18:1)*s)}px ${FN[2]}`;
  // 1) 바탕
  if(C==="grad"&&cover){ const g=x.createLinearGradient(0,0,W,H); g.addColorStop(0,A); g.addColorStop(1,B); x.fillStyle=g; }
  else x.fillStyle=C==="dark"?"#14171d":C==="bold"?A:C==="paper"?"#fbf7ee":C==="pastel"?S:"#fff";
  x.fillRect(0,0,W,H);
  if(img&&st.bg==="photo"){ const r=Math.max(W/img.naturalWidth,H/img.naturalHeight), iw=img.naturalWidth*r, ih=img.naturalHeight*r; x.drawImage(img,(W-iw)/2,(H-ih)/2,iw,ih);
    const a=({"강":1,"중":0.72,"약":0.42,"0":0}[st.dim]??0.72); if(a>0){ x.fillStyle=dark?(C==="grad"?`rgba(20,24,40,${(0.68*a).toFixed(2)})`:`rgba(0,0,0,${(0.66*a).toFixed(2)})`):`rgba(255,255,255,${(0.88*a).toFixed(2)})`; x.fillRect(0,0,W,H); } }
  // 2) 무늬
  const pc=dark?"rgba(255,255,255,.09)":C==="paper"?"rgba(0,0,0,.06)":A+"1a";
  if(st.bg==="dot"){ x.fillStyle=pc; for(let yy=20*s;yy<H;yy+=40*s) for(let xx=20*s;xx<W;xx+=40*s){ x.beginPath(); x.arc(xx,yy,3.2*s,0,7); x.fill(); } }
  else if(st.bg==="grid"){ x.strokeStyle=pc; x.lineWidth=1.5; for(let xx=0;xx<W;xx+=54*s){ x.beginPath(); x.moveTo(xx,0); x.lineTo(xx,H); x.stroke(); } for(let yy=0;yy<H;yy+=54*s){ x.beginPath(); x.moveTo(0,yy); x.lineTo(W,yy); x.stroke(); } }
  else if(st.bg==="wave"){ x.strokeStyle=pc; x.lineWidth=3*s; for(let j=0;j<6;j++){ x.beginPath(); for(let xx=0;xx<=W;xx+=10){ const yy=H-60*s-j*34*s+Math.sin(xx/(90*s)+j)*16*s; xx?x.lineTo(xx,yy):x.moveTo(xx,yy); } x.stroke(); } }
  if(C==="paper"&&st.bg!=="grid"){ x.strokeStyle="rgba(0,0,0,.05)"; x.lineWidth=1.5; for(let yy=60*s;yy<H;yy+=48*s){ x.beginPath(); x.moveTo(0,yy); x.lineTo(W,yy); x.stroke(); } }
  // 2-1) 글씨 위치 직접 옮기기 (2026-11-19): 배경은 그대로, 글씨·상자 묶음만 이동
  { const ox=(+spec.dx||0)*W, oy=(+spec.dy||0)*H; if(ox||oy) x.translate(ox,oy); }
  /* 줄별 위치·색 (2026-11-19): spec.el = {label|bar|title|sub|items: {dx,dy,c}} */
  const at=(nm,fn)=>{ const e=EL[nm]||{}; x.save(); x.translate((+e.dx||0)*W,(+e.dy||0)*H); fn(e.c||null); x.restore(); };
  // 3) 표지·마지막 장
  if(cover){
    let X0=M, CWc=CW;
    if(C==="pastel"){ x.save(); x.shadowColor="rgba(0,0,0,.08)"; x.shadowBlur=30*s; x.fillStyle="#fff"; rr(x,M*0.5,M*0.5,W-M,H-M,36*s); x.fill(); x.restore(); X0=M*1.3; CWc=W-2*X0; }
    if(C==="grad"&&st.bg==="plain"){ x.fillStyle="rgba(255,255,255,.07)"; x.beginPath(); x.arc(W-150*s,170*s,260*s,0,7); x.fill(); x.beginPath(); x.arc(120*s,H-100*s,180*s,0,7); x.fill(); }
    if(C==="dark"){ const g=x.createRadialGradient(W*0.85,H*0.15,0,W*0.85,H*0.15,W*0.6); g.addColorStop(0,A+"aa"); g.addColorStop(1,"rgba(0,0,0,0)"); x.fillStyle=g; x.fillRect(0,0,W,H); }
    if(C==="mini"){ x.fillStyle=A; x.fillRect(0,0,16*s,H); }
    const lim=W>H?2:4; let y=H*(W>H?0.2:0.23);
    if(spec.label){ const y0=y; at("label",c=>{ x.fillStyle=c||O; x.font=F(700,34); x.fillText(spec.label,X0,y0); }); }
    y+=40*s; { const y0=y; at("bar",c=>{ x.fillStyle=c||O; x.fillRect(X0,y0,120*s,12*s); }); } y+=130*s;
    const ts=k==="thumb"?80:68; { const y0=y; let h=0; at("title",c=>{ x.fillStyle=C==="paper"?"#1b2333":C==="mini"||C==="pastel"?A:"#fff"; x.font=F(800,ts);
      if(C==="paper"){ const ls=wl(x,spec.title,CWc).slice(0,lim); x.fillStyle=O+"66"; ls.forEach((l,i)=>x.fillRect(X0-6*s,y0+i*ts*1.25*s-ts*0.42*s,x.measureText(l).width+12*s,ts*0.5*s)); x.fillStyle="#1b2333"; }
      if(c) x.fillStyle=c; h=dt(x,spec.title,X0,y0,CWc,ts*1.25*s,lim); }); y+=h+16*s; }
    if(spec.sub){ const y0=y; let h=0; at("sub",c=>{ x.fillStyle=c||(C==="mini"||C==="pastel"||C==="paper"?"#5b6577":"rgba(255,255,255,.88)"); x.font=F(500,38); h=dt(x,spec.sub,X0,y0,CWc,54*s,W>H?2:3); }); y+=h+18*s; }
    if(k==="cta"&&it.length){ const y0=y; at("items",c=>{ let yy=y0; x.font=F(600,34); it.slice(0,W>H?2:3).forEach(t=>{ x.fillStyle=dark?"rgba(255,255,255,.15)":A+"14"; rr(x,X0,yy,CWc,76*s,38*s); x.fill(); x.fillStyle=c||(dark?"#fff":"#1b2333"); x.fillText("✓  "+t,X0+36*s,yy+50*s); yy+=96*s; }); }); }
    return c; }
  // 4) 본문 장: 제목
  let top;
  if(C==="grad"){ const hb=Math.round(230*s); x.fillStyle=A; x.fillRect(0,0,W,hb); x.fillStyle=O; x.fillRect(0,hb,W,10*s); at("title",c=>{ x.fillStyle=c||"#fff"; x.font=F(800,54); dt(x,spec.title,M,hb*0.55,CW,66*s,2); }); top=hb+70*s; }
  else { if(C==="mini"){ x.fillStyle=A; x.fillRect(0,0,16*s,H); } let th=0; at("title",c=>{ x.fillStyle=c||TT; x.font=F(800,54); th=dt(x,spec.title,M,M+50*s,CW,66*s,2); x.fillStyle=O; x.fillRect(M,M+50*s+th-30*s,90*s,10*s); }); top=M+th+80*s; }
  { const e=EL.items||{}; x.translate((+e.dx||0)*W,(+e.dy||0)*H); }
  const AH=H-top-M*0.7, n=Math.max(it.length,1);
  if(k==="checklist"){ const gap=Math.min(150*s,AH/n);
    it.forEach((t,i)=>{ const y=top+i*gap, h=gap-18*s, cy=y+h/2; x.fillStyle=PANEL; rr(x,M,y,CW,h,18*s); x.fill(); x.fillStyle=O; x.beginPath(); x.arc(M+55*s,cy,Math.min(26*s,h*0.38),0,7); x.fill();
      x.strokeStyle="#fff"; x.lineWidth=6*s; x.lineCap="round"; x.beginPath(); x.moveTo(M+43*s,cy+1); x.lineTo(M+52*s,cy+11*s); x.lineTo(M+69*s,cy-10*s); x.stroke();
      x.fillStyle=INK; x.font=F(600,Math.min(36,h/s*0.42)); dt(x,t,M+105*s,cy+12*s,CW-130*s,42*s,1); }); }
  else if(k==="steps"){ const g=Math.min(165*s,AH/n);
    x.strokeStyle=dark?"rgba(255,255,255,.2)":"#e3e8f0"; x.lineWidth=6*s; x.beginPath(); x.moveTo(M+50*s,top+30*s); x.lineTo(M+50*s,top+30*s+(it.length-1)*g); x.stroke();
    it.forEach((t,i)=>{ const y=top+i*g; x.fillStyle=i===it.length-1?O:(C==="bold"?"#fff":A); x.beginPath(); x.arc(M+50*s,y+30*s,32*s,0,7); x.fill(); x.fillStyle=C==="bold"&&i!==it.length-1?A:"#fff"; x.font=F(800,32); x.textAlign="center"; x.fillText(String(i+1),M+50*s,y+41*s); x.textAlign="left";
      const pr=String(t).split(/\s+[—-]\s+/); x.fillStyle=INK; x.font=F(700,36); x.fillText(pr[0],M+110*s,y+32*s); if(pr[1]&&g>90*s){ x.fillStyle=MU; x.font=F(400,29); dt(x,pr[1],M+110*s,y+74*s,CW-130*s,36*s,1); } }); }
  else if(k==="compare"){ const cw=(CW-20*s)/2; [spec.left||{},spec.right||{}].forEach((col,ci)=>{ const cx=M+ci*(cw+20*s), cc=ci?O:(C==="bold"?"rgba(255,255,255,.22)":A);
      x.fillStyle=cc; rr(x,cx,top,cw,92*s,18*s); x.fill(); x.fillStyle="#fff"; x.font=F(700,36); x.textAlign="center"; x.fillText(col.title||"",cx+cw/2,top+59*s); x.textAlign="left";
      x.fillStyle=PANEL; rr(x,cx,top+112*s,cw,AH-112*s,18*s); x.fill(); let y=top+180*s; x.fillStyle=INK; x.font=F(500,32); (col.items||[]).slice(0,5).forEach(t=>{ if(y<top+AH-30*s) y+=dt(x,"· "+t,cx+30*s,y,cw-60*s,42*s,2)+30*s; }); }); }
  else { const cw=(CW-20*s)/2, chh=Math.min(330*s,(AH-20*s)/2);
    it.slice(0,4).forEach((t,i)=>{ const cx=M+(i%2)*(cw+20*s), cy=top+Math.floor(i/2)*(chh+20*s), pr=String(t).split(/\s+[—-]\s+/);
      x.fillStyle=PANEL; rr(x,cx,cy,cw,chh,22*s); x.fill(); x.fillStyle=O; x.fillRect(cx+30*s,cy+36*s,60*s,8*s);
      x.fillStyle=C==="bold"||C==="dark"?"#fff":A; x.font=F(800,37); const hh=dt(x,pr[0],cx+30*s,cy+96*s,cw-60*s,46*s,2); if(pr[1]){ x.fillStyle=INK; x.font=F(400,29); dt(x,pr[1],cx+30*s,cy+96*s+hh+12*s,cw-60*s,40*s,Math.max(1,Math.floor((chh-hh-120*s)/(40*s)))); } }); }
  return c; }
function stOf(p){ return dstyle(p&&p.style); }
/* 글씨 위치·색: 정보 이미지마다. 전체 = spec.dx·dy, 줄별 = spec.el[줄].dx·dy·c (그림 폭·높이 대비 비율, -0.45~0.45) */
let MVSEL={}, TXOPEN={};
/* 글씨 문구 고치기: 이미지 종류별로 고칠 수 있는 칸 [필드, 이름, 최대 글자, 여러 줄] */
function txFields(s){ const k=s.kind; if(k==="thumb") return [["label","작은 제목",16],["title","큰 제목",40],["sub","설명",60]];
  if(k==="cta") return [["title","큰 제목",40],["sub","설명",60],["items","항목",40,1]];
  if(k==="compare") return [["title","제목",40],["left.title","왼쪽 제목",24],["left.items","왼쪽 항목",40,1],["right.title","오른쪽 제목",24],["right.items","오른쪽 항목",40,1]];
  return [["title","제목",40],["items","항목",60,1]]; }
function txVal(s,f){ const [a,b]=f.split("."), o=b?(s[a]||{}):s, v=o[b||a]; return Array.isArray(v)?v.join("\n"):String(v==null?"":v); }
function txSet(s,f,val){ const [a,b]=f.split("."); let o=s; if(b){ s[a]=s[a]||{title:"",items:[]}; o=s[a]; } const key=b||a;
  o[key]=/items$/.test(f)?String(val).split("\n").map(x=>x.trim()).filter(Boolean).slice(0,8):String(val).replace(/\n/g," ").slice(0,80); }
const TCOLORS=[["","기본"],["#ffffff","흰색"],["#1b2333","검정"],["#0B1E42","네이비"],["#ff8a1f","주황"],["#e03131","빨강"],["#ffd43b","노랑"],["#20c997","민트"]];
function elTargets(s){ const cover=s.kind==="thumb"||s.kind==="cta"; return [["all","전체"]].concat(cover?[s.label?["label","작은 제목"]:null,["bar","줄"],["title","큰 제목"],s.sub?["sub","설명"]:null,s.kind==="cta"?["items","항목"]:null].filter(Boolean):[["title","제목"],["items","내용"]]); }
function redrawCard(p,n){ const s=(p.out.images||[])[n-1], old=$(`canvas[data-owcard="${n}"]`); if(!s||!old) return; const c=card(s,stOf(p),bgImgOf(p.style,p.id)); c.style.cssText=old.style.cssText; old.replaceWith(c); dragCard(p,n,c); }
function elOf(s,sel){ if(sel==="all") return s; s.el=s.el||{}; return s.el[sel]||(s.el[sel]={}); }
function moveCard(p,n,dx,dy,abs){ const s=(p.out.images||[])[n-1]; if(!s) return; const cl=v=>Math.max(-0.45,Math.min(0.45,Math.round(v*1000)/1000)), sel=MVSEL[n]||"all", o=elOf(s,sel);
  if(abs){ if(sel==="all"){ s.dx=0; s.dy=0; delete s.el; } else { o.dx=0; o.dy=0; } } else { o.dx=cl((+o.dx||0)+dx); o.dy=cl((+o.dy||0)+dy); }
  if(abs) drawPost(p); else redrawCard(p,n); }
function colorCard(p,n,col){ const s=(p.out.images||[])[n-1]; if(!s) return; const sel=MVSEL[n]||"all";
  const set=nm=>{ s.el=s.el||{}; const o=s.el[nm]||(s.el[nm]={}); if(col) o.c=col; else delete o.c; };
  if(sel==="all") elTargets(s).filter(t=>t[0]!=="all"&&t[0]!=="bar").forEach(t=>set(t[0])); else set(sel); drawPost(p); }
function dragCard(p,n,c){ c.dataset.owcard=n; c.style.cursor="move"; c.style.touchAction="none"; c.title="끌어서 글씨 위치 옮기기";
  let st=null, raf=0;
  c.addEventListener("pointerdown",e=>{ const s=(p.out.images||[])[n-1]; if(!s) return; const o=elOf(s,MVSEL[n]||"all"); st={o,x:e.clientX,y:e.clientY,dx:+o.dx||0,dy:+o.dy||0,w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height}; try{ c.setPointerCapture(e.pointerId); }catch(er){} e.preventDefault(); });
  c.addEventListener("pointermove",e=>{ if(!st) return; const s=(p.out.images||[])[n-1], o=st.o; o.dx=Math.max(-0.45,Math.min(0.45,st.dx+(e.clientX-st.x)/st.w)); o.dy=Math.max(-0.45,Math.min(0.45,st.dy+(e.clientY-st.y)/st.h));
    if(!raf) raf=requestAnimationFrame(()=>{ raf=0; const nc=card(s,stOf(p),bgImgOf(p.style,p.id)); const g=c.getContext("2d"); g.clearRect(0,0,c.width,c.height); g.drawImage(nc,0,0); }); });
  const end=()=>{ if(!st) return; const o=st.o; st=null; o.dx=Math.round((+o.dx||0)*1000)/1000; o.dy=Math.round((+o.dy||0)*1000)/1000; };
  c.addEventListener("pointerup",end); c.addEventListener("pointercancel",end); }
function cardURL(p,n){ const s=(p.out.images||[])[n-1]; return s?card(s,stOf(p),bgImgOf(p.style,p.id)).toDataURL("image/png"):""; }
async function loadBg(p){ if(!p||BGIMG[p.id]) return false; const u=await IDB.get("bg_"+p.id); if(!u) return false; return new Promise(ok=>{ const im=new Image(); im.onload=()=>{ BGIMG[p.id]=im; ok(true); }; im.onerror=()=>ok(false); im.src=u; }); }
function designHTML(st,live){ st=dstyle(st); const ch=(f,v,t)=>`<button type="button" class="oa-chip${st[f]===v?" on":""}" data-ws="${f}" data-v="${v}">${t}</button>`;
  return `<div class="oa-srow"><b>비율</b>${RATIOS.map(r=>ch("ratio",r[0],r[1])).join("")}</div>
  <div class="oa-srow"><b>컨셉</b>${CONCEPTS.map(r=>ch("concept",r[0],r[1])).join("")}</div>
  <div class="oa-srow"><b>글씨체</b>${FONTS.map(f=>`<button type="button" class="oa-chip${st.font===f[0]?" on":""}" data-ws="font" data-v="${f[0]}" style="font-family:${E(f[2])}">${f[1]}</button>`).join("")}</div>
  <div class="oa-srow"><b>색상</b>${Object.entries(THEMES).map(([t,c])=>`<button type="button" class="oa-sw${st.theme===t?" on":""}" data-ws="theme" data-v="${t}" style="--a:${c[1]};--b:${c[2]};--o:${c[3]}"><i></i>${c[0]}</button>`).join("")}</div>
  <div class="oa-srow"><b>배경</b>${BGS.filter(b=>b[0]!=="photo").map(b=>ch("bg",b[0],b[1])).join("")}</div>
  <div class="oa-srow oa-bgl"><b>내 배경</b>${BGLIST().map(b=>`<span class="oa-bgt${st.bg==="photo"&&st.bgid===b.id?" on":""}"><button type="button" data-ws="bgid" data-v="${b.id}" title="${E(b.name||"")}">${BGLURL[b.id]?`<img src="${BGLURL[b.id]}" alt="">`:"…"}</button><button type="button" class="x" data-owbgx="${b.id}" title="배경 지우기">×</button></span>`).join("")}<label class="oa-chip" style="cursor:pointer">＋ 배경 이미지 올리기<input type="file" accept="image/*" data-owbgu hidden></label><small class="note">이 기기에 저장 · ${BGLIST().length}/12</small></div>
  ${st.bg==="photo"?`<div class="oa-srow"><b>글씨 잘 보이게</b>${DIMS.map(([v,t])=>ch("dim",v,t)).join("")}</div>`:""}`; }

const KDEF={recruit:{ins:"1",len:"보통",ni:"3",np:"1",rtopic:"생존",rtarget:"전체",rch:"카페",type:"친근형"},blog:{ins:"1",len:"보통",ni:"5",np:"2"},cafe:{ins:"1",len:"보통",ni:"2",np:"1"},qa:{ins:"1",len:"짧게",ni:"0",np:"0"},review:{ins:"0",len:"짧게",ni:"0",np:"0"}};
const NIMAX={blog:6,cafe:6,qa:2,review:1,recruit:6}, NPMAX={blog:3,cafe:3,qa:1,review:0,recruit:3};
function curKind(){ const p=curPost(); return p?kindOf(p):WKIND; }
function kst(k){ const o=D(); if(!o.wst||typeof o.wst!=="object") o.wst={}; o.wst[k]=Object.assign({},WDEF,D().wstyle||{},KDEF[k],o.wst[k]||{}); return o.wst[k]; }
function DRAFT(k){ const o=D(); if(!o.wdraft||typeof o.wdraft!=="object") o.wdraft={}; return o.wdraft[k]||(o.wdraft[k]={}); }
const FIELDS=[["kw","ow-kw"],["kw2","ow-kw2"],["facts","ow-facts"],["target","ow-tg"],["q","ow-q"],["qsrc","ow-qsrc"],["rv","ow-rv"],["paid","ow-paid"],["paidw","ow-paidw"]];
function saveForm(){ const p=curPost(), o=p||DRAFT(curKind()); FIELDS.forEach(([f,id])=>{ const e=$("#"+id); if(e) o[f]=String(e.value||"").trim(); }); const a=$("#ow-agree"); if(a) o.agree=a.checked; return o; }
function vWrite(){
  const B=$("#oa-body"), p=curPost(), k=curKind(), K=KINDS[k], st=p&&p.style?Object.assign({},kst(k),p.style,p.pend||{}):kst(k);
  const pre=window.__OAKW||{}; window.__OAKW=null;
  const v=p||Object.assign(DRAFT(k),pre.kw?{kw:pre.kw}:{});
  const rev=p?needRev(p):(k==="qa"||((k==="blog"||k==="cafe"||k==="recruit")&&st.ins!=="0"));
  const chip=(f,val,t,on)=>`<button type="button" class="oa-chip${on?" on":""}" data-ws="${f}" data-v="${E(val)}">${t}</button>`;
  const nums=(f,max,cur)=>Array.from({length:max+1},(_,n)=>chip(f,String(n),n+"장",String(cur)===String(n))).join("");
  let n=0; const sec=t=>`<div class="oa-sec"><span class="no">${++n}</span><b>${t}</b></div>`;
  const kwBox=(req)=>`<div class="oa-wgrid">
      <label>${req?"주제 키워드 <small class=\"note\">(필수)</small>":"검색 키워드 <small class=\"note\">(선택)</small>"}<span class="row" style="gap:6px;flex-wrap:nowrap"><input id="ow-kw" maxlength="30" value="${E(v.kw||"")}" placeholder="예) 70대 간병인보험" style="flex:1;min-width:0"><button class="btn sm" type="button" id="ow-kwr">추천 보기</button></span></label>
      ${req?`<label>보조 키워드 <small class="note">(선택 · 쉼표로)</small><input id="ow-kw2" maxlength="120" value="${E(v.kw2||"")}" placeholder="예) 간병인 비용, 가입 나이"></label>`:""}
    </div><div id="ow-kwlist"></div>`;
  let form="";
  if(k==="blog"||k==="cafe"){
    form=sec("어떤 글인가요?")+`<div class="oa-chips">${chip("ins","1","보험 글 <small>심의 받고 게시</small>",st.ins!=="0")}${chip("ins","0","생활·정보 글 <small>보험 내용 없음 · 바로 게시</small>",st.ins==="0")}</div>`
      +sec("키워드")+kwBox(true)
      +sec("말투")+`<div class="oa-srow"><b>글쓴이</b>${GENS.map(g=>chip("gender",g,g,st.gender===g)).join("")}</div><div class="oa-srow"><b>글 유형</b>${TYPES.map(([t,d])=>chip("type",t,`${t} <small>${d}</small>`,st.type===t)).join("")}</div>`
      +sec("분량·이미지")+`<div class="oa-srow"><b>글 길이</b>${LENS.map(([l,d])=>chip("len",l,`${l} <small>${d}</small>`,st.len===l)).join("")}</div>
        <div class="oa-srow"><b>정보 이미지</b>${nums("ni",NIMAX[k],st.ni)}<small class="note">무료</small></div>
        <div class="oa-srow"><b>실사 사진</b>${nums("np",NPMAX[k],st.np)}<small class="note">AI 생성</small></div>
        ${+st.ni>0?`<details class="oa-help oa-des"${p?"":" open"}><summary>🎨 정보 이미지 디자인 <small>(글 만든 뒤에도 바로 바꿀 수 있음 · 무료)</small></summary>${designHTML(st,false)}</details>`:""}`;
  } else if(k==="recruit"){
    form=sec("어떤 글인가요?")+`<div class="oa-chips">${chip("ins","1","회사 심의 받기 <small>회사 내규상 리쿠르팅 광고도 심의 대상이면</small>",st.ins!=="0")}${chip("ins","0","심의 없이 <small>바로 게시</small>",st.ins==="0")}</div>`
      +sec("주제")+`<div class="oa-chips">${RTOPICS.map(([v,t])=>chip("rtopic",v,t,st.rtopic===v)).join("")}</div>`
      +`<div class="oa-srow"><b>모집 대상</b>${RTARGETS.map(t=>chip("rtarget",t,t,st.rtarget===t)).join("")}</div>`
      +`<div class="oa-srow"><b>올릴 곳</b>${["카페","블로그"].map(t=>chip("rch",t,t,(st.rch||"카페")===t)).join("")}</div>`
      +sec("키워드")+kwBox(true)
      +sec("말투")+`<div class="oa-srow"><b>글쓴이</b>${GENS.map(g=>chip("gender",g,g,st.gender===g)).join("")}</div><div class="oa-srow"><b>글 유형</b>${TYPES.map(([t,d])=>chip("type",t,`${t} <small>${d}</small>`,st.type===t)).join("")}</div>`
      +sec("분량·이미지")+`<div class="oa-srow"><b>글 길이</b>${LENS.map(([l,d])=>chip("len",l,`${l} <small>${d}</small>`,st.len===l)).join("")}</div>
        <div class="oa-srow"><b>정보 이미지</b>${nums("ni",NIMAX[k],st.ni)}<small class="note">무료</small></div>
        <div class="oa-srow"><b>실사 사진</b>${nums("np",NPMAX[k],st.np)}<small class="note">AI 생성</small></div>
        ${+st.ni>0?`<details class="oa-help oa-des"${p?"":" open"}><summary>🎨 정보 이미지 디자인 <small>(글 만든 뒤에도 바로 바꿀 수 있음 · 무료)</small></summary>${designHTML(st,false)}</details>`:""}
        <p class="note" style="margin:8px 0 0">"월 ○○○만원 보장", "누구나 쉽게" 같은 소득 보장·과장 문구와 정착지원금 내용은 쓰지 않습니다. 수수료 관련 내용은 아래 '우리 조직 사실'에 적은 것만 씁니다.</p>`;
  } else if(k==="qa"){
    form=sec("답할 질문")+`<div class="oa-qgen"><b>💡 자주 받는 질문 뽑기</b> <small class="note">키워드를 넣으면 고객이 실제로 묻는 질문 15개를 검색 의도별로 뽑아 드립니다. 고르면 아래 칸에 들어갑니다.</small>
        <div class="row" style="gap:6px;flex-wrap:nowrap;margin-top:8px"><input id="ow-qkw" class="oa-in" maxlength="30" value="${E(v.kw||"")}" placeholder="예) 간병인보험추천" style="flex:1;min-width:0;margin:0"><button class="btn sm primary" type="button" id="ow-qgen">질문 15개 뽑기</button></div>
        <div id="ow-qlist"></div></div>
      <label class="oa-full"><textarea id="ow-q" class="oa-ta" rows="3" maxlength="2000" placeholder="위에서 질문을 고르거나, 지식iN·카페에 올라온 실제 질문을 그대로 붙여 넣으세요">${E(v.q||"")}</textarea></label>
      <div class="oa-srow"><b>질문 출처</b><select id="ow-qsrc" class="oa-in" style="width:auto;margin:0">${["자주 받는 질문","지식iN","네이버 카페","직접 받은 질문"].map(s=>`<option ${v.qsrc===s?"selected":""}>${s}</option>`).join("")}</select></div>
      <p class="note" style="margin:6px 0 0">자주 받는 질문 글은 <b>설계사 이름으로</b> "상담에서 자주 받는 질문"에 답하는 글입니다. 고객인 척 질문을 올리면 소비자를 속이는 광고(표시광고법)가 될 수 있습니다.</p>`
      +sec("키워드")+kwBox(false)
      +sec("말투")+`<div class="oa-srow"><b>글쓴이</b>${GENS.map(g=>chip("gender",g,g+" 설계사",st.gender===g)).join("")}</div><div class="oa-srow"><b>답변 유형</b>${TYPES.slice(0,4).map(([t,d])=>chip("type",t,`${t} <small>${d}</small>`,st.type===t)).join("")}</div>`
      +sec("분량·이미지")+`<div class="oa-srow"><b>답변 길이</b>${[["짧게","400~700자"],["보통","700~1,200자"],["길게","1,200~1,800자"]].map(([l,d])=>chip("len",l,`${l} <small>${d}</small>`,st.len===l)).join("")}</div>
        <div class="oa-srow"><b>정보 이미지</b>${nums("ni",NIMAX[k],st.ni)}</div><div class="oa-srow"><b>실사 사진</b>${nums("np",NPMAX[k],st.np)}</div>`;
  } else {
    form=`<div class="oa-rule" style="margin:0 0 12px;background:var(--accent-soft);color:inherit">고객이 <b>직접 겪은 내용</b>을 문장만 다듬습니다. 없는 내용은 만들지 않으며, 완성된 글은 <b>고객이 본인 계정으로</b> 올립니다.</div>`
      +sec("고객이 적어 준 내용")+`<label class="oa-full"><textarea id="ow-rv" class="oa-ta" rows="6" maxlength="3000" placeholder="고객이 직접 적어 준 경험(상담·보험금 청구 등)을 그대로 붙여 넣으세요">${E(v.rv||"")}</textarea></label>`
      +sec("대가 여부")+`<div class="oa-srow"><select id="ow-paid" class="oa-in" style="width:auto;margin:0"><option value="" ${!v.paid?"selected":""}>대가 없음</option><option value="1" ${v.paid?"selected":""}>대가 있음 (선물·상품권·할인 등)</option></select><input id="ow-paidw" class="oa-in" maxlength="40" value="${E(v.paidw||"")}" placeholder="예) 커피 상품권" style="max-width:220px;margin:0"></div>
        <p class="note" style="margin:6px 0 0">대가가 있으면 글 첫머리에 표시 문구가 자동으로 들어갑니다 (공정위 추천·보증 심사지침).</p>`
      +sec("분량")+`<div class="oa-srow">${[["짧게","500~800자"],["보통","800~1,200자"],["길게","1,200~1,800자"]].map(([l,d])=>chip("len",l,`${l} <small>${d}</small>`,st.len===l)).join("")}</div>
        <label class="row" style="gap:8px;margin-top:14px;font-size:14px;flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" id="ow-agree" ${v.agree?"checked":""} style="width:18px;height:18px;flex:none;margin-top:2px"><span>고객 본인이 직접 겪은 일이며, 완성된 글은 고객이 본인 계정으로 올립니다.</span></label>`;
  }
  const more=k==="review"?"":`<details class="oa-help" style="margin-top:12px"${k==="recruit"?" open":""}><summary>더 자세히 (선택)</summary><div class="oa-wgrid" style="margin-top:8px">
      <label style="grid-column:1/-1">${k==="qa"?"답변 요지·내가 확인한 사실":k==="recruit"?"추가로 알릴 사실 (연락 방법·지역·교육 일정 등) — 다온지사 강점(교육·코칭, 영업 시장 제공, 계약 즉시 예상 수수료 공개, 수수료 쉐어, 전국 사업단장·본부장 모집)은 자동으로 들어갑니다":"내가 확인한 사실·강조할 점"} <small class="note">(적은 내용만 사실로 씁니다)</small><textarea id="ow-facts" class="oa-ta" rows="2" maxlength="1500">${E(v.facts||"")}</textarea></label>
      ${k==="qa"?"":`<label>주요 독자<input id="ow-tg" maxlength="120" value="${E(v.target||"")}" placeholder="예) 부모님 간병이 걱정되는 40~50대"></label>`}
    </div></details>`;
  const flow=rev?["설정","확인","심의","복사"]:["설정","확인","복사"], at=!p||!p.out?0:p.st==="완료"?flow.length-1:p.st==="심의중"?2:1;
  B.innerHTML=`<div class="oa-bar"><button class="btn sm" type="button" id="ow-back">← 처음으로</button><h2>${K.ic} ${K.t}</h2><button class="btn sm" type="button" data-owlist="1">📂 내가 만든 글 ${POSTS().length}편</button></div>
  ${rev?`<div class="oa-rule" style="margin:0 0 12px">보험 글은 광고 → <b>회사 심의 후 게시</b> (금융소비자보호법 제22조)</div>`:""}
  <div class="oa-steps">${flow.map((t,i)=>`<span class="${i===at?"on":""}">${i+1} ${t}</span>`).join("")}</div>
  <div class="panel oa-form">${form}${more}
    <div class="row" style="gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn primary oa-go" type="button" id="ow-go" ${WBUSY?"disabled":""}>${WBUSY?"글 쓰는 중… (1분 안팎)":(p&&p.out?"이 설정으로 다시 쓰기":"글 만들기")}</button>${p?`<button class="btn" type="button" id="ow-new">새 글</button>`:""}<span class="note" id="ow-msg">${p&&p.pend?(p.st==="초안"?"바뀐 설정은 [이 설정으로 다시 쓰기]를 눌러야 글에 반영됩니다.":"심의에 올린 글은 그대로 두고, [이 설정으로 다시 쓰기]를 누르면 새 글로 만듭니다."):""}</span></div>
  </div>
  ${p&&p.out?vPost(p):""}`;
  if(p&&p.out){ drawPost(p); Promise.all([loadPhotos(p),loadBg(p),loadFont(p)]).then(()=>{ if(TAB==="write"&&WCUR===p.id) drawPost(p); }); }
  if(BGLIST().some(b=>!BGL[b.id])) loadBgl().then(ch=>{ if(ch&&TAB==="write") keepDes(); });
}
function keepDes(){ const p=curPost(); if(p&&p.out&&!keepDes.busy){ keepDes.busy=1; loadFont(p).then(ok=>{ keepDes.busy=0; if(ok&&curPost()===p) keepDes(); }); } saveForm(); const y=window.scrollY, op=[...document.querySelectorAll(".oa-des")].map(d=>d.open); vWrite(); [...document.querySelectorAll(".oa-des")].forEach((d,i)=>{ if(op[i]) d.open=true; }); window.scrollTo(0,y); }
function vPost(p){
  const o=p.out, bn=BNS(), k=kindOf(p), rev=needRev(p), ed=p.st==="초안";
  const copyBtns=`<button class="btn primary" type="button" data-owc="final">${k==="review"?"후기 복사 (고객에게 전달)":"① 본문 복사 (이미지 자리 표시)"}</button><button class="btn" type="button" data-owc="title">제목 복사</button><span class="note" id="ow-cmsg"></span>`
    +(k==="review"?"":`<div class="oa-imgq" style="flex-basis:100%"><b>② 이미지 하나씩 복사</b> <small class="note">네이버는 붙여넣은 글 속 이미지를 지웁니다. 아래 버튼을 누르고 네이버 본문의 [이미지 자리]를 눌러 Ctrl+V 하세요.</small><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">${imgSeq(p).map((x,j)=>`<button class="btn sm" type="button" data-owcp="${j}">📋 ${E(x.label)}</button>`).join("")||'<span class="note">이미지 없음</span>'}</div></div>`);
  return `<div class="panel" style="margin-top:14px">
    ${(o.warn||[]).length?`<div class="oa-rule" style="margin:0 0 10px">${o.warn.map(E).join("<br>")}</div>`:""}
    <div class="row between" style="flex-wrap:wrap;gap:8px"><h2 style="margin:0">글 확인</h2><small class="note">본문 ${fmt(o.stat&&o.stat.chars)}자${k==="blog"||k==="cafe"||k==="recruit"?` · 키워드 ${o.stat&&o.stat.kwCount||0}회`:""}</small></div>
    <label style="display:block;margin-top:10px">제목<input id="ow-title" value="${E(o.title)}" maxlength="80" style="width:100%"></label>
    ${(o.titles_alt||[]).length?`<div class="oa-tpick"><small class="note">제목 후보 ${ed?"(눌러서 고르기)":""}</small>${[...new Set([o.title0||o.title].concat(o.titles_alt))].map(t=>`<button type="button" class="oa-chip${t===o.title?" on":""}" data-owtt="${E(t)}" ${ed?"":"disabled"}>${E(t)}</button>`).join("")}</div>`:""}
    ${ed?`<p class="note" style="margin:10px 0 0">문단을 눌러 바로 고칠 수 있습니다.</p>`:""}
    ${(o.blocks||[]).some(b=>b.t==="img")?`<details class="oa-help oa-des" style="margin-top:10px" ${ed?"open":""}><summary>🎨 정보 이미지 디자인 바꾸기 <small>${ed?"(누르면 바로 적용 · 무료)":"(심의 후에는 바꾸면 다시 심의)"}</small></summary>${designHTML(p.style,true)}<span class="note" id="ow-dmsg"></span></details>`:""}
    ${ed||!rev?`<div class="row" style="gap:8px;margin:10px 0 0;flex-wrap:wrap"><button class="btn sm${UIMODE?" primary":""}" type="button" id="ow-uimode">🖼 내 이미지 넣기${UIMODE?" (끄기)":""}</button><small class="note">${UIMODE?"본문 사이의 [＋ 여기에 내 이미지]를 누르면 내 사진·자료를 원하는 위치에 넣습니다.":"가지고 있는 사진·자료를 글 원하는 위치에 넣을 수 있습니다."}</small><input type="file" id="ow-ufile" accept="image/*" hidden></div>`:""}
    <div class="oa-post" id="ow-body"></div>
    ${(o.tags||[]).length?`<p class="note">태그: ${o.tags.map(t=>"#"+E(t)).join(" ")}</p>`:""}
    ${(o.checklist||[]).length?`<details class="oa-help" open><summary>${rev?"심의 전에 확인할 것":"올리기 전에 확인할 것"}</summary><ul>${o.checklist.map(c=>`<li>${E(c)}</li>`).join("")}</ul></details>`:""}
    ${k==="blog"||k==="cafe"||k==="recruit"?`<div id="ow-seo">${seoHTML(p)}</div>`:""}
    <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
      ${rev?`<button class="btn" type="button" data-owc="review">심의용 원고 복사</button>`:""}
      ${(o.blocks||[]).some(b=>b.t==="img"||b.t==="photo")?`<button class="btn" type="button" id="ow-dlall">이미지 전체 받기</button>`:""}
      ${rev&&ed?`<button class="btn primary" type="button" data-owst="심의중">심의 올렸음</button>`:""}
      ${!ed?(p.no?`<button class="btn" type="button" data-owdup="1">📄 복사해서 새 글로 고치기</button>`:`<button class="btn" type="button" data-owre="1">✏️ 다시 고치기</button>`):""}
    </div>
  </div>
  ${rev?`<div class="panel" style="margin-top:14px;${ed?"opacity:.55":""}">
    <h2 style="margin:0 0 4px">심의번호 넣고 복사</h2>
    <p class="note" style="margin:0 0 10px">심의번호를 넣으면 심의필 문구·배너가 붙은 최종글을 복사할 수 있습니다 · 심의 후 수정 금지</p>
    <div class="oa-wgrid">
      <label>심의번호<input id="ow-no" value="${E(p.no||"")}" maxlength="40" placeholder="예) 2026-1234"></label>
      <label>심의필 문구 <small class="note">(회사 양식대로)</small><input id="ow-notxt" value="${E(p.noText||"")}" maxlength="160" placeholder="예) 준법감시인 심의필 제2026-1234호 (2026.11.13~2027.11.12)"></label>
      <label>필수기재 배너<select id="ow-bn">${BN.map(([b,t])=>`<option value="${b}" ${((p.bn==="kid"?"hlt":p.bn)||"gen")===b?"selected":""}>${t}${bn[b]&&bn[b].img?"":BIMG(b)?"":" (미등록)"}</option>`).join("")}</select></label>
    </div>
    <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">${copyBtns}</div>
    <details class="oa-help" style="margin-top:10px"><summary>네이버에 붙이는 방법</summary><ul>
      <li>제목 칸에 <b>제목 복사</b> → Ctrl+V, 본문 칸에 <b>① 본문 복사</b> → Ctrl+V.</li>
      <li>본문에 생긴 <b>▶ [이미지 1]</b> 같은 자리 표시 줄을 누르고, <b>② 이미지 하나씩 복사</b>에서 같은 번호 버튼 → Ctrl+V. 자리 표시 글은 지우세요.</li>
      <li>또는 <b>이미지 전체 받기</b>로 파일을 받아 네이버 사진 버튼으로 올려도 됩니다.</li>
      <li>네이버는 붙여넣을 때 세로줄 꾸밈을 지워서, 소제목·인용구 앞에 <b>▍</b> 표시로 넣었습니다. 네이버 인용구 모양으로 바꾸려면 그 줄을 누르고 위 <b>인용구(66) → 버티컬 라인</b>을 고르고 ▍ 표시는 지우세요.</li>
      <li>AI 사진은 이 기기에만 저장됩니다.</li></ul></details>
  </div>`
  :`<div class="panel" style="margin-top:14px">
    <h2 style="margin:0 0 4px">복사해서 올리기</h2>
    <p class="note" style="margin:0 0 10px">${k==="review"?"복사한 글을 고객에게 보내 고객이 본인 계정으로 올리게 하세요. 설계사 블로그·카페에 직접 올리면 보험 광고가 되어 심의 대상입니다.":"보험 내용이 없는 생활·정보 글입니다. 글에 보험 이야기를 넣으면 보험 글로 다시 만들어 심의를 받으세요."}</p>
    <div class="row" style="gap:8px;flex-wrap:wrap">${copyBtns}</div>
  </div>`}
  ${vSns(p)}`;
}
/* 옛 제목 모음(oa-titles.json, 대표 제공) — 고르는 용도가 아니라 키워드와 비슷한 제목 몇 개를 AI에 '방향 참고'로만 넘김 */
let TREF=null;
async function titleRefs(kw){ try{ if(!TREF){ const r=await fetch("oa-titles.json",{cache:"force-cache"}); TREF=await r.json(); } }catch(e){ return []; }
  const nb=String(kw||"").replace(/\s+/g,""), core=nb.replace(/보험$/,"").length>=2?nb.replace(/보험$/,""):nb, stem=core.length>=3?core.slice(0,core.length-1):core; if(stem.length<2) return [];
  const all=Object.values(TREF.cats||{}).flat().filter(t=>t.replace(/\s+/g,"").includes(stem));
  for(let i=all.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [all[i],all[j]]=[all[j],all[i]]; }
  return all.slice(0,6); }
async function runWrite(){
  if(WBUSY) return; const k=curKind(), v=saveForm(), msg=t=>{ const m=$("#ow-msg"); if(m) m.textContent=t; };
  if((k==="blog"||k==="cafe"||k==="recruit")&&String(v.kw||"").length<2) return msg("주제 키워드를 적어 주세요.");
  if(k==="qa"&&String(v.q||"").length<10) return msg("답할 질문을 그대로 붙여 넣어 주세요.");
  if(k==="review"){ if(String(v.rv||"").length<50) return msg("고객이 적어 준 내용을 50자 이상 붙여 넣어 주세요."); if(!v.agree) return msg("맨 아래 확인란에 체크해 주세요."); if(v.paid&&!v.paidw) return msg("받은 대가가 무엇인지 적어 주세요."); }
  const style=wStyle(), ins=k==="review"?false:k==="qa"?true:style.ins!=="0";
  WBUSY=true; vWrite();
  const refs=(k==="blog"||k==="cafe")&&ins?await titleRefs(v.kw):[];
  const r=await callW({action:"write",kind:k,ins,refs,kw:v.kw||"",kw2:v.kw2||"",facts:v.facts||"",target:v.target||"",q:v.q||"",qsrc:v.qsrc||"",rv:v.rv||"",agree:!!v.agree,
    gender:style.gender,type:style.type,ch:(k==="cafe"||(k==="recruit"&&(style.rch||"카페")==="카페"))?"카페":"블로그",len:style.len,ni:style.ni,np:style.np,rtopic:style.rtopic||"",rtarget:style.rtarget||""});
  WBUSY=false;
  if(r&&r.ok){ let p=curPost(); if(p) delete p.pend; if(!p||p.st!=="초안"){ p={id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),at:td(),st:"초안",no:"",noText:"",bn:"gen"}; POSTS().push(p); }
    const blocks=r.blocks.slice();
    if(k==="review"&&v.paid) blocks.unshift({t:"p",text:`※ 이 글은 담당 보험설계사로부터 ${v.paidw}을(를) 받고 작성한 후기입니다.`});
    Object.assign(p,{kind:k,ins,kw:v.kw||"",kw2:v.kw2||"",facts:v.facts||"",target:v.target||"",q:v.q||"",qsrc:v.qsrc||"",rv:v.rv||"",paid:v.paid||"",paidw:v.paidw||"",agree:!!v.agree},
      {style,pend:undefined,out:{title:r.title,title0:r.title,titles_alt:r.titles_alt,summary:r.summary,keywords:r.keywords,blocks,images:r.images,photos:r.photos,tags:r.tags,checklist:r.checklist,warn:r.warn,stat:r.stat}});
    if(D().wdraft) delete D().wdraft[k];
    WCUR=p.id; const P=POSTS(); if(P.length>100) P.splice(0,P.length-100);
    const pl=D().plan.find(x=>x.keyword===p.kw); if(pl&&(k==="blog"||k==="cafe")){ pl.post=p.id; if(pl.st==="예정") pl.st="초안"; }
    vWrite(); const m=$("#ow-msg"); if(m) m.textContent="글을 만들었습니다."+(r.left!=null?" (오늘 남은 횟수 "+r.left+"회)":""); const b=$("#ow-body"); if(b) b.scrollIntoView({behavior:"smooth",block:"start"}); }
  else { vWrite(); msg((r&&r.error)||"글을 만들지 못했습니다."); }
}
/* 키워드 추천: 보험을 궁금해하는 사람의 검색어만 (2026-11-18 대표 요청)
   씨앗 4개(입력어·○○보험·○○보험 추천·○○보험 청구)로 연관 검색어를 모은 뒤
   ① 주제어 포함 ② 보험 의도 단어 포함 ③ 보험사 이름·대출 등 제외 (보험사명은 글에 쓸 수 없음) → 판정·검색량 순 */
const INS_W=/보험|보장|특약|청구|실비|실손|가입|보험료|환급|약관|진단비|일당|담보|공제|면책|갱신|비교|추천/;
// 보험 단어는 없지만 보험 글로 연결하기 좋은 검색어 (비용·병원비·사고·보상 등을 알아보는 사람)
const INS_B=/비용|가격|금액|요금|시세|하루|비|병원비|의료비|치료비|수술비|입원|수술|치료|진단|사고|합의|벌금|보상|배상|피해|손해|지원|혜택|나이|기간|조건|대상|등급|신청|방법/;
const INS_X=/업체|구하기|센터|협회|추천업체|삼성|현대해상|DB|디비|KB|케이비|메리츠|한화|롯데|흥국|라이나|교보|신한|미래에셋|농협|NH|AIA|동양|ABL|하나|처브|AXA|악사|캐롯|우체국|카카오|토스|대출|주택담보|카드|적금|예금|은행|주식|코인|채용|구인|구직|알바|자격증|학원|교육원|시험/i;
/* 리쿠르팅 키워드: 보험대리점·보험설계사·워킹맘 + 입력어로 연관 검색어 → 설계사 일·이직·부업 관련만 */
const REC_W=/설계사|대리점|GA|지에이|보험영업|영업|리크루팅|리쿠르팅|모집|채용|구인|이직|전직|위촉|수수료|수당|연봉|월급|수입|부업|투잡|N잡|재택|프리랜서|워킹맘|주부|경력단절|경단녀|육아|엄마|맘|자격증|시험|교육|신입|경력|본부장|사업단|지점장|지사장|팀장|창업/;
const REC_X=/정착|지원금|대출|카드|적금|예금|주택담보|사기|고소|민원|해지|청구|실비|자동차보험|여행자/;
async function kwRecruit(base,box,t0){
  const seeds=[...new Set([base,"보험설계사","보험대리점","워킹맘 부업"])];
  box.innerHTML=`<p class="note">리쿠르팅 검색어를 찾는 중… (20초 안팎)</p>`;
  const call=async k=>{ try{ const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t0,keywords:[k],related:20})}); const j=JSON.parse(await res.text()); return j&&j.ok&&Array.isArray(j.rows)?j.rows:[]; }catch(e){ return []; } };
  const all=(await Promise.all(seeds.map(call))).flat(), seen=new Set(), O={"최적":0,"가능":1,"어려움":2,"포화":3};
  const nk=x=>String(x.keyword||"").replace(/\s+/g,"");
  const ok=all.filter(x=>{ const k=nk(x); if(!k||seen.has(k)) return false; seen.add(k); return x.verdict!=="허수"&&REC_W.test(k)&&!REC_X.test(k)&&!INS_X.test(k.replace(/GA|지에이/g,"")); });
  const srt=L=>L.sort((a,b)=>(O[a.verdict]??4)-(O[b.verdict]??4)||b.search-a.search);
  const job=srt(ok.filter(x=>/설계사|대리점|GA|지에이|보험영업|리크루팅|리쿠르팅|위촉|수수료|수당|본부장|사업단|지점장|지사장|팀장/.test(nk(x)))).slice(0,15);
  const life=srt(ok.filter(x=>!job.includes(x))).slice(0,10);
  const chips=L=>`<div class="oa-chips">${L.map(x=>`<button type="button" class="oa-chip" data-owkf="${E(x.keyword)}">${E(x.keyword)} <small style="color:${VC[x.verdict]||"inherit"}">${E(x.verdict)}</small> <small>월 ${fmt(x.search)}</small></button>`).join("")}</div>`;
  box.innerHTML=job.length||life.length?`<p class="note" style="margin:8px 0 4px">눌러서 고르기 · <b style="color:var(--ok)">최적</b>·<b style="color:var(--c2)">가능</b>이 상위 노출에 유리</p>
    ${job.length?`<div class="oa-kg"><b>설계사 일·이직을 알아보는 검색어</b>${chips(job)}</div>`:""}
    ${life.length?`<div class="oa-kg"><b>부업·워킹맘·경력단절 검색어</b> <small class="note">일자리를 찾는 사람 → 설계사라는 선택지를 안내</small>${chips(life)}</div>`:""}`
    :`<p class="note">리쿠르팅 검색어를 찾지 못했습니다. 다른 단어로 다시 눌러 주세요. (예: 보험설계사, 워킹맘 부업)</p>`;
}
async function kwSuggest(){
  const v=saveForm(), base=String(v.kw||"").trim(), box=$("#ow-kwlist"); if(!box) return;
  if(curKind()==="recruit"){ const t1=await tok(); if(!t1){ box.innerHTML=`<p class="note">다시 로그인해 주세요.</p>`; return; } return kwRecruit(base.length>=2?base:"보험설계사",box,t1); }
  if(base.length<2){ box.innerHTML=`<p class="note">먼저 생각나는 단어를 적고 [추천 보기]를 누르세요. 예) 간병인보험</p>`; return; }
  const t0=await tok(); if(!t0){ box.innerHTML=`<p class="note">지사페이지에 다시 로그인해 주세요.</p>`; return; }
  box.innerHTML=`<p class="note">보험 관련 검색어를 찾는 중… (20초 안팎)</p>`;
  const nb=base.replace(/\s+/g,""), core=(nb.replace(/보험$/,"").length>=2?nb.replace(/보험$/,""):nb), ib=/보험/.test(nb)?nb:core+"보험";
  const stem=core.length>=3?core.slice(0,core.length-1):core; // 간병인→간병 (간병비보험·간병보험도 포함)
  const seeds=[...new Set([base,ib,ib+" 추천",ib+" 청구"])];
  const call=async k=>{ try{ const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t0,keywords:[k],related:20})}); const j=JSON.parse(await res.text()); return j&&j.ok&&Array.isArray(j.rows)?j.rows:[]; }catch(e){ return []; } };
  const all=(await Promise.all(seeds.map(call))).flat(), seen=new Set(), O={"최적":0,"가능":1,"어려움":2,"포화":3};
  const ok=all.filter(x=>{ const k=String(x.keyword||"").replace(/\s+/g,""); if(!k||seen.has(k)) return false; seen.add(k);
      return x.verdict!=="허수"&&k.includes(stem)&&!INS_X.test(k); });
  const srt=L=>L.sort((a,b)=>(O[a.verdict]??4)-(O[b.verdict]??4)||b.search-a.search);
  const nk=x=>String(x.keyword).replace(/\s+/g,"");
  const rows=srt(ok.filter(x=>INS_W.test(nk(x)))).slice(0,15), bridge=srt(ok.filter(x=>!INS_W.test(nk(x))&&INS_B.test(nk(x)))).slice(0,10);
  const chips=L=>`<div class="oa-chips">${L.map(x=>`<button type="button" class="oa-chip" data-owkf="${E(x.keyword)}">${E(x.keyword)} <small style="color:${VC[x.verdict]||"inherit"}">${E(x.verdict)}</small> <small>월 ${fmt(x.search)}</small></button>`).join("")}</div>`;
  box.innerHTML=rows.length||bridge.length?`<p class="note" style="margin:8px 0 4px">눌러서 고르기 · <b style="color:var(--ok)">최적</b>·<b style="color:var(--c2)">가능</b>이 상위 노출에 유리 <small>(보험사 이름이 들어간 검색어는 글에 쓸 수 없어 뺐습니다)</small></p>
    ${rows.length?`<div class="oa-kg"><b>보험을 알아보는 검색어</b>${chips(rows)}</div>`:""}
    ${bridge.length?`<div class="oa-kg"><b>보험 글로 연결하기 좋은 검색어</b> <small class="note">비용·병원비·사고 등을 알아보는 사람 → 글에서 보험으로 대비하는 방법까지 안내</small>${chips(bridge)}</div>`:""}`
    :`<p class="note">'${E(core)}'로 보험 관련 검색어를 찾지 못했습니다. 다른 단어로 다시 눌러 주세요. (예: 간병인, 치매, 화재)</p>`;
}
function drawPost(p){
  const W=$("#ow-body"); if(!W) return; const o=p.out;
  W.innerHTML="";
  const uiOn=UIMODE&&(p.st==="초안"||!needRev(p)), slot=i=>{ if(!uiOn) return; const s=document.createElement("button"); s.type="button"; s.className="oa-uslot"; s.dataset.owui=i; s.textContent="＋ 여기에 내 이미지"; W.appendChild(s); };
  slot(-1);
  o.blocks.forEach((b,i)=>{
    if(b.t==="uimg"){ const k=p.id+"_"+b.id, u=UIMG[k]; const f=document.createElement("figure"); f.className="oa-fig oa-uimg";
      f.innerHTML=(u?`<img src="${u}" alt="${E(b.cap||"내 이미지")}">`:`<div class="oa-phslot">내 이미지 (이 기기에 파일이 없습니다)</div>`)
        +`<figcaption>${uiOn?`<input class="oa-in" data-owuc="${i}" maxlength="60" value="${E(b.cap||"")}" placeholder="설명 (선택)" style="width:auto;flex:1;min-width:120px;margin:0"><button class="btn sm" type="button" data-owum="up" data-i="${i}">↑</button><button class="btn sm" type="button" data-owum="down" data-i="${i}">↓</button><button class="btn sm" type="button" data-owum="del" data-i="${i}">빼기</button>`:`내 이미지${b.cap?" · "+E(b.cap):""}`}</figcaption>`;
      W.appendChild(f); slot(i); return; }
    if(b.t==="h"||b.t==="p"){ const e=document.createElement(b.t==="h"?"h3":"p"); e.textContent=b.text; if(b.t==="p"&&isQ(b.text)) e.className="oa-q"; e.contentEditable=p.st==="초안"?"true":"false"; e.dataset.owb=i; W.appendChild(e); }
    else if(b.t==="table"){ const w=document.createElement("div"); w.innerHTML=`${b.caption?`<div class="oa-cap">${E(b.caption)}</div>`:""}<table class="oa-pt"><tr>${(b.head||[]).map(h=>`<th>${E(h)}</th>`).join("")}</tr>${(b.rows||[]).map(r=>`<tr>${r.map(c=>`<td>${E(c)}</td>`).join("")}</tr>`).join("")}</table>`; W.appendChild(w); }
    else if(b.t==="img"){ const s=(o.images||[])[b.n-1]; if(!s) return; const f=document.createElement("figure"); f.className="oa-fig"; const c=card(s,stOf(p),bgImgOf(p.style,p.id)); c.style.width="100%"; c.style.maxWidth=(c.width>c.height?"600px":"420px"); f.appendChild(c); const cap=document.createElement("figcaption");
      const mv=p.st==="초안"||!needRev(p);
      if(mv){ const sel=MVSEL[b.n]||"all", tg=elTargets(s), cur=sel==="all"?null:((s.el||{})[sel]||{}).c||"";
        cap.innerHTML=`이미지 ${b.n} · <b>글씨 고치기</b> <small class="note">(고른 글씨를 그림에서 끌거나 버튼으로)</small>
          <div class="oa-mv">${tg.map(([v,t])=>`<button class="oa-chip${sel===v?" on":""}" type="button" data-owmt="${b.n}:${v}">${t}</button>`).join("")}</div>
          <div class="oa-mv">${[["L","←"],["U","↑"],["D","↓"],["R","→"]].map(([d,t])=>`<button class="btn sm" type="button" data-owmv="${b.n}:${d}" title="글씨 옮기기">${t}</button>`).join("")}<button class="btn sm" type="button" data-owmv="${b.n}:0">${sel==="all"?"모두 처음대로":"처음 위치"}</button>
          <span class="oa-cols"><small>색</small>${TCOLORS.map(([v,t])=>`<button type="button" class="oa-col${(cur||"")===v?" on":""}" data-owmc="${b.n}:${v}" title="${t}" style="${v?`background:${v}`:""}">${v?"":"기본"}</button>`).join("")}<input type="color" data-owmcc="${b.n}" value="${/^#[0-9a-f]{6}$/i.test(cur)?cur:"#ff6a00"}" title="직접 고르기"></span></div>
          <details class="oa-txt" data-owtxo="${b.n}" ${TXOPEN[b.n]?"open":""}><summary>✏️ 글씨 문구 고치기</summary>${txFields(s).map(([f,t,ml,multi])=>`<label>${t}${multi?`<textarea class="oa-ta" rows="${Math.min(6,Math.max(2,(txVal(s,f)||"").split("\n").length))}" data-owtx="${b.n}:${f}">${E(txVal(s,f))}</textarea><small class="note">한 줄에 하나씩</small>`:`<input class="oa-in" maxlength="${ml}" data-owtx="${b.n}:${f}" value="${E(txVal(s,f))}">`}</label>`).join("")}</details>`;
        dragCard(p,b.n,c); }
      else cap.textContent="이미지 "+b.n;
      f.appendChild(cap); W.appendChild(f); }
    else if(b.t==="photo"){ const ph=(o.photos||[])[b.n-1]; if(!ph) return; const k=p.id+"_"+b.n, u=PHB[k]; const f=document.createElement("figure"); f.className="oa-fig oa-ph";
      f.innerHTML=(u&&!PBUSY[k])?`<img src="${u}" alt="${E(ph.ko)}"><figcaption>사진 ${b.n} · AI 생성 · ${E(ph.ko)} <button class="btn sm" type="button" data-owp="${b.n}">다시 만들기</button> <button class="btn sm" type="button" data-owpd="${b.n}">받기</button></figcaption>`
        :PBUSY[k]?`<div class="oa-phslot"><b>사진 ${b.n}</b> ${E(ph.ko)}<div class="oa-pbar"><i></i></div><span>만드는 중… <b data-owpt="${k}">${Math.round((Date.now()-PBUSY[k])/1000)}초</b> · 보통 40~60초 걸립니다. 그동안 다른 작업을 해도 됩니다.</span></div>`
        :`<div class="oa-phslot"><b>사진 ${b.n}</b> ${E(ph.ko)}<textarea class="oa-ta" rows="2" data-owpe="${b.n}" maxlength="900">${E(ph.en)}</textarea><div class="row" style="gap:6px"><button class="btn sm primary" type="button" data-owp="${b.n}">${PERR[k]?"다시 만들기":"실사 사진 만들기 (40~60초)"}</button><span class="note" data-owpm="${b.n}" style="${PERR[k]?"color:var(--bad)":""}">${E(PERR[k]||"")}</span></div></div>`;
      W.appendChild(f); }
    slot(i);
  });
  if(needRev(p)||kindOf(p)==="recruit"){ const d=document.createElement("p"); d.className="note"; d.textContent=discOf(p); W.appendChild(d); }
}
async function tok(){ try{ return (typeof ME!=="undefined"&&ME&&ME.code)?"daon:"+ME.code:null; }catch(e){ return null; } }
async function callW(body,ms){ const t=await tok(); if(!t) return {ok:false,error:"지사페이지에 다시 로그인해 주세요."};
  const ac=window.AbortController?new AbortController():null, tm=ac&&ms?setTimeout(()=>ac.abort(),ms):null;
  try{ const r=await fetch(WAPI,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.assign({token:t},body)),signal:ac?ac.signal:undefined}); if(tm) clearTimeout(tm); const x=await r.text(); try{ return JSON.parse(x); }catch(e){ return {ok:false,error:"서버 응답을 읽지 못했습니다. ("+r.status+") 잠시 후 다시 눌러 주세요."}; } }
  catch(e){ if(tm) clearTimeout(tm); return {ok:false,error:e&&e.name==="AbortError"?"3분이 지나도 응답이 없어 멈췄습니다. 다시 눌러 주세요.":"연결에 실패했습니다. 인터넷 연결을 확인해 주세요."}; } }
function wStyle(){ const k=curKind(), s=Object.assign({},kst(k)); $$(".oa-chip.on[data-ws],.oa-sw.on").forEach(b=>{ s[b.dataset.ws]=b.dataset.v; }); D().wst[k]=s; return s; }
const $$=s=>Array.from(document.querySelectorAll(s));
/* 실사 사진: 서버에서 40~60초 걸림 → 경과 시간 표시, 화면을 다시 그려도 진행 상태 유지, 3분 넘으면 중단 (2026-11-18) */
const PBUSY={}, PERR={};
setInterval(()=>{ document.querySelectorAll("[data-owpt]").forEach(e=>{ const t0=PBUSY[e.dataset.owpt]; if(t0) e.textContent=Math.round((Date.now()-t0)/1000)+"초"; }); },1000);
async function runPhoto(n,btn){
  const p=curPost(); if(!p) return; const ph=(p.out.photos||[])[n-1]; if(!ph) return; const k=p.id+"_"+n; if(PBUSY[k]) return;
  const ta=document.querySelector(`[data-owpe="${n}"]`); if(ta){ const v=ta.value.trim(); if(v.length>=20) ph.en=v.slice(0,900); }
  PBUSY[k]=Date.now(); delete PERR[k]; drawPost(p);
  const r=await callW({action:"photo",prompt:ph.en},180000);
  delete PBUSY[k];
  if(r&&r.ok&&r.img){ PHB[k]=r.img; await IDB.put(k,r.img); }
  else PERR[k]=(r&&r.error)||"사진을 만들지 못했습니다. 다시 눌러 주세요.";
  if(TAB==="write"&&WCUR===p.id) drawPost(p);
}
function imgSeq(p){ const o=p.out||{}, L=[]; let ui=0;
  (o.blocks||[]).forEach(b=>{ if(b.t==="img"&&(o.images||[])[b.n-1]) L.push({label:"이미지 "+b.n,get:()=>cardURL(p,b.n)});
    else if(b.t==="photo"&&(o.photos||[])[b.n-1]) L.push({label:"사진 "+b.n,get:()=>PHB[p.id+"_"+b.n]});
    else if(b.t==="uimg"){ const n=++ui; L.push({label:"내 이미지 "+n,get:()=>UIMG[p.id+"_"+b.id]}); } });
  if(needRev(p)&&(BIMG(p.bn)||{}).img) L.push({label:"필수기재 배너",get:()=>(BIMG(p.bn)||{}).img});
  return L; }
async function copyImg(u){ // 네이버 에디터는 클립보드의 그림(PNG) 한 장 붙여넣기는 받음
  const im=new Image(); im.src=u; await im.decode(); const c=document.createElement("canvas"); c.width=im.naturalWidth; c.height=im.naturalHeight; c.getContext("2d").drawImage(im,0,0);
  const blob=await new Promise(r=>c.toBlob(r,"image/png")); await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]); }
function dlURL(u,name){ const a=document.createElement("a"); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
function safe(s){ return String(s||"").replace(/[\\/:*?"<>|\n]/g," ").trim().slice(0,30); }
function dlAll(p){ let i=0; p.out.blocks.forEach(b=>{ if(b.t==="img"){ const u=cardURL(p,b.n); if(u) setTimeout(()=>dlURL(u,`${safe(p.out.title)}_이미지${b.n}.png`),(i++)*400); } else if(b.t==="photo"){ const u=PHB[p.id+"_"+b.n]; if(u) setTimeout(()=>dlURL(u,`${safe(p.out.title)}_사진${b.n}.jpg`),(i++)*400); } else if(b.t==="uimg"){ const u=UIMG[p.id+"_"+b.id]; if(u){ const no=i+1; setTimeout(()=>dlURL(u,`${safe(p.out.title)}_내이미지${no}.jpg`),(i++)*400); } } }); if(!i) alert("받을 이미지가 없습니다."); }
const isQ=t=>/^\s*[“"]/.test(t||"")&&/[”"]\s*$/.test(t||"");
function postParts(p,mode){ // mode: review | text | final  (final: 네이버가 붙여넣기 이미지를 지우므로 자리 표시만 넣고 이미지는 하나씩 복사)
  const o=p.out, H=[], T=[]; let ui=0; const mk=l=>`<p style="color:#2563eb"><b>▶ [${E(l)}] 여기를 누르고 Ctrl+V</b></p>`;
  o.blocks.forEach(b=>{
    if(b.t==="h"){ H.push(mode==="review"?`<h3>${E(b.text)}</h3>`:`<h3><span style="color:#1d5c4a">▍</span>${E(b.text)}</h3>`); T.push("■ "+b.text); }
    else if(b.t==="p"){ H.push(isQ(b.text)?`<p style="font-size:17px;color:#1e3a8a"><b><span style="color:#2563eb">▍</span> ${E(b.text)}</b></p>`:`<p>${E(b.text)}</p>`); T.push(b.text); }
    else if(b.t==="table"){ H.push((b.caption?`<p><b>${E(b.caption)}</b></p>`:"")+`<table border="1" cellpadding="6" style="border-collapse:collapse">${[`<tr>${(b.head||[]).map(h=>`<th>${E(h)}</th>`).join("")}</tr>`].concat((b.rows||[]).map(r=>`<tr>${r.map(c=>`<td>${E(c)}</td>`).join("")}</tr>`)).join("")}</table>`); T.push((b.caption?b.caption+"\n":"")+[b.head||[]].concat(b.rows||[]).map(r=>"| "+r.join(" | ")+" |").join("\n")); }
    else if(b.t==="img"){ const s=(o.images||[])[b.n-1]; if(!s) return; if(mode==="final"){ H.push(mk(`이미지 ${b.n}`)); } else { H.push(`<p style="color:#c2410c">[이미지 ${b.n}: ${E(s.title)}]</p>`); } T.push(`[이미지 ${b.n}: ${s.title}]`); }
    else if(b.t==="uimg"){ const u=UIMG[p.id+"_"+b.id]; if(mode==="final"&&u){ H.push(mk(`내 이미지 ${++ui}`)); } else { H.push(`<p style="color:#c2410c">[내 이미지${b.cap?": "+E(b.cap):""}]</p>`); } T.push(`[내 이미지${b.cap?": "+b.cap:""}]`); }
    else if(b.t==="photo"){ const ph=(o.photos||[])[b.n-1]; if(!ph) return; const u=PHB[p.id+"_"+b.n]; if(mode==="final"&&u){ H.push(mk(`사진 ${b.n}`)); } else { H.push(`<p style="color:#c2410c">[사진 ${b.n}: ${E(ph.ko)}]</p>`); } T.push(`[사진 ${b.n}: ${ph.ko}]`); }
  });
  if(!needRev(p)){ if(kindOf(p)==="recruit"){ H.push(`<p>${E(DISC_R)}</p>`); T.push(DISC_R); } return {html:H.join(""),text:T.join("\n\n")}; }
  H.push(`<p>${E(discOf(p))}</p>`); T.push(discOf(p));
  if(mode!=="review"){ const nt=p.noText||p.no; if(nt){ H.push(`<p>${E(nt)}</p>`); T.push(nt); } if(mode==="final"){ const bu=(BIMG(p.bn)||{}).img; if(bu) H.push(mk("필수기재 배너")); else T.push("[필수기재 배너]"); } else T.push("[필수기재 배너]"); }
  return {html:H.join(""),text:T.join("\n\n")};
}
async function copyPost(p,mode,btn){
  const msg=t=>{ const m=$("#ow-cmsg"); if(m) m.textContent=t; };
  if(mode==="title"){ try{ await navigator.clipboard.writeText(p.out.title); msg("제목을 복사했습니다."); }catch(e){ msg("복사하지 못했습니다."); } return; }
  if((mode==="final"||mode==="text")&&needRev(p)&&!p.no){ alert("심의번호를 먼저 넣어 주세요. 보험 광고는 심의 후 게시해야 합니다 (금융소비자보호법 제22조)."); return; }
  if(mode==="final"&&needRev(p)&&!BIMG(p.bn)&&!confirm("글 끝 필수기재 배너가 등록되지 않았습니다. 배너 없이 복사할까요?")) return;
  const pt=postParts(p,mode==="review"?"review":mode);
  try{ if(navigator.clipboard&&window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([pt.html],{type:"text/html"}),"text/plain":new Blob([pt.text],{type:"text/plain"})})]); else await navigator.clipboard.writeText(pt.text);
    const o=btn.textContent; btn.textContent="복사됨"; setTimeout(()=>btn.textContent=o,1600);
    if(mode==="final"||(mode==="text"&&!needRev(p))){ p.st="완료"; const pl=D().plan.find(x=>x.post===p.id||x.keyword===p.kw); if(pl){ pl.no=p.no; pl.post=p.id; pl.st="발행"; } msg("네이버 글쓰기 본문에 붙여넣고 발행하세요."); }
    else if(mode==="review") msg("심의 제출 양식에 붙여넣으세요. 이미지는 '이미지 전체 받기'로 함께 제출합니다.");
  }catch(e){ msg("이 브라우저에서는 복사가 안 됩니다. 다른 브라우저(크롬)로 열어 주세요."); }
}

/* ---------- 3-2. SEO 점검 (브라우저에서 계산 · 무료) ----------
   기준: oa-rules.json·글 만들기 선택값(길이·이미지 수). 고친 본문 기준으로 다시 점검 가능 */
const LRANGE={"짧게":{c:[1200,1500],k:[3,4],h:[3,4]},"보통":{c:[1800,2500],k:[4,6],h:[5,6]},"길게":{c:[2800,3500],k:[5,7],h:[6,8]}};
function seoList(p){
  const o=p.out, st=Object.assign({},WDEF,p.style||{}), R=LRANGE[st.len]||LRANGE["보통"], kw=String(p.kw||"").trim(), nk=kw.replace(/\s+/g,"");
  const ps=o.blocks.filter(b=>b.t==="p").map(b=>b.text||""), body=ps.join(""), title=String(o.title||"");
  const kc=nk?body.replace(/\s+/g,"").split(nk).length-1:0, hc=o.blocks.filter(b=>b.t==="h").length;
  const ic=o.blocks.filter(b=>b.t==="img").length, pc=o.blocks.filter(b=>b.t==="photo").length;
  const tpos=nk?title.replace(/\s+/g,"").indexOf(nk):-1, first=ps[0]||"", sn=first.split(/[.?!](?:\s+|$)/).filter(x=>x.trim()).length;
  const all=[title].concat(o.blocks.map(b=>b.text||"")).join("\n"), lo=R.c[0]*0.9, hi=R.c[1]*1.1;
  // 키워드 분포 (2026-11-19): 첫 문단·소제목·후반부에 고르게, 한 문단 몰림 없음
  const cnt=t=>nk?String(t||"").replace(/\s+/g,"").split(nk).length-1:0, body0=ps.filter(t=>!/^\s*참고\s*[:：]/.test(t)&&!/^\s*[“"]/.test(t));
  const hk=o.blocks.filter(b=>b.t==="h"&&cnt(b.text)>0).length, z=[0,0,0]; body0.forEach((t,i)=>{ z[Math.min(2,Math.floor(i*3/body0.length))]+=cnt(t); });
  const mx=Math.max(0,...body0.map(cnt));
  return [
    ["제목 25~35자",title.length>=25&&title.length<=35,title.length+"자"],
    ["제목 앞쪽에 대표 키워드",tpos>=0&&tpos<=10,tpos<0?"제목에 없음":(tpos+1)+"번째 글자부터"],
    [`본문 ${fmt(R.c[0])}~${fmt(R.c[1])}자 (${st.len})`,body.length>=lo&&body.length<=hi,fmt(body.length)+"자"],
    [`대표 키워드 ${R.k[0]}~${R.k[1]}회`,kc>=R.k[0]&&kc<=R.k[1]+1,kc+"회"],
    [`소제목 ${R.h[0]}~${R.h[1]}개`,hc>=R.h[0]&&hc<=R.h[1]+1,hc+"개"],
    ["키워드 분포: 첫 문단에 대표 키워드",cnt(first)>0,cnt(first)?"있음":"없음"],
    ["키워드 분포: 소제목 1~2개에 대표 키워드",hk>=1&&hk<=2,hk+"개"],
    ["키워드 분포: 앞·중간·뒤에 고르게",z.every(x=>x>0),"앞 "+z[0]+" · 중간 "+z[1]+" · 뒤 "+z[2]],
    ["키워드 분포: 한 문단에 2회 이상 몰림 없음",mx<=1,"한 문단 최대 "+mx+"회"],
    ["첫 문단 3문장 이내 (답 먼저)",sn>0&&sn<=3,sn+"문장"],
    ["\"참고:\" 근거 문단",/(^|\n)\s*참고\s*[:：]/.test(ps.join("\n")),""],
    ["[확인 필요] 없음",!/\[확인 필요/.test(all),""],
    ...(kindOf(p)==="recruit"?[["정착지원금·퍼미션 DB 지원 언급 없음 (현재 제공 안 함)",!/정착\s*지원금|퍼미션|3만\s*5천\s*원|35,?000\s*원/.test(all+" "+(o.tags||[]).join(" ")),"있으면 본문에서 지우세요"]]:[]),
    ["[내 경험 넣기] 자리를 내 이야기로 채움",!/\[내 경험 넣기/.test(all),"그대로 발행하면 품질이 떨어져 보입니다"],
    [`정보 이미지 ${st.ni}장 · 사진 ${st.np}장`,ic===+st.ni&&pc===+st.np,`이미지 ${ic} · 사진 ${pc}`],
    ["태그 10개",(o.tags||[]).length>=10,(o.tags||[]).length+"개"],
    (()=>{ const hit=["이번 글에서는","알아보겠습니다","쉽게 설명드리겠습니다","결론부터 말씀드리면","무료상담","지금 가입","가입하세요","선착순","특가","최저보험료","인기상품","보험료 폭탄","무조건"].filter(w=>all.includes(w)); return ["AI 문체·광고 표현 없음",!hit.length,hit.join(", ")]; })()];
}
function seoHTML(p){ const L=seoList(p), ok=L.filter(x=>x[1]).length;
  return `<details class="oa-help oa-seo"${ok<L.length?" open":""}><summary>네이버 작성 점검 <b>${ok}/${L.length}</b> <button class="btn sm" type="button" id="ow-seor">다시 점검</button></summary>
    <ul>${L.map(([t,g,v])=>`<li class="${g?"ok":"no"}">${g?"✓":"!"} ${E(t)}${v?` <small>(${E(v)})</small>`:""}</li>`).join("")}</ul>
    <p class="note" style="margin:6px 0 0">네이버는 순위 기준을 공개하지 않습니다. 공개된 원칙(출처 신뢰도·검색 의도 적합도)에 맞춘 점검이며 상위 노출을 보장하지 않습니다.</p></details>`; }

/* ---------- 3-3. 인스타·쓰레드로 바꾸기 ----------
   심의번호가 들어간 블로그 글 → AI가 인스타 캡션·쓰레드 글(글 안 내용만 사용) → SNS용 심의 → 심의번호 입력 후 복사
   카드뉴스 = 블로그 정보 이미지(1080×1080) 그대로. 자동 게시는 하지 않음 (복사해서 직접 올림) */
let SBUSY=false;
function blogText(p){ return p.out.blocks.map(b=>b.t==="h"?"■ "+b.text:b.t==="p"?b.text:b.t==="table"?[b.caption||""].concat([b.head||[]].concat(b.rows||[]).map(r=>r.join(" | "))).join("\n"):"").filter(Boolean).join("\n\n"); }
function snsNote(p){ return p.snsNoText||(p.snsNo?(/심의필/.test(p.snsNo)?p.snsNo:"준법감시인 심의필 제"+p.snsNo+"호"):""); }
function vSns(p){
  const rv=needRev(p); if(kindOf(p)!=="blog"||(rv&&!p.no)) return "";
  const s=p.sns, locked=rv&&!!p.snsNo, cards=(p.out.blocks||[]).filter(b=>b.t==="img").length;
  return `<div class="panel" style="margin-top:14px">
    <h2 style="margin:0 0 4px">⑤ 인스타·쓰레드로 바꾸기 <small class="note">하루 5회</small></h2>
    <p class="note" style="margin:0 0 10px">이 블로그 글 내용만으로 짧게 줄입니다.${rv?" 문구가 달라지므로 <b>SNS용도 따로 심의</b>를 받은 뒤 올리세요.":""} 카드뉴스는 위 정보 이미지(정사각형) ${cards}장을 그대로 씁니다.</p>
    ${s?`${(s.warn||[]).length?`<div class="oa-rule" style="margin:0 0 10px">${s.warn.map(E).join("<br>")}</div>`:""}
      <div class="oa-wgrid">
        <label style="grid-column:1/-1">인스타그램 캡션<textarea class="oa-ta" id="ow-scap" rows="7" ${locked?"readonly":""}>${E(s.insta.caption)}</textarea><small class="note">${(s.insta.hashtags||[]).map(t=>"#"+E(t)).join(" ")}</small></label>
        ${s.threads.posts.map((t,i)=>`<label style="grid-column:1/-1">쓰레드 ${i+1}/${s.threads.posts.length} <small class="note">${t.length}자</small><textarea class="oa-ta" data-owsp="${i}" rows="3" ${locked?"readonly":""}>${E(t)}</textarea></label>`).join("")}
      </div>
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn" type="button" data-owsc="review">SNS 심의용 복사</button>
        <button class="btn" type="button" id="ow-cards" ${cards?"":"disabled"}>카드뉴스 이미지 받기 (${cards}장)</button>
        ${locked?"":`<button class="btn" type="button" id="ow-sgo" ${SBUSY?"disabled":""}>${SBUSY?"만드는 중…":"다시 만들기"}</button>`}
      </div>
      ${rv?`<div class="oa-wgrid" style="margin-top:12px">
        <label>SNS 심의번호<input id="ow-sno" value="${E(p.snsNo||"")}" maxlength="40" placeholder="예) 2026-1235"></label>
        <label>SNS 심의필 문구<input id="ow-snotxt" value="${E(snsNote(p))}" maxlength="160" placeholder="예) 준법감시인 심의필 제2026-1235호"></label>
      </div>`:""}
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn primary" type="button" data-owsc="insta">인스타 캡션 복사</button>
        ${s.threads.posts.map((_,i)=>`<button class="btn" type="button" data-owsc="t${i}">쓰레드 ${i+1} 복사</button>`).join("")}
        <span class="note" id="ow-smsg"></span>
      </div>`
    :`<button class="btn primary" type="button" id="ow-sgo" ${SBUSY?"disabled":""}>${SBUSY?"만드는 중… (30초 안팎)":"인스타·쓰레드 글 만들기"}</button> <span class="note" id="ow-smsg"></span>`}
  </div>`;
}
async function runSns(){
  const p=curPost(); if(!p||SBUSY) return; if(needRev(p)&&p.snsNo){ alert("SNS 심의를 받은 뒤에는 다시 만들 수 없습니다."); return; }
  SBUSY=true; vWrite();
  const r=await callW({action:"sns",title:p.out.title,text:blogText(p)});
  SBUSY=false;
  if(r&&r.ok){ p.sns={insta:r.insta,threads:r.threads,warn:r.warn||[],at:td()}; vWrite(); const m=$("#ow-smsg"); if(m) m.textContent="만들었습니다."+(r.left!=null?" (오늘 남은 횟수 "+r.left+"회)":""); }
  else { vWrite(); const m=$("#ow-smsg"); if(m) m.textContent=(r&&r.error)||"만들지 못했습니다."; }
}
async function copySns(p,mode,btn){
  const s=p.sns; if(!s) return; const msg=t=>{ const m=$("#ow-smsg"); if(m) m.textContent=t; };
  const tags=(s.insta.hashtags||[]).map(t=>"#"+t).join(" "), nt=snsNote(p);
  let txt="";
  if(mode==="review") txt="[인스타그램 캡션]\n"+s.insta.caption+"\n\n"+tags+"\n\n"+s.threads.posts.map((t,i)=>`[쓰레드 ${i+1}]\n`+t).join("\n\n")+"\n\n[카드뉴스] 블로그 정보 이미지 "+(p.out.blocks||[]).filter(b=>b.t==="img").length+"장 (첨부)";
  else { if(needRev(p)&&!p.snsNo){ alert("SNS 심의번호를 먼저 넣어 주세요. 보험 광고는 심의 후 게시해야 합니다 (금융소비자보호법 제22조)."); return; }
    if(mode==="insta") txt=s.insta.caption+"\n\n"+tags+"\n\n"+nt;
    else { const i=+mode.slice(1), L=s.threads.posts; txt=L[i]+(i===L.length-1?"\n\n"+nt:""); } }
  try{ await navigator.clipboard.writeText(txt); const o=btn.textContent; btn.textContent="복사됨"; setTimeout(()=>btn.textContent=o,1600); msg(mode==="review"?"SNS 심의 양식에 붙여넣으세요.":"앱에 붙여넣어 올리세요."); }
  catch(e){ msg("복사하지 못했습니다. 다른 브라우저(크롬)로 열어 주세요."); }
}
function dlCards(p){ let i=0; p.out.blocks.forEach(b=>{ if(b.t==="img"){ const u=cardURL(p,b.n); if(u) setTimeout(()=>dlURL(u,`${safe(p.out.title)}_카드${++i}.png`),i*400); } }); if(!i) alert("카드뉴스로 쓸 정보 이미지가 없습니다."); }

/* ---------- 4. 자동화 목록 ---------- */
function vMore(){
  const B=$("#oa-body");
  const L=[
    ["블로그 키워드 조사","네이버 월간 검색량 + 블로그 상위글 경쟁도로 쓸 키워드 고르기","사용 중","kw"],
    ["콘텐츠 계획","키워드별 발행일·심의번호·발행 주소 관리","사용 중","plan"],
    ["글 만들기","키워드·스타일(설계사 성별·글 유형·색상)로 심의 제출용 원고 + 정보 이미지 + AI 실사 사진 → 심의번호·배너 붙여 최종글 복사","사용 중","write"],
    ["카페 글","글 만들기에서 채널 '카페' 선택 → 카페 게시판용 정보 글(질문·후기형·홍보 문구 금지)","사용 중","write"],
    ["내 필수기재 배너","설계사별 등록번호 배너를 등록해 두고 글 끝에 복사해 붙이기","사용 중","banner"],
    ["이미지·썸네일","글 만들기에서 정보 이미지 0~6장(무료)·실사 사진 0~3장 개수 선택","사용 중","write"],
    ["네이버 작성 점검","글마다 제목 길이·키워드 횟수·소제목·첫 문단·근거 문단·이미지 수를 바로 점검","사용 중","write"],
    ["발행 후 순위 확인","발행한 글이 키워드 검색에서 몇 위인지 주기적으로 확인","준비중"],
    ["네이버 로직 점검","매주 네이버 검색 공식 블로그 새 공지를 확인해 관리자에게 알림 → 작성 규칙 파일(oa-rules.json) 갱신 → 다음 글부터 자동 반영","사용 중"],
    ["인스타·쓰레드","심의 받은 블로그 글 → 인스타 캡션·쓰레드 글·카드뉴스(정보 이미지) → SNS 심의 후 복사","사용 중","write"],
    ["쇼츠 대본","블로그 글을 쇼츠 대본으로 바꾸기","준비중"]];
  B.innerHTML=`<div class="oa-grid">${L.map(([t,d,s,go])=>`<div class="panel oa-card"><div class="row between"><b>${t}</b><span class="pill" style="background:${s==="사용 중"?"var(--accent-soft)":"var(--surface-2,#f1f1f1)"};color:${s==="사용 중"?"var(--ok)":"var(--muted)"}">${s}</span></div><p class="note" style="margin:6px 0 0">${d}</p>${go?`<button class="btn sm" type="button" data-oat="${go}" style="margin-top:10px;align-self:flex-start">열기</button>`:""}</div>`).join("")}</div>`;
}

/* ---------- 이벤트 ---------- */
document.addEventListener("toggle",e=>{ const d=e.target; if(d&&d.dataset&&d.dataset.owtxo) TXOPEN[+d.dataset.owtxo]=d.open; },true);
document.addEventListener("input",e=>{ const t=e.target; if(t&&t.dataset&&t.dataset.owtx!=null){ const p=curPost(); if(!p||!p.out) return; const i=t.dataset.owtx.indexOf(":"), n=+t.dataset.owtx.slice(0,i), s=(p.out.images||[])[n-1]; if(s){ txSet(s,t.dataset.owtx.slice(i+1),t.value); redrawCard(p,n); } } });
document.addEventListener("click",e=>{ const t=e.target; if(!t||!t.closest||!t.closest("#oa-root")) return;
  const tb=t.closest("[data-oat]"); if(tb){ TAB=tb.dataset.oat; render(); window.scrollTo(0,0); return; }
  const kd=t.closest("[data-oak]"); if(kd){ WKIND=kd.dataset.oak; WCUR=null; TAB="write"; render(); window.scrollTo(0,0); return; }
  if(t.closest("#ow-kwr")){ kwSuggest(); return; }
  if(t.closest("#ow-qgen")){ qGen(); return; }
  const mt=t.closest("[data-owmt]"); if(mt){ const p=curPost(); if(!p||!p.out) return; const [n,v]=mt.dataset.owmt.split(":"); MVSEL[+n]=v; drawPost(p); return; }
  const mc=t.closest("[data-owmc]"); if(mc){ const p=curPost(); if(!p||!p.out) return; const i=mc.dataset.owmc.indexOf(":"); colorCard(p,+mc.dataset.owmc.slice(0,i),mc.dataset.owmc.slice(i+1)); return; }
  const mvb=t.closest("[data-owmv]"); if(mvb){ const p=curPost(); if(!p||!p.out) return; const [n,d]=mvb.dataset.owmv.split(":"), S=0.03;
    if(d==="0") moveCard(p,+n,0,0,true); else moveCard(p,+n,d==="L"?-S:d==="R"?S:0,d==="U"?-S:d==="D"?S:0,false); return; }
  if(t.closest("#ow-uimode")){ UIMODE=!UIMODE; const p=curPost(); vWrite(); const b=$("#ow-body"); if(b&&p&&UIMODE) b.scrollIntoView({block:"start"}); return; }
  const us=t.closest("[data-owui]"); if(us){ UIAT=+us.dataset.owui; const f=$("#ow-ufile"); if(f){ f.value=""; f.click(); } return; }
  const um=t.closest("[data-owum]"); if(um){ const p=curPost(); if(!p||!p.out) return; const B=p.out.blocks, i=+um.dataset.i, a=um.dataset.owum;
    if(a==="del"){ if(!confirm("이 이미지를 글에서 뺄까요?")) return; const b=B[i]; B.splice(i,1); if(b&&b.t==="uimg"){ IDB.del(p.id+"_"+b.id); delete UIMG[p.id+"_"+b.id]; } }
    else { const j=a==="up"?i-1:i+1; if(j<0||j>=B.length) return; const x=B[i]; B[i]=B[j]; B[j]=x; }
    drawPost(p); return; }
  const oq=t.closest("[data-owq]"); if(oq){ const q=$("#ow-q"), sr=$("#ow-qsrc"); if(q) q.value=oq.dataset.owq; if(sr) sr.value="자주 받는 질문"; saveForm(); $$("[data-owq]").forEach(b=>b.classList.toggle("on",b===oq)); return; }
  const tt=t.closest("[data-owtt]"); if(tt){ const p=curPost(); if(p&&p.out&&p.st==="초안"){ p.out.title=tt.dataset.owtt; const i=$("#ow-title"); if(i) i.value=p.out.title; $$("[data-owtt]").forEach(b=>b.classList.toggle("on",b===tt)); const w=$("#ow-seo"); if(w) w.innerHTML=seoHTML(p); } return; }
  const kf=t.closest("[data-owkf]"); if(kf){ const i=$("#ow-kw"); if(i){ i.value=kf.dataset.owkf; saveForm(); } $$("[data-owkf]").forEach(b=>b.classList.toggle("on",b===kf)); return; }
  if(t.closest("#oa-go")){ runKw(); return; }
  if(t.closest("#oa-gen")){ genPlan(); return; }
  const gt=t.closest("[data-gt]"); if(gt){ const g=GS(), v=gt.dataset.gt; g.topics=g.topics.includes(v)?g.topics.filter(x=>x!==v):[...g.topics,v]; vPlanMake(); return; }
  const gw=t.closest("[data-gw]"); if(gw){ GS().weeks=+gw.dataset.gw; vPlanMake(); return; }
  const gf=t.closest("[data-gf]"); if(gf){ GS().freq=gf.dataset.gf; vPlanMake(); return; }
  const fl=t.closest("[data-oaf]"); if(fl){ FLT=fl.dataset.oaf; vDo(); return; }
  const ou=t.closest("[data-oaurl]"); if(ou){ const c=ou.closest("[data-oap]"); const d=c&&c.querySelector("details"); if(d){ d.open=true; const i=d.querySelector('[data-f="url"]'); if(i) i.focus(); } return; }
  if(t.closest("#ow-back")){ saveForm(); TAB="home"; WCUR=null; render(); window.scrollTo(0,0); return; }
  const ws=t.closest("[data-ws]"); if(ws){ const f=ws.dataset.ws, v=ws.dataset.v, p=curPost();
    if(p&&p.out&&DES.includes(f)){ if(p.st!=="초안"){ alert("심의에 올린 뒤에는 이미지를 바꾸면 다시 심의를 받아야 합니다."); return; }
      if(f==="bgid"){ p.style.bg="photo"; p.style.bgid=v; } else p.style[f]=v; const K=kst(curKind()); if(f==="bgid"){ K.bg="photo"; K.bgid=v; } else K[f]=v; keepDes(); return; }
    saveForm(); if(f==="bgid"){ kst(curKind()).bg="photo"; kst(curKind()).bgid=v; } else kst(curKind())[f]=v; if(p){ p.pend=Object.assign({},p.pend||{}); p.pend[f]=v; } const y=window.scrollY, op=!!($(".oa-form details")&&$(".oa-form details").open); vWrite(); const d=$(".oa-form details"); if(d&&op) d.open=true; window.scrollTo(0,y); return; }
  const bgx=t.closest("[data-owbgx]"); if(bgx){ if(!confirm("이 배경 이미지를 지울까요?")) return; const id=bgx.dataset.owbgx, L=BGLIST(), i=L.findIndex(b=>b.id===id); if(i>=0) L.splice(i,1); IDB.del("bgl_"+id); delete BGL[id]; delete BGLURL[id];
    [kst(curKind())].concat(POSTS().filter(x=>x.st==="초안").map(x=>x.style||{})).forEach(st=>{ if(st.bgid===id){ st.bg="plain"; delete st.bgid; } }); keepDes(); return; }
  if(t.closest("#ow-go")){ runWrite(); return; }
  if(t.closest("#ow-new")){ WCUR=null; vWrite(); return; }
  if(t.closest("[data-owlist]")){ TAB="home"; render(); const h=$("#oa-mylist"); if(h) h.scrollIntoView({behavior:"smooth",block:"start"}); return; }
  if(t.closest("[data-owre]")){ const p=curPost(); if(!p) return; if(p.st==="심의중"&&!confirm("심의에 올린 글입니다. 고치면 심의를 다시 받아야 합니다. 고칠까요?")) return; p.st="초안"; saveForm(); vWrite(); return; }
  if(t.closest("[data-owdup]")){ const p=curPost(); if(!p) return; const q=JSON.parse(JSON.stringify(p)); q.id=Date.now().toString(36)+Math.random().toString(36).slice(2,5); q.at=td(); q.st="초안"; q.no=""; q.noText=""; delete q.sns; delete q.snsNo;
    const ks=[]; (p.out.photos||[]).forEach((_,j)=>ks.push(j+1)); (p.out.blocks||[]).forEach(b=>{ if(b.t==="uimg") ks.push(b.id); });
    Promise.all(ks.map(k=>IDB.get(p.id+"_"+k).then(v=>v?IDB.put(q.id+"_"+k,v):0))).then(()=>{ POSTS().push(q); WCUR=q.id; saveForm(); vWrite(); window.scrollTo(0,0); const m=$("#ow-msg"); if(m) m.textContent="사본을 만들었습니다. 고친 뒤 다시 심의를 받으세요."; }); return; }
  const wo=t.closest("[data-owo]"); if(wo){ WCUR=wo.dataset.owo; TAB="write"; render(); window.scrollTo(0,0); return; }
  const wd=t.closest("[data-owd]"); if(wd){ if(confirm("이 글을 삭제할까요?")){ const P=POSTS(); const i=P.findIndex(x=>x.id===wd.dataset.owd); if(i>=0){ const x=P[i]; (x.out&&x.out.photos||[]).forEach((_,j)=>{ IDB.del(x.id+"_"+(j+1)); delete PHB[x.id+"_"+(j+1)]; }); (x.out&&x.out.blocks||[]).forEach(b=>{ if(b.t==="uimg"){ IDB.del(x.id+"_"+b.id); delete UIMG[x.id+"_"+b.id]; } }); IDB.del("bg_"+x.id); delete BGIMG[x.id]; P.splice(i,1); } if(WCUR===wd.dataset.owd) WCUR=null; render(); } return; }
  const wp=t.closest("[data-owp]"); if(wp){ runPhoto(+wp.dataset.owp,wp); return; }
  const cp=t.closest("[data-owcp]"); if(cp){ const p=curPost(), x=p&&imgSeq(p)[+cp.dataset.owcp], u=x&&x.get(); if(!u){ alert("이 이미지는 아직 없습니다. (AI 사진은 먼저 만들어 주세요)"); return; }
    copyImg(u).then(()=>{ const o=cp.textContent; cp.textContent="✔ 복사됨 — 네이버에서 Ctrl+V"; setTimeout(()=>cp.textContent=o,2500); }).catch(()=>alert("이 브라우저에서는 이미지 복사가 안 됩니다. 크롬으로 열거나 '이미지 전체 받기'를 쓰세요.")); return; }
  const wpd=t.closest("[data-owpd]"); if(wpd){ const p=curPost(); const u=p&&PHB[p.id+"_"+wpd.dataset.owpd]; if(u) dlURL(u,`${safe(p.out.title)}_사진${wpd.dataset.owpd}.jpg`); return; }
  const wc=t.closest("[data-owc]"); if(wc){ const p=curPost(); if(p&&p.out) copyPost(p,wc.dataset.owc,wc); return; }
  if(t.closest("#ow-seor")){ e.preventDefault(); const p=curPost(); const w=$("#ow-seo"); if(p&&p.out&&w){ w.innerHTML=seoHTML(p); const d=w.querySelector("details"); if(d) d.open=true; } return; }
  if(t.closest("#ow-sgo")){ runSns(); return; }
  if(t.closest("#ow-cards")){ const p=curPost(); if(p&&p.out) dlCards(p); return; }
  const sc=t.closest("[data-owsc]"); if(sc){ const p=curPost(); if(p&&p.sns) copySns(p,sc.dataset.owsc,sc); return; }
  if(t.closest("#ow-dlall")){ const p=curPost(); if(p&&p.out) dlAll(p); return; }
  const wst=t.closest("[data-owst]"); if(wst){ const p=curPost(); if(p){ p.st=wst.dataset.owst; const pl=D().plan.find(x=>x.post===p.id); if(pl&&pl.st!=="발행") pl.st="심의중"; vWrite(); } return; }
  const aw=t.closest("[data-oaw]"); if(aw){ const pl=D().plan.find(x=>x.id===aw.dataset.oaw); if(pl){ if(pl.post&&POSTS().some(x=>x.id===pl.post)) WCUR=pl.post; else { WCUR=null; WKIND=pl.ch==="카페"?"cafe":"blog"; window.__OAKW={kw:pl.keyword}; } TAB="write"; render(); window.scrollTo(0,0); } return; }
  const a=t.closest("[data-oaadd]"); if(a){ const r=(D().last||{}).rows||[]; const x=r[+a.dataset.oaadd]; if(x){ candAdd(x,"kw"); keepKw(); } return; }
  if(t.closest("#oa-addall")){ const r=(D().last||{}).rows||[]; let n=0; r.filter(x=>x.verdict==="최적"||x.verdict==="가능").forEach(x=>{ if(candAdd(x,"kw")) n++; }); keepKw(); const m=$("#oa-msg"); if(m) m.textContent=n?n+"개를 '키워드 고르기'에 넣었습니다.":"새로 고를 키워드가 없습니다."; return; }
  if(t.closest("#oa-cadd")){ const v=($("#oa-ck").value||""); let n=0; v.split(/[,\n]+/).forEach(k=>{ if(candAdd({keyword:k},"mine")) n++; }); keepKw(); return; }
  const cs=t.closest("[data-oacs]"); if(cs){ const m=cs.dataset.oacs, C=CAND(); if(m==="clear"){ if(!confirm("키워드 고르기 목록을 비울까요? (계획에 넣은 것은 그대로)")) return; D().cand=[]; } else C.forEach(c=>{ c.on=m==="best"?(c.verdict==="최적"||c.verdict==="가능"||!!c.mine):false; }); keepKw(); return; }
  const cu=t.closest("[data-oacu]"); if(cu){ e.preventDefault(); const C=CAND(), i=+cu.dataset.oacu; if(i>0){ [C[i-1],C[i]]=[C[i],C[i-1]]; } keepKw(); return; }
  const cx=t.closest("[data-oacx]"); if(cx){ e.preventDefault(); CAND().splice(+cx.dataset.oacx,1); keepKw(); return; }
  if(t.closest("#oa-cput")){ candPut(); return; }
  if(t.closest("#oa-idel")){ const P=D().plan, k=P.filter(idle).length; if(!k||!confirm(`아직 글을 안 쓴 계획 ${k}개를 모두 지울까요? (초안·심의·발행한 글은 그대로)`)) return; for(let j=P.length-1;j>=0;j--) if(idle(P[j])) P.splice(j,1); vDo(); const m=$("#oa-dmsg"); if(m) m.textContent=k+"개를 지웠습니다."; return; }
  if(t.closest("#oa-nadd")){ const k=($("#oa-nk").value||"").trim().slice(0,30); if(k.length>=2){ addPlan({keyword:k,verdict:"",search:0}); render(); } return; }
  const bc=t.closest("[data-oabc]"); if(bc){ const tr=bc.closest("[data-oap]"); let k=bc.dataset.oabc; if(tr){ const sel=tr.querySelector('[data-f="bn"]'); if(sel) k=sel.value; } copyBanner(k,bc); return; }
  const bd=t.closest("[data-oabd]"); if(bd){ dlBanner(bd.dataset.oabd); return; }
  const bx=t.closest("[data-oabx]"); if(bx){ if(confirm("이 배너 이미지를 삭제할까요?")){ delete BNS()[bx.dataset.oabx]; render(); } return; }
  const d=t.closest("[data-oadel]"); if(d){ if(confirm("이 계획을 삭제할까요?")){ const P=D().plan; const i=P.findIndex(p=>p.id===d.dataset.oadel); if(i>=0) P.splice(i,1); render(); } return; }
});
document.addEventListener("change",e=>{ const t=e.target; if(!t||!t.closest) return;
  if(t.id==="ow-sno"||t.id==="ow-snotxt"){ const p=curPost(); if(!p) return; const v=String(t.value||"").trim(); if(t.id==="ow-sno"){ p.snsNo=v.slice(0,40); if(!p.snsNoText&&v) p.snsNoText=/심의필/.test(v)?v:"준법감시인 심의필 제"+v+"호"; vWrite(); } else p.snsNoText=v.slice(0,160); return; }
  if(t.id==="ow-title"||t.id==="ow-no"||t.id==="ow-notxt"||t.id==="ow-bn"){ const p=curPost(); if(!p) return; const v=String(t.value||"").trim();
    if(t.id==="ow-title"){ if(p.st!=="초안"&&v!==p.out.title&&!confirm("심의 후 제목을 바꾸면 다시 심의를 받아야 합니다. 바꿀까요?")){ t.value=p.out.title; return; } p.out.title=v.slice(0,80); }
    if(t.id==="ow-no"){ p.no=v.slice(0,40); if(v&&p.st==="초안") p.st="심의중"; if(!p.noText&&v){ p.noText=/심의필/.test(v)?v:"준법감시인 심의필 제"+v+"호"; const n2=$("#ow-notxt"); if(n2) n2.value=p.noText; } }
    if(t.id==="ow-notxt") p.noText=v.slice(0,160);
    if(t.id==="ow-bn") p.bn=v;
    return; }
  if(t.dataset&&t.dataset.owbgu!=null){ const f=t.files&&t.files[0]; if(!f) return; if(BGLIST().length>=12){ alert("배경은 12개까지 올릴 수 있습니다. 안 쓰는 배경을 지운 뒤 올려 주세요."); return; }
    loadImg(f).then(async u=>{ const id="b"+Date.now().toString(36); await IDB.put("bgl_"+id,u); BGLIST().push({id,name:String(f.name||"").slice(0,40),at:td()}); BGLURL[id]=u;
      await new Promise(ok=>{ const im=new Image(); im.onload=()=>{ BGL[id]=im; ok(); }; im.onerror=ok; im.src=u; });
      const p=curPost(); if(p&&p.out&&p.st==="초안"){ p.style.bg="photo"; p.style.bgid=id; } const K=kst(curKind()); K.bg="photo"; K.bgid=id; keepDes(); })
    .catch(er=>alert(er.message)); return; }
  if(t.id==="oa-crep"){ GS().rep=t.checked; return; }
  if(t.dataset&&t.dataset.oacc!=null){ const c=CAND()[+t.dataset.oacc]; if(c){ c.on=t.checked; keepKw(); } return; }
  if(t.id==="oa-gs"){ GS().start=t.value; keepKw(); return; }
  if(t.id==="oa-gc"){ GS().custom=t.value; vPlanMake(); return; }
  if(t.dataset&&t.dataset.owtx!=null){ const p=curPost(); if(!p||!p.out) return; const i=t.dataset.owtx.indexOf(":"), n=+t.dataset.owtx.slice(0,i), s=(p.out.images||[])[n-1]; if(s){ txSet(s,t.dataset.owtx.slice(i+1),t.value); redrawCard(p,n); } return; }
  if(t.dataset&&t.dataset.owmcc!=null){ const p=curPost(); if(p&&p.out) colorCard(p,+t.dataset.owmcc,t.value); return; }
  if(t.id==="ow-ufile"){ const f=t.files&&t.files[0]; if(f) addUimg(f); return; }
  if(t.dataset&&t.dataset.owuc!=null){ const p=curPost(); const b=p&&p.out&&p.out.blocks[+t.dataset.owuc]; if(b&&b.t==="uimg") b.cap=String(t.value||"").trim(); return; }
  if(t.dataset&&t.dataset.oabu&&t.closest("#oa-root")){ const k=t.dataset.oabu, f=t.files&&t.files[0]; if(!f) return;
    loadImg(f).then(u=>{ BNS()[k]={img:u,name:String(f.name||"").slice(0,60),at:td()}; render(); }).catch(er=>{ const m=$("#oa-bmsg"); if(m) m.textContent=er.message; else alert(er.message); }); return; }
  const tr=t.closest("[data-oap]"); if(!tr||!t.dataset.f) return;
  const p=D().plan.find(x=>x.id===tr.dataset.oap); if(!p) return; const f=t.dataset.f; let v=String(t.value||"").trim();
  if(f==="url"&&v&&!/^https?:\/\//.test(v)){ alert("주소는 https:// 로 시작해야 합니다."); t.value=p.url; return; }
  if(f==="st"&&v==="발행"&&!p.no){ alert("심의번호를 먼저 넣어 주세요. 보험 광고는 심의 후 게시해야 합니다."); t.value=p.st; return; }
  if(f==="keyword"){ v=v.slice(0,30); if(v.length<2||D().plan.some(x=>x!==p&&x.keyword===v)){ alert(v.length<2?"키워드를 2자 이상 넣어 주세요.":"이미 계획에 있는 키워드입니다."); t.value=p.keyword; return; } if(v!==p.keyword){ p.verdict=""; p.search=0; } }
  p[f]=v; if(f==="url"&&v&&p.no&&p.st!=="발행") p.st="발행"; if(f==="st"||f==="date"||f==="url"||f==="keyword") vDo();
});
document.addEventListener("input",e=>{ const t=e.target; if(!t) return; const ps=curPost();
  if(ps&&ps.sns&&!ps.snsNo){ if(t.id==="ow-scap"){ ps.sns.insta.caption=t.value.slice(0,1500); return; } if(t.dataset&&t.dataset.owsp!=null){ ps.sns.threads.posts[+t.dataset.owsp]=t.value.slice(0,500); return; } }
  if(!t.dataset||t.dataset.owb==null) return; const p=curPost(); if(!p||!p.out) return; const b=p.out.blocks[+t.dataset.owb]; if(b) b.text=t.innerText.replace(/\n+/g," ").trim(); });
document.addEventListener("keydown",e=>{ if(e.key!=="Enter"||!e.target) return; const id=e.target.id; if(id==="oa-nk"||id==="oa-ck"){ e.preventDefault(); const b=$(id==="oa-nk"?"#oa-nadd":"#oa-cadd"); if(b) b.click(); } });

const css=document.createElement("style"); css.textContent=`
.oa-mv{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:6px}.oa-mv .btn{padding:3px 9px}.oa-mv .oa-chip{padding:3px 10px}
.oa-txt{margin-top:6px}.oa-txt summary{cursor:pointer;font-weight:700;font-size:13px}.oa-txt label{display:block;margin-top:6px;font-size:12.5px;color:var(--muted)}.oa-txt .oa-in,.oa-txt .oa-ta{width:100%;margin:2px 0 0}
.oa-cols{display:inline-flex;gap:4px;align-items:center;margin-left:8px}.oa-col{width:24px;height:24px;border-radius:50%;border:1.5px solid var(--line);font-size:9px;padding:0;cursor:pointer;background:#fff}.oa-col.on{outline:2px solid var(--accent);outline-offset:1px}.oa-cols input[type=color]{width:28px;height:24px;padding:0;border:0;background:none;cursor:pointer}
.oa-uslot{display:block;width:100%;margin:6px 0;padding:6px;border:1.5px dashed var(--accent);border-radius:8px;background:var(--accent-soft);color:var(--ok);font-weight:700;font-size:13px;cursor:pointer}
.oa-uimg img{max-width:100%;border-radius:8px}.oa-uimg figcaption{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.oa-qgen{margin:0 0 12px;padding:12px 14px;border:1.5px dashed var(--accent);border-radius:12px;background:var(--accent-soft)}
.oa-qg{margin-top:10px}.oa-qg small{display:block;font-weight:700;color:var(--muted);margin-bottom:4px}.oa-qg .oa-chip{text-align:left;white-space:normal}
.oa-when{display:flex;flex-wrap:wrap;gap:4px 28px;align-items:flex-start}.oa-when>div{min-width:0}.oa-when .oa-chips{margin-bottom:0}
.oa-cr{cursor:pointer;align-items:center;gap:10px}.oa-cr input[type=checkbox]{width:18px;height:18px;flex:none}.oa-cr:not(.on){opacity:.6}
.nav .grp[data-g="7"]{--g:var(--c5)}
.oa-rule{margin-top:12px;padding:10px 14px;border-radius:10px;background:var(--warn-soft);color:var(--warn);font-size:13.5px}.oa-rule b{color:inherit}
.oa-ta{width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 11px;background:var(--surface);font:inherit;resize:vertical}
.oa-t td,.oa-t th{white-space:nowrap;vertical-align:middle}.oa-t td.num{text-align:right}
.oa-t input,.oa-t select{font:inherit;font-size:13.5px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:inherit}
.oa-lb{font-size:13.5px;font-weight:700;margin:14px 0 6px}.oa-chips{display:flex;flex-wrap:wrap;gap:6px}
.oa-in{font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:inherit;width:100%;margin-top:8px;box-sizing:border-box}
.oa-sum{margin:16px 0 10px;font-size:14.5px}.oa-more summary{cursor:pointer;font-weight:700}
.oa-kl{display:flex;flex-direction:column;margin-top:8px}.oa-kr{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}.oa-kr>div{min-width:0}.oa-kr small{display:block;margin-top:2px}
.oa-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-top:10px}
.oa-pc{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface);min-width:0}.oa-pc.late{border-color:var(--warn)}
.oa-pt{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.oa-pt .d{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}.oa-pc.late .oa-pt .d{color:var(--warn);font-weight:700}.oa-pt b{font-size:15px}.oa-pt small{font-size:12px;font-weight:700}
.oa-prog{display:flex;gap:4px;margin-top:8px}.oa-prog span{flex:1;text-align:center;font-size:11.5px;padding:3px 0;border-radius:6px;background:var(--surface-2,#f1f1f1);color:var(--muted)}.oa-prog span.on{background:var(--accent-soft);color:var(--ok);font-weight:700}
.oa-pd{margin-top:8px}.oa-pd summary{cursor:pointer;font-size:12.5px;color:var(--muted)}.oa-pf{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.oa-pf label{display:flex;flex-direction:column;gap:3px;font-size:12.5px;font-weight:600;min-width:0}.oa-pf input,.oa-pf select{font:inherit;font-size:13.5px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:inherit;min-width:0;width:100%;box-sizing:border-box}
@media(max-width:520px){.oa-pf{grid-template-columns:1fr}}
.oa-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.oa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.oa-card{display:flex;flex-direction:column}
.oa-bgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.oa-bslot{border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
.oa-bslot img{width:100%;border-radius:6px;border:1px solid var(--line);background:#fff}
.oa-bdrop{display:flex;align-items:center;justify-content:center;min-height:110px;border:2px dashed var(--line);border-radius:8px;color:var(--muted);cursor:pointer;font-size:14px}.oa-bdrop:hover{border-color:var(--accent);color:var(--accent)}
.oa-steps{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.oa-steps span{font-size:13px;padding:5px 10px;border-radius:999px;background:var(--surface-2,#f1f1f1);color:var(--muted)}.oa-steps span.on{background:var(--accent);color:#fff;font-weight:700}
.oa-wgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.oa-wgrid label{display:flex;flex-direction:column;gap:4px;font-size:13.5px;font-weight:600}.oa-wgrid input,.oa-wgrid select{font:inherit;font-weight:400;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:inherit}
.oa-srow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}.oa-srow>b{font-size:13.5px;min-width:80px}
.oa-chip{font:inherit;font-size:13.5px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:inherit;cursor:pointer}.oa-chip small{color:var(--muted);font-size:11.5px;margin-left:4px}.oa-chip.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);font-weight:700}
.oa-sw{font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:6px;padding:5px 10px 5px 6px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:inherit;cursor:pointer}.oa-sw i{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--a) 0 55%,var(--o) 55%)}.oa-sw.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft);font-weight:700}
.oa-post{margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:20px 22px;background:#fff;color:#222;max-width:760px;line-height:1.85}.oa-post p{margin:0 0 14px;font-size:15.5px}.oa-post h3{font-size:18px;margin:24px 0 10px;padding-left:10px;border-left:4px solid var(--accent)}.oa-post [contenteditable="true"]:focus{outline:2px dashed var(--accent);outline-offset:3px}
.oa-fig{margin:16px 0}.oa-fig img{width:100%;max-width:640px;border-radius:8px;display:block}.oa-fig figcaption{font-size:12px;color:#888;margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.oa-phslot{border:2px dashed #f0c48a;background:#fff8ef;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;font-size:13.5px;color:#7a4a10}
.oa-q{font-size:17px;font-weight:700;color:#1e3a8a;margin:18px 0;padding:2px 0 2px 12px;border-left:4px solid #2563eb;line-height:1.6}
.oa-cap{font-weight:700;font-size:14px;margin:8px 0 6px}.oa-pt{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:14px}.oa-pt th,.oa-pt td{border:1px solid #ddd;padding:7px 9px;text-align:left}.oa-pt th{background:#f6f7f8}
.oa-h{margin:0 0 12px;font-size:20px}
.oa-kinds{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.oa-kind{font:inherit;color:inherit;text-align:left;display:flex;flex-direction:column;gap:6px;padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--surface);cursor:pointer;transition:.15s}
.oa-kind:hover{border-color:var(--accent);box-shadow:0 4px 14px rgba(0,0,0,.06);transform:translateY(-1px)}
.oa-kind .ic{font-size:28px}.oa-kind b{font-size:17px}.oa-kind .d{font-size:13.5px;color:var(--muted)}.oa-kind em{font-style:normal;font-size:12px;color:var(--accent);font-weight:700;margin-top:2px}
.oa-subs{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:14px}
.oa-sub{font:inherit;color:inherit;text-align:left;display:flex;flex-direction:column;gap:3px;padding:12px 14px;border:1px dashed var(--line);border-radius:12px;background:transparent;cursor:pointer}.oa-sub span{font-size:12.5px;color:var(--muted)}.oa-sub:hover{border-color:var(--accent)}
.oa-bar{display:flex;align-items:center;gap:10px;margin:0 0 12px;flex-wrap:wrap}.oa-bar h2{margin:0;font-size:19px}
.oa-st{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}.oa-st.draft{background:var(--surface-2,#f1f1f1);color:var(--muted)}.oa-st.mid{background:var(--warn-soft);color:var(--warn)}.oa-st.ok{background:var(--accent-soft);color:var(--ok)}
.oa-sec{display:flex;align-items:center;gap:8px;margin:20px 0 8px}.oa-sec:first-child{margin-top:0}.oa-sec .no{width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:13px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}.oa-sec b{font-size:15.5px}
.oa-full{display:block}.oa-go{min-width:200px;font-size:15px;padding:12px 22px}
.oa-plist{padding:4px 16px}.oa-prow{display:grid;grid-template-columns:92px 1fr auto auto;gap:4px 12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}.oa-prow:last-child{border-bottom:0}
.oa-prow .d{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}.oa-prow.late .d{color:var(--warn);font-weight:700}.oa-prow .k{min-width:0}.oa-prow .oa-pd{grid-column:1/-1;margin:0}.oa-prow .oa-pd summary{font-size:12px}
@media(max-width:560px){.oa-prow{grid-template-columns:70px 1fr auto}.oa-prow .a{grid-column:2/-1;justify-self:start}}
.oa-kg{margin-top:10px}.oa-kg>b{display:block;font-size:13.5px;margin-bottom:6px}
.oa-des summary small{color:var(--muted);font-weight:400}.oa-des .oa-srow>b{min-width:52px}
.oa-tpick{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}.oa-tpick .oa-chip{text-align:left}
.oa-bgl{align-items:center}.oa-bgt{position:relative;display:inline-block}.oa-bgt>button:first-child{width:64px;height:48px;padding:0;border:2px solid var(--line);border-radius:8px;overflow:hidden;background:#eee;cursor:pointer}.oa-bgt img{width:100%;height:100%;object-fit:cover;display:block}.oa-bgt.on>button:first-child{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
.oa-bgt .x{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:0;background:#333;color:#fff;font-size:12px;line-height:18px;padding:0;cursor:pointer}
.oa-pbar{height:6px;border-radius:3px;background:#f3dfc3;overflow:hidden}.oa-pbar i{display:block;height:100%;width:35%;background:#e0902f;border-radius:3px;animation:oapb 1.4s ease-in-out infinite}@keyframes oapb{0%{transform:translateX(-100%)}100%{transform:translateX(290%)}}
.oa-seo{margin-top:10px}.oa-seo li.ok{color:var(--ok)}.oa-seo li.no{color:var(--warn);font-weight:600}.oa-seo summary .btn{margin-left:6px}
.oa-help summary{cursor:pointer;color:var(--muted);font-size:13.5px}.oa-help ul{margin:8px 0 0;padding-left:18px;font-size:13.5px;color:var(--muted);display:flex;flex-direction:column;gap:4px}
`; document.head.appendChild(css);

window.ONLINE={render};
if(document.readyState!=="loading") render(); else document.addEventListener("DOMContentLoaded",render);
})();
