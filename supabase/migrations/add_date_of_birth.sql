-- Date of birth collected at enrolment (nullable for workers registered before this feature).
alter table workers add column if not exists date_of_birth date;
