begin;

-- The allowed tax types changed in 20260924240000, but the old SST default remained.
alter table public.companies alter column tax_type set default 'SST_SERVICE_TAX';

commit;
