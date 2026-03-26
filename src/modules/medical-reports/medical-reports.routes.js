const express = require('express');
const router  = express.Router();
const { getReports, getReport, createReport, deleteReport, upload } = require('./medical-reports.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);
router.get('/',    getReports);
router.get('/:id', getReport);
router.post('/', upload.single('file'), createReport);
router.delete('/:id', deleteReport);

module.exports = router;
