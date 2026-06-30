const { PrismaClient } = require('@prisma/client');
const { logAudit } = require('../utils/audit');

const prisma = new PrismaClient();

async function getTeamLeadSdrIds(leadEmployeeId) {
  const activeCampaigns = await prisma.campaignMember.findMany({
    where: { employeeId: leadEmployeeId, role: 'team_lead', status: 'active' },
    select: { campaignId: true }
  });
  const campaignIds = activeCampaigns.map(c => c.campaignId);
  const members = await prisma.campaignMember.findMany({
    where: { campaignId: { in: campaignIds }, status: 'active' },
    select: { employeeId: true }
  });
  return members.map(m => m.employeeId);
}

// Helper to get dates between two dates
function getDatesInRange(startDate, endDate) {
  const dates = [];
  let curr = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  
  while (curr <= end) {
    dates.push(new Date(curr));
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return dates;
}

// ==============================================================================
// Leave Requests
// ==============================================================================

exports.createLeaveRequest = async (req, res, next) => {
  try {
    const { type, startDate, endDate, reason } = req.body;

    if (!req.user.employee) {
      return res.status(400).json({ error: 'No employee profile linked to user.' });
    }

    if (!type || !startDate || !endDate) {
      return res.status(400).json({ error: 'Type, startDate, and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate total days (inclusive)
    const diffTime = Math.abs(end - start);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const request = await prisma.leaveRequest.create({
      data: {
        employeeId: req.user.employee.id,
        type,
        startDate: new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())),
        endDate: new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())),
        days,
        reason,
        status: 'pending'
      }
    });

    await logAudit(req.user.id, 'SUBMIT_LEAVE_REQUEST', 'LeaveRequest', request.id, { type, days });
    res.status(201).json(request);
  } catch (err) {
    next(err);
  }
};

exports.getLeaveRequests = async (req, res, next) => {
  try {
    const { status, employeeId } = req.query;

    const where = {};
    if (status) where.status = status;

    // RBAC
    if (req.user.role === 'Employee') {
      where.employeeId = req.user.employee.id;
    } else if (req.user.role === 'Team Lead') {
      const sdrIds = await getTeamLeadSdrIds(req.user.employee?.id);
      if (employeeId) {
        if (!sdrIds.includes(employeeId)) {
          return res.status(403).json({ error: 'Access denied.' });
        }
        where.employeeId = employeeId;
      } else {
        where.employeeId = { in: sdrIds };
      }
    } else {
      if (employeeId) where.employeeId = employeeId;
    }

    const requests = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: { id: true, fullName: true, employeeCode: true, designation: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (err) {
    next(err);
  }
};

exports.reviewLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // approved, rejected

    if (req.user.role === 'Team Lead') {
      return res.status(403).json({ error: 'Access denied: Team Leads do not have approval authority.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be approved or rejected.' });
    }

    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true }
    });

    if (!request) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been reviewed.' });
    }

    const updatedRequest = await prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status,
          reviewedById: req.user.id,
          reviewedAt: new Date()
        }
      });

      // If approved, automatically update/create attendance records for those dates
      if (status === 'approved') {
        const dates = getDatesInRange(request.startDate, request.endDate);
        for (const date of dates) {
          await tx.attendance.upsert({
            where: {
              employeeId_date: {
                employeeId: request.employeeId,
                date
              }
            },
            create: {
              employeeId: request.employeeId,
              date,
              status: 'leave',
              late: 0,
              earlyDeparture: 0,
              overtime: 0,
              note: `Approved Leave: ${request.type}`
            },
            update: {
              status: 'leave',
              late: 0,
              earlyDeparture: 0,
              overtime: 0,
              note: `Approved Leave: ${request.type}`
            }
          });
        }
      }

      return updated;
    });

    await logAudit(req.user.id, 'REVIEW_LEAVE_REQUEST', 'LeaveRequest', id, { status });
    res.json(updatedRequest);
  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// Half-day Requests
// ==============================================================================

exports.createHalfdayRequest = async (req, res, next) => {
  try {
    const { date, reason } = req.body;

    if (!req.user.employee) {
      return res.status(400).json({ error: 'No employee profile linked to user.' });
    }

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const dateObj = new Date(date);
    const dateMidnight = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));

    const request = await prisma.halfdayRequest.create({
      data: {
        employeeId: req.user.employee.id,
        date: dateMidnight,
        reason,
        status: 'pending'
      }
    });

    await logAudit(req.user.id, 'SUBMIT_HALFDAY_REQUEST', 'HalfdayRequest', request.id, { date });
    res.status(201).json(request);
  } catch (err) {
    next(err);
  }
};

