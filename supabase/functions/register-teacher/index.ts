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
    let authUserId: string
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authErr) {
      const isAlreadyExists =
        authErr.message?.toLowerCase().includes('already registered') ||
        authErr.message?.toLowerCase().includes('already been registered') ||
        authErr.message?.toLowerCase().includes('already exists')

      if (!isAlreadyExists) {
        return new Response(JSON.stringify({ error: authErr.message }), { status: 400, headers: corsHeaders })
      }

      // "Already exists" — check whether this is an orphaned ghost account (created by
      // a magic-link request that was never completed) or a real approved account.
      const { data: existingProfile } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (existingProfile) {
        // Genuine account — this person is already a registered user
        return new Response(
          JSON.stringify({ error: 'An account with this email already exists. If you are already a teacher, please sign in instead. Otherwise contact your admin.' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // No profile → ghost account from a magic-link attempt. Recover it by updating
      // the password so the teacher can register and log in normally.
      const { data: { users: allAuthUsers } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 })
      const ghostUser = allAuthUsers?.find((u) => u.email?.toLowerCase() === email.toLowerCase())

      if (!ghostUser) {
        return new Response(
          JSON.stringify({ error: 'An account with this email already exists. Please contact your admin.' }),
          { status: 400, headers: corsHeaders }
        )
      }

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(ghostUser.id, {
        password,
        email_confirm: true,
      })
      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: corsHeaders })
      }

      authUserId = ghostUser.id
    } else {
      authUserId = authData.user.id
    }

    // Insert application row
    const { error: appErr } = await supabaseAdmin.from('teacher_applications').insert({
      auth_user_id: authUserId,
      full_name,
      email,
      phone,
      preferred_group: preferred_group || null,
      dbs_number: dbs_number || null,
      experience: experience || null,
      status: 'pending',
    })
    if (appErr) {
      // Roll back only if we created a fresh auth user (not a recovered ghost)
      if (authData?.user) await supabaseAdmin.auth.admin.deleteUser(authUserId)
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
