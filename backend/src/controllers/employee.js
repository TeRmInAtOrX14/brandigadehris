const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../utils/audit');
const { sendMail } = require('../utils/mailer');

const prisma = new PrismaClient();

// ==============================================================================
// Teams / Campaigns Metadata for filters and forms
// ==============================================================================
exports.getTeams = async (req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { status: 'active' },
      select: { id: true, name: true }
    });
    res.json(campaigns);
  } catch (err) {
    next(err);
  }
};

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

    // Role restriction: Team Lead can only see employees in campaigns they actively lead, plus themselves
    if (req.user.role === 'Team Lead' && req.user.employee?.id) {
      const ledCampaigns = await prisma.campaignMember.findMany({
        where: { employeeId: req.user.employee.id, role: 'team_lead', status: 'active' },
        select: { campaignId: true }
      });
      const campaignIds = ledCampaigns.map(c => c.campaignId);
      where.OR = [
        { id: req.user.employee.id },
        {
          campaignMembers: {
            some: { campaignId: { in: campaignIds }, status: 'active' }
          }
        }
      ];
    }

    // Role restriction: SDR & Employee can only see their own record
    if (['Employee', 'SDR'].includes(req.user.role) && req.user.employee?.id) {
      where.id = req.user.employee.id;
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

    const mapped = employees.map(emp => ({
      ...emp,
      team: emp.campaignMembers?.[0]?.campaign || null,
      teams: emp.campaignMembers.map(m => m.campaign)
    }));
    res.json(mapped);
  } catch (err) {
    next(err);
  }
};

