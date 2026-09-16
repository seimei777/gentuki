-- 現地確認の報告を集める。
-- 方針：anon は「追記だけ」。読むのは集計ビューだけ。
--   ・UPDATE を許すと PATCH ?uk=eq.○○ で他人の報告を一括改変できてしまうので許さない。
--   ・押し直しは新しい行を積み、ビュー側で (uk, client_id) ごとの最新だけを数える。
--   ・RLS ポリシーは「どの行か」しか決めない。テーブルへの GRANT が別に必要。
create table if not exists public.spot_reports (
  id         bigint generated always as identity primary key,
  uk         text        not null check (char_length(uk) between 1 and 80),
  verdict    text        not null check (verdict in ('ok','ng')),
  lanes      smallint    check (lanes between 0 and 12),
  road       text        check (char_length(road) <= 120),
  city       text        check (char_length(city) <= 40),
  client_id  uuid        not null,
  created_at timestamptz not null default now()
);

create index if not exists spot_reports_uk_idx on public.spot_reports (uk);
create index if not exists spot_reports_latest_idx
  on public.spot_reports (uk, client_id, created_at desc);

-- 追記専用にしたので、一意制約と UPDATE ポリシーは捨てる
drop index  if exists public.spot_reports_uk_client_uidx;
drop policy if exists "anon update own report" on public.spot_reports;

alter table public.spot_reports enable row level security;

drop policy if exists "anon insert report" on public.spot_reports;
create policy "anon insert report"
  on public.spot_reports for insert to anon with check (true);

-- ポリシーとは別に、テーブル権限そのものを与える（これが無いと 42501 で全部落ちる）
revoke all on public.spot_reports from anon;
grant insert on public.spot_reports to anon;   -- select も update も delete も与えない

-- 同じ端末が押し直したら、最後の1回だけを数える
create or replace view public.spot_report_counts
with (security_invoker = off) as
with latest as (
  select distinct on (uk, client_id) uk, client_id, verdict, created_at
  from public.spot_reports
  order by uk, client_id, created_at desc
)
select uk,
       count(*) filter (where verdict = 'ok')::int as ok_count,
       count(*) filter (where verdict = 'ng')::int as ng_count,
       max(created_at)                             as last_at
from latest
group by uk;

grant select on public.spot_report_counts to anon;