exports.getHalfdayRequests = async (req, res, next) => {
  try {
    const { status, employeeId } = req.query;

    const where = {};
    if (status) where.status = status;

    // RBAC
    if (req.user.role === 'Employee') {
      where.employeeId = req.user.employee.id;
    } else if (req.user.role === 'Team Lead') {
      const sdrIds = await getTeamLeadSdrIds(req.user.employee?.id);
      if (employeeId) {
        if (!sdrIds.includes(employeeId)) {
          return res.status(403).json({ error: 'Access denied.' });
        }
        where.employeeId = employeeId;
      } else {
        where.employeeId = { in: sdrIds };
      }
    } else {
      if (employeeId) where.employeeId = employeeId;
    }

    const requests = await prisma.halfdayRequest.findMany({
      where,
      include: {
        employee: {
          select: { id: true, fullName: true, employeeCode: true, designation: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (err) {
    next(err);
  }
};

exports.reviewHalfdayRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (req.user.role === 'Team Lead') {
      return res.status(403).json({ error: 'Access denied: Team Leads do not have approval authority.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const request = await prisma.halfdayRequest.findUnique({
      where: { id }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already reviewed' });
    }

    const updatedRequest = await prisma.$transaction(async (tx) => {
      const updated = await tx.halfdayRequest.update({
        where: { id },
        data: {
          status,
          reviewedById: req.user.id,
          reviewedAt: new Date()
        }
      });

      if (status === 'approved') {
        await tx.attendance.upsert({
          where: {
            employeeId_date: {
              employeeId: request.employeeId,
              date: request.date
            }
          },
          create: {
            employeeId: request.employeeId,
            date: request.date,
            status: 'half_day',
            late: 0,
            earlyDeparture: 0,
            overtime: 0,
            note: 'Approved Half-day Request'
          },
          update: {
            status: 'half_day',
            note: 'Approved Half-day Request'
          }
        });
      }

      return updated;
    });

    await logAudit(req.user.id, 'REVIEW_HALFDAY_REQUEST', 'HalfdayRequest', id, { status });
    res.json(updatedRequest);
  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// WFH Requests
// ==============================================================================

exports.createWfhRequest = async (req, res, next) => {
  try {
    const { startDate, endDate, reason } = req.body;

    if (!req.user.employee) {
      return res.status(400).json({ error: 'No employee profile linked to user.' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const request = await prisma.wfhRequest.create({
      data: {
        employeeId: req.user.employee.id,
        startDate: new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())),
        endDate: new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())),
        reason,
        status: 'pending'
      }
    });

    await logAudit(req.user.id, 'SUBMIT_WFH_REQUEST', 'WfhRequest', request.id, { startDate, endDate });
    res.status(201).json(request);
  } catch (err) {
    next(err);
  }
};

exports.getWfhRequests = async (req, res, next) => {
  try {
    const { status, employeeId } = req.query;

    const where = {};
    if (status) where.status = status;

    // RBAC
    if (req.user.role === 'Employee') {
      where.employeeId = req.user.employee.id;
    } else if (req.user.role === 'Team Lead') {
      const sdrIds = await getTeamLeadSdrIds(req.user.employee?.id);
      if (employeeId) {
        if (!sdrIds.includes(employeeId)) {
          return res.status(403).json({ error: 'Access denied.' });
        }
        where.employeeId = employeeId;
      } else {
        where.employeeId = { in: sdrIds };
      }
    } else {
      if (employeeId) where.employeeId = employeeId;
    }

    const requests = await prisma.wfhRequest.findMany({
      where,
      include: {
        employee: {
          select: { id: true, fullName: true, employeeCode: true, designation: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (err) {
    next(err);
  }
};

exports.reviewWfhRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (req.user.role === 'Team Lead') {
      return res.status(403).json({ error: 'Access denied: Team Leads do not have approval authority.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const request = await prisma.wfhRequest.findUnique({
      where: { id }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already reviewed' });
    }

    const updatedRequest = await prisma.$transaction(async (tx) => {
      const updated = await tx.wfhRequest.update({
        where: { id },
        data: {
          status,
          reviewedById: req.user.id,
          reviewedAt: new Date()
        }
      });

      if (status === 'approved') {
        const dates = getDatesInRange(request.startDate, request.endDate);
        for (const date of dates) {
          await tx.attendance.upsert({
            where: {
              employeeId_date: {
                employeeId: request.employeeId,
                date
              }
            },
            create: {
              employeeId: request.employeeId,
              date,
              status: 'wfh',
              late: 0,
              earlyDeparture: 0,
              overtime: 0,
              note: 'Approved WFH'
            },
            update: {
              status: 'wfh',
              late: 0,
              earlyDeparture: 0,
              overtime: 0,
              note: 'Approved WFH'
            }
          });
        }
      }

      return updated;
    });

    await logAudit(req.user.id, 'REVIEW_WFH_REQUEST', 'WfhRequest', id, { status });
    res.json(updatedRequest);
  } catch (err) {
    next(err);
  }
};
