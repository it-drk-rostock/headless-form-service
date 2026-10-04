-- One-time bootstrap of the first Super Admin (README, "First Super Admin").
-- Replace the address, then run it once in the Supabase SQL editor. It does
-- nothing once any Super Admin exists.
update public.profiles
set is_super_admin = true
where lower(email) = lower('first.admin@example.org')
  and not exists (select 1 from public.profiles where is_super_admin)
returning id, email, is_super_admin;
