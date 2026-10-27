begin;

-- These helpers inspect staff outside the caller's scope during validation.
-- Expose only the tenant-checked admin RPCs and device-bound login RPC.
revoke execute on function public.staff_record_has_branch(uuid,uuid),
  public.terminal_staff_access_reason(uuid,uuid) from authenticated;

commit;
