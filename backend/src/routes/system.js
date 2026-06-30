const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system');
const { requireAuth, requireRole } = require('../middlewares/auth');

const adminRoles = ['Admin', 'CEO', 'COO'];

// Notifications
router.get('/notifications', requireAuth, systemController.getNotifications);
router.put('/notifications/read-all', requireAuth, systemController.markAllAsRead);
router.put('/notifications/:id/read', requireAuth, systemController.markAsRead);

// Audit Logs
router.get('/audit-logs', requireAuth, requireRole(adminRoles), systemController.getAuditLogs);

module.exports = router;
