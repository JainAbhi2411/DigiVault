const supabase = require('../../config/supabase');

// Helper: enrich prescriptions with doctor data separately (avoids FK join errors)
const enrichWithDoctors = async (prescriptions, userId) => {
  if (!prescriptions || prescriptions.length === 0) return prescriptions;
  const doctorIds = [...new Set(prescriptions.map(p => p.doctor_id).filter(Boolean))];
  if (doctorIds.length === 0) return prescriptions;
  const { data: doctors } = await supabase
    .from('doctors')
    .select('id, name, specialty, phone, color')
    .eq('user_id', userId)
    .in('id', doctorIds);
  const map = {};
  (doctors || []).forEach(d => { map[d.id] = d; });
  return prescriptions.map(p => ({ ...p, doctors: p.doctor_id ? (map[p.doctor_id] || null) : null }));
};

// ── List prescriptions ────────────────────────────────────────
const getPrescriptions = async (req, res, next) => {
  try {
    const { active, doctorId } = req.query;
    let query = supabase
      .from('prescriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('prescribed_month', { ascending: false })
      .order('created_at',       { ascending: false });

    if (active   === 'true') query = query.eq('is_active', true);
    if (doctorId)            query = query.eq('doctor_id', doctorId);

    const { data, error } = await query;
    if (error) throw error;
    const enriched = await enrichWithDoctors(data, req.user.id);
    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

// ── Get single prescription ───────────────────────────────────
const getPrescription = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    if (error || !data) return res.status(404).json({ success: false, message: 'Prescription not found' });
    const [enriched] = await enrichWithDoctors([data], req.user.id);
    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

// ── Get history ───────────────────────────────────────────────
const getPrescriptionHistory = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('prescribed_month', { ascending: false })
      .order('created_at',       { ascending: false });
    if (error) throw error;
    const enriched = await enrichWithDoctors(data, req.user.id);
    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

// ── Create prescription ───────────────────────────────────────
const createPrescription = async (req, res, next) => {
  try {
    const {
      medicineName, dosage, frequency, timesOfDay,
      startDate, endDate, doctorId, doctorName,
      prescribedMonth, notes, color,
    } = req.body;
    if (!medicineName) return res.status(400).json({ success: false, message: 'Medicine name is required' });
    if (!startDate)    return res.status(400).json({ success: false, message: 'Start date is required' });

    const month = prescribedMonth || (startDate ? startDate.slice(0, 7) : new Date().toISOString().slice(0, 7));

    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        user_id:           req.user.id,
        medicine_name:     medicineName,
        dosage:            dosage           || null,
        frequency:         frequency        || 'daily',
        times_of_day:      timesOfDay       || [],
        start_date:        startDate,
        end_date:          endDate          || null,
        doctor_id:         doctorId         || null,
        doctor_name:       doctorName       || null,
        prescribed_month:  month,
        notes:             notes            || null,
        color:             color            || '#3B82F6',
        is_active:         true,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[createPrescription] Supabase error:', error.code, error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
    await supabase.from('activity_logs').insert({ user_id: req.user.id, action: 'prescription_created', metadata: { medicine: medicineName } }).catch(() => {});
    const [enriched] = await enrichWithDoctors([data], req.user.id);
    res.status(201).json({ success: true, message: 'Prescription added', data: enriched });
  } catch (err) { next(err); }
};

// ── Update prescription ───────────────────────────────────────
const updatePrescription = async (req, res, next) => {
  try {
    const {
      medicineName, dosage, frequency, timesOfDay,
      startDate, endDate, doctorId, doctorName,
      prescribedMonth, notes, color, isActive,
    } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (medicineName    !== undefined) updates.medicine_name    = medicineName;
    if (dosage          !== undefined) updates.dosage           = dosage;
    if (frequency       !== undefined) updates.frequency        = frequency;
    if (timesOfDay      !== undefined) updates.times_of_day     = timesOfDay;
    if (startDate       !== undefined) updates.start_date       = startDate;
    if (endDate         !== undefined) updates.end_date         = endDate;
    if (doctorId        !== undefined) updates.doctor_id        = doctorId;
    if (doctorName      !== undefined) updates.doctor_name      = doctorName;
    if (prescribedMonth !== undefined) updates.prescribed_month = prescribedMonth;
    if (notes           !== undefined) updates.notes            = notes;
    if (color           !== undefined) updates.color            = color;
    if (isActive        !== undefined) updates.is_active        = isActive;

    const { data, error } = await supabase
      .from('prescriptions')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Prescription not found' });
    const [enriched] = await enrichWithDoctors([data], req.user.id);
    res.json({ success: true, message: 'Prescription updated', data: enriched });
  } catch (err) { next(err); }
};

// ── Delete prescription ───────────────────────────────────────
const deletePrescription = async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('prescriptions')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true, message: 'Prescription deleted' });
  } catch (err) { next(err); }
};

module.exports = {
  getPrescriptions, getPrescription, getPrescriptionHistory,
  createPrescription, updatePrescription, deletePrescription,
};
