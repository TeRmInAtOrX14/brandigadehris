const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee');
const { requireAuth, requireRole } = require('../middlewares/auth');

const adminRoles = ['Admin', 'CEO', 'COO'];

// Team Routes
router.get('/teams', requireAuth, employeeController.getTeams);
router.post('/teams', requireAuth, requireRole(adminRoles), employeeController.createTeam);

// Employee Routes
router.get('/', requireAuth, employeeController.getEmployees);
router.get('/:id', requireAuth, employeeController.getEmployeeById);
router.post('/', requireAuth, requireRole(adminRoles), employeeController.createEmployee);
router.put('/:id', requireAuth, employeeController.updateEmployee);
router.delete('/:id', requireAuth, requireRole(adminRoles), employeeController.deleteEmployee);

module.exports = router;
