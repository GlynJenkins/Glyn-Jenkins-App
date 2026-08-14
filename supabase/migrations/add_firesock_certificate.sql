-- Firesock training certificate path (nullable for workers enrolled before this feature).
alter table workers add column if not exists firesock_certificate_url text;
