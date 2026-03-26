const express = require('express');
const router  = express.Router();
const {
  getExpenses, getStats, getExpense,
  createExpense, updateExpense, deleteExpense,
} = require('./expenses.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/stats', getStats);     // must be before /:id
router.get('/',      getExpenses);
router.get('/:id',   getExpense);
router.post('/',     createExpense);
router.put('/:id',   updateExpense);
router.delete('/:id', deleteExpense);

module.exports = router;
