import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify caller is admin
    const { data: { user } } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return new Response('Forbidden', { status: 403, headers: corsHeaders })
    }

    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { name, email, role } = body
      const tempPw = Math.random().toString(36).slice(-10) + 'A1!'
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPw,
        email_confirm: true,
      })
      if (authErr) return jsonResponse({ error: authErr.message }, 400)

      const { error: dbErr } = await supabaseAdmin
        .from('users')
        .insert({ id: authData.user.id, name, email, role })
      if (dbErr) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        return jsonResponse({ error: dbErr.message }, 400)
      }
      return jsonResponse({ success: true, tempPw })
    }

    if (action === 'reset-password') {
      const { userId, email } = body
      const tempPw = Math.random().toString(36).slice(-10) + 'A1!'
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPw,
      })
      if (error) return jsonResponse({ error: error.message }, 400)

      await supabaseAdmin
        .from('users')
        .update({ pw_changed_at: null })
        .eq('id', userId)
      return jsonResponse({ success: true, tempPw })
    }

    if (action === 'update-email') {
      const { userId, newEmail } = body
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: newEmail,
      })
      if (error) return jsonResponse({ error: error.message }, 400)

      await supabaseAdmin
        .from('users')
        .update({ email: newEmail })
        .eq('id', userId)
      return jsonResponse({ success: true })
    }

    if (action === 'delete') {
      const { userId } = body
      await supabaseAdmin.from('users').delete().eq('id', userId)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (error) return jsonResponse({ error: error.message }, 400)
      return jsonResponse({ success: true })
    }

    if (action === 'list-mfa-status') {
      // listUsers()'s embedded `factors` field turned out unreliable in
      // practice - it's typed as possibly present, but a real enrolled
      // account still came back with no factors on it. Falling back to
      // the dedicated per-user endpoint instead (the same one reset-mfa
      // already uses successfully), fetched in parallel to stay fast.
      const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 500,
      })
      if (usersErr) return jsonResponse({ error: usersErr.message }, 400)

      const status = {}
      await Promise.all(
        usersData.users.map(async (u) => {
          const { data } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: u.id })
          status[u.id] = (data?.factors || []).some(
            (f) => f.factor_type === 'totp' && f.status === 'verified',
          )
        }),
      )
      return jsonResponse({ success: true, status })
    }

    if (action === 'reset-mfa') {
      const { userId } = body
      const { data, error: listErr } = await supabaseAdmin.auth.admin.mfa.listFactors({
        userId,
      })
      if (listErr) return jsonResponse({ error: listErr.message }, 400)

      const factors = (data?.factors || []).filter((f) => f.factor_type === 'totp')
      for (const f of factors) {
        const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
          userId,
          id: f.id,
        })
        if (error) return jsonResponse({ error: error.message }, 400)
      }
      return jsonResponse({ success: true, removed: factors.length })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)

  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
