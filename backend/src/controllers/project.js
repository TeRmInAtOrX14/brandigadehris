const { PrismaClient } = require('@prisma/client');
const { logAudit } = require('../utils/audit');

const prisma = new PrismaClient();

// ==============================================================================
// Projects CRUD
// ==============================================================================

exports.getProjects = async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        employeeProjects: {
          include: {
            employee: { select: { id: true, fullName: true, designation: true } }
          }
        },
        commissions: true
      }
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
};

exports.createProject = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await prisma.project.create({
      data: { name, description, status: 'active' }
    });

    await logAudit(req.user.id, 'CREATE_PROJECT', 'Project', project.id, { name });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
};

exports.updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, status, settings } = req.body;

    const project = await prisma.project.update({
      where: { id },
      data: { 
        name, 
        description, 
        status, 
        settings: settings ? settings : undefined
      }
    });

    await logAudit(req.user.id, 'UPDATE_PROJECT', 'Project', id, { name, status, settings });
    res.json(project);
  } catch (err) {
    next(err);
  }
};

exports.deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Soft deactivation
    const project = await prisma.project.update({
      where: { id },
      data: { status: 'inactive' }
    });

    await logAudit(req.user.id, 'DEACTIVATE_PROJECT', 'Project', id);
    res.json({ message: 'Project deactivated successfully', project });
  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// Project Employee Assignments
// ==============================================================================

exports.assignEmployee = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const { employeeId, role } = req.body; // role: sdr, team_lead, manager, etc.

    if (!employeeId || !role) {
      return res.status(400).json({ error: 'employeeId and role are required' });
    }

    const assignment = await prisma.employeeProject.upsert({
      where: {
        employeeId_projectId: {
          employeeId,
          projectId
        }
      },
      create: {
        employeeId,
        projectId,
        role
      },
      update: {
        role
      }
    });

    await logAudit(req.user.id, 'ASSIGN_EMPLOYEE_PROJECT', 'EmployeeProject', assignment.id, { employeeId, projectId, role });
    res.json(assignment);
  } catch (err) {
    next(err);
  }
};

exports.unassignEmployee = async (req, res, next) => {
  try {
    const { id: projectId, employeeId } = req.params;

    await prisma.employeeProject.delete({
      where: {
        employeeId_projectId: {
          employeeId,
          projectId
        }
      }
    });

    await logAudit(req.user.id, 'UNASSIGN_EMPLOYEE_PROJECT', 'EmployeeProject', null, { employeeId, projectId });
    res.json({ message: 'Employee unassigned from project successfully' });
  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// Commission Configurations
// ==============================================================================

exports.getCommissions = async (req, res, next) => {
  try {
    const projectCommissions = await prisma.commission.findMany({
      include: { project: true }
    });
    
    const teamCommissions = await prisma.teamCommission.findMany({
      include: { team: true }
    });

    res.json({ projectCommissions, teamCommissions });
  } catch (err) {
    next(err);
  }
};

exports.upsertProjectCommission = async (req, res, next) => {
  try {
    const { projectId, role, amount } = req.body;

    if (!projectId || !role || amount === undefined) {
      return res.status(400).json({ error: 'projectId, role, and amount are required' });
    }

    const comm = await prisma.commission.upsert({
      where: {
        projectId_role: {
          projectId,
          role
        }
      },
      create: {
        projectId,
        role,
        amount: parseFloat(amount)
      },
      update: {
        amount: parseFloat(amount)
      }
    });

    await logAudit(req.user.id, 'UPSERT_PROJECT_COMMISSION', 'Commission', comm.id, { projectId, role, amount });
    res.json(comm);
  } catch (err) {
    next(err);
  }
};

exports.upsertTeamCommission = async (req, res, next) => {
  try {
    const { teamId, amount } = req.body;

    if (!teamId || amount === undefined) {
      return res.status(400).json({ error: 'teamId and amount are required' });
    }

    // Find if a team commission already exists
    const existing = await prisma.teamCommission.findFirst({
      where: { teamId }
    });

    let comm;
    if (existing) {
      comm = await prisma.teamCommission.update({
        where: { id: existing.id },
        data: { amount: parseFloat(amount) }
      });
    } else {
      comm = await prisma.teamCommission.create({
        data: { teamId, amount: parseFloat(amount) }
      });
    }

    await logAudit(req.user.id, 'UPSERT_TEAM_COMMISSION', 'TeamCommission', comm.id, { teamId, amount });
    res.json(comm);
  } catch (err) {
    next(err);
  }
};
