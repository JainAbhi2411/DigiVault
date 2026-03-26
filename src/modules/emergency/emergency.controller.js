const supabase = require('../../config/supabase');
const { sendEmail } = require('../../config/mailer');

// ─── Request emergency access (nominee initiates) ────────────────────────────

const requestEmergencyAccess = async (req, res, next) => {
  try {
    const { nomineeId, reason } = req.body;
    if (!nomineeId) return res.status(400).json({ success: false, message: 'Nominee ID is required' });

    // Verify nominee exists
    const { data: nominee } = await supabase
      .from('nominees')
      .select('*, users(id, name, email)')
      .eq('id', nomineeId)
      .single();
    if (!nominee) return res.status(404).json({ success: false, message: 'Nominee not found' });

    // Check for existing pending request
    const { data: existing } = await supabase
      .from('emergency_requests')
      .select('id, status')
      .eq('nominee_id', nomineeId)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return res.status(409).json({ success: false, message: 'A pending request already exists' });
    }

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { data: request, error } = await supabase
      .from('emergency_requests')
      .insert({
        nominee_id: nomineeId,
        user_id: nominee.user_id,
        reason: reason || null,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) throw error;

    // Notify the vault owner
    await sendEmail({
      to: nominee.users.email,
      subject: '⚠️ Emergency Access Request – Digital Vault',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#EF4444">Emergency Access Request</h2>
          <p>Hello ${nominee.users.name},</p>
          <p><strong>${nominee.name}</strong> (${nominee.relationship || 'your nominee'}) has requested emergency access to your Digital Vault.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Please log in to your Digital Vault app to <strong>approve or reject</strong> this request. It expires in 48 hours.</p>
          <p style="color:#6B7280;font-size:12px">If you do not take action, the request will expire automatically.</p>
        </div>
      `,
    });

    res.status(201).json({ success: true, message: 'Emergency access request submitted', data: request });
  } catch (err) {
    next(err);
  }
};

// ─── Get emergency requests (vault owner sees incoming requests) ───────────────

const getEmergencyRequests = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('emergency_requests')
      .select(`*, nominees(id, name, email, relationship)`)
      .eq('user_id', req.user.id)
      .order('requested_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── Resolve request (approve / reject) ──────────────────────────────────────

const resolveRequest = async (req, res, next) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be approve or reject' });
    }

    const { data: request } = await supabase
      .from('emergency_requests')
      .select(`*, nominees(name, email)`)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const accessGrantedUntil = action === 'approve'
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days access
      : null;

    await supabase.from('emergency_requests').update({
      status: newStatus,
      resolved_at: new Date().toISOString(),
      access_granted_until: accessGrantedUntil,
    }).eq('id', req.params.id);

    // Notify the nominee
    await sendEmail({
      to: request.nominees.email,
      subject: `Your emergency access request has been ${newStatus} – Digital Vault`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:${action === 'approve' ? '#10B981' : '#EF4444'}">Access ${action === 'approve' ? 'Approved' : 'Rejected'}</h2>
          <p>Hello ${request.nominees.name},</p>
          <p>Your emergency access request has been <strong>${newStatus}</strong> by the vault owner.</p>
          ${action === 'approve' ? '<p>You now have temporary access to the vault for 7 days.</p>' : ''}
        </div>
      `,
    });

    await supabase.from('activity_logs').insert({
      user_id: req.user.id,
      action: `emergency_access_${newStatus}`,
      metadata: { request_id: req.params.id, nominee_id: request.nominee_id },
    });

    res.json({ success: true, message: `Request ${newStatus}`, data: { status: newStatus, accessGrantedUntil } });
  } catch (err) {
    next(err);
  }
};

module.exports = { requestEmergencyAccess, getEmergencyRequests, resolveRequest };
