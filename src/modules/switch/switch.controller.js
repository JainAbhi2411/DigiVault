const supabase = require('../../config/supabase');
const { sendEmail } = require('../../config/mailer');

// ─── Get switch settings ──────────────────────────────────────────────────────

const getSwitchSettings = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('checkin_interval_days, last_checkin_at, warning_sent_at, switch_triggered_at, status')
      .eq('id', req.user.id)
      .single();
    if (error) throw error;

    const now = new Date();
    const lastCheckin = new Date(data.last_checkin_at);
    const daysSinceCheckin = Math.floor((now - lastCheckin) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, data.checkin_interval_days - daysSinceCheckin);

    res.json({
      success: true,
      data: {
        ...data,
        daysSinceCheckin,
        daysRemaining,
        isOverdue: daysSinceCheckin > data.checkin_interval_days,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Update switch settings ───────────────────────────────────────────────────

const updateSwitchSettings = async (req, res, next) => {
  try {
    const { checkinIntervalDays } = req.body;
    if (!checkinIntervalDays || checkinIntervalDays < 1 || checkinIntervalDays > 365) {
      return res.status(400).json({ success: false, message: 'Interval must be between 1 and 365 days' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ checkin_interval_days: checkinIntervalDays, updated_at: new Date().toISOString() })
      .eq('id', req.user.id)
      .select('checkin_interval_days, last_checkin_at')
      .single();

    if (error) throw error;
    res.json({ success: true, message: 'Dead Man\'s Switch settings updated', data });
  } catch (err) {
    next(err);
  }
};

// ─── Check in ─────────────────────────────────────────────────────────────────

const checkIn = async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('users')
      .update({ last_checkin_at: now, warning_sent_at: null, status: 'active', updated_at: now })
      .eq('id', req.user.id);

    if (error) throw error;
    await supabase.from('activity_logs').insert({ user_id: req.user.id, action: 'checkin' });

    res.json({ success: true, message: 'Check-in recorded successfully', data: { lastCheckinAt: now } });
  } catch (err) {
    next(err);
  }
};

// ─── TEST: Manually trigger nominee emails ────────────────────────────────────

const testTrigger = async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const APP_DEEP_LINK     = process.env.APP_DEEP_LINK || 'digitalvault://nominee-setup';
    const TOKEN_EXPIRY_DAYS = 7;
    const now               = new Date();

    // Get the current user's info
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', req.user.id)
      .single();
    if (userErr || !user) return res.status(404).json({ success: false, message: 'User not found' });

    // Get all nominees with inactivity notification enabled
    const { data: nominees } = await supabase
      .from('nominees')
      .select('id, name, email, access_level')
      .eq('user_id', req.user.id)
      .eq('notify_on_inactivity', true);

    if (!nominees || nominees.length === 0) {
      return res.status(404).json({ success: false, message: 'No nominees with notifications enabled. Add a nominee first.' });
    }

    const results = [];
    for (const nominee of nominees) {
      // Generate one-time token
      const token     = crypto.randomUUID();
      const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

      await supabase.from('nominee_access_tokens').upsert(
        { nominee_id: nominee.id, vault_owner_id: user.id, token, expires_at: expiresAt, used_at: null },
        { onConflict: 'nominee_id' }
      );

      const setupLink = `${APP_DEEP_LINK}?token=${token}`;

      await sendEmail({
        to: nominee.email,
        subject: `🧪 [TEST] ${user.name}'s Digital Vault — Nominee Access Test`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#0f0f1a;color:#fff;border-radius:16px;overflow:hidden">
            <div style="background:linear-gradient(135deg,#C8980A,#3B82F6);padding:32px;text-align:center">
              <h1 style="margin:0;font-size:28px">🔐 Digital Vault</h1>
              <p style="margin:8px 0 0;opacity:0.85;font-size:15px">🧪 TEST — Nominee Access Email</p>
            </div>
            <div style="padding:32px;">
              <div style="background:#F59E0B22;border:1px solid #F59E0B55;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:#F59E0B">
                ⚠️ This is a <strong>TEST email</strong> triggered manually by the vault owner. No action is required unless they've asked you to test the setup flow.
              </div>
              <p style="font-size:16px;color:#ccc">Hello <strong style="color:#fff">${nominee.name}</strong>,</p>
              <p style="font-size:15px;color:#aaa">
                <strong style="color:#fff">${user.name}</strong> has triggered a test notification to confirm the nominee access system is working correctly.
              </p>
              <p style="font-size:14px;color:#888">Your access level: <strong style="color:#C8980A">${nominee.access_level || 'limited'}</strong></p>
              <div style="text-align:center;margin:32px 0">
                <a href="${setupLink}" style="background:linear-gradient(135deg,#C8980A,#F59E0B);color:#000;text-decoration:none;padding:16px 32px;border-radius:12px;font-weight:800;font-size:16px;display:inline-block">
                  🔐 Test Nominee Setup
                </a>
              </div>
              <p style="font-size:12px;color:#555;text-align:center">Link expires in 7 days · This is a test — no emergency has occurred</p>
            </div>
          </div>
        `,
      });

      results.push({ nominee: nominee.name, email: nominee.email, status: 'sent' });
      console.log(`[TEST TRIGGER] Email sent to ${nominee.email}`);
    }

    await supabase.from('activity_logs').insert({
      user_id: req.user.id,
      action: 'test_trigger',
      metadata: { count: results.length, nominees: results.map(r => r.email) },
    }).catch(() => {});

    res.json({
      success: true,
      message: `✅ Test emails sent to ${results.length} nominee${results.length !== 1 ? 's' : ''}`,
      data: results,
    });
  } catch (err) { next(err); }
};

module.exports = { getSwitchSettings, updateSwitchSettings, checkIn, testTrigger };
