const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { getSwitchSettings, updateSwitchSettings, checkIn, testTrigger } = require('./switch.controller');

router.use(authenticate);
router.get('/settings',      getSwitchSettings);
router.put('/settings',      updateSwitchSettings);
router.post('/checkin',      checkIn);
router.post('/test-trigger', testTrigger);   // 🧪 TEST ONLY — sends nominee emails immediately

module.exports = router;
