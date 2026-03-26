const supabase = require('../../config/supabase');

// ── List expenses ──────────────────────────────────────────────
const getExpenses = async (req, res, next) => {
  try {
    const { month, year, category, type } = req.query;
    const now = new Date();
    const m = parseInt(month) || now.getMonth() + 1;
    const y = parseInt(year)  || now.getFullYear();

    // Build date range for the requested month
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end   = new Date(y, m, 0).toISOString().split('T')[0]; // last day of month

    let query = supabase
      .from('expenses')
      .select('*')
      .eq('user_id', req.user.id)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category', category);
    if (type === 'expense') query = query.eq('is_income', false);
    if (type === 'income')  query = query.eq('is_income', true);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data, month: m, year: y });
  } catch (err) { next(err); }
};

// ── Monthly stats ──────────────────────────────────────────────
const getStats = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = parseInt(month) || now.getMonth() + 1;
    const y = parseInt(year)  || now.getFullYear();

    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end   = new Date(y, m, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', req.user.id)
      .gte('date', start)
      .lte('date', end);

    if (error) throw error;

    const expenses = data.filter(e => !e.is_income);
    const incomes  = data.filter(e =>  e.is_income);

    const totalSpent  = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    const totalIncome = incomes.reduce((s, e)  => s + parseFloat(e.amount), 0);
    const net         = totalIncome - totalSpent;

    // Per-category breakdown
    const byCategory = {};
    for (const e of expenses) {
      if (!byCategory[e.category]) byCategory[e.category] = 0;
      byCategory[e.category] += parseFloat(e.amount);
    }

    // Day-by-day totals
    const byDay = {};
    for (const e of data) {
      const d = e.date;
      if (!byDay[d]) byDay[d] = { spent: 0, income: 0 };
      if (e.is_income) byDay[d].income += parseFloat(e.amount);
      else             byDay[d].spent  += parseFloat(e.amount);
    }

    // Top spending days
    const topDays = Object.entries(byDay)
      .sort((a, b) => b[1].spent - a[1].spent)
      .slice(0, 5)
      .map(([date, vals]) => ({ date, ...vals }));

    res.json({
      success: true,
      month: m, year: y,
      totalSpent, totalIncome, net,
      byCategory,
      byDay,
      topDays,
      transactionCount: data.length,
    });
  } catch (err) { next(err); }
};

// ── Get single ─────────────────────────────────────────────────
const getExpense = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    if (error || !data) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ── Create ─────────────────────────────────────────────────────
const createExpense = async (req, res, next) => {
  try {
    const { amount, category, description, date, paymentMethod, isIncome, notes } = req.body;
    if (!amount)   return res.status(400).json({ success: false, message: 'Amount is required' });
    if (!category) return res.status(400).json({ success: false, message: 'Category is required' });

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id:        req.user.id,
        amount:         parseFloat(amount),
        category:       category.toLowerCase(),
        description:    description || null,
        date:           date || new Date().toISOString().split('T')[0],
        payment_method: paymentMethod || 'Cash',
        is_income:      isIncome === true || isIncome === 'true',
        notes:          notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, message: 'Expense recorded', data });
  } catch (err) { next(err); }
};

// ── Update ─────────────────────────────────────────────────────
const updateExpense = async (req, res, next) => {
  try {
    const { amount, category, description, date, paymentMethod, isIncome, notes } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (amount         !== undefined) updates.amount         = parseFloat(amount);
    if (category       !== undefined) updates.category       = category.toLowerCase();
    if (description    !== undefined) updates.description    = description;
    if (date           !== undefined) updates.date           = date;
    if (paymentMethod  !== undefined) updates.payment_method = paymentMethod;
    if (isIncome       !== undefined) updates.is_income      = isIncome === true || isIncome === 'true';
    if (notes          !== undefined) updates.notes          = notes;

    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, message: 'Expense updated', data });
  } catch (err) { next(err); }
};

// ── Delete ─────────────────────────────────────────────────────
const deleteExpense = async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) { next(err); }
};

module.exports = { getExpenses, getStats, getExpense, createExpense, updateExpense, deleteExpense };
