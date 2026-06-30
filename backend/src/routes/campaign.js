const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaign');
const { requireAuth, requireRole } = require('../middlewares/auth');

const adminRoles = ['Admin', 'CEO', 'COO'];

// Campaigns CRUD
router.get('/', requireAuth, campaignController.getCampaigns);
router.post('/', requireAuth, requireRole(adminRoles), campaignController.createCampaign);
router.put('/:id', requireAuth, requireRole(adminRoles), campaignController.updateCampaign);
router.delete('/:id', requireAuth, requireRole(adminRoles), campaignController.deleteCampaign);
router.post('/:id/duplicate', requireAuth, requireRole(adminRoles), campaignController.duplicateCampaign);

// Member Assignments & Transfers
router.post('/:id/members', requireAuth, requireRole(adminRoles), campaignController.assignMember);
router.delete('/:id/members/:employeeId', requireAuth, requireRole(adminRoles), campaignController.unassignMember);
router.put('/:id/members/:employeeId/status', requireAuth, requireRole(adminRoles), campaignController.toggleMemberStatus);

// Commission Structure & Slabs CRUD
router.get('/:campaignId/structures', requireAuth, campaignController.getStructures);
router.post('/:campaignId/structures', requireAuth, requireRole(adminRoles), campaignController.createStructure);
router.put('/structures/:id', requireAuth, requireRole(adminRoles), campaignController.updateStructure);
router.delete('/structures/:id', requireAuth, requireRole(adminRoles), campaignController.deleteStructure);
router.post('/structures/:id/activate', requireAuth, requireRole(adminRoles), campaignController.activateStructure);

// Commission Preview Simulator
router.post('/preview-commission', requireAuth, campaignController.previewCommission);

// Campaign Dashboard & Performance Logging
router.get('/:id/dashboard', requireAuth, campaignController.getCampaignDashboard);
router.post('/performance', requireAuth, requireRole(adminRoles), campaignController.logPerformance);

module.exports = router;
