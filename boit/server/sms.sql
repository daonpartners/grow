-- 보잇 · 솔라피 문자 연결정보 표 (Supabase SQL Editor 에서 1회 실행)
-- 설계사별 솔라피 연결정보(API Key·Secret 또는 토큰)를 암호화해서 보관. 화면(브라우저)에서는 읽을 수도 쓸 수도 없음.
-- 서버 기능 'sms'(server/sms.ts)만 service_role 권한으로 읽고 씀.
create table if not exists public.boit_sms_links(
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null check (mode in ('key','oauth')),
  enc text not null,          -- 암호화된 연결정보 (AES-GCM)
  iv text not null,
  sender text,                -- 선택한 발신번호 (숫자만)
  updated_at timestamptz default now());
alter table public.boit_sms_links enable row level security;
-- 정책(policy)을 일부러 만들지 않음 → 로그인한 회원도 직접 접근 불가. 서버 기능만 접근.
