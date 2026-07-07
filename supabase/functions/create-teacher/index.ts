import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendApprovalEmail(name: string, email: string, groupName: string | null) {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return // skip silently if not configured yet

  const groupLine = groupName
    ? `<p><strong>Assigned Group:</strong> ${groupName}</p>`
    : `<p><strong>Assigned Group:</strong> To be confirmed by the admin team</p>`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .wrap { max-width: 580px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .header { background: #1e1a6e; padding: 28px 32px; text-align: center; }
    .header h1 { color: #f0a500; margin: 0; font-size: 1.3rem; letter-spacing: .5px; }
    .header p { color: rgba(255,255,255,.75); margin: 6px 0 0; font-size: .85rem; }
    .body { padding: 32px; }
    .body h2 { color: #1e1a6e; font-size: 1.1rem; margin-top: 0; }
    .details { background: #f9f8ff; border-left: 4px solid #1e1a6e; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 20px 0; }
    .details p { margin: 6px 0; font-size: .92rem; }
    .btn { display: inline-block; margin: 20px 0 8px; padding: 14px 28px; background: #1e1a6e; color: #fff !important; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: .95rem; }
    .footer { background: #f5f5f5; padding: 20px 32px; text-align: center; font-size: .78rem; color: #888; border-top: 1px solid #eee; }
    .wahe { color: #1e1a6e; font-weight: 600; font-size: .88rem; font-style: italic; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>Akaal Sahai Southall</h1>
      <p>Punjabi Classes Management System</p>
    </div>
    <div class="body">
      <p class="wahe">Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh</p>
      <h2>Your Application Has Been Approved</h2>
      <p>Dear ${name},</p>
      <p>We are pleased to confirm that your <strong>Teacher Sevadaar application</strong> for Akaal Sahai Southall Punjabi Classes has been reviewed and approved. Welcome to the team!</p>

      <div class="details">
        <p><strong>Email:</strong> ${email}</p>
        ${groupLine}
        <p><strong>Role:</strong> Teacher Sevadaar</p>
      </div>

      <p>You can now log in to the attendance system using the email address and password you set during registration:</p>

      <a href="https://akaalsahai.vercel.app" class="btn">Log In to Akaal Sahai</a>

      <p style="font-size:.85rem; color:#666;">If you ever have difficulty logging in, use the <strong>"Forgot Password?"</strong> option on the login page to reset your password.</p>

      <p style="font-size:.85rem; color:#666;">If you have any questions or need assistance, please contact the admin team.</p>

      <p class="wahe" style="margin-top:24px;">Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh</p>
      <p style="margin:4px 0 0; font-size:.88rem; color:#555;">Akaal Sahai Southall Admin Team</p>
    </div>
    <div class="footer">
      &copy; Akaal Sahai Southall &nbsp;|&nbsp; This email was sent to ${email}
    </div>
  </div>
</body>
</html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Akaal Sahai Southall <noreply@karamishersar.com>',
      to: [email],
      subject: 'Your Application Has Been Approved — Akaal Sahai Southall',
      html,
    }),
  })
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

    let userId = auth_user_id

    if (userId) {
      // Teacher registered themselves — just create the profile row
      const { error: dbErr } = await supabaseAdmin.from('users').insert({
        id: userId,
        name,
        email,
        role: 'teacher',
        group_id: group_id || null,
      })
      if (dbErr) return new Response(JSON.stringify({ error: dbErr.message }), { status: 400, headers: corsHeaders })
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

    // Send branded approval email
    await sendApprovalEmail(name, email, groupName)

    return new Response(JSON.stringify({ success: true, groupName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
})
