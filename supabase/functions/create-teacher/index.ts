import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, name, group_id, application_id } = await req.json()

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

    // Generate temp password
    const tempPw = Math.random().toString(36).slice(-8) + 'Aa1!'

    // Create auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPw,
      email_confirm: true,
    })
    if (authErr) return new Response(JSON.stringify({ error: authErr.message }), { status: 400, headers: corsHeaders })

    // Insert profile row
    const { error: dbErr } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      name,
      email,
      role: 'teacher',
      group_id: group_id || null,
    })
    if (dbErr) return new Response(JSON.stringify({ error: dbErr.message }), { status: 400, headers: corsHeaders })

    // Mark application approved
    if (application_id) {
      await supabaseAdmin.from('teacher_applications')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', application_id)
    }

    return new Response(JSON.stringify({ tempPw }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
})
