-- Snapshot foreman display name on claims so lift history survives leavers.
-- Prefer Set Inactive for staff who leave; permanent delete keeps claims but
-- detaches the workers row after copying the name onto claim_periods.

alter table claim_periods
  add column if not exists foreman_name text;

alter table claim_periods
  alter column foreman_id drop not null;

update claim_periods as c
set foreman_name = nullif(trim(concat_ws(' ', w.first_name, w.surname)), '')
from workers as w
where c.foreman_id = w.id
  and (c.foreman_name is null or btrim(c.foreman_name) = '');
