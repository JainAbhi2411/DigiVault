const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const {
  getNominees, addNominee, updateNominee, deleteNominee,
  assignDocuments, getNomineeDocuments, getMyAssignedDocuments,
} = require('./nominees.controller');

router.use(authenticate);

// Nominee user: get their own assigned documents
router.get('/my-documents', getMyAssignedDocuments);

// Vault owner routes
router.get('/', getNominees);
router.post('/', addNominee);
router.put('/:id', updateNominee);
router.delete('/:id', deleteNominee);
router.post('/:id/assign-documents', assignDocuments);
router.get('/:id/documents', getNomineeDocuments);

module.exports = router;

