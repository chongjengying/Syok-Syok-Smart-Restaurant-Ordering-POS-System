begin;

-- Legacy session creation is not used by the terminal PIN flow and must not
-- provide a second browser-accessible way to create a session without a PIN.
revoke execute on function public.begin_terminal_staff_session(uuid,uuid,text,uuid) from authenticated;

commit;
