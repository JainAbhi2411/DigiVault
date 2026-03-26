const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const {
  register,
  verifyEmailOtp,
  verifyPhoneOtp,
  login,
  resendOtp,
  getProfile,
  updateProfile,
  changePassword,
  validateNomineeToken,
  nomineeSetup,
} = require('./auth.controller');

router.post('/register', register);
router.post('/verify-email-otp', verifyEmailOtp);
router.post('/verify-phone-otp', verifyPhoneOtp);
router.post('/login', login);
router.post('/resend-otp', resendOtp);

// Nominee access (public — token is the secret)
router.get('/nominee-token/:token', validateNomineeToken);
router.post('/nominee-setup', nomineeSetup);

// Protected routes
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);

module.exports = router;

