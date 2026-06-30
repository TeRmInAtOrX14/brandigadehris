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

exports.createLoanRequest = async (req, res, next) => {
  try {
    const { type, amount, reason, repaymentMonth, repaymentYear } = req.body;

    if (!req.user.employee) {
      return res.status(400).json({ error: 'No employee profile linked to user.' });
    }

    if (!type || !amount) {
      return res.status(400).json({ error: 'Type and amount are required' });
    }

    const request = await prisma.loanRequest.create({
      data: {
        employeeId: req.user.employee.id,
        type, // loan, advance_salary
        amount: parseFloat(amount),
        reason,
        status: 'pending',
        repaymentMonth: repaymentMonth ? parseInt(repaymentMonth) : null,
        repaymentYear: repaymentYear ? parseInt(repaymentYear) : null
      }
    });

    await logAudit(req.user.id, 'SUBMIT_LOAN_REQUEST', 'LoanRequest', request.id, { type, amount });
    res.status(201).json(request);
  } catch (err) {
    next(err);
  }
};

exports.getLoanRequests = async (req, res, next) => {
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

    const requests = await prisma.loanRequest.findMany({
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

exports.reviewLoanRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, repaymentMonth, repaymentYear } = req.body; // approved, rejected

    if (req.user.role === 'Team Lead') {
      return res.status(403).json({ error: 'Access denied: Team Leads do not have approval authority.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const request = await prisma.loanRequest.findUnique({
      where: { id }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already reviewed' });
    }

    const updated = await prisma.loanRequest.update({
      where: { id },
      data: {
        status,
        repaymentMonth: repaymentMonth ? parseInt(repaymentMonth) : request.repaymentMonth,
        repaymentYear: repaymentYear ? parseInt(repaymentYear) : request.repaymentYear,
        reviewedById: req.user.id,
        reviewedAt: new Date()
      }
    });

    await logAudit(req.user.id, 'REVIEW_LOAN_REQUEST', 'LoanRequest', id, { status, repaymentMonth, repaymentYear });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};
