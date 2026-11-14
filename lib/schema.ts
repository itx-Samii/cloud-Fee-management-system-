// The database tables. The app runs this itself the first time it connects (every statement is
// "if not exists"), so a new Supabase project needs no manual setup. Changes to existing tables
// must be added below as their own idempotent statements, never by editing a CREATE TABLE.
//
// Every school's records live in the same tables, told apart by school_id; ids count up per school
// (receipt #1, #2, ... for each school), handed out through the counters table.
//
// Row Level Security is switched on with no policies: Supabase's public API (the anon key) can't
// read anything, while the app, connecting as the database owner, is not affected by it.

export const SCHEMA_SQL = /* sql */ `
create table if not exists staff_session_revisions (
  username text primary key,
  revision bigint not null default 1
);
alter table staff_session_revisions enable row level security;

create or replace function revoke_staff_session(login_name text) returns void language plpgsql as $$
begin
  if login_name is not null and login_name <> '' then
    insert into staff_session_revisions (username) values (lower(login_name))
    on conflict (username) do update set revision = staff_session_revisions.revision + 1;
  end if;
end;
$$;

create or replace function revoke_changed_user_sessions() returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    perform revoke_staff_session(OLD.username);
    return OLD;
  end if;
  if (OLD.username, OLD.password, OLD.role, OLD.status, OLD.school_id)
      is distinct from (NEW.username, NEW.password, NEW.role, NEW.status, NEW.school_id) then
    perform revoke_staff_session(OLD.username);
    if OLD.username is distinct from NEW.username then
      perform revoke_staff_session(NEW.username);
    end if;
  end if;
  return NEW;
end;
$$;

create or replace function revoke_changed_principal_sessions() returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' then
    if (OLD.admin_username, OLD.admin_password, OLD.super_admin_password)
        is not distinct from (NEW.admin_username, NEW.admin_password, NEW.super_admin_password) then
      return NEW;
    end if;
  end if;
  if TG_OP <> 'INSERT' then
    perform revoke_staff_session(OLD.admin_username);
    if OLD.school_id = 'master' then perform revoke_staff_session('superadmin'); end if;
    if OLD.school_id = 'school_brookfield' then perform revoke_staff_session('admin'); end if;
    if OLD.school_id like 'school_%' then perform revoke_staff_session(substring(OLD.school_id from 8)); end if;
  end if;
  if TG_OP <> 'DELETE' then
    perform revoke_staff_session(NEW.admin_username);
    if NEW.school_id = 'master' then perform revoke_staff_session('superadmin'); end if;
    if NEW.school_id = 'school_brookfield' then perform revoke_staff_session('admin'); end if;
    if NEW.school_id like 'school_%' then perform revoke_staff_session(substring(NEW.school_id from 8)); end if;
    return NEW;
  end if;
  return OLD;
end;
$$;
create table if not exists school_settings (
  school_id            text primary key,
  admin_username       text,
  admin_password       text,
  school_name          text,
  super_admin_password text,
  due_days             integer,
  late_fine            numeric(12,2),
  updated_at           timestamptz not null default now()
);
create unique index if not exists school_settings_admin_username on school_settings (admin_username);

create table if not exists licenses (
  school_id      text primary key,
  client_name    text not null,
  admin_username text,
  license_key    text not null unique,
  status         text not null default 'active' check (status in ('active', 'blocked')),
  max_students   integer not null default 1000,
  features       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  last_sync      timestamptz not null default now()
);

create table if not exists counters (
  school_id text not null,
  name      text not null,
  seq       integer not null default 0,
  primary key (school_id, name)
);

create table if not exists users (
  school_id    text not null,
  id           integer not null,
  username     text not null,
  password     text not null,
  display_name text not null,
  role         text not null default 'accountant' check (role in ('admin', 'accountant')),
  status       text not null default 'active' check (status in ('active', 'blocked')),
  created_at   timestamptz not null default now(),
  primary key (school_id, id)
);
create unique index if not exists users_username on users (lower(username));

create or replace trigger users_revoke_sessions after update or delete on users
for each row execute function revoke_changed_user_sessions();
create or replace trigger principals_revoke_sessions after insert or update or delete on school_settings
for each row execute function revoke_changed_principal_sessions();

create table if not exists classes (
  school_id      text not null,
  id             integer not null,
  name           text not null,
  section        text not null default '',
  monthly_fee    numeric(12,2) not null default 0,
  annual_charges numeric(12,2) not null default 0,
  created_at     timestamptz not null default now(),
  primary key (school_id, id)
);

create table if not exists students (
  school_id           text not null,
  id                  integer not null,
  name                text not null,
  father_name         text,
  parent_phone        text,
  admission_number    text,
  class_id            integer,
  monthly_fee         numeric(12,2) not null default 0,
  discount            numeric(12,2) not null default 0,
  annual_charges      numeric(12,2) not null default 0,
  paid_annual_charges numeric(12,2) not null default 0,
  status              text not null default 'Active',
  left_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  primary key (school_id, id)
);
create index if not exists students_class on students (school_id, class_id);

-- One row per student per month: the fee voucher (challan). Paid amounts live here; how each
-- payment was split across months is on its receipt in payments.
create table if not exists fees (
  school_id        text not null,
  id               integer not null,
  student_id       integer,
  student_name     text,
  father_name      text,
  admission_number text,
  class_id         integer,
  class_name       text,
  month            text not null,
  year             text not null,
  amount           numeric(12,2) not null default 0,
  base_amount      numeric(12,2),
  discount         numeric(12,2),
  status           text not null default 'Unpaid' check (status in ('Paid', 'Unpaid', 'Partially Paid')),
  issue_date       timestamptz,
  due_date         timestamptz,
  payment_date     timestamptz,
  -- Null only on vouchers marked paid before amounts were tracked.
  paid_tuition     numeric(12,2),
  paid_ac          numeric(12,2),
  total_received   numeric(12,2),
  fine_charged     numeric(12,2),
  fine_waived      boolean not null default false,
  is_ac_only       boolean not null default false,
  primary key (school_id, id)
);
create index if not exists fees_student on fees (school_id, student_id);
create index if not exists fees_period on fees (school_id, year, month);
-- So two "generate" requests at once can't bill a student twice for a month. Vouchers from before
-- due dates were tracked are left out: older data may hold duplicates already.
create unique index if not exists one_voucher_per_student_month on fees (school_id, student_id, year, month) where due_date is not null;

-- Cash receipts; id is the receipt number. Reversed receipts stay, marked.
create table if not exists payments (
  school_id        text not null,
  id               integer not null,
  voucher_id       integer not null,
  student_id       integer,
  student_name     text,
  class_name       text,
  month            text,
  year             text,
  paid_tuition     numeric(12,2) not null default 0,
  paid_ac          numeric(12,2) not null default 0,
  amount           numeric(12,2) not null,
  received_at      timestamptz not null default now(),
  received_by      text not null,
  received_by_name text,
  -- [{voucherId, month, year, amount, fineCharged?, fineWaived?, advance?, created?}]: where the tuition went.
  allocations      jsonb,
  reversed_at      timestamptz,
  reversed_by      text,
  primary key (school_id, id)
);
create index if not exists payments_received on payments (school_id, received_at);
create index if not exists payments_voucher on payments (school_id, voucher_id);
create index if not exists payments_student on payments (school_id, student_id);

create table if not exists expenses (
  school_id   text not null,
  id          integer not null,
  category    text not null default 'Other',
  amount      numeric(12,2) not null,
  description text not null default '',
  date        timestamptz not null default now(),
  primary key (school_id, id)
);

create table if not exists staff (
  school_id         text not null,
  id                integer not null,
  name              text not null,
  designation       text not null default '',
  salary            numeric(12,2) not null default 0,
  deduction_per_off numeric(12,2) not null default 0,
  joined_date       timestamptz,
  status            text not null default 'Active',
  primary key (school_id, id)
);

create table if not exists salaries_history (
  school_id    text not null,
  id           integer not null,
  staff_id     integer,
  staff_name   text not null default '',
  month        text,
  year         text,
  amount       numeric(12,2) not null default 0,
  offs         numeric(6,2) not null default 0,
  deduction    numeric(12,2) not null default 0,
  payment_date timestamptz not null default now(),
  primary key (school_id, id)
);
create index if not exists salaries_staff on salaries_history (school_id, staff_id);

-- Append-only: nothing in the app edits or deletes it, and restores leave it alone.
create table if not exists audit_log (
  id           bigint generated always as identity primary key,
  school_id    text not null,
  at           timestamptz not null default now(),
  username     text not null,
  display_name text,
  role         text not null,
  action       text not null,
  summary      text not null
);
create index if not exists audit_log_school_at on audit_log (school_id, at desc);

-- Charges on top of the monthly fee, as [{label, amount}]: on a voucher they are part of its amount;
-- a student's monthly_charges (transport, say) are copied onto each new voucher.
alter table fees     add column if not exists charges         jsonb;
alter table students add column if not exists monthly_charges jsonb;

-- Each class promotion (new session), with every student's class, fee and status before and after,
-- so the latest one can be undone.
create table if not exists promotions (
  id           bigint generated always as identity primary key,
  school_id    text not null,
  done_at      timestamptz not null default now(),
  done_by      text not null,
  done_by_name text,
  summary      text not null,
  -- [{studentId, name, from: {classId, monthlyFee, annualCharges, status, leftAt}, to: {...}}]
  moves        jsonb not null,
  undone_at    timestamptz,
  undone_by    text
);
create index if not exists promotions_school on promotions (school_id, id desc);

-- Fee reminders opened in WhatsApp, one row per family message, so staff can see who was reminded
-- lately and not message a family twice.
create table if not exists reminders (
  id           bigint generated always as identity primary key,
  school_id    text not null,
  sent_at      timestamptz not null default now(),
  sent_by      text not null,
  sent_by_name text,
  phone        text not null,
  -- [studentId, ...]: the brothers and sisters the message was about.
  student_ids  jsonb not null,
  amount       numeric(12,2) not null default 0
);
create index if not exists reminders_school_sent on reminders (school_id, sent_at desc);

-- Parent portal logins: one per family (parent phone, in WhatsApp form 923001234567) per school.
-- The PIN is hashed like passwords; failed tries lock the login for a while. Never in backups.
create table if not exists parent_logins (
  school_id     text not null,
  phone         text not null,
  pin           text not null,
  pin_set_at    timestamptz not null default now(),
  pin_set_by    text not null,
  last_login_at timestamptz,
  failed_logins integer not null default 0,
  locked_until  timestamptz,
  primary key (school_id, phone)
);
create index if not exists parent_logins_phone on parent_logins (phone);

alter table school_settings  enable row level security;
alter table licenses         enable row level security;
alter table counters         enable row level security;
alter table users            enable row level security;
alter table classes          enable row level security;
alter table students         enable row level security;
alter table fees             enable row level security;
alter table payments         enable row level security;
alter table expenses         enable row level security;
alter table staff            enable row level security;
alter table salaries_history enable row level security;
alter table audit_log        enable row level security;
alter table promotions       enable row level security;
alter table reminders        enable row level security;
alter table parent_logins    enable row level security;

alter table payments add column if not exists request_id text;
alter table payments add column if not exists request_fingerprint text;
create unique index if not exists payments_request_id on payments (school_id, request_id) where request_id is not null;

alter table students add column if not exists roll_number integer;
create unique index if not exists students_class_roll on students (school_id, class_id, roll_number)
  where roll_number is not null;
create index if not exists students_admission_lookup on students (school_id, upper(btrim(admission_number)));

-- Continue any existing ADM series and preserve all supplied legacy admission numbers.
insert into counters (school_id, name, seq)
select school_id, 'student-admission', max(substring(btrim(admission_number) from 5)::int)
from students where btrim(admission_number) ~* '^ADM-[0-9]{1,9}$' group by school_id
on conflict (school_id, name) do update set seq = excluded.seq where counters.seq < excluded.seq;

create or replace function next_student_number(tenant text, series text, last_used integer default 0)
returns integer language sql as $$
  insert into counters (school_id, name, seq) values (tenant, series, last_used + 1)
  on conflict (school_id, name) do update set seq = greatest(counters.seq, last_used) + 1
  returning seq;
$$;

create or replace function assign_student_numbers() returns trigger language plpgsql as $$
declare
  issued integer;
begin
  perform pg_advisory_xact_lock(hashtext(NEW.school_id || ':student-numbering'));

  if nullif(btrim(NEW.admission_number), '') is null then
    loop
      issued := next_student_number(NEW.school_id, 'student-admission');
      NEW.admission_number := 'ADM-' || lpad(issued::text, greatest(5, length(issued::text)), '0');
      exit when not exists (select 1 from students where school_id = NEW.school_id
        and upper(btrim(admission_number)) = NEW.admission_number);
    end loop;
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.class_id is distinct from OLD.class_id then NEW.roll_number := null; end if;
  end if;
  if NEW.class_id is null then
    NEW.roll_number := null;
  elsif NEW.roll_number is null then
    NEW.roll_number := next_student_number(NEW.school_id, 'student-roll:' || NEW.class_id, (
      select coalesce(max(roll_number), 0) from students where school_id = NEW.school_id and class_id = NEW.class_id
    ));
  end if;
  return NEW;
end;
$$;

create or replace trigger students_assign_numbers before insert or update of class_id, admission_number, roll_number on students
for each row execute function assign_student_numbers();

-- Give existing students missing identifiers numbers in their original registration order.
do $$
declare
  student record;
begin
  for student in select school_id, id from students
    where nullif(btrim(admission_number), '') is null or (class_id is not null and roll_number is null)
    order by school_id, id
  loop
    update students set admission_number = admission_number, roll_number = roll_number
    where school_id = student.school_id and id = student.id;
  end loop;
end;
$$;

create table if not exists school_signup_requests (
  id             uuid primary key,
  school_name    text not null,
  school_address text not null,
  principal_name text not null,
  email          text not null,
  phone          text not null,
  username       text not null,
  password_hash  text,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  school_id      text,
  check ((status = 'pending') = (password_hash is not null)),
  check ((status = 'pending') = (reviewed_at is null)),
  check ((status = 'approved') = (school_id is not null))
);
create unique index if not exists school_signup_pending_username on school_signup_requests (username) where status = 'pending';
create index if not exists school_signup_created on school_signup_requests (created_at desc, id);
alter table school_signup_requests enable row level security;

-- Principal and staff logins use the same username namespace across these two tables.
create or replace function prevent_shared_login_name() returns trigger language plpgsql as $$
declare login_name text;
begin
  if TG_TABLE_NAME = 'users' then
    login_name := lower(NEW.username);
    if TG_OP = 'UPDATE' and lower(OLD.username) is not distinct from login_name then return NEW; end if;
  else
    login_name := lower(NEW.admin_username);
    if TG_OP = 'UPDATE' and lower(OLD.admin_username) is not distinct from login_name then return NEW; end if;
  end if;
  if login_name is null then return NEW; end if;

  perform pg_advisory_xact_lock(hashtext('staff-login-name'), hashtext(login_name));
  if (TG_TABLE_NAME = 'users' and exists (select 1 from school_settings where admin_username = login_name))
    or (TG_TABLE_NAME = 'school_settings' and exists (select 1 from users where lower(username) = login_name)) then
    raise unique_violation using message = 'Username is already in use', constraint = 'staff_login_name_unique';
  end if;
  return NEW;
end;
$$;
create or replace trigger users_check_login_name before insert or update of username on users
  for each row execute function prevent_shared_login_name();
create or replace trigger principals_check_login_name before insert or update of admin_username on school_settings
  for each row execute function prevent_shared_login_name();

alter table parent_logins add column if not exists pin_encrypted text;
alter table school_settings add column if not exists challan_profile jsonb;
alter table licenses add column if not exists trial_expires_at timestamptz;
`;
