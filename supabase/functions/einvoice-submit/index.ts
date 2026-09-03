import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { myinvoisToken, submitMyinvois } from '../_shared/myinvois.ts';

const classifyError = (message: string) => {
  if (message === 'LOCAL_VALIDATION') return { code: 'LOCAL_VALIDATION', retryable: false };
  if (message.includes('AUTH_400') || message.includes('AUTH_401') || message.includes('AUTH_403')) return { code: 'AUTHENTICATION', retryable: false };
  if (message.includes('_400') || message.includes('_422')) return { code: 'MYINVOIS_VALIDATION', retryable: false };
  if (message.includes('_429')) return { code: 'RATE_LIMIT', retryable: true };
  if (message.includes('AbortError')) return { code: 'TIMEOUT', retryable: true };
  return { code: 'MYINVOIS_TEMPORARY', retryable: true };
};

// Worker entry point. MyInvois credentials are intentionally read only from
// server-side secrets; the POS never receives tokens or client secrets.
Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: allowed, error: permissionError } = await caller.rpc('has_pos_permission', { p_permission: 'einvoice.retry' });
  if (permissionError || !allowed) return Response.json({ error: 'Insufficient permission' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.action === 'testConnection') {
    if (!body.profileId) return Response.json({ error: 'profileId is required' }, { status: 400 });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: company } = await admin.from('company_einvoice_profiles').select('environment,status').eq('id', body.profileId).single();
    if (!company) return Response.json({ error: 'Supplier profile not found' }, { status: 404 });
    const clientId = Deno.env.get('MYINVOIS_CLIENT_ID');
    const clientSecret = Deno.env.get('MYINVOIS_CLIENT_SECRET');
    if (!clientId || !clientSecret) return Response.json({ connected: false, configured: false, error: 'ERP client credentials are not configured.' }, { status: 409 });
    try {
      await myinvoisToken(company.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX', clientId, clientSecret);
      return Response.json({ connected: true, configured: true, environment: company.environment });
    } catch {
      return Response.json({ connected: false, configured: true, error: 'MyInvois authentication failed.' }, { status: 502 });
    }
  }
  if (!body?.jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: profile } = await admin.from('profiles').select('status').eq('id', authData.user.id).maybeSingle();
  if (!profile || profile.status !== 'ACTIVE') return Response.json({ error: 'Staff account is inactive' }, { status: 403 });
  const { data: job, error } = await admin.from('einvoice_jobs').select('*, einvoice_documents(*)').eq('id', body.jobId).in('status', ['QUEUED', 'RETRYING']).lte('next_attempt_at', new Date().toISOString()).single();
  if (error || !job) return Response.json({ error: 'Job not found' }, { status: 404 });
  const { data: companyProfile } = await admin.from('company_einvoice_profiles').select('environment,status').eq('id', job.profile_id).single();
  if (!companyProfile || !['ACTIVE', 'CONNECTED'].includes(companyProfile.status)) return Response.json({ error: 'e-Invoice company configuration is not active.' }, { status: 409 });
  const clientId = Deno.env.get('MYINVOIS_CLIENT_ID');
  const clientSecret = Deno.env.get('MYINVOIS_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    await admin.from('einvoice_jobs').update({ status: 'RETRYING', last_error_code: 'NOT_CONFIGURED', last_error_message: 'MyInvois credentials are not configured', next_attempt_at: new Date(Date.now() + 300000).toISOString() }).eq('id', body.jobId);
    return Response.json({ status: 'RETRYING' }, { status: 202 });
  }
  const claimed = await admin.from('einvoice_jobs').update({ status: 'PROCESSING', attempt_count: Number(job.attempt_count || 0) + 1, last_attempt_at: new Date().toISOString() }).eq('id', job.id).in('status', ['QUEUED', 'RETRYING']).select('id').maybeSingle();
  if (claimed.error || !claimed.data) return Response.json({ status: 'ALREADY_PROCESSING' }, { status: 202 });
  const environment = companyProfile.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
  try {
    const token = await myinvoisToken(environment, clientId, clientSecret);
    const document = job.einvoice_documents;
    const payload = document?.transaction_snapshot;
    if (!payload || typeof payload !== 'object') throw new Error('LOCAL_VALIDATION');
    const result = await submitMyinvois(environment, token.access_token, document.document_number, payload);
    await admin.from('einvoice_jobs').update({ status: 'WAITING_VALIDATION', last_error_code: null, last_error_message: null }).eq('id', job.id);
    await admin.from('einvoice_documents').update({ internal_status: 'SUBMITTED', submitted_at: new Date().toISOString(), submission_uid: result?.submissionUid || result?.submissionUID || null }).eq('id', document.id);
    return Response.json({ status: 'SUBMITTED' }, { status: 202 });
  } catch (submissionError) {
    const attempt = Number(job.attempt_count || 0) + 1;
    const classification = classifyError(submissionError instanceof Error ? submissionError.message : 'MYINVOIS_SUBMISSION_FAILED');
    const terminal = !classification.retryable || attempt >= Number(job.max_attempts || 8);
    const message = submissionError instanceof Error ? submissionError.message.slice(0, 240) : 'MYINVOIS_SUBMISSION_FAILED';
    await admin.from('einvoice_jobs').update({ status: terminal ? 'DEAD_LETTER' : 'RETRYING', last_error_code: classification.code, last_error_message: message, next_attempt_at: new Date(Date.now() + Math.min(3600000, 300000 * 2 ** Math.min(attempt - 1, 4))).toISOString() }).eq('id', job.id);
    await admin.from('einvoice_documents').update({ internal_status: terminal ? 'FAILED' : 'QUEUED', error_code: classification.code, error_message: message }).eq('id', job.einvoice_documents.id);
    return Response.json({ status: terminal ? 'DEAD_LETTER' : 'RETRYING' }, { status: 202 });
  }
});
