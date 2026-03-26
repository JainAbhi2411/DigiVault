const supabase = require('../../config/supabase');
const multer   = require('multer');
const path     = require('path');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Helper: enrich reports with doctor data separately (avoids FK schema-cache error)
const enrichWithDoctor = async (reports, userId) => {
  if (!reports || reports.length === 0) return reports;
  const doctorIds = [...new Set(reports.map(r => r.doctor_id).filter(Boolean))];
  if (doctorIds.length === 0) return reports;
  const { data: doctors } = await supabase
    .from('doctors')
    .select('id, name, specialty, phone, color')
    .eq('user_id', userId)
    .in('id', doctorIds);
  const map = {};
  (doctors || []).forEach(d => { map[d.id] = d; });
  return reports.map(r => ({ ...r, doctors: r.doctor_id ? (map[r.doctor_id] || null) : null }));
};

// ── List medical reports ──────────────────────────────────────
const getReports = async (req, res, next) => {
  try {
    const { doctorId, type } = req.query;
    let query = supabase
      .from('medical_reports')
      .select('*')
      .eq('user_id', req.user.id)
      .order('report_date', { ascending: false });

    if (doctorId) query = query.eq('doctor_id', doctorId);
    if (type)     query = query.eq('report_type', type);

    const { data, error } = await query;
    if (error) throw error;
    const enriched = await enrichWithDoctor(data, req.user.id);
    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

// ── Get single report ──────────────────────────────────────────
const getReport = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('medical_reports')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Report not found' });

    // Generate a short-lived signed URL for the file if present
    if (data.file_path) {
      const { data: signed } = await supabase.storage
        .from('medical-reports')
        .createSignedUrl(data.file_path, 3600);
      data.signed_url = signed?.signedUrl || null;
    }

    const [enriched] = await enrichWithDoctor([data], req.user.id);
    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

// ── Create / upload report ────────────────────────────────────
const createReport = async (req, res, next) => {
  try {
    const { title, reportType, reportDate, doctorId, notes } = req.body;
    if (!title)      return res.status(400).json({ success: false, message: 'Title is required' });
    if (!reportDate) return res.status(400).json({ success: false, message: 'Report date is required' });

    let file_path = null, file_name = null, file_type = null, file_size = null;

    if (req.file) {
      const ext      = path.extname(req.file.originalname) || '';
      const filePath = `${req.user.id}/${Date.now()}${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('medical-reports')
        .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (uploadError) throw uploadError;
      file_path = filePath;
      file_name = req.file.originalname;
      file_type = req.file.mimetype;
      file_size = req.file.size;
    }

    const { data, error } = await supabase
      .from('medical_reports')
      .insert({
        user_id:     req.user.id,
        title:       title.trim(),
        report_type: reportType || 'Other',
        report_date: reportDate,
        doctor_id:   doctorId   || null,
        notes:       notes      || null,
        file_path, file_name, file_type, file_size,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[createReport] Supabase error:', error.code, error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
    const [enriched] = await enrichWithDoctor([data], req.user.id);
    res.status(201).json({ success: true, message: 'Report uploaded', data: enriched });
  } catch (err) { next(err); }
};

// ── Delete report ─────────────────────────────────────────────
const deleteReport = async (req, res, next) => {
  try {
    const { data: report } = await supabase.from('medical_reports').select('file_path').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (report?.file_path) {
      await supabase.storage.from('medical-reports').remove([report.file_path]);
    }
    const { error } = await supabase.from('medical_reports').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true, message: 'Report deleted' });
  } catch (err) { next(err); }
};

module.exports = { getReports, getReport, createReport, deleteReport, upload };
