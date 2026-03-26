const express = require('express');
const router = express.Router();
const {
  getPrescriptions, getPrescription, getPrescriptionHistory,
  createPrescription, updatePrescription, deletePrescription,
} = require('./prescriptions.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);
router.get('/history', getPrescriptionHistory);   // must be before /:id
router.get('/',        getPrescriptions);
router.get('/:id',     getPrescription);
router.post('/',       createPrescription);
router.put('/:id',     updatePrescription);
router.delete('/:id',  deletePrescription);

module.exports = router;
