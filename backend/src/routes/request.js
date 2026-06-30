const express = require('express');
const router = express.Router();
const requestController = require('../controllers/request');
const { requireAuth, requireRole } = require('../middlewares/auth');

const reviewerRoles = ['Admin', 'CEO', 'COO', 'Team Lead'];

// Leave Request Routes
router.get('/leave', requireAuth, requestController.getLeaveRequests);
router.post('/leave', requireAuth, requestController.createLeaveRequest);
router.put('/leave/:id/review', requireAuth, requireRole(reviewerRoles), requestController.reviewLeaveRequest);

// Half-day Request Routes
router.get('/halfday', requireAuth, requestController.getHalfdayRequests);
router.post('/halfday', requireAuth, requestController.createHalfdayRequest);
router.put('/halfday/:id/review', requireAuth, requireRole(reviewerRoles), requestController.reviewHalfdayRequest);

// WFH Request Routes
router.get('/wfh', requireAuth, requestController.getWfhRequests);
router.post('/wfh', requireAuth, requestController.createWfhRequest);
router.put('/wfh/:id/review', requireAuth, requireRole(reviewerRoles), requestController.reviewWfhRequest);

module.exports = router;
