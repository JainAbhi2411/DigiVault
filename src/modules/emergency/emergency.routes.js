const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requestEmergencyAccess, getEmergencyRequests, resolveRequest } = require('./emergency.controller');

router.post('/request', requestEmergencyAccess); // public (nominee uses this)
router.use(authenticate);
router.get('/', getEmergencyRequests);
router.put('/:id/resolve', resolveRequest);

module.exports = router;
