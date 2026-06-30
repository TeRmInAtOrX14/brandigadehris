const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../utils/audit');

const prisma = new PrismaClient();

// ==============================================================================
// Teams
// ==============================================================================

exports.getTeams = async (req, res, next) => {
  try {
    const teams = await prisma.team.findMany({
      include: {
        _count: { select: { employees: true } }
      }
    });
    res.json(teams);
  } catch (err) {
    next(err);
  }
};

exports.createTeam = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const team = await prisma.team.create({
      data: { name }
    });

    await logAudit(req.user.id, 'CREATE_TEAM', 'Team', team.id, { name });
    res.status(201).json(team);
  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// Employees
// ==============================================================================

exports.getEmployees = async (req, res, next) => {
  try {
    const { teamId, status, search } = req.query;

    const where = {};
    if (teamId) where.teamId = teamId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { designation: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Role restriction: Team Lead can only see their team employees (or restrict accordingly)
    if (req.user.role === 'Team Lead' && req.user.employee?.teamId) {
      where.teamId = req.user.employee.teamId;
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        user: {
          select: { email: true, role: true, isActive: true }
        },
        team: true,
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
        team: true,
        manager: {
          select: { id: true, fullName: true, designation: true }
        },
        employeeProjects: {
          include: { project: true }
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
      teamId,
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
          teamId: teamId || null,
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
          teamId: updates.teamId,
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

    // Rather than hard delete, we disable the user account and mark status as terminated
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

    await logAudit(req.user.id, 'TERMINATE_EMPLOYEE', 'Employee', id);
    res.json({ message: 'Employee terminated and user account deactivated successfully' });
  } catch (err) {
    next(err);
  }
};
