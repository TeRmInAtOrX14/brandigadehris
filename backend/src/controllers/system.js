const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==============================================================================
// Notifications
// ==============================================================================

exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== req.user.id) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.markAllAsRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// Audit Logs (Admin Only)
// ==============================================================================

exports.getAuditLogs = async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: { select: { email: true, role: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200 // Cap results at 200 for performance
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
};
