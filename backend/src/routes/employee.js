const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee');
const { requireAuth, requireRole } = require('../middlewares/auth');

const adminRoles = ['Admin', 'CEO', 'COO'];

// Employee Routes
router.get('/', requireAuth, employeeController.getEmployees);
router.get('/:id', requireAuth, employeeController.getEmployeeById);
router.post('/', requireAuth, requireRole(adminRoles), employeeController.createEmployee);
router.put('/:id', requireAuth, employeeController.updateEmployee);
router.delete('/:id', requireAuth, requireRole(adminRoles), employeeController.deleteEmployee);
router.post('/:id/terminate', requireAuth, requireRole(adminRoles), employeeController.terminateEmployee);

module.exports = router;
