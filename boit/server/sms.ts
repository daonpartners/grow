// 보잇 · 문자 발송 서버 기능 (Supabase Edge Function 'sms') — 솔라피(SOLAPI) 연동
// 설계사 각자의 솔라피 계정으로 보냄 (설계사 본인 번호·본인 충전금). 운영계획 16번.
//
// 배포:  supabase functions deploy sms --no-verify-jwt   (로그인 확인은 함수 안에서 직접 함 · 2026-10-23 배포 v1)
// 비밀값: supabase secrets set SMS_ENC_KEY=$(openssl rand -base64 32)  (필수 · 연결정보 암호화 열쇠, 한 번 정하면 바꾸지 말 것)
//        supabase secrets set SOLAPI_CLIENT_ID=... SOLAPI_CLIENT_SECRET=... SOLAPI_REDIRECT_URI=https://grow.ai.kr/boit/sl.html
//                                                                      ([솔라피 연결] 버튼용 · 앱 만든 뒤)
//        supabase secrets set SOLAPI_APP_ID=...                        (선택 · 솔라피 앱스토어 수익쉐어 앱 ID)
// 표 만들기: server/sms.sql 을 Supabase SQL Editor 에서 1회 실행
//
// 원칙: API Key·Secret·토큰은 화면(브라우저)으로 절대 돌려주지 않음. 암호화해서 boit_sms_links 표에만 저장.
//       문자 내용·받는 번호는 저장하지 않음 (솔라피 발송내역에만 남음).
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.solapi.com";
const SCOPES = "message:write message:read cash:read senderid:read";
const env = (k: string) => Deno.env.get(k) || "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

type Link =
  | { mode: "key"; apiKey: string; apiSecret: string }
  | { mode: "oauth"; access: string; refresh: string; exp: number };
type Row = { user_id: string; mode: string; enc: string; iv: string; sender: string | null };

