begin;

create or replace function public.request_receipt_print(p_receipt_id uuid,p_printer_id text default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.receipts%rowtype; job public.receipt_print_jobs%rowtype; h public.receipt_print_history%rowtype; kind text; reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),'');
begin
  if not public.has_pos_permission('receipt.reprint') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into r from public.receipts where id=p_receipt_id and public.can_access_branch(branch_id) for update;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  if r.status<>'ISSUED' then raise exception 'VOIDED_RECEIPT_CANNOT_BE_PRINTED'; end if;
  kind:=case when reason is not null then 'REPRINT' when r.print_count=0 then 'ORIGINAL' else 'REPRINT' end;
  if kind='REPRINT' then
    if reason is null or length(reason)<3 then raise exception 'REPRINT_REASON_REQUIRED'; end if;
    update public.receipts set reprint_count=reprint_count+1 where id=r.id returning * into r;
    insert into public.receipt_print_history(receipt_id,reprint_number,reprinted_by,reason,device_context)
      values(r.id,r.reprint_count,auth.uid(),reason,jsonb_build_object('printerId',p_printer_id)) returning * into h;
  end if;
  insert into public.receipt_print_jobs(receipt_id,terminal_id,printer_id,print_type,requested_by,reprint_history_id)
    values(r.id,(public.current_terminal_staff_session()).terminal_id,nullif(left(btrim(coalesce(p_printer_id,'')),100),''),kind,auth.uid(),h.id) returning * into job;
  update public.receipts set print_count=print_count+1,last_printed_at=clock_timestamp(),last_printed_by=auth.uid() where id=r.id;
  perform public.write_pos_audit(case when kind='REPRINT' then 'RECEIPT_REPRINT_QUEUED' else 'RECEIPT_PRINT_QUEUED' end,'RECEIPT',r.id,reason,jsonb_build_object('receiptNumber',r.receipt_number,'jobId',job.id,'printType',kind));
  return jsonb_build_object('receipt',to_jsonb(r),'job',to_jsonb(job));
end;
$$;

revoke all on function public.request_receipt_print(uuid,text,text) from public,anon;
grant execute on function public.request_receipt_print(uuid,text,text) to authenticated;
commit;
