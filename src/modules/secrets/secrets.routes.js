const express = require('express');
const router = express.Router();
const { getSecrets, getSecret, createSecret, updateSecret, deleteSecret } = require('./secrets.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);
router.get('/', getSecrets);
router.get('/:id', getSecret);
router.post('/', createSecret);
router.put('/:id', updateSecret);
router.delete('/:id', deleteSecret);

module.exports = router;
