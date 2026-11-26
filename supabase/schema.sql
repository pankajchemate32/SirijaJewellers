-- =====================================================================
-- Sirija Jwellers — Bullion POS & Inventory
-- Supabase / PostgreSQL schema
--
-- How to install: open your Supabase project → SQL Editor → paste this
-- whole file → Run. It is safe to run again (idempotent).
--
-- Design notes
-- * Row ids are text (e.g. "prod_ab12…", "STK-1001") so that the same ids
--   work in local mode and in Supabase.
-- * The browser never writes tables directly. Every save goes through the
--   apply_changeset() function, which runs as ONE database transaction:
--   either every row of a bill / purchase / return is saved, or none is.
-- * Business rules are enforced in the database as well as in the app:
--     - a certificate / serial number can exist only once
--     - a stock item can never be sold twice
--     - sold stock can only come back through a recorded return
--     - stock movements can never be edited or deleted
--     - completed bills keep their prices, tax and cost forever
--     - staff cannot delete completed transactions, reverse purchases,
--       adjust stock, change settings or manage users
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null,
  role text not null check (role in ('owner', 'staff')),
  pin text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_users_email on public.users (lower(email));

create table if not exists public.shop_settings (
  id text primary key,
  shop_name text not null,
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  gstin text not null default '',
  state_code text not null default '27',
  invoice_prefix text not null default 'SJ-',
  next_invoice_number integer not null default 1001,
  invoice_format text not null default 'A4' check (invoice_format in ('A4', 'THERMAL')),
  default_gst_rate numeric(5,2) not null default 3,
  default_tax_mode text not null default 'CGST_SGST' check (default_tax_mode in ('CGST_SGST', 'IGST')),
  default_gold_making_charge numeric(12,2) not null default 0,
  default_silver_making_charge numeric(12,2) not null default 0,
  enabled_payment_modes text[] not null default array['Cash','UPI','Card','Bank Transfer','Other'],
  next_stock_seq integer not null default 1001,
  next_purchase_seq integer not null default 1,
  next_return_seq integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.metal_rates (
  id text primary key,
  metal text not null check (metal in ('Gold', 'Silver')),
  purity text not null,
  rate_per_gram numeric(12,2) not null check (rate_per_gram > 0),
  effective_at timestamptz not null default now(),
  updated_by text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ix_metal_rates_lookup on public.metal_rates (metal, effective_at desc);

create table if not exists public.products (
  id text primary key,
  sku_code text not null,
  name text not null,
  metal text not null check (metal in ('Gold', 'Silver')),
  purity text not null,
  weight_grams numeric(10,3) not null check (weight_grams > 0),
  type text not null check (type in ('Coin', 'Bar')),
  hsn_code text not null default '',
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_products_sku on public.products (upper(sku_code));

create table if not exists public.suppliers (
  id text primary key,
  name text not null,
  contact_number text not null default '',
  address text not null default '',
  gstin text not null default '',
  supplier_type text not null default 'MMTC'
    check (supplier_type in ('MMTC', 'Bullion Wholesaler', 'Refinery', 'Other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id text primary key,
  name text not null,
  mobile text not null default '',
  address text not null default '',
  gstin text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_customers_mobile on public.customers (mobile);

create table if not exists public.purchases (
  id text primary key,
  purchase_number text not null unique,
  supplier_id text not null references public.suppliers(id) deferrable initially deferred,
  supplier_invoice_number text not null,
  purchase_date date not null,
  status text not null check (status in ('draft', 'completed', 'reversed')),
  tax_mode text not null check (tax_mode in ('CGST_SGST', 'IGST')),
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  taxable_amount numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  gst_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(14,2) not null default 0 check (balance_due >= 0),
  payment_mode text not null default 'Bank Transfer',
  payment_status text not null check (payment_status in ('paid', 'partial', 'unpaid')),
  notes text not null default '',
  attachment_name text,
  attachment_data_url text,
  reversal_reason text,
  reversed_at timestamptz,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_purchases_supplier on public.purchases (supplier_id, purchase_date desc);
create index if not exists ix_purchases_date on public.purchases (purchase_date desc);

create table if not exists public.purchase_items (
  id text primary key,
  purchase_id text not null references public.purchases(id) on delete cascade deferrable initially deferred,
  product_id text not null references public.products(id) deferrable initially deferred,
  quantity integer not null check (quantity > 0),
  weight_grams numeric(10,3) not null,
  rate_per_gram numeric(12,2) not null,
  making_charges numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  taxable_amount numeric(14,2) not null,
  gst_rate numeric(5,2) not null,
  gst_amount numeric(14,2) not null,
  total_amount numeric(14,2) not null,
  unit_cost numeric(14,2) not null,
  serial_numbers text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ix_purchase_items_purchase on public.purchase_items (purchase_id);

create table if not exists public.sales (
  id text primary key,
  invoice_number text not null unique,
  sale_date date not null,
  customer_id text references public.customers(id) deferrable initially deferred,
  customer_name text not null,
  customer_mobile text not null default '',
  customer_gstin text not null default '',
  is_walk_in boolean not null default false,
  tax_mode text not null check (tax_mode in ('CGST_SGST', 'IGST')),
  subtotal numeric(14,2) not null,
  discount_total numeric(14,2) not null default 0,
  taxable_amount numeric(14,2) not null,
  gst_rate numeric(5,2) not null,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  gst_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null,
  amount_received numeric(14,2) not null default 0 check (amount_received >= 0),
  balance_due numeric(14,2) not null default 0 check (balance_due >= 0),
  payment_status text not null check (payment_status in ('paid', 'partial', 'unpaid')),
  notes text not null default '',
  gold_rate_snapshot numeric(12,2) not null default 0,
  silver_rate_snapshot numeric(12,2) not null default 0,
  status text not null check (status in ('completed', 'returned', 'partial_return')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_sales_date on public.sales (sale_date desc);
create index if not exists ix_sales_customer on public.sales (customer_id);

create table if not exists public.stock_items (
  id text primary key,
  product_id text not null references public.products(id) deferrable initially deferred,
  serial_number text not null,
  barcode text not null default '',
  purchase_id text references public.purchases(id) deferrable initially deferred,
  purchase_date date not null,
  supplier_id text references public.suppliers(id) deferrable initially deferred,
  purchase_price numeric(14,2) not null default 0,
  status text not null check (status in ('Available', 'Sold', 'Returned', 'Damaged')),
  sale_id text references public.sales(id) deferrable initially deferred,
  sale_item_id text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One physical certificate / serial number = one stock record, ever.
create unique index if not exists ux_stock_serial on public.stock_items (upper(btrim(serial_number)));
create index if not exists ix_stock_product_status on public.stock_items (product_id, status);
create index if not exists ix_stock_barcode on public.stock_items (barcode) where barcode <> '';

create table if not exists public.sale_items (
  id text primary key,
  sale_id text not null references public.sales(id) deferrable initially deferred,
  product_id text not null references public.products(id) deferrable initially deferred,
  stock_item_id text not null references public.stock_items(id) deferrable initially deferred,
  serial_number text not null,
  product_name text not null,
  sku_code text not null,
  metal text not null,
  purity text not null,
  weight_grams numeric(10,3) not null,
  hsn_code text not null default '',
  rate_per_gram numeric(12,2) not null,
  making_charges numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  taxable_amount numeric(14,2) not null,
  gst_rate numeric(5,2) not null,
  gst_amount numeric(14,2) not null,
  line_total numeric(14,2) not null,
  purchase_cost_snapshot numeric(14,2) not null default 0,
  returned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ix_sale_items_sale on public.sale_items (sale_id);
-- A stock item can be on only one active (not returned) bill line: it can never be sold twice.
create unique index if not exists ux_sale_items_active_stock
  on public.sale_items (stock_item_id) where not returned;

do $$ begin
  alter table public.stock_items
    add constraint fk_stock_sale_item foreign key (sale_item_id)
    references public.sale_items(id) deferrable initially deferred;
exception when duplicate_object then null; end $$;

create table if not exists public.returns (
  id text primary key,
  return_number text not null unique,
  sale_id text not null references public.sales(id) deferrable initially deferred,
  invoice_number text not null,
  sale_item_id text not null unique references public.sale_items(id) deferrable initially deferred,
  stock_item_id text not null references public.stock_items(id) deferrable initially deferred,
  serial_number text not null,
  product_name text not null,
  customer_id text references public.customers(id) deferrable initially deferred,
  customer_name text not null,
  return_date date not null,
  reason text not null check (btrim(reason) <> ''),
  resolution text not null check (resolution in ('refund', 'exchange')),
  refund_amount numeric(14,2) not null default 0 check (refund_amount >= 0),
  refund_mode text not null,
  restock_to_available boolean not null,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ix_returns_date on public.returns (return_date desc);

create table if not exists public.payments (
  id text primary key,
  reference_type text not null check (reference_type in ('sale', 'purchase', 'refund')),
  reference_id text not null,
  party_id text,
  party_name text not null default '',
  payment_date date not null,
  mode text not null,
  amount numeric(14,2) not null check (amount > 0),
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ix_payments_ref on public.payments (reference_type, reference_id);

create table if not exists public.stock_movements (
  id text primary key,
  stock_item_id text not null references public.stock_items(id) deferrable initially deferred,
  product_id text not null references public.products(id) deferrable initially deferred,
  serial_number text not null,
  movement_type text not null check (movement_type in
    ('IMPORT','PURCHASE','PURCHASE_REVERSAL','SALE','RETURN_RESTOCK','RETURN_DAMAGED','ADJUSTMENT')),
  reference_type text not null check (reference_type in ('IMPORT','PURCHASE','SALE','RETURN','ADJUSTMENT')),
  reference_id text not null,
  reference_number text not null default '',
  previous_status text,
  new_status text not null,
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ix_movements_stock on public.stock_movements (stock_item_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. Who is signed in
-- ---------------------------------------------------------------------

-- Role of the signed-in Supabase user ('owner' / 'staff'), or null when the
-- login email has not been added as an active user of the shop.
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select u.role from public.users u
  where u.active and lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.app_user_name() returns text
language sql stable security definer set search_path = public as $$
  select u.name from public.users u
  where u.active and lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

-- ---------------------------------------------------------------------
-- 3. Business-rule triggers (they protect the data even if the app has a bug)
-- ---------------------------------------------------------------------

-- Stock movements are an audit trail: never edited, never deleted.
create or replace function public.trg_movements_readonly() returns trigger
language plpgsql as $$
begin
  if current_setting('sirija.allow_reset', true) = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'Stock movement history cannot be changed or deleted.';
end $$;
drop trigger if exists movements_readonly on public.stock_movements;
create trigger movements_readonly before update or delete on public.stock_movements
  for each row execute function public.trg_movements_readonly();

-- Stock status changes must follow a real transaction.
create or replace function public.trg_stock_status_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'Sold' and not exists (
      select 1 from public.sale_items si
      where si.id = new.sale_item_id and si.stock_item_id = new.id and not si.returned) then
      raise exception 'Stock % cannot be created as Sold without its bill.', new.serial_number;
    end if;
    return new;
  end if;

  if new.product_id <> old.product_id
     or upper(btrim(new.serial_number)) <> upper(btrim(old.serial_number)) then
    raise exception 'Product and serial number of stock % cannot be changed.', old.serial_number;
  end if;

  if new.status = 'Sold' then
    if old.status = 'Sold' and new.sale_item_id is distinct from old.sale_item_id then
      raise exception 'Serial % is already sold and cannot be sold again.', old.serial_number;
    end if;
    if old.status not in ('Available', 'Sold') then
      raise exception 'Serial % is % and cannot be sold.', old.serial_number, old.status;
    end if;
    if not exists (
      select 1 from public.sale_items si
      where si.id = new.sale_item_id and si.stock_item_id = new.id and not si.returned) then
      raise exception 'Serial % can only be marked Sold through a bill.', old.serial_number;
    end if;
  elsif old.status = 'Sold' then
    -- Sold stock comes back only through a confirmed sales return.
    if not exists (
      select 1 from public.returns r
      where r.stock_item_id = old.id and r.sale_item_id = old.sale_item_id) then
      raise exception 'Serial % can only come back to stock through a sales return.', old.serial_number;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists stock_status_guard on public.stock_items;
create trigger stock_status_guard before insert or update on public.stock_items
  for each row execute function public.trg_stock_status_guard();

-- Completed bills keep their prices, tax and totals forever.
create or replace function public.trg_sales_guard() returns trigger
language plpgsql as $$
begin
  if new.invoice_number <> old.invoice_number
     or new.sale_date <> old.sale_date
     or new.subtotal <> old.subtotal
     or new.discount_total <> old.discount_total
     or new.taxable_amount <> old.taxable_amount
     or new.gst_total <> old.gst_total
     or new.grand_total <> old.grand_total
     or new.gold_rate_snapshot <> old.gold_rate_snapshot
     or new.silver_rate_snapshot <> old.silver_rate_snapshot then
    raise exception 'Invoice % is final; its prices and totals cannot be changed.', old.invoice_number;
  end if;
  if new.amount_received < old.amount_received then
    raise exception 'Received amount on invoice % cannot be reduced.', old.invoice_number;
  end if;
  return new;
end $$;
drop trigger if exists sales_guard on public.sales;
create trigger sales_guard before update on public.sales
  for each row execute function public.trg_sales_guard();

create or replace function public.trg_sale_items_guard() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'returned') <> (to_jsonb(old) - 'returned') then
    raise exception 'Bill lines cannot be changed after saving.';
  end if;
  if old.returned and not new.returned then
    raise exception 'A returned bill line cannot be un-returned.';
  end if;
  return new;
end $$;
drop trigger if exists sale_items_guard on public.sale_items;
create trigger sale_items_guard before update on public.sale_items
  for each row execute function public.trg_sale_items_guard();

-- Completed purchases change only through payment or a controlled reversal.
create or replace function public.trg_purchases_guard() returns trigger
language plpgsql as $$
begin
  if old.status = 'reversed' then
    raise exception 'Purchase % is reversed and cannot be changed.', old.purchase_number;
  end if;
  if old.status = 'completed' then
    if new.status not in ('completed', 'reversed')
       or new.grand_total <> old.grand_total
       or new.taxable_amount <> old.taxable_amount
       or new.supplier_id <> old.supplier_id
       or new.purchase_date <> old.purchase_date then
      raise exception 'Completed purchase % cannot be edited. Use reversal instead.', old.purchase_number;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists purchases_guard on public.purchases;
create trigger purchases_guard before update on public.purchases
  for each row execute function public.trg_purchases_guard();

create or replace function public.trg_purchase_items_guard() returns trigger
language plpgsql as $$
declare v_status text;
begin
  if current_setting('sirija.allow_reset', true) = 'on' then
    return coalesce(new, old);
  end if;
  select status into v_status from public.purchases where id = coalesce(new.purchase_id, old.purchase_id);
  if tg_op <> 'INSERT' and v_status is distinct from 'draft' and v_status is not null then
    raise exception 'Lines of a completed purchase cannot be changed.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists purchase_items_guard on public.purchase_items;
create trigger purchase_items_guard before update or delete on public.purchase_items
  for each row execute function public.trg_purchase_items_guard();

-- ---------------------------------------------------------------------
-- 4. apply_changeset: the only way the app writes data (one transaction)
--
--   p_changes = {
--     "upserts": { "<table>": [ {row}, ... ], ... },
--     "deletes": { "<table>": [ "id", ... ], ... }
--   }
-- ---------------------------------------------------------------------

create or replace function public.apply_changeset(p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.app_role();
  v_tables text[] := array[
    'users','shop_settings','metal_rates','products','suppliers','customers',
    'purchases','purchase_items','sales','sale_items','returns','stock_items',
    'payments','stock_movements'];
  v_table text;
  v_rows jsonb;
  v_cols text;
  v_set text;
  v_id text;
  v_status text;
  v_count int := 0;
  v_row jsonb;
  v_old public.shop_settings;
begin
  if v_role is null then
    raise exception 'Your login is not an active user of this shop. Ask the owner to add your email in Settings.';
  end if;

  -- Staff restrictions
  if v_role <> 'owner' then
    if jsonb_array_length(coalesce(p_changes #> '{upserts,users}', '[]')) > 0 then
      raise exception 'Only the Owner can manage users.';
    end if;
    for v_row in select * from jsonb_array_elements(coalesce(p_changes #> '{upserts,shop_settings}', '[]')) loop
      select * into v_old from public.shop_settings where id = v_row ->> 'id';
      if found and (
          (to_jsonb(v_old) - array['next_invoice_number','next_stock_seq','next_purchase_seq','next_return_seq','updated_at'])
          <> ((to_jsonb(v_old) || v_row) - array['next_invoice_number','next_stock_seq','next_purchase_seq','next_return_seq','updated_at'])) then
        raise exception 'Only the Owner can change shop settings.';
      end if;
    end loop;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_changes #> '{upserts,stock_movements}', '[]')) m
      where m ->> 'movement_type' in ('ADJUSTMENT', 'PURCHASE_REVERSAL')) then
      raise exception 'Only the Owner can adjust stock or reverse purchases.';
    end if;
  end if;

  -- Deletes: only draft purchases (and their lines) may ever be deleted.
  for v_table in select jsonb_object_keys(coalesce(p_changes -> 'deletes', '{}')) loop
    if v_table not in ('purchases', 'purchase_items') then
      raise exception 'Records in % cannot be deleted.', v_table;
    end if;
    for v_id in select jsonb_array_elements_text(p_changes -> 'deletes' -> v_table) loop
      if v_table = 'purchases' then
        select status into v_status from public.purchases where id = v_id;
        if v_status is distinct from 'draft' and v_status is not null then
          raise exception 'Only draft purchases can be deleted.';
        end if;
      end if;
      execute format('delete from public.%I where id = $1', v_table) using v_id;
    end loop;
  end loop;

  -- Upserts, in an order that respects references
  foreach v_table in array v_tables loop
    v_rows := p_changes -> 'upserts' -> v_table;
    if v_rows is null or jsonb_array_length(v_rows) = 0 then
      continue;
    end if;

    select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
           string_agg(
             case
               when v_table = 'shop_settings' and column_name in
                    ('next_invoice_number','next_stock_seq','next_purchase_seq','next_return_seq')
                 -- counters never go backwards (two counters saving at once)
                 then format('%1$I = greatest(t.%1$I, excluded.%1$I)', column_name)
               else format('%1$I = excluded.%1$I', column_name)
             end, ', ' order by ordinal_position)
             filter (where column_name <> 'id')
      into v_cols, v_set
      from information_schema.columns
     where table_schema = 'public' and table_name = v_table;

    execute format(
      'insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) '
      || 'on conflict (id) do update set %3$s',
      v_table, v_cols, v_set) using v_rows;
    v_count := v_count + jsonb_array_length(v_rows);
  end loop;

  return jsonb_build_object('ok', true, 'rows', v_count);
end $$;

-- ---------------------------------------------------------------------
-- 5. First-time setup and sample data reset
-- ---------------------------------------------------------------------

-- The very first person to sign in becomes the Owner.
create or replace function public.bootstrap_owner(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := auth.jwt() ->> 'email';
begin
  if v_email is null then
    raise exception 'Please sign in first.';
  end if;
  lock table public.users in exclusive mode;
  if exists (select 1 from public.users) then
    return coalesce(public.app_role(), 'none');
  end if;
  insert into public.users (id, name, email, role, pin, active)
  values ('usr_' || substr(md5(random()::text), 1, 10), coalesce(nullif(btrim(p_name), ''), 'Owner'),
          lower(v_email), 'owner', '', true);
  insert into public.shop_settings (id, shop_name) values ('shop_1', 'Sirija Jwellers')
  on conflict (id) do nothing;
  return 'owner';
end $$;

-- Owner only: wipe all business data (users are kept). Used by
-- Settings → "Load sample data" before the sample data is saved.
create or replace function public.reset_business_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is distinct from 'owner' then
    raise exception 'Only the Owner can reset data.';
  end if;
  perform set_config('sirija.allow_reset', 'on', true);
  truncate public.stock_movements, public.payments, public.returns, public.sale_items,
           public.stock_items, public.sales, public.purchase_items, public.purchases,
           public.customers, public.suppliers, public.products, public.metal_rates,
           public.shop_settings;
end $$;

-- ---------------------------------------------------------------------
-- 6. Row level security: signed-in shop users can read; nobody writes
--    directly (all writes go through apply_changeset above).
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['users','shop_settings','metal_rates','products','suppliers','customers',
    'purchases','purchase_items','sales','sale_items','returns','stock_items','payments','stock_movements']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "shop users can read" on public.%I', t);
    execute format('create policy "shop users can read" on public.%I for select to authenticated using (public.app_role() is not null)', t);
  end loop;
end $$;

revoke all on function public.apply_changeset(jsonb) from public, anon;
revoke all on function public.reset_business_data() from public, anon;
revoke all on function public.bootstrap_owner(text) from public, anon;
grant execute on function public.apply_changeset(jsonb) to authenticated;
grant execute on function public.reset_business_data() to authenticated;
grant execute on function public.bootstrap_owner(text) to authenticated;
grant execute on function public.app_role() to authenticated;
