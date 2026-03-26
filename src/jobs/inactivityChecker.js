const cron   = require('node-cron');
const crypto = require('crypto');
const supabase   = require('../config/supabase');
const { sendEmail } = require('../config/mailer');

const APP_DEEP_LINK    = process.env.APP_DEEP_LINK || 'digitalvault://nominee-setup';
const TOKEN_EXPIRY_DAYS = 7;

// Runs every day at 00:00
const inactivityCheckerJob = cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running inactivity check...');
  try {
    const now = new Date();

    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, checkin_interval_days, last_checkin_at, warning_sent_at, switch_triggered_at, status')
      .eq('is_active', true)
      .neq('status', 'deceased');

    if (error) { console.error('[CRON] Error fetching users:', error.message); return; }

    for (const user of users) {
      const lastCheckin      = new Date(user.last_checkin_at);
      const daysSinceCheckin = Math.floor((now - lastCheckin) / (1000 * 60 * 60 * 24));
      const interval         = user.checkin_interval_days;

      // ── Warning: 5 days before deadline ──────────────────────────────────────
      if (daysSinceCheckin >= interval - 5 && !user.warning_sent_at && !user.switch_triggered_at) {
        const daysLeft = interval - daysSinceCheckin;
        await sendEmail({
          to: user.email,
          subject: '⚠️ Digital Vault Activity Reminder',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto">
              <h2 style="color:#F59E0B">Activity Reminder</h2>
              <p>Hello ${user.name},</p>
              <p>You have not checked in for <strong>${daysSinceCheckin} days</strong>.</p>
              <p>If you do not check in within <strong>${daysLeft} days</strong>, your nominees will be granted vault access.</p>
              <p>Please open the Digital Vault app and tap <strong>Check In Now</strong>.</p>
            </div>
          `,
        });
        await supabase.from('users').update({ warning_sent_at: now.toISOString() }).eq('id', user.id);
        console.log(`[CRON] Warning sent to ${user.email}`);
      }

      // ── Switch triggered: past interval ──────────────────────────────────────
      if (daysSinceCheckin >= interval && !user.switch_triggered_at) {
        await supabase.from('users').update({
          status: 'inactive',
          switch_triggered_at: now.toISOString(),
        }).eq('id', user.id);

        const { data: nominees } = await supabase
          .from('nominees')
          .select('id, name, email, access_level')
          .eq('user_id', user.id)
          .eq('notify_on_inactivity', true);

        for (const nominee of nominees || []) {
          // Generate one-time setup token (7-day expiry)
          const token     = crypto.randomUUID();
          const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

          await supabase.from('nominee_access_tokens').upsert(
            { nominee_id: nominee.id, vault_owner_id: user.id, token, expires_at: expiresAt, used_at: null },
            { onConflict: 'nominee_id' }
          );

          const setupLink = `${APP_DEEP_LINK}?token=${token}`;

          await sendEmail({
            to: nominee.email,
            subject: `🔐 ${user.name}'s Digital Vault — Your Access is Ready`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#0f0f1a;color:#fff;border-radius:16px;overflow:hidden">
                <div style="background:linear-gradient(135deg,#C8980A,#3B82F6);padding:32px;text-align:center">
                  <h1 style="margin:0;font-size:28px">🔐 Digital Vault</h1>
                  <p style="margin:8px 0 0;opacity:0.85;font-size:15px">Nominee Access Granted</p>
                </div>
                <div style="padding:32px">
                  <p style="font-size:16px">Hello <strong>${nominee.name}</strong>,</p>
                  <p style="color:#aaa;line-height:1.6">
                    <strong style="color:#fff">${user.name}</strong> has been inactive for over
                    <strong style="color:#F59E0B">${daysSinceCheckin} days</strong>.
                    As a trusted nominee, you have now been granted access to their secure vault.
                  </p>
                  <p style="color:#aaa;line-height:1.6">
                    Tap the button below to set up your account and access the documents ${user.name} assigned to you.
                  </p>
                  <div style="text-align:center;margin:32px 0">
                    <a href="${setupLink}"
                       style="background:linear-gradient(135deg,#C8980A,#a87a08);color:#000;font-weight:800;
                              font-size:16px;padding:16px 36px;border-radius:12px;text-decoration:none;display:inline-block">
                      Set Up My Access →
                    </a>
                  </div>
                  <p style="color:#666;font-size:12px;text-align:center">
                    This link expires in 7 days. Once you set up your account, log in with your email address.
                  </p>
                  <p style="color:#666;font-size:12px;text-align:center">
                    Can't tap? Copy this link:<br>
                    <span style="color:#3B82F6;word-break:break-all">${setupLink}</span>
                  </p>
                </div>
              </div>
            `,
          });
          console.log(`[CRON] Nominee access email → ${nominee.email} (owner: ${user.email})`);
        }

        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: 'switch_triggered',
          metadata: { days_inactive: daysSinceCheckin, nominees_notified: nominees?.length || 0 },
        });
        console.log(`[CRON] Dead Man's Switch triggered for ${user.email}`);
      }
    }
    console.log('[CRON] Inactivity check complete.');
  } catch (err) {
    console.error('[CRON] Unexpected error:', err.message);
  }
}, { scheduled: false });

module.exports = inactivityCheckerJob;
