const supabase = require('../../config/supabase');
const { sendEmail } = require('../../config/mailer');

// ─── Get nominees ─────────────────────────────────────────────────────────────

const getNominees = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('nominees')
      .select(`*, nominee_documents(document_id, documents(id, title, categories(name)))`)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── Add nominee ──────────────────────────────────────────────────────────────

const addNominee = async (req, res, next) => {
  try {
    const { name, email, phone, relationship, accessLevel, notifyOnInactivity } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, message: 'Name and email are required' });

    const { data, error } = await supabase
      .from('nominees')
      .insert({
        user_id: req.user.id,
        name,
        email,
        phone: phone || null,
        relationship: relationship || null,
        access_level: accessLevel || 'limited',
        notify_on_inactivity: notifyOnInactivity !== false,
      })
      .select()
      .single();

    if (error) throw error;

    // Notify the nominee by email
    await sendEmail({
      to: email,
      subject: `${req.user.name} has added you as a trusted nominee on Digital Vault`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#3B82F6">Digital Vault</h2>
          <p>Hello ${name},</p>
          <p><strong>${req.user.name}</strong> has added you as a trusted nominee on Digital Vault.
          This means you may be granted access to their secure vault in case of an emergency or prolonged inactivity.</p>
          <p>Your access level: <strong>${accessLevel || 'limited'}</strong></p>
          <p>If you have not been expecting this, please contact ${req.user.name} directly.</p>
        </div>
      `,
    });

    await supabase.from('activity_logs').insert({ user_id: req.user.id, action: 'nominee_added', metadata: { nominee_email: email } });
    res.status(201).json({ success: true, message: 'Nominee added', data });
  } catch (err) {
    next(err);
  }
};

// ─── Update nominee ───────────────────────────────────────────────────────────

const updateNominee = async (req, res, next) => {
  try {
    const { name, email, phone, relationship, accessLevel, notifyOnInactivity } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (relationship !== undefined) updates.relationship = relationship;
    if (accessLevel !== undefined) updates.access_level = accessLevel;
    if (notifyOnInactivity !== undefined) updates.notify_on_inactivity = notifyOnInactivity;

    const { data, error } = await supabase
      .from('nominees')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Nominee not found' });
    res.json({ success: true, message: 'Nominee updated', data });
  } catch (err) {
    next(err);
  }
};

// ─── Delete nominee ───────────────────────────────────────────────────────────

const deleteNominee = async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('nominees')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true, message: 'Nominee removed' });
  } catch (err) {
    next(err);
  }
};

// ─── Assign documents to nominee ──────────────────────────────────────────────

const assignDocuments = async (req, res, next) => {
  try {
    const { documentIds } = req.body; // array of document IDs
    const nomineeId = req.params.id;

    // Verify nominee belongs to user
    const { data: nominee } = await supabase
      .from('nominees')
      .select('id, access_level')
      .eq('id', nomineeId)
      .eq('user_id', req.user.id)
      .single();
    if (!nominee) return res.status(404).json({ success: false, message: 'Nominee not found' });

    // Remove existing assignments
    await supabase.from('nominee_documents').delete().eq('nominee_id', nomineeId);

    // Insert new assignments
    if (documentIds && documentIds.length > 0) {
      const rows = documentIds.map(docId => ({ nominee_id: nomineeId, document_id: docId }));
      const { error } = await supabase.from('nominee_documents').insert(rows);
      if (error) throw error;
    }

    res.json({ success: true, message: 'Documents assigned to nominee', assignedCount: documentIds?.length || 0 });
  } catch (err) {
    next(err);
  }
};

// ─── Get nominee's accessible documents ──────────────────────────────────────

const getNomineeDocuments = async (req, res, next) => {
  try {
    const nomineeId = req.params.id;
    const { data: nominee } = await supabase.from('nominees').select('id, access_level').eq('id', nomineeId).eq('user_id', req.user.id).single();
    if (!nominee) return res.status(404).json({ success: false, message: 'Nominee not found' });

    let documents;
    if (nominee.access_level === 'full') {
      const { data } = await supabase.from('documents').select(`*, categories(*)`).eq('user_id', req.user.id);
      documents = data;
    } else {
      const { data } = await supabase
        .from('nominee_documents')
        .select(`documents(*, categories(*))`)
        .eq('nominee_id', nomineeId);
      documents = (data || []).map(row => row.documents);
    }

    res.json({ success: true, data: documents });
  } catch (err) {
    next(err);
  }
};

// ─── Nominee: Get my assigned documents ────────────────────────────────────────
// Called by a logged-in NOMINEE user to see their assigned documents.
const getMyAssignedDocuments = async (req, res, next) => {
  try {
    const { nominee_record_id, nominee_for_user_id, is_nominee } = req.user;
    if (!is_nominee || !nominee_record_id) {
      return res.status(403).json({ success: false, message: 'This endpoint is only for nominees' });
    }

    // Check access level on the nominee row
    const { data: nomineeRow } = await supabase
      .from('nominees')
      .select('id, access_level, name')
      .eq('id', nominee_record_id)
      .single();

    let documents;
    if (nomineeRow?.access_level === 'full') {
      // Full access — see everything
      const { data } = await supabase
        .from('documents')
        .select(`*, categories(*)`)
        .eq('user_id', nominee_for_user_id)
        .order('created_at', { ascending: false });
      documents = data;
    } else {
      // Limited — only assigned documents
      const { data } = await supabase
        .from('nominee_documents')
        .select(`documents(*, categories(*))`)
        .eq('nominee_id', nominee_record_id);
      documents = (data || []).map(r => r.documents).filter(Boolean);
    }

    // Get vault owner info
    const { data: owner } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', nominee_for_user_id)
      .single();

    res.json({ success: true, data: documents, vaultOwner: owner });
  } catch (err) { next(err); }
};

module.exports = { getNominees, addNominee, updateNominee, deleteNominee, assignDocuments, getNomineeDocuments, getMyAssignedDocuments };
