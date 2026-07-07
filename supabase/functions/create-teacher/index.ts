import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, name, group_id, application_id, auth_user_id } = await req.json()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify caller is admin or registrar
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single()
    if (!['admin', 'registrar'].includes(profile?.role)) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders })
    }

    // Fetch group name if assigned
    let groupName = null
    if (group_id) {
      const { data: grp } = await supabaseAdmin.from('groups').select('name').eq('id', group_id).single()
      groupName = grp?.name || null
    }

    // Determine the auth user ID
    let userId = auth_user_id
    if (!userId) {
      // Fallback: look up by email
      const { data: existingUser } = await supabaseAdmin.auth.admin.getUserByEmail(email)
      userId = existingUser?.user?.id
    }

    if (userId) {
      // Teacher registered themselves — just create the profile row
      const { error: dbErr } = await supabaseAdmin.from('users').insert({
        id: userId,
        name,
        email,
        role: 'teacher',
        group_id: group_id || null,
      })
      if (dbErr && !dbErr.message.includes('duplicate')) {
        return new Response(JSON.stringify({ error: dbErr.message }), { status: 400, headers: corsHeaders })
      }
    } else {
      // No prior registration — invite them so they can set a password
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: 'https://akaalsahai.vercel.app/reset-password',
      })
      if (inviteErr) return new Response(JSON.stringify({ error: inviteErr.message }), { status: 400, headers: corsHeaders })

      const { error: dbErr } = await supabaseAdmin.from('users').insert({
        id: inviteData.user.id,
        name,
        email,
        role: 'teacher',
        group_id: group_id || null,
      })
      if (dbErr) return new Response(JSON.stringify({ error: dbErr.message }), { status: 400, headers: corsHeaders })
    }

    // Mark application approved
    if (application_id) {
      await supabaseAdmin.from('teacher_applications')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', application_id)
    }

    return new Response(JSON.stringify({ success: true, groupName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
})