exports.getEmployeeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Standard employees and SDRs can only view their own details
    if (['Employee', 'SDR'].includes(req.user.role) && req.user.employee?.id !== id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Team Leads can only view their own details or employees on their led campaigns
    if (req.user.role === 'Team Lead' && req.user.employee?.id !== id) {
      const ledCampaigns = await prisma.campaignMember.findMany({
        where: { employeeId: req.user.employee?.id, role: 'team_lead', status: 'active' },
        select: { campaignId: true }
      });
      const campaignIds = ledCampaigns.map(c => c.campaignId);
      
      const isMemberOfLedCampaign = await prisma.campaignMember.findFirst({
        where: {
          employeeId: id,
          campaignId: { in: campaignIds },
          status: 'active'
        }
      });

      if (!isMemberOfLedCampaign) {
        return res.status(403).json({ error: 'Access denied.' });
      }
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

    res.json({
      ...employee,
      team: employee.campaignMembers?.[0]?.campaign || null,
      teams: employee.campaignMembers.map(m => m.campaign)
    });
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
      birthday,
      baseSalary,
      currency,
      phone,
      bankAccount,
      emergencyContact,
      shiftStart,
      shiftEnd,
      zkUserId,
      graceMinutes,
      teamId
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
          baseSalary: parseFloat(baseSalary) || 0,
          currency: currency || 'PKR',
          phone: phone || null,
          birthday: birthday || null,
          bankAccount: bankAccount || null,
          emergencyContact: emergencyContact || null,
          shiftStart: shiftStart || '09:30',
          shiftEnd: shiftEnd || '18:30',
          graceMinutes: graceMinutes !== undefined ? parseInt(graceMinutes) : 15,
          zkUserId: zkUserId || null
        },
        include: {
          user: { select: { email: true, role: true } },
          campaignMembers: {
            where: { status: 'active' },
            include: { campaign: true }
          }
        }
      });

      const finalRole = role || 'Employee';
      const memberRole = (finalRole === 'Team Lead' || finalRole === 'Admin' || finalRole === 'CEO' || finalRole === 'COO') ? 'team_lead' : 'sdr';

      const selectedTeams = req.body.teamIds || (teamId ? [teamId] : []);
      for (const tId of selectedTeams) {
        await tx.campaignMember.create({
          data: {
            campaignId: tId,
            employeeId: emp.id,
            role: memberRole,
            status: 'active'
          }
        });
      }

      // Log initial salary history
      await tx.salaryHistory.create({
        data: {
          employeeId: emp.id,
          newSalary: parseFloat(baseSalary) || 0,
          reason: 'Initial Salary Setup',
          effectiveDate: new Date()
        }
      });

      // Refetch employee with fresh campaign member details inside transaction to be clean
      const freshEmp = await tx.employee.findUnique({
        where: { id: emp.id },
        include: {
          user: { select: { email: true, role: true } },
          campaignMembers: {
            where: { status: 'active' },
            include: { campaign: true }
          }
        }
      });

      return freshEmp;
    });

    await logAudit(req.user.id, 'CREATE_EMPLOYEE', 'Employee', newEmployee.id, { fullName, employeeCode });
    
    res.status(201).json({
      ...newEmployee,
      team: newEmployee.campaignMembers?.[0]?.campaign || null
    });
  } catch (err) {
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Restriction: Non-admin roles (Employee, SDR, Team Lead) can only edit some fields of their own profile
    if (['Employee', 'SDR', 'Team Lead'].includes(req.user.role)) {
      if (req.user.employee?.id !== id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      // Limit fields normal employee can change
      const allowedSelfUpdates = {
        phone: updates.phone,
        birthday: updates.birthday,
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

      // 3. Handle Campaign Member changes if teamId is provided
      // 3. Handle Campaign Member changes if teamId or teamIds is provided
      if (updates.teamIds !== undefined || updates.teamId !== undefined) {
        const selectedTeams = updates.teamIds || (updates.teamId ? [updates.teamId] : []);

        // Deactivate active campaigns that are not in the selected list
        await tx.campaignMember.updateMany({
          where: {
            employeeId: id,
            status: 'active',
            campaignId: { notIn: selectedTeams }
          },
          data: { status: 'inactive' }
        });

        const finalRole = updates.role || currentEmp.user.role;
        const memberRole = (finalRole === 'Team Lead' || finalRole === 'Admin' || finalRole === 'CEO' || finalRole === 'COO') ? 'team_lead' : 'sdr';

        for (const tId of selectedTeams) {
          const existing = await tx.campaignMember.findUnique({
            where: {
              campaignId_employeeId: {
                campaignId: tId,
                employeeId: id
              }
            }
          });

          if (existing) {
            await tx.campaignMember.update({
              where: { id: existing.id },
              data: { status: 'active', role: memberRole }
            });
          } else {
            await tx.campaignMember.create({
              data: {
                campaignId: tId,
                employeeId: id,
                role: memberRole,
                status: 'active'
              }
            });
          }
        }
      }

      // 4. Update employee fields
      const emp = await tx.employee.update({
        where: { id },
        data: {
          fullName: updates.fullName,
          designation: updates.designation,
          managerId: updates.managerId,
          baseSalary: updates.baseSalary ? parseFloat(updates.baseSalary) : undefined,
          currency: updates.currency,
          phone: updates.phone,
          birthday: updates.birthday,
          bankAccount: updates.bankAccount,
          emergencyContact: updates.emergencyContact,
          shiftStart: updates.shiftStart,
          shiftEnd: updates.shiftEnd,
          graceMinutes: updates.graceMinutes !== undefined ? parseInt(updates.graceMinutes) : undefined,
          zkUserId: updates.zkUserId,
          status: updates.status
        },
        include: {
          user: { select: { email: true, role: true, isActive: true } },
          campaignMembers: {
            where: { status: 'active' },
            include: { campaign: true }
          }
        }
      });

      // Refetch employee with fresh relation details
      const freshEmp = await tx.employee.findUnique({
        where: { id },
        include: {
          user: { select: { email: true, role: true, isActive: true } },
          campaignMembers: {
            where: { status: 'active' },
            include: { campaign: true }
          }
        }
      });

      return freshEmp;
    });

    await logAudit(req.user.id, 'UPDATE_EMPLOYEE', 'Employee', id, updates);
    
    res.json({
      ...updatedEmployee,
      team: updatedEmployee.campaignMembers?.[0]?.campaign || null
    });
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
