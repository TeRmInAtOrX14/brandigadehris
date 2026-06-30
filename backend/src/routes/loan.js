const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loan');
const { requireAuth, requireRole } = require('../middlewares/auth');

const adminRoles = ['Admin', 'CEO', 'COO'];

router.get('/', requireAuth, loanController.getLoanRequests);
router.post('/', requireAuth, loanController.createLoanRequest);
router.put('/:id/review', requireAuth, requireRole(adminRoles), loanController.reviewLoanRequest);

module.exports = router;
