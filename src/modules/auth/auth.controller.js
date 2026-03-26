const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../../config/supabase');
const { sendEmail } = require('../../config/mailer');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendSmsOtp = async (phone, otp) => {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilio.messages.create({
      body: `Your Digital Vault OTP is: ${otp}. Valid for 10 minutes.`,
      from: process.env.TWILIO_PHONE_FROM,
      to: phone,
    });
  } else {
    console.log(`[SMS SIMULATION] To: ${phone} | OTP: ${otp}`);
  }
};

const saveOtp = async (userId, type, otp) => {
  // Invalidate previous OTPs
  await supabase.from('otps').update({ used: true }).eq('user_id', userId).eq('type', type).eq('used', false);
  // Save new OTP (10 min expiry)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await supabase.from('otps').insert({ user_id: userId, type, otp_code: otp, expires_at: expiresAt });
};

const logActivity = async (userId, action, metadata = {}) => {
  await supabase.from('activity_logs').insert({ user_id: userId, action, metadata });
};

// ─── Register ─────────────────────────────────────────────────────────────────

const register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    console.log('[REGISTER] Attempt:', { name, email, phone });

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    // Check duplicates
    const { data: existing } = await supabase
      .from('users')
      .select('id, email, phone')
      .or(`email.eq.${email},phone.eq.${phone}`)
      .limit(1);

    if (existing && existing.length > 0) {
      const dup = existing[0];
      if (dup.email === email) return res.status(409).json({ success: false, message: 'Email already registered. Please login instead.' });
      if (dup.phone === phone) return res.status(409).json({ success: false, message: 'Phone number already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    console.log('[REGISTER] Inserting user...');

    const { data: user, error } = await supabase
      .from('users')
      .insert({ name, email, phone, password_hash: passwordHash })
      .select()
      .single();

    if (error) {
      console.error('[REGISTER] DB insert error:', error.message, error.details);
      throw error;
    }
    console.log('[REGISTER] User created:', user.id);

    // Send email OTP — non-blocking, won't fail registration
    const emailOtp = generateOTP();
    try {
      await saveOtp(user.id, 'email', emailOtp);
      await sendEmail({
        to: email,
        subject: 'Digital Vault – Verify your email',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#C8980A">🔐 Digital Vault</h2>
            <p>Hello ${name},</p>
            <p>Your email verification OTP is:</p>
            <div style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#C8980A;padding:20px;background:#1a1a2e;border-radius:12px;text-align:center">${emailOtp}</div>
            <p>This OTP expires in 10 minutes.</p>
          </div>
        `,
      });
      console.log('[REGISTER] Email OTP sent to:', email);
    } catch (mailErr) {
      console.warn('[REGISTER] Email send failed (non-fatal):', mailErr.message);
      console.log(`[REGISTER] EMAIL OTP FALLBACK — ${email}: ${emailOtp}`);
    }

    // Send phone OTP — non-blocking
    const phoneOtp = generateOTP();
    try {
      await saveOtp(user.id, 'phone', phoneOtp);
      await sendSmsOtp(phone, phoneOtp);
      console.log('[REGISTER] Phone OTP sent to:', phone);
    } catch (smsErr) {
      console.warn('[REGISTER] SMS send failed (non-fatal):', smsErr.message);
      console.log(`[REGISTER] PHONE OTP FALLBACK — ${phone}: ${phoneOtp}`);
    }

    await logActivity(user.id, 'register');

    res.status(201).json({
      success: true,
      message: 'Registration successful! Check your email for the OTP.',
      data: { userId: user.id, email, phone },
    });
  } catch (err) {
    console.error('[REGISTER] Fatal error:', err.message, err.stack);
    next(err);
  }
};

// ─── Verify Email OTP ─────────────────────────────────────────────────────────

const verifyEmailOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

    const { data: user } = await supabase.from('users').select('id').eq('email', email).single();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { data: otpRecord } = await supabase
      .from('otps')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'email')
      .eq('otp_code', otp)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!otpRecord) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

    await supabase.from('otps').update({ used: true }).eq('id', otpRecord.id);
    await supabase.from('users').update({ email_verified: true }).eq('id', user.id);
    await logActivity(user.id, 'verify_email');

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
};

// ─── Verify Phone OTP ─────────────────────────────────────────────────────────

const verifyPhoneOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP are required' });

    const { data: user } = await supabase.from('users').select('id').eq('phone', phone).single();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { data: otpRecord } = await supabase
      .from('otps')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'phone')
      .eq('otp_code', otp)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!otpRecord) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

    await supabase.from('otps').update({ used: true }).eq('id', otpRecord.id);
    await supabase.from('users').update({ phone_verified: true }).eq('id', user.id);
    await logActivity(user.id, 'verify_phone');

    res.json({ success: true, message: 'Phone verified successfully' });
  } catch (err) {
    next(err);
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────

const login = async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;
    if ((!email && !phone) || !password) {
      return res.status(400).json({ success: false, message: 'Email/phone and password are required' });
    }

    let query = supabase.from('users').select('*');
    if (email) query = query.eq('email', email);
    else query = query.eq('phone', phone);

    const { data: user, error } = await query.single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.email_verified && !user.phone_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email or phone before logging in',
        data: { userId: user.id, needsVerification: true },
      });
    }

    // Update last check-in
    await supabase
      .from('users')
      .update({ last_checkin_at: new Date().toISOString() })
      .eq('id', user.id);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    await logActivity(user.id, 'login');

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          emailVerified: user.email_verified,
          phoneVerified: user.phone_verified,
          checkinIntervalDays: user.checkin_interval_days,
          lastCheckinAt: user.last_checkin_at,
          isNominee: user.is_nominee || false,
          nomineeForUserId: user.nominee_for_user_id || null,
          nomineeRecordId: user.nominee_record_id || null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Resend OTP ───────────────────────────────────────────────────────────────

const resendOtp = async (req, res, next) => {
  try {
    const { email, phone, type } = req.body; // type: 'email' | 'phone'
    if (!type || !['email', 'phone'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Type must be email or phone' });
    }

    let query = supabase.from('users').select('id, name, email, phone');
    if (email) query = query.eq('email', email);
    else if (phone) query = query.eq('phone', phone);
    const { data: user } = await query.single();

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const otp = generateOTP();
    await saveOtp(user.id, type, otp);

    if (type === 'email') {
      await sendEmail({
        to: user.email,
        subject: 'Digital Vault – Verification OTP',
        html: `<div style="font-family:sans-serif"><h2>Your OTP: <strong style="color:#3B82F6">${otp}</strong></h2><p>Expires in 10 minutes.</p></div>`,
      });
    } else {
      await sendSmsOtp(user.phone, otp);
    }

    res.json({ success: true, message: `OTP sent to your ${type}` });
  } catch (err) {
    next(err);
  }
};

// ─── Get Profile ──────────────────────────────────────────────────────────────

const getProfile = async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, phone, email_verified, phone_verified, checkin_interval_days, last_checkin_at, status, avatar_url, created_at')
    .eq('id', req.user.id)
    .single();
  res.json({ success: true, data: user });
};

// ─── Update Profile ───────────────────────────────────────────────────────────

const updateProfile = async (req, res, next) => {
  try {
    const { name, avatarUrl } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (avatarUrl) updates.avatar_url = avatarUrl;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, message: 'Profile updated', data });
  } catch (err) {
    next(err);
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both passwords are required' });
    }

    const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password_hash: newHash, updated_at: new Date().toISOString() }).eq('id', req.user.id);
    await logActivity(req.user.id, 'change_password');

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};


// ─── Validate Nominee Access Token ───────────────────────────────────────────
// GET /auth/nominee-token/:token
const validateNomineeToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { data, error } = await supabase
      .from('nominee_access_tokens')
      .select(`id, token, expires_at, used_at, nominees(id, name, email), users!vault_owner_id(id, name)`)
      .eq('token', token)
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Invalid or expired access link' });
    if (data.used_at)   return res.status(410).json({ success: false, message: 'This link has already been used' });
    if (new Date(data.expires_at) < new Date()) return res.status(410).json({ success: false, message: 'This link has expired' });

    res.json({
      success: true,
      data: {
        tokenId:        data.id,
        nomineeName:    data.nominees?.name,
        nomineeEmail:   data.nominees?.email,
        vaultOwnerName: data.users?.name,
        expiresAt:      data.expires_at,
      },
    });
  } catch (err) { next(err); }
};

// ─── Nominee Account Setup ────────────────────────────────────────────────────
// POST /auth/nominee-setup  { token, password }
const nomineeSetup = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, message: 'Token and password are required' });
    if (password.length < 8)  return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const { data: tokenRow, error: tokenErr } = await supabase
      .from('nominee_access_tokens')
      .select('id, nominee_id, vault_owner_id, expires_at, used_at, nominees(id, name, email)')
      .eq('token', token)
      .single();

    if (tokenErr || !tokenRow) return res.status(404).json({ success: false, message: 'Invalid access link' });
    if (tokenRow.used_at)      return res.status(410).json({ success: false, message: 'This link has already been used' });
    if (new Date(tokenRow.expires_at) < new Date()) return res.status(410).json({ success: false, message: 'Link expired' });

    const nominee    = tokenRow.nominees;
    const passHash   = await bcrypt.hash(password, 12);
    let userId;

    const { data: existing } = await supabase.from('users').select('id').eq('email', nominee.email).single();
    if (existing) {
      await supabase.from('users').update({
        password_hash: passHash, is_nominee: true,
        nominee_for_user_id: tokenRow.vault_owner_id,
        nominee_record_id: nominee.id,
        email_verified: true, is_active: true,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      userId = existing.id;
    } else {
      const { data: newUser, error: createErr } = await supabase.from('users').insert({
        name: nominee.name, email: nominee.email, phone: null,
        password_hash: passHash, email_verified: true, phone_verified: false,
        is_active: true, is_nominee: true,
        nominee_for_user_id: tokenRow.vault_owner_id,
        nominee_record_id: nominee.id,
      }).select().single();
      if (createErr) throw createErr;
      userId = newUser.id;
    }

    await supabase.from('nominee_access_tokens').update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id);

    const jwtToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
    await logActivity(userId, 'nominee_account_setup', { vault_owner_id: tokenRow.vault_owner_id });

    const { data: owner } = await supabase.from('users').select('id, name').eq('id', tokenRow.vault_owner_id).single();

    res.json({
      success: true,
      message: 'Account set up! You can now access the vault.',
      data: {
        token: jwtToken,
        user: {
          id: userId, name: nominee.name, email: nominee.email,
          isNominee: true,
          nomineeForUserId: tokenRow.vault_owner_id,
          nomineeRecordId: nominee.id,
          vaultOwnerName: owner?.name,
        },
      },
    });
  } catch (err) { next(err); }
};

module.exports = { register, verifyEmailOtp, verifyPhoneOtp, login, resendOtp, getProfile, updateProfile, changePassword, validateNomineeToken, nomineeSetup };
