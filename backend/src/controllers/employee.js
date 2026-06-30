const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../utils/audit');
const { sendMail } = require('../utils/mailer');

const prisma = new PrismaClient();

// ==============================================================================
// Employees
// ==============================================================================

exports.getEmployees = async (req, res, next) => {
  try {
    const { campaignId, status, search } = req.query;

    const where = {};
    if (campaignId) {
      where.campaignMembers = {
        some: { campaignId, status: 'active' }
      };
    }
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { designation: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Role restriction: Team Lead can only see employees in campaigns they actively lead
    if (req.user.role === 'Team Lead' && req.user.employee?.id) {
      const ledCampaigns = await prisma.campaignMember.findMany({
        where: { employeeId: req.user.employee.id, role: 'team_lead', status: 'active' },
        select: { campaignId: true }
      });
      const campaignIds = ledCampaigns.map(c => c.campaignId);
      where.campaignMembers = {
        some: { campaignId: { in: campaignIds }, status: 'active' }
      };
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        user: {
          select: { email: true, role: true, isActive: true }
        },
        campaignMembers: {
          where: { status: 'active' },
          include: { campaign: true }
        },
        manager: {
          select: { id: true, fullName: true, designation: true }
        }
      },
      orderBy: { employeeCode: 'asc' }
    });

    res.json(employees);
  } catch (err) {
    next(err);
  }
};

exports.getEmployeeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Standard employees can only view their own details
    if (req.user.role === 'Employee' && req.user.employee?.id !== id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true, role: true, isActive: true }
        },
        campaignMembers: {
          where: { status: 'active' },
          include: { campaign: true }
        },
        manager: {
          select: { id: true, fullName: true, designation: true }
        },
        salaryHistory: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);
  } catch (err) {
    next(err);
  }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const {
      email,
      password,
      role,
      employeeCode,
      fullName,
      designation,
      managerId,
      dateOfJoining,
      baseSalary,
      currency,
      phone,
      cnic,
      bankAccount,
      address,
      emergencyContact,
      shiftStart,
      shiftEnd,
      zkUserId
    } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Check if employee code already exists
    const existingCode = await prisma.employee.findUnique({ where: { employeeCode } });
    if (existingCode) {
      return res.status(400).json({ error: 'Employee code already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password || 'Brandigade123@', salt);

    // Create user and employee in a single transaction
    const newEmployee = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: role || 'Employee',
          mustChangePassword: true
        }
      });

      const emp = await tx.employee.create({
        data: {
          userId: user.id,
          employeeCode,
          fullName,
          designation,
          managerId: managerId || null,
          dateOfJoining: new Date(dateOfJoining),
          baseSalary: parseFloat(baseSalary) || 0,
          currency: currency || 'PKR',
          phone: phone || null,
          cnic: cnic || null,
          bankAccount: bankAccount || null,
          address: address || null,
          emergencyContact: emergencyContact || null,
          shiftStart: shiftStart || '09:30',
          shiftEnd: shiftEnd || '18:30',
          zkUserId: zkUserId || null
        },
        include: {
          user: { select: { email: true, role: true } }
        }
      });

      // Log initial salary history
      await tx.salaryHistory.create({
        data: {
          employeeId: emp.id,
          newSalary: parseFloat(baseSalary) || 0,
          reason: 'Initial Salary Setup',
          effectiveDate: new Date(dateOfJoining)
        }
      });

      return emp;
    });

    await logAudit(req.user.id, 'CREATE_EMPLOYEE', 'Employee', newEmployee.id, { fullName, employeeCode });
    res.status(201).json(newEmployee);
  } catch (err) {
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Restriction: Normal Employee can only edit some fields of their own profile
    if (req.user.role === 'Employee') {
      if (req.user.employee?.id !== id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      // Limit fields normal employee can change
      const allowedSelfUpdates = {
        phone: updates.phone,
        address: updates.address,
        emergencyContact: updates.emergencyContact,
        bankAccount: updates.bankAccount
      };
      const updated = await prisma.employee.update({
        where: { id },
        data: allowedSelfUpdates
      });
      await logAudit(req.user.id, 'SELF_UPDATE_EMPLOYEE', 'Employee', id, allowedSelfUpdates);
      return res.json(updated);
    }

    // HR / Admin update flow
    const currentEmp = await prisma.employee.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!currentEmp) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const updatedEmployee = await prisma.$transaction(async (tx) => {
      // 1. Update user table fields if provided
      if (updates.email || updates.role || updates.isActive !== undefined) {
        await tx.user.update({
          where: { id: currentEmp.userId },
          data: {
            email: updates.email,
            role: updates.role,
            isActive: updates.isActive
          }
        });
      }

      // 2. Log salary changes in salaryHistory if base salary changes
      if (updates.baseSalary !== undefined && parseFloat(updates.baseSalary) !== currentEmp.baseSalary) {
        await tx.salaryHistory.create({
          data: {
            employeeId: id,
            oldSalary: currentEmp.baseSalary,
            newSalary: parseFloat(updates.baseSalary),
            reason: updates.salaryChangeReason || 'Salary updated by Admin',
            effectiveDate: updates.salaryChangeEffectiveDate ? new Date(updates.salaryChangeEffectiveDate) : new Date()
          }
        });
      }

      // 3. Update employee fields
      const emp = await tx.employee.update({
        where: { id },
        data: {
          fullName: updates.fullName,
          designation: updates.designation,
          managerId: updates.managerId,
          dateOfJoining: updates.dateOfJoining ? new Date(updates.dateOfJoining) : undefined,
          baseSalary: updates.baseSalary ? parseFloat(updates.baseSalary) : undefined,
          currency: updates.currency,
          phone: updates.phone,
          cnic: updates.cnic,
          bankAccount: updates.bankAccount,
          address: updates.address,
          emergencyContact: updates.emergencyContact,
          shiftStart: updates.shiftStart,
          shiftEnd: updates.shiftEnd,
          zkUserId: updates.zkUserId,
          status: updates.status
        },
        include: {
          user: { select: { email: true, role: true, isActive: true } }
        }
      });

      return emp;
    });

    await logAudit(req.user.id, 'UPDATE_EMPLOYEE', 'Employee', id, updates);
    res.json(updatedEmployee);
  } catch (err) {
    next(err);
  }
};

