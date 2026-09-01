import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Worker entry point. MyInvois credentials are intentionally read only from
// server-side secrets; the POS never receives tokens or client secrets.
Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await request.json().catch(() => null);
  if (!body?.jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: job, error } = await admin.from('einvoice_jobs').select('*, einvoice_documents(*)').eq('id', body.jobId).single();
  if (error || !job) return Response.json({ error: 'Job not found' }, { status: 404 });
  // Configuration and HTTP mapper are deliberately server-side. Until the
  // MyInvois secrets are configured, leave the job retryable and never block POS.
  if (!Deno.env.get('MYINVOIS_CLIENT_ID') || !Deno.env.get('MYINVOIS_CLIENT_SECRET')) {
    await admin.from('einvoice_jobs').update({ status: 'RETRYING', last_error_code: 'NOT_CONFIGURED', last_error_message: 'MyInvois credentials are not configured', next_attempt_at: new Date(Date.now() + 300000).toISOString() }).eq('id', body.jobId);
    return Response.json({ status: 'RETRYING' }, { status: 202 });
  }
  return Response.json({ error: 'MyInvois adapter requires environment-specific credentials and endpoint configuration' }, { status: 501 });
});