/* ---------- 암호화 (AES-GCM 256) ---------- */
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let KEY: CryptoKey | null = null;
async function encKey() {
  if (KEY) return KEY;
  const raw = unb64(env("SMS_ENC_KEY"));
  if (raw.length !== 32) throw new Error("server_key_missing");
  KEY = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  return KEY;
}
async function seal(o: Link) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encKey(), new TextEncoder().encode(JSON.stringify(o)));
  return { enc: b64(new Uint8Array(ct)), iv: b64(iv) };
}
async function open(r: Row): Promise<Link> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(r.iv) }, await encKey(), unb64(r.enc));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function hmacHex(secret: string, data: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
  return [...s].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* ---------- 솔라피 호출 ---------- */
// API Key 방식 서명: HMAC-SHA256(apiSecret, date + salt)  (솔라피 공식 SDK와 같은 방식)
async function keyAuth(apiKey: string, apiSecret: string) {
  const date = new Date().toISOString();
  const abc = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const salt = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => abc[x % abc.length]).join("");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${await hmacHex(apiSecret, date + salt)}`;
}
async function refreshIfNeeded(userId: string, l: Link): Promise<Link> {
  if (l.mode !== "oauth" || l.exp > Date.now() + 120_000) return l;
  const r = await fetch(`${API}/oauth2/v1/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: l.refresh, client_id: env("SOLAPI_CLIENT_ID"), client_secret: env("SOLAPI_CLIENT_SECRET") }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("oauth_expired");
  const nl: Link = { mode: "oauth", access: j.access_token, refresh: j.refresh_token || l.refresh, exp: Date.now() + (j.expires_in ? j.expires_in * 1000 : 23 * 3600_000) };
  await db.from("boit_sms_links").update({ ...(await seal(nl)), updated_at: new Date().toISOString() }).eq("user_id", userId);
  return nl;
}
async function sol(l: Link, method: string, path: string, body?: unknown) {
  const auth = l.mode === "key" ? await keyAuth(l.apiKey, l.apiSecret) : `Bearer ${l.access}`;
  const r = await fetch(`${API}/${path}`, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

/* ---------- 쉬운 말 오류 ---------- */
function plain(code: string, msg: string): string {
  const t = `${code} ${msg}`;
  if (/3059/.test(t)) return "발신번호가 '변작'으로 막혔습니다. 통신사 '번호도용문자 차단서비스'를 해지하세요 (반영 최대 7일).";
  if (/balance|잔액|NotEnough|cash/i.test(t)) return "솔라피 잔액이 부족합니다. 솔라피에서 충전하세요.";
  if (/quota|한도|limit/i.test(t)) return "오늘 발송 한도를 넘었습니다. 오전 9시~9시 30분에 초기화됩니다.";
  if (/sender|발신번호/i.test(t)) return "등록되지 않았거나 만료된 발신번호입니다. 솔라피 [발신번호]에서 확인하세요.";
  if (/Unauthorized|signature|apiKey|token|Invalid.*Key/i.test(t)) return "솔라피 연결 정보가 맞지 않습니다. 다시 연결하세요.";
  if (/수신거부|reject|block/i.test(t)) return "수신거부한 번호입니다.";
  if (/to|수신번호/i.test(t)) return "받는 번호 형식이 맞지 않습니다.";
  return msg || "솔라피에서 접수하지 못했습니다.";
}
const digits = (s: string) => String(s || "").replace(/\D/g, "");

/* ---------- 상태 (잔액·발신번호) ---------- */
async function status(userId: string, row: Row) {
  let l = await refreshIfNeeded(userId, await open(row));
  const [bal, snd] = await Promise.all([sol(l, "GET", "cash/v1/balance"), sol(l, "GET", "senderid/v1/numbers?limit=50")]);
  if (!bal.ok) return { connected: true, mode: row.mode, sender: row.sender, error: plain(bal.j.errorCode || "", bal.j.errorMessage || "") };
  const list = (snd.ok && Array.isArray(snd.j.senderIds) ? snd.j.senderIds : []) as Array<Record<string, string>>;
  const senders = list
    .filter((s) => s.phoneNumber && (!s.status || s.status === "ACTIVE"))
    .map((s) => ({ no: s.phoneNumber, expireAt: s.expireAt || null }));
  return {
    connected: true,
    mode: row.mode,
    sender: row.sender,
    balance: Number(bal.j.balance || 0),
    point: Number(bal.j.point || 0),
    senders,
    sendersKnown: snd.ok,
  };
}

/* ---------- 요청 처리 ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!env("SMS_ENC_KEY")) return json({ error: "not_configured", message: "서버 비밀값(SMS_ENC_KEY)이 아직 등록되지 않았습니다." });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: "login_required", message: "보잇에 다시 로그인하세요." }, 401);
  const oauthOn = !!(env("SOLAPI_CLIENT_ID") && env("SOLAPI_CLIENT_SECRET") && env("SOLAPI_REDIRECT_URI"));

  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { /* 빈 요청 */ }
  const getRow = async () => (await db.from("boit_sms_links").select("*").eq("user_id", user.id).maybeSingle()).data as Row | null;
  const save = async (l: Link, sender?: string | null) => {
    const prev = await getRow();
    await db.from("boit_sms_links").upsert({ user_id: user.id, mode: l.mode, ...(await seal(l)), sender: sender ?? prev?.sender ?? null, updated_at: new Date().toISOString() });
  };

  try {
    switch (b.action) {
      case "config":
        return json({ oauth: oauthOn });

      case "status": {
        const row = await getRow();
        if (!row) return json({ connected: false, oauth: oauthOn });
        return json({ ...(await status(user.id, row)), oauth: oauthOn });
      }

      // API Key 붙여넣기로 연결 — 잔액 조회로 맞는 키인지 바로 확인
      case "key_connect": {
        const apiKey = String(b.apiKey || "").trim(), apiSecret = String(b.apiSecret || "").trim();
        if (!/^[A-Z0-9]{10,40}$/i.test(apiKey) || apiSecret.length < 16) return json({ error: "bad_key", message: "API Key와 Secret을 다시 확인하세요." });
        const l: Link = { mode: "key", apiKey, apiSecret };
        const t = await sol(l, "GET", "cash/v1/balance");
        if (!t.ok) return json({ error: "bad_key", message: plain(t.j.errorCode || "", t.j.errorMessage || "") });
        await save(l);
        return json(await status(user.id, (await getRow())!));
      }

      // [솔라피 연결] 버튼 — 솔라피 허용 화면 주소를 만들어 줌
      case "oauth_url": {
        if (!oauthOn) return json({ error: "oauth_off", message: "[솔라피 연결] 버튼은 보잇 앱 등록 후 열립니다. 지금은 API Key로 연결하세요." });
        const nonce = crypto.randomUUID();
        const state = `${user.id}.${nonce}.${(await hmacHex(env("SMS_ENC_KEY"), user.id + nonce)).slice(0, 32)}`;
        const q = new URLSearchParams({ client_id: env("SOLAPI_CLIENT_ID"), response_type: "code", redirect_uri: env("SOLAPI_REDIRECT_URI"), scope: SCOPES, state });
        return json({ url: `${API}/oauth2/v1/authorize?${q}` });
      }

      // 솔라피 허용 후 돌아온 code로 토큰 받기
      case "oauth_finish": {
        if (!oauthOn) return json({ error: "oauth_off" });
        const [uid, nonce, sig] = String(b.state || "").split(".");
        if (uid !== user.id || sig !== (await hmacHex(env("SMS_ENC_KEY"), uid + nonce)).slice(0, 32)) return json({ error: "bad_state", message: "연결 요청이 맞지 않습니다. 다시 시도하세요." });
        const r = await fetch(`${API}/oauth2/v1/access_token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grant_type: "authorization_code", code: b.code, client_id: env("SOLAPI_CLIENT_ID"), client_secret: env("SOLAPI_CLIENT_SECRET"), redirect_uri: env("SOLAPI_REDIRECT_URI") }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.access_token) return json({ error: "oauth_failed", message: "솔라피 연결에 실패했습니다. 다시 시도하세요." });
        await save({ mode: "oauth", access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in ? j.expires_in * 1000 : 23 * 3600_000) });
        return json(await status(user.id, (await getRow())!));
      }

      case "set_sender": {
        const row = await getRow();
        if (!row) return json({ error: "not_connected" });
        const s = digits(b.sender);
        if (s.length < 8 || s.length > 12) return json({ error: "bad_sender", message: "발신번호를 확인하세요." });
        await db.from("boit_sms_links").update({ sender: s, updated_at: new Date().toISOString() }).eq("user_id", user.id);
        return json({ ok: true, sender: s });
      }

      // 발송 — messages: [{to, text, subject?}] · at: 예약 시각(ISO, 선택)
      case "send": {
        const row = await getRow();
        if (!row) return json({ error: "not_connected", message: "솔라피를 먼저 연결하세요." });
        if (!row.sender) return json({ error: "no_sender", message: "발신번호를 먼저 고르세요." });
        const ms = (Array.isArray(b.messages) ? b.messages : []).slice(0, 1000)
          .map((m: Record<string, string>) => ({ to: digits(m.to), from: row.sender!, text: String(m.text || ""), ...(m.subject ? { subject: String(m.subject).slice(0, 40) } : {}) }))
          .filter((m: { to: string; text: string }) => m.to.length >= 10 && m.text);
        if (!ms.length) return json({ error: "empty", message: "보낼 번호·내용이 없습니다." });
        const at = b.at ? new Date(b.at) : null;
        if (at && (isNaN(+at) || +at < Date.now() - 60_000)) return json({ error: "bad_time", message: "예약 시각을 확인하세요." });
        const l = await refreshIfNeeded(user.id, await open(row));
        const body: Record<string, unknown> = { messages: ms, allowDuplicates: false };
        if (at) body.scheduledDate = at.toISOString();
        if (env("SOLAPI_APP_ID")) body.agent = { appId: env("SOLAPI_APP_ID") };
        const r = await sol(l, "POST", "messages/v4/send-many/detail", body);
        if (!r.ok) return json({ error: "send_failed", code: r.j.errorCode || String(r.status), message: plain(r.j.errorCode || "", r.j.errorMessage || "") });
        const cnt = r.j.groupInfo?.count || {};
        const failed = (r.j.failedMessageList || []).map((f: Record<string, string>) => ({ to: f.to, code: f.statusCode, why: plain(f.statusCode, f.statusMessage) }));
        return json({ ok: true, groupId: r.j.groupInfo?.groupId || null, total: ms.length, accepted: cnt.registeredSuccess ?? ms.length - failed.length, failed, scheduled: !!at });
      }

      case "disconnect":
        await db.from("boit_sms_links").delete().eq("user_id", user.id);
        return json({ connected: false, oauth: oauthOn });

      default:
        return json({ error: "bad_action" }, 400);
    }
  } catch (e) {
    const m = String((e as Error).message || e);
    if (m === "oauth_expired") return json({ error: "oauth_expired", message: "솔라피 연결이 만료되었습니다. 다시 연결하세요." });
    if (m === "server_key_missing") return json({ error: "not_configured", message: "서버 비밀값(SMS_ENC_KEY)이 올바르지 않습니다." });
    return json({ error: "server_error", message: "잠시 후 다시 시도하세요." });
  }
});