exports.deleteEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;

    const emp = await prisma.employee.findUnique({ where: { id } });
    if (!emp) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Cascade hard-delete all related data in a transaction
    await prisma.$transaction([
      prisma.salaryHistory.deleteMany({ where: { employeeId: id } }),
      prisma.campaignMember.deleteMany({ where: { employeeId: id } }),
      prisma.campaignPerformance.deleteMany({ where: { employeeId: id } }),
      prisma.spiff.deleteMany({ where: { employeeId: id } }),
      prisma.attendance.deleteMany({ where: { employeeId: id } }),
      prisma.leaveRequest.deleteMany({ where: { employeeId: id } }),
      prisma.halfdayRequest.deleteMany({ where: { employeeId: id } }),
      prisma.wfhRequest.deleteMany({ where: { employeeId: id } }),
      prisma.loanRequest.deleteMany({ where: { employeeId: id } }),
      prisma.payslip.deleteMany({ where: { employeeId: id } }),
      prisma.document.deleteMany({ where: { employeeId: id } }),
      prisma.employee.delete({ where: { id } }),
      prisma.user.delete({ where: { id: emp.userId } })
    ]);

    await logAudit(req.user.id, 'DELETE_EMPLOYEE', 'Employee', id, { fullName: emp.fullName, employeeCode: emp.employeeCode });
    res.json({ message: 'Employee and all associated records deleted permanently.' });
  } catch (err) {
    next(err);
  }
};

exports.terminateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;

    const emp = await prisma.employee.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!emp) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Set employee status to terminated and user to inactive
    await prisma.$transaction([
      prisma.user.update({
        where: { id: emp.userId },
        data: { isActive: false }
      }),
      prisma.employee.update({
        where: { id },
        data: { status: 'terminated' }
      })
    ]);

    // Send termination email
    const subject = 'Employment Termination Notice - Brandigade';
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; rounded-xl;">
        <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">Employment Termination Notice</h2>
        <p>Dear <strong>${emp.fullName}</strong>,</p>
        <p>We are writing to officially inform you that your employment with <strong>Brandigade</strong> has been terminated, effective immediately.</p>
        <p>Consequently, your credentials and user access to the Brandigade HRIS portal have been deactivated.</p>
        <p>For any inquiries regarding your final settlement, unpaid salary clearance, or return of company properties, please reach out to the HR department directly at <a href="mailto:hr@brandigade.com">hr@brandigade.com</a>.</p>
        <p>We appreciate the time you spent with us and wish you the best in your future endeavors.</p>
        <br/>
        <p>Sincerely,</p>
        <p><strong>HR Department</strong><br/>Brandigade</p>
      </div>
    `;

    // Attempt to send email; if email credentials aren't set up yet, it'll gracefully log warning
    await sendMail({
      to: emp.user.email,
      subject,
      html
    });

    await logAudit(req.user.id, 'TERMINATE_EMPLOYEE', 'Employee', id);
    res.json({ message: 'Employee terminated successfully. Notification email dispatched.' });
  } catch (err) {
    next(err);
  }
};
