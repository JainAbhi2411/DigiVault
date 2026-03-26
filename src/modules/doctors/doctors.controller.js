const supabase = require('../../config/supabase');

// ── List doctors ──────────────────────────────────────────────
const getDoctors = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('user_id', req.user.id)
      .order('name', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ── Get single doctor ─────────────────────────────────────────
const getDoctor = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Doctor not found' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ── Create doctor ─────────────────────────────────────────────
const createDoctor = async (req, res, next) => {
  try {
    const { name, specialty, phone, hospitalClinic, email, city, notes, color } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Doctor name is required' });

    const { data, error } = await supabase
      .from('doctors')
      .insert({
        user_id:         req.user.id,
        name:            name.trim(),
        specialty:       specialty || null,
        phone:           phone || null,
        hospital_clinic: hospitalClinic || null,
        email:           email || null,
        city:            city || null,
        notes:           notes || null,
        color:           color || '#3D7EFF',
      })
      .select()
      .single();

    if (error) {
      console.error('[createDoctor] Supabase error:', error.code, error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
    res.status(201).json({ success: true, message: 'Doctor added', data });
  } catch (err) { next(err); }
};

// ── Update doctor ─────────────────────────────────────────────
const updateDoctor = async (req, res, next) => {
  try {
    const { name, specialty, phone, hospitalClinic, email, city, notes, color } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name            !== undefined) updates.name             = name;
    if (specialty       !== undefined) updates.specialty        = specialty;
    if (phone           !== undefined) updates.phone            = phone;
    if (hospitalClinic  !== undefined) updates.hospital_clinic  = hospitalClinic;
    if (email           !== undefined) updates.email            = email;
    if (city            !== undefined) updates.city             = city;
    if (notes           !== undefined) updates.notes            = notes;
    if (color           !== undefined) updates.color            = color;

    const { data, error } = await supabase
      .from('doctors')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Doctor not found' });
    res.json({ success: true, message: 'Doctor updated', data });
  } catch (err) { next(err); }
};

// ── Delete doctor ─────────────────────────────────────────────
const deleteDoctor = async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('doctors')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true, message: 'Doctor removed' });
  } catch (err) { next(err); }
};

module.exports = { getDoctors, getDoctor, createDoctor, updateDoctor, deleteDoctor };
