const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const upload = require('../../config/multer');
const {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  getCategories,
  getDashboardStats,
} = require('./documents.controller');

router.use(authenticate);

router.get('/stats', getDashboardStats);
router.get('/categories', getCategories);
router.get('/', getDocuments);
router.get('/:id', getDocument);
router.post('/', upload.single('file'), createDocument);
router.put('/:id', updateDocument);
router.delete('/:id', deleteDocument);

module.exports = router;
