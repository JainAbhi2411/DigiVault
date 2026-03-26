const supabase = require('../../config/supabase');

// ── List secrets ──────────────────────────────────────────────
const getSecrets = async (req, res, next) => {
  try {
    const { type, search } = req.query;
    let query = supabase
      .from('secrets')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (type) query = query.eq('type', type);
    if (search) query = query.ilike('title', `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ── Get single secret ─────────────────────────────────────────
const getSecret = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('secrets')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    if (error || !data) return res.status(404).json({ success: false, message: 'Entry not found' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ── Create secret ─────────────────────────────────────────────
const createSecret = async (req, res, next) => {
  try {
    const { title, content, type, mood, isLocked, tags } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });

    const { data, error } = await supabase
      .from('secrets')
      .insert({
        user_id: req.user.id,
        title,
        content: content || null,
        type: type || 'note',
        mood: mood || null,
        is_locked: isLocked || false,
        tags: tags || [],
      })
      .select()
      .single();

    if (error) throw error;
    await supabase.from('activity_logs').insert({ user_id: req.user.id, action: 'secret_created', metadata: { type: type || 'note' } });
    res.status(201).json({ success: true, message: 'Entry saved', data });
  } catch (err) { next(err); }
};

// ── Update secret ─────────────────────────────────────────────
const updateSecret = async (req, res, next) => {
  try {
    const { title, content, type, mood, isLocked, tags } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (type !== undefined) updates.type = type;
    if (mood !== undefined) updates.mood = mood;
    if (isLocked !== undefined) updates.is_locked = isLocked;
    if (tags !== undefined) updates.tags = tags;

    const { data, error } = await supabase
      .from('secrets')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Entry not found' });
    res.json({ success: true, message: 'Entry updated', data });
  } catch (err) { next(err); }
};

// ── Delete secret ─────────────────────────────────────────────
const deleteSecret = async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('secrets')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true, message: 'Entry deleted' });
  } catch (err) { next(err); }
};

module.exports = { getSecrets, getSecret, createSecret, updateSecret, deleteSecret };
