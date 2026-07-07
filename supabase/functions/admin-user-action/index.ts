import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403, headers: corsHeaders })

    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { name, email, role } = body
      const tempPw = Math.random().toString(36).slice(-10) + 'A1!'
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email, password: tempPw, email_confirm: true,
      })
      if (authErr) return new Response(JSON.stringify({ error: authErr.message }), { status: 400, headers: corsHeaders })
      const { error: dbErr } = await supabaseAdmin.from('users').insert({
        id: authData.user.id, name, email, role,
      })
      if (dbErr) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        return new Response(JSON.stringify({ error: dbErr.message }), { status: 400, headers: corsHeaders })
      }
      return new Response(JSON.stringify({ success: true, tempPw }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'reset-password') {
      const { userId, email } = body
      const tempPw = Math.random().toString(36).slice(-10) + 'A1!'
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: tempPw })
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
      await supabaseAdmin.from('users').update({ pw_changed_at: null }).eq('id', userId)
      return new Response(JSON.stringify({ success: true, tempPw }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'update-email') {
      const { userId, newEmail } = body
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email: newEmail })
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
      await supabaseAdmin.from('users').update({ email: newEmail }).eq('id', userId)
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'delete') {
      const { userId } = body
      await supabaseAdmin.from('users').delete().eq('id', userId)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
