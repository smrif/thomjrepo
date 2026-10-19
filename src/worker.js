import { createClient } from '@supabase/supabase-js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

const API_ROUTES = new Set([
  '/api/auth/start',
  '/api/auth/verify',
  '/api/me',
  '/api/sync',
  '/api/account'
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === 'www.whosedayapp.com') {
      url.protocol = 'https:';
      url.hostname = 'whosedayapp.com';
      url.port = '';
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  }
};

function handleApi(request, env, url) {
  if (url.pathname === '/api/account') {
    return deleteAccount(request, env, url);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({
      ok: true,
      service: 'whose-day-api',
      backendEnabled: flag(env.BACKEND_ENABLED)
    });
  }

  if (url.pathname === '/api/config' && request.method === 'GET') {
    return json({
      backendEnabled: flag(env.BACKEND_ENABLED),
      authEnabled: flag(env.AUTH_ENABLED),
      syncEnabled: flag(env.SYNC_ENABLED)
    });
  }

  if (!API_ROUTES.has(url.pathname)) {
    return json({ error: 'not_found' }, 404);
  }

  if (!flag(env.BACKEND_ENABLED)) {
    return json({
      error: 'backend_disabled',
      message: 'Cloud sync is not enabled for this environment yet.'
    }, 503);
  }

  return json({
    error: 'not_implemented',
    message: 'This backend route is reserved for the next implementation milestone.'
  }, 501);
}

async function deleteAccount(request, env, url) {
  if (request.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...JSON_HEADERS, allow: 'DELETE' }
    });
  }

  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'forbidden', message: 'Delete your account from Whose Day Settings.' }, 403);
  }

  const authorization = request.headers.get('authorization') || '';
  const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
  if (!token) return json({ error: 'unauthorized', message: 'Sign in before deleting your account.' }, 401);

  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'invalid_request', message: 'Confirm account deletion in Settings.' }, 415);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_request', message: 'Confirm account deletion in Settings.' }, 400);
  }
  // The caller never supplies a user ID; only the verified token selects the account.
  if (!body || body.confirmation !== 'DELETE' || Object.keys(body).some(key => key !== 'confirmation')) {
    return json({ error: 'confirmation_required', message: 'Type DELETE to confirm account deletion.' }, 400);
  }
  if (!flag(env.ACCOUNT_DELETION_ENABLED) || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    return json({ error: 'deletion_unavailable', message: 'Account deletion is temporarily unavailable. Please try again later.' }, 503);
  }

  try {
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user?.id) {
      if (error?.status >= 500) {
        return json({ error: 'deletion_failed', message: 'Could not verify your account. Please try again later.' }, 502);
      }
      return json({ error: 'unauthorized', message: 'Your sign-in has expired. Sign in again before deleting your account.' }, 401);
    }
    // App tables reference auth.users with ON DELETE CASCADE: one atomic database deletion.
    const { error: deletionError } = await admin.auth.admin.deleteUser(data.user.id, false);
    if (deletionError) {
      return json({ error: 'deletion_failed', message: 'Could not delete your account. Please try again later.' }, 502);
    }
    return json({ deleted: true });
  } catch {
    return json({ error: 'deletion_failed', message: 'Could not delete your account. Please try again later.' }, 502);
  }
}

function flag(value) {
  return value === true || value === 'true' || value === '1';
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}
