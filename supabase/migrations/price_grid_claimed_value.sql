-- B1/B2: Track claimed money (not only rounded %) and apply/release atomically.
-- Run in Supabase SQL Editor before deploying claim routes that call these RPCs.

alter table public.price_grid
  add column if not exists claimed_value numeric(14, 2) not null default 0;

-- Backfill from existing percentage where money column is still zero.
update public.price_grid
set claimed_value = round(
  coalesce(contract_value, 0)
    * least(greatest(coalesce(total_claimed_pct, 0), 0), 100)
    / 100.0,
  2
)
where coalesce(claimed_value, 0) = 0
  and coalesce(total_claimed_pct, 0) > 0;

create or replace function public.apply_price_grid_claim(
  p_cell_id uuid,
  p_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract numeric(14, 2);
  v_claimed  numeric(14, 2);
  v_new      numeric(14, 2);
  v_pct      integer;
  v_color    text;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Invalid amount');
  end if;

  select coalesce(contract_value, 0), coalesce(claimed_value, 0)
    into v_contract, v_claimed
  from price_grid
  where id = p_cell_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cell not found');
  end if;

  if v_claimed + p_amount > v_contract + 0.01 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Insufficient remaining value',
      'remaining', greatest(round(v_contract - v_claimed, 2), 0)
    );
  end if;

  v_new := round(v_claimed + p_amount, 2);

  if v_contract > 0 then
    v_pct := least(100, greatest(0, round((v_new / v_contract) * 100)::integer));
  else
    v_pct := case when v_new > 0 then 100 else 0 end;
  end if;

  v_color := case
    when v_pct >= 100 then 'blue'
    when v_pct > 0 then 'orange'
    else 'white'
  end;

  update price_grid
  set claimed_value = v_new,
      total_claimed_pct = v_pct,
      cell_color = v_color
  where id = p_cell_id;

  return jsonb_build_object(
    'ok', true,
    'claimed_value', v_new,
    'total_claimed_pct', v_pct,
    'cell_color', v_color
  );
end;
$$;

create or replace function public.release_price_grid_claim(
  p_cell_id uuid,
  p_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract numeric(14, 2);
  v_claimed  numeric(14, 2);
  v_new      numeric(14, 2);
  v_pct      integer;
  v_color    text;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Invalid amount');
  end if;

  select coalesce(contract_value, 0), coalesce(claimed_value, 0)
    into v_contract, v_claimed
  from price_grid
  where id = p_cell_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cell not found');
  end if;

  v_new := greatest(0, round(v_claimed - p_amount, 2));

  if v_contract > 0 then
    v_pct := least(100, greatest(0, round((v_new / v_contract) * 100)::integer));
  else
    v_pct := case when v_new > 0 then 100 else 0 end;
  end if;

  v_color := case
    when v_pct >= 100 then 'blue'
    when v_pct > 0 then 'orange'
    else 'white'
  end;

  update price_grid
  set claimed_value = v_new,
      total_claimed_pct = v_pct,
      cell_color = v_color
  where id = p_cell_id;

  return jsonb_build_object(
    'ok', true,
    'claimed_value', v_new,
    'total_claimed_pct', v_pct,
    'cell_color', v_color
  );
end;
$$;

revoke all on function public.apply_price_grid_claim(uuid, numeric) from public;
revoke all on function public.release_price_grid_claim(uuid, numeric) from public;
grant execute on function public.apply_price_grid_claim(uuid, numeric) to service_role;
grant execute on function public.release_price_grid_claim(uuid, numeric) to service_role;
