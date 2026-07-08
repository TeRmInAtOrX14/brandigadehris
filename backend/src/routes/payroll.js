const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payroll');
const { requireAuth, requireRole } = require('../middlewares/auth');

const adminRoles = ['Admin', 'CEO', 'COO'];

router.get('/runs', requireAuth, requireRole(adminRoles), payrollController.getPayrollRuns);
router.get('/runs/:runId/payslips', requireAuth, requireRole(adminRoles), payrollController.getPayslipsByRun);
router.post('/run', requireAuth, requireRole(adminRoles), payrollController.runPayroll);
router.put('/runs/:id/finalize', requireAuth, requireRole(adminRoles), payrollController.finalizePayroll);
router.get('/my-payslips', requireAuth, payrollController.getMyPayslips);
router.get('/payslips/:id/pdf', requireAuth, payrollController.getPayslipPdfFile);
router.post('/generate-manual-pdf', requireAuth, requireRole(adminRoles), payrollController.generateManualPdf);

module.exports = router;
