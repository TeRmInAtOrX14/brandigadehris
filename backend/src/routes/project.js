const express = require('express');
const router = express.Router();
const projectController = require('../controllers/project');
const { requireAuth, requireRole } = require('../middlewares/auth');

const adminRoles = ['Admin', 'CEO', 'COO'];

// Project CRUD
router.get('/', requireAuth, projectController.getProjects);
router.post('/', requireAuth, requireRole(adminRoles), projectController.createProject);
router.put('/:id', requireAuth, requireRole(adminRoles), projectController.updateProject);
router.delete('/:id', requireAuth, requireRole(adminRoles), projectController.deleteProject);

// Project Assignment
router.post('/:id/assign', requireAuth, requireRole(adminRoles), projectController.assignEmployee);
router.delete('/:id/assign/:employeeId', requireAuth, requireRole(adminRoles), projectController.unassignEmployee);

// Commission Rates
router.get('/commissions', requireAuth, projectController.getCommissions);
router.post('/commissions/project', requireAuth, requireRole(adminRoles), projectController.upsertProjectCommission);
router.post('/commissions/team', requireAuth, requireRole(adminRoles), projectController.upsertTeamCommission);

module.exports = router;
