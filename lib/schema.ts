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
`;
