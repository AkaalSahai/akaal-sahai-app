import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { full_name, email, password, phone, preferred_group, dbs_number, experience } = await req.json()

    // Validate required fields
    if (!full_name?.trim() || !email?.trim() || !password) {
      return new Response(JSON.stringify({ error: 'Full name, email and password are required.' }), { status: 400, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Check if application already exists
    const { data: existing } = await supabaseAdmin
      .from('teacher_applications')
      .select('id, status')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'An application with this email already exists. Please contact your admin if you need help.' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Create auth user — confirmed but NO public.users row yet (can't log in successfully until approved)
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authErr) {
      const msg = authErr.message?.toLowerCase().includes('already registered') || authErr.message?.toLowerCase().includes('already been registered')
        ? 'An account with this email already exists. Please contact your admin if you need help.'
        : authErr.message
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: corsHeaders })
    }

    // Insert application row
    const { error: appErr } = await supabaseAdmin.from('teacher_applications').insert({
      auth_user_id: authData.user.id,
      full_name,
      email,
      phone,
      preferred_group: preferred_group || null,
      dbs_number: dbs_number || null,
      experience: experience || null,
      status: 'pending',
    })
    if (appErr) {
      // Roll back auth user if insert failed
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return new Response(JSON.stringify({ error: appErr.message }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
})
