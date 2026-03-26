const express = require('express');
const router = express.Router();
const { getDoctors, getDoctor, createDoctor, updateDoctor, deleteDoctor } = require('./doctors.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);
router.get('/',    getDoctors);
router.get('/:id', getDoctor);
router.post('/',   createDoctor);
router.put('/:id', updateDoctor);
router.delete('/:id', deleteDoctor);

module.exports = router;
