begin;

drop policy if exists einvoice_document_view on public.einvoice_documents;
create policy einvoice_document_view on public.einvoice_documents for select to authenticated
using (exists(select 1 from public.company_einvoice_profiles p where p.id=profile_id and p.company_id=public.current_user_company_id()) and public.can_access_branch(branch_id) and public.has_pos_permission('einvoice.view'));

drop policy if exists einvoice_job_view on public.einvoice_jobs;
create policy einvoice_job_view on public.einvoice_jobs for select to authenticated
using (exists(select 1 from public.company_einvoice_profiles p where p.id=profile_id and p.company_id=public.current_user_company_id()) and public.has_pos_permission('einvoice.view'));

drop policy if exists einvoice_tax_profile_view on public.customer_tax_profiles;
create policy einvoice_tax_profile_view on public.customer_tax_profiles for select to authenticated
using (public.has_pos_permission('einvoice.view') or public.has_pos_permission('einvoice.request'));

drop policy if exists einvoice_request_view on public.einvoice_requests;
create policy einvoice_request_view on public.einvoice_requests for select to authenticated
using (exists(select 1 from public.company_einvoice_profiles p where p.id=profile_id and p.company_id=public.current_user_company_id()) and exists(select 1 from public.orders o where o.id=order_id and public.can_access_branch(o.branch_id)) and (public.has_pos_permission('einvoice.view') or public.has_pos_permission('einvoice.request')));

drop policy if exists einvoice_lines_view on public.einvoice_document_lines;
create policy einvoice_lines_view on public.einvoice_document_lines for select to authenticated
using (exists(select 1 from public.einvoice_documents d where d.id=document_id and public.can_access_branch(d.branch_id) and exists(select 1 from public.company_einvoice_profiles p where p.id=d.profile_id and p.company_id=public.current_user_company_id())) and public.has_pos_permission('einvoice.view'));

drop policy if exists einvoice_events_view on public.einvoice_events;
create policy einvoice_events_view on public.einvoice_events for select to authenticated
using (exists(select 1 from public.einvoice_documents d where d.id=document_id and public.can_access_branch(d.branch_id) and exists(select 1 from public.company_einvoice_profiles p where p.id=d.profile_id and p.company_id=public.current_user_company_id())) and public.has_pos_permission('einvoice.view'));

drop policy if exists einvoice_consolidation_view on public.einvoice_consolidation_batches;
create policy einvoice_consolidation_view on public.einvoice_consolidation_batches for select to authenticated
using (exists(select 1 from public.company_einvoice_profiles p where p.id=profile_id and p.company_id=public.current_user_company_id()) and public.can_access_branch(branch_id) and public.has_pos_permission('einvoice.reconcile'));

commit;
