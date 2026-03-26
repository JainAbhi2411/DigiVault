const supabase = require('../../config/supabase');
const upload = require('../../config/multer');

// ─── Get all documents ────────────────────────────────────────────────────────

const getDocuments = async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from('documents')
      .select(`*, categories(id, name, slug, icon, color)`, { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (category) query = query.eq('category_id', category);
    if (search) query = query.ilike('title', `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get single document ──────────────────────────────────────────────────────

const getDocument = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select(`*, categories(*)`)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Document not found' });

    // Generate signed URL if file exists
    if (data.file_path) {
      const { data: signedUrl } = await supabase.storage
        .from('documents')
        .createSignedUrl(data.file_path, 3600); // 1 hour
      data.signed_url = signedUrl?.signedUrl || null;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── Create document (with optional file) ────────────────────────────────────

const createDocument = async (req, res, next) => {
  try {
    const { title, description, categoryId, tags, isSensitive, isEncrypted } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });

    let filePath = null;
    let fileName = null;
    let fileType = null;
    let fileSize = null;

    if (req.file) {
      const ext = req.file.originalname.split('.').pop();
      filePath = `${req.user.id}/${Date.now()}-${req.file.originalname}`;
      fileName = req.file.originalname;
      fileType = req.file.mimetype;
      fileSize = req.file.size;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

      if (uploadError) throw uploadError;
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: req.user.id,
        title,
        description,
        category_id: categoryId || null,
        tags: tags ? JSON.parse(tags) : [],
        is_sensitive: isSensitive === 'true' || isSensitive === true,
        is_encrypted: isEncrypted === 'true' || isEncrypted === true,
        file_path: filePath,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
      })
      .select(`*, categories(id, name, slug, icon, color)`)
      .single();

    if (error) throw error;

    await supabase.from('activity_logs').insert({ user_id: req.user.id, action: 'document_upload', resource_type: 'document', resource_id: data.id });

    res.status(201).json({ success: true, message: 'Document created', data });
  } catch (err) {
    next(err);
  }
};

// ─── Update document ──────────────────────────────────────────────────────────

const updateDocument = async (req, res, next) => {
  try {
    const { title, description, categoryId, tags, isSensitive } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (categoryId !== undefined) updates.category_id = categoryId;
    if (tags !== undefined) updates.tags = typeof tags === 'string' ? JSON.parse(tags) : tags;
    if (isSensitive !== undefined) updates.is_sensitive = isSensitive === 'true' || isSensitive === true;

    const { data, error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select(`*, categories(id, name, slug, icon, color)`)
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Document not found' });

    res.json({ success: true, message: 'Document updated', data });
  } catch (err) {
    next(err);
  }
};

// ─── Delete document ──────────────────────────────────────────────────────────

const deleteDocument = async (req, res, next) => {
  try {
    const { data: doc } = await supabase.from('documents').select('file_path').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    if (doc.file_path) {
      await supabase.storage.from('documents').remove([doc.file_path]);
    }

    await supabase.from('documents').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true, message: 'Document deleted' });
  } catch (err) {
    next(err);
  }
};

// ─── Get categories ───────────────────────────────────────────────────────────

const getCategories = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw error;

    // Get document counts per category
    const { data: counts } = await supabase
      .from('documents')
      .select('category_id')
      .eq('user_id', req.user.id);

    const countMap = {};
    (counts || []).forEach(d => {
      countMap[d.category_id] = (countMap[d.category_id] || 0) + 1;
    });

    const enriched = data.map(c => ({ ...c, documentCount: countMap[c.id] || 0 }));
    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

// ─── Dashboard stats ──────────────────────────────────────────────────────────

const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [docsResult, nomineesResult, recentResult, activityResult] = await Promise.all([
      supabase.from('documents').select('id, category_id, file_size', { count: 'exact' }).eq('user_id', userId),
      supabase.from('nominees').select('id', { count: 'exact' }).eq('user_id', userId),
      supabase.from('documents').select(`id, title, created_at, categories(name, color, icon)`).eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      supabase.from('activity_logs').select('action, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
    ]);

    const docs = docsResult.data || [];
    const totalSize = docs.reduce((sum, d) => sum + (d.file_size || 0), 0);

    // Category breakdown
    const categoryBreakdown = {};
    docs.forEach(d => {
      if (d.category_id) categoryBreakdown[d.category_id] = (categoryBreakdown[d.category_id] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        totalDocuments: docsResult.count || 0,
        totalNominees: nomineesResult.count || 0,
        totalStorageBytes: totalSize,
        categoryBreakdown,
        recentDocuments: recentResult.data || [],
        recentActivity: activityResult.data || [],
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDocuments, getDocument, createDocument, updateDocument, deleteDocument, getCategories, getDashboardStats };
