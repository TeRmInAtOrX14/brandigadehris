const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Log an audit trail entry
 * @param {string} userId - ID of the user performing the action
 * @param {string} action - Action details (e.g. 'CREATE_EMPLOYEE', 'APPROVE_LEAVE')
 * @param {string} entityType - Model name (e.g. 'Employee', 'LeaveRequest')
 * @param {string} entityId - ID of the affected entity
 * @param {object} details - Any metadata/diffs (serializable to JSON)
 */
async function logAudit(userId, action, entityType, entityId = null, details = null) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        details: details ? JSON.stringify(details) : null
      }
    });
  } catch (error) {
    console.error('[Audit Log Failure]:', error.message);
  }
}

module.exports = { logAudit };
