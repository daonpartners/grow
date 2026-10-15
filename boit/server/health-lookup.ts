// 보잇 · 진료내역 자동 불러오기 서버 기능 (Supabase Edge Function 'health-lookup') — 뼈대
// 배포: supabase functions deploy health-lookup  /  비밀키: supabase secrets set HL_PROVIDER=codef HL_CLIENT_ID=... HL_CLIENT_SECRET=...
// 원칙: 진료내역은 저장하지 않고 바로 화면에 돌려줌. 로그에도 남기지 않음. 1건 조회마다 충전금 차감(보잇 요금표 확정 후).
// 업체(CODEF·하이픈) 계약 후, 업체가 주는 API 명세서 기준으로 아래 start/finish 안을 채움. 지금은 계약 전이라 'not_configured'를 돌려주고 화면은 시범 예시로 동작.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Row = { d: string; h: string; c: string; n: string; t: "외래" | "입원"; k: string; r: string }; // 진료일·병원·상병코드·상병명·구분·일수·투약일수

const PROVIDER = Deno.env.get("HL_PROVIDER") || ""; // "codef" | "hyphen"
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function start(_p: { name: string; birth: string; phone: string; app: string; src: "hira" | "nhis"; years: number }): Promise<{ job: string }> {
  // TODO(계약 후): 업체 토큰 발급 → 간편인증(카카오·네이버·PASS 등) 요청 → 2차 인증 대기 상태값을 job으로 돌려줌
  throw new Error("not_configured");
}
async function finish(_job: string): Promise<Row[]> {
  // TODO(계약 후): 고객 승인 확인 → 진료내역 받아 Row 형식으로 변환 (상병코드·상병명 포함 여부 업체 확인 필수)
  throw new Error("not_configured");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!PROVIDER) return json({ error: "not_configured" });
  // TODO: Authorization 헤더의 보잇 회원 토큰 확인(supabase.auth.getUser) + 충전금 확인
  try {
    const b = await req.json();
    if (b.action === "start") return json(await start(b));
    if (b.action === "finish") return json({ rows: await finish(b.job) });
    return json({ error: "bad_action" }, 400);
  } catch (e) {
    const m = String((e as Error).message || e);
    return json({ error: m === "not_configured" ? "not_configured" : "provider_error", message: m });
  }
});
