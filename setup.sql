-- CONFOODENCE database setup. Run once in Supabase: SQL Editor > New query > paste > Run.
-- STEP 1: change CHANGE-ME-TO-YOUR-CODE (on the "insert into" line) to your group passphrase before you run it.
-- To change the code later, run:  update public.config set code = 'new code' where id = 1;

create table if not exists public.config (
  id int primary key default 1 check (id = 1),
  code text not null
);
insert into public.config (id, code) values (1, 'CHANGE-ME-TO-YOUR-CODE')
  on conflict (id) do nothing;

create table if not exists public.polls (
  poll_id text primary key check (poll_id ~ '^[a-z0-9]{6,12}$'),
  title text not null,
  ref_name text not null,
  ref_lat double precision not null,
  ref_lng double precision not null,
  place_ids int[] not null,
  coords jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  poll_id text not null references public.polls(poll_id) on delete cascade,
  voter_id text not null check (char_length(voter_id) between 6 and 40),
  place_id int not null,
  vote smallint not null check (vote in (-1, 0, 1)),
  updated_at timestamptz not null default now(),
  primary key (poll_id, voter_id, place_id)
);

-- Lock the tables completely: nobody can read or write them directly.
alter table public.config enable row level security;
alter table public.polls enable row level security;
alter table public.votes enable row level security;

-- The only way in is through these functions, and each one checks the group code.
create or replace function public.cf_ok(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.config where code = c)
$$;

create or replace function public.cf_check(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.cf_ok(c)
$$;

create or replace function public.cf_get_poll(c text, p_id text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.cf_ok(c) then raise exception 'bad code'; end if;
  return (select row_to_json(p) from public.polls p where p.poll_id = p_id);
end $$;

revoke all on function public.cf_ok(text) from public, anon, authenticated;
grant execute on function public.cf_check(text) to anon;
grant execute on function public.cf_get_poll(text, text) to anon;

-- ===== v2 update: submit-then-unlock voting, stored walking routes. Safe to run more than once. =====
alter table public.polls add column if not exists legs jsonb;

drop function if exists public.cf_create_poll(text, text, text, text, double precision, double precision, int[], jsonb);
drop function if exists public.cf_cast(text, text, text, int, smallint);
drop function if exists public.cf_get_votes(text, text);

create or replace function public.cf_create_poll(c text, p_id text, p_title text, p_ref_name text,
  p_lat double precision, p_lng double precision, p_places int[], p_coords jsonb, p_legs jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.cf_ok(c) then raise exception 'bad code'; end if;
  if array_length(p_places, 1) is null or array_length(p_places, 1) > 12 then raise exception 'bad places'; end if;
  insert into public.polls (poll_id, title, ref_name, ref_lat, ref_lng, place_ids, coords, legs)
  values (p_id, left(p_title, 80), left(p_ref_name, 80), p_lat, p_lng, p_places, p_coords, p_legs);
end $$;

-- A voter submits all answers at once. They cannot be changed afterwards.
create or replace function public.cf_submit(c text, p_id text, v_id text, pls int[], vals smallint[]) returns void
language plpgsql security definer set search_path = public as $$
declare want int[];
begin
  if not public.cf_ok(c) then raise exception 'bad code'; end if;
  if char_length(v_id) < 6 or char_length(v_id) > 40 then raise exception 'bad voter'; end if;
  select place_ids into want from public.polls where poll_id = p_id;
  if want is null then raise exception 'bad poll'; end if;
  if array_length(pls, 1) is distinct from array_length(vals, 1)
     or (select array_agg(x order by x) from unnest(pls) x) is distinct from (select array_agg(x order by x) from unnest(want) x)
  then raise exception 'bad votes'; end if;
  insert into public.votes (poll_id, voter_id, place_id, vote)
  select p_id, v_id, u.pl, u.val from unnest(pls, vals) as u(pl, val)
  on conflict do nothing;
end $$;

-- Results: nobody's identity is returned, rows come back shuffled, and everyone else's
-- votes are withheld until the caller has answered every place.
create or replace function public.cf_results(c text, p_id text, v_id text)
returns table (place_id int, vote smallint, mine boolean)
language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  if not public.cf_ok(c) then raise exception 'bad code'; end if;
  select array_length(p.place_ids, 1) into n from public.polls p where p.poll_id = p_id;
  if n is null then return; end if;
  if (select count(*) from public.votes w where w.poll_id = p_id and w.voter_id = v_id) < n then
    return query select w.place_id, w.vote, true from public.votes w where w.poll_id = p_id and w.voter_id = v_id;
  else
    return query select w.place_id, w.vote, (w.voter_id = v_id) from public.votes w where w.poll_id = p_id order by random();
  end if;
end $$;

grant execute on function public.cf_create_poll(text, text, text, text, double precision, double precision, int[], jsonb, jsonb) to anon;
grant execute on function public.cf_submit(text, text, text, int[], smallint[]) to anon;
grant execute on function public.cf_results(text, text, text) to anon;
