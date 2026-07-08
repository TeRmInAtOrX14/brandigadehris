const { PrismaClient } = require('@prisma/client');
const { logAudit } = require('../utils/audit');

const prisma = new PrismaClient();

// Helper to validate commission slabs
function validateSlabs(slabs) {
  for (let i = 0; i < slabs.length; i++) {
    const s1 = slabs[i];
    const min1 = parseInt(s1.minShowups) || 0;
    const max1 = s1.maxShowups !== null && s1.maxShowups !== undefined ? parseInt(s1.maxShowups) : null;
    const rate1 = parseFloat(s1.rate) || 0;

    if (min1 < 0 || (max1 !== null && max1 < 0) || rate1 < 0) {
      return 'Slab values and rates must be non-negative.';
    }

    if (max1 !== null && min1 > max1) {
      return `Slab min (${min1}) cannot exceed max (${max1}).`;
    }

    for (let j = i + 1; j < slabs.length; j++) {
      const s2 = slabs[j];
      const min2 = parseInt(s2.minShowups) || 0;
      const max2 = s2.maxShowups !== null && s2.maxShowups !== undefined ? parseInt(s2.maxShowups) : null;

      // Overlap check
      const startOverlap = max2 === null || min1 <= max2;
      const endOverlap = max1 === null || min2 <= max1;

      if (startOverlap && endOverlap) {
        return `Overlapping range detected: [${min1}-${max1 ?? '∞'}] overlaps with [${min2}-${max2 ?? '∞'}].`;
      }
    }
  }
  return null;
}

// ==============================================================================
// Campaigns CRUD
// ==============================================================================

exports.getCampaigns = async (req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        members: {
          include: {
            employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } }
          }
        },
        commissionStructures: {
          include: { slabs: true }
        }
      }
    });
    res.json(campaigns);
  } catch (err) {
    next(err);
  }
};

exports.createCampaign = async (req, res, next) => {
  try {
    const { name, description, startDate, endDate, notes, teamLeadId, sdrIds = [] } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Campaign name is required' });
    }

    const campaign = await prisma.$transaction(async (tx) => {
      // 1. Create campaign
      const camp = await tx.campaign.create({
        data: {
          name,
          description,
          status: 'active',
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          monthlyShowupTarget: 0,
          notes
        }
      });

      // 2. Assign Team Lead if provided
      if (teamLeadId) {
        await tx.campaignMember.updateMany({
          where: { employeeId: teamLeadId, status: 'active' },
          data: { status: 'inactive' }
        });
        await tx.campaignMember.create({
          data: {
            campaignId: camp.id,
            employeeId: teamLeadId,
            role: 'team_lead',
            status: 'active'
          }
        });
      }

      // 3. Assign SDRs if provided
      for (const sdrId of sdrIds) {
        if (sdrId) {
          await tx.campaignMember.updateMany({
            where: { employeeId: sdrId, status: 'active' },
            data: { status: 'inactive' }
          });
          await tx.campaignMember.create({
            data: {
              campaignId: camp.id,
              employeeId: sdrId,
              role: 'sdr',
              status: 'active'
            }
          });
        }
      }

      return camp;
    });

    await logAudit(req.user.id, 'CREATE_CAMPAIGN', 'Campaign', campaign.id, { name });
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
};

exports.updateCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, status, startDate, endDate, monthlyShowupTarget, notes } = req.body;

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        name,
        description,
        status,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        monthlyShowupTarget: monthlyShowupTarget !== undefined ? parseInt(monthlyShowupTarget) : undefined,
        notes
      }
    });

    await logAudit(req.user.id, 'UPDATE_CAMPAIGN', 'Campaign', id, { name, status });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
};

exports.deleteCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Direct deletion with cascade support
    await prisma.campaign.delete({
      where: { id }
    });

    await logAudit(req.user.id, 'DELETE_CAMPAIGN', 'Campaign', id);
    res.json({ message: 'Campaign deleted successfully' });
  } catch (err) {
    next(err);
  }
};

exports.duplicateCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;

    const sourceCampaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        commissionStructures: {
          where: { status: 'active' },
          include: { slabs: true }
        }
      }
    });

    if (!sourceCampaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Duplicate Campaign properties
    const newName = `${sourceCampaign.name} (Copy) - ${Date.now()}`;
    const newCampaign = await prisma.campaign.create({
      data: {
        name: newName,
        description: sourceCampaign.description,
        status: 'active',
        startDate: sourceCampaign.startDate,
        endDate: sourceCampaign.endDate,
        monthlyShowupTarget: sourceCampaign.monthlyShowupTarget,
        notes: sourceCampaign.notes
      }
    });

    // Clone active structures and slabs if any exist
    for (const struct of sourceCampaign.commissionStructures) {
      const newStruct = await prisma.commissionStructure.create({
        data: {
          campaignId: newCampaign.id,
          name: `${struct.name} (Cloned)`,
          status: 'draft',
          startDate: struct.startDate,
          endDate: struct.endDate
        }
      });

      for (const slab of struct.slabs) {
        await prisma.commissionSlab.create({
          data: {
            structureId: newStruct.id,
            minShowups: slab.minShowups,
            maxShowups: slab.maxShowups,
            rate: slab.rate,
            type: slab.type
          }
        });
      }
    }

    await logAudit(req.user.id, 'DUPLICATE_CAMPAIGN', 'Campaign', newCampaign.id, { sourceId: id });
    res.status(201).json(newCampaign);
  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// Campaign Member Assignments
// ==============================================================================

exports.assignMember = async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const { employeeId, role } = req.body; // role: sdr, team_lead

    if (!employeeId || !role) {
      return res.status(400).json({ error: 'employeeId and role are required' });
    }

    // Enforce business rule: "Each employee can only belong to one active Campaign at a time"
    // Deactivate active campaign memberships for this employee
    await prisma.campaignMember.updateMany({
      where: {
        employeeId,
        status: 'active'
      },
      data: {
        status: 'inactive'
      }
    });

    // Create or Upsert new active member assignment
    const member = await prisma.campaignMember.upsert({
      where: {
        campaignId_employeeId: {
          campaignId,
          employeeId
        }
      },
      create: {
        campaignId,
        employeeId,
        role,
        status: 'active'
      },
      update: {
        role,
        status: 'active'
      }
    });

    // Sync the campaign member role to the User role in DB
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true }
    });
    if (emp && emp.userId) {
      const newUserRole = role === 'team_lead' ? 'Team Lead' : 'SDR';
      await prisma.user.update({
        where: { id: emp.userId },
        data: { role: newUserRole }
      });
    }

    await logAudit(req.user.id, 'ASSIGN_CAMPAIGN_MEMBER', 'CampaignMember', member.id, { campaignId, employeeId, role });
    res.json(member);
  } catch (err) {
    next(err);
  }
};

exports.unassignMember = async (req, res, next) => {
  try {
    const { id: campaignId, employeeId } = req.params;

    await prisma.campaignMember.delete({
      where: {
        campaignId_employeeId: {
          campaignId,
          employeeId
        }
      }
    });

    // Revert User role to 'Employee' since they are unassigned
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true }
    });
    if (emp && emp.userId) {
      await prisma.user.update({
        where: { id: emp.userId },
        data: { role: 'Employee' }
      });
    }

    await logAudit(req.user.id, 'UNASSIGN_CAMPAIGN_MEMBER', 'CampaignMember', null, { campaignId, employeeId });
    res.json({ message: 'Employee unassigned from campaign successfully' });
  } catch (err) {
    next(err);
  }
};

exports.toggleMemberStatus = async (req, res, next) => {
  try {
    const { id: campaignId, employeeId } = req.params;
    const { status } = req.body; // active, inactive

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const member = await prisma.campaignMember.update({
      where: {
        campaignId_employeeId: {
          campaignId,
          employeeId
        }
      },
      data: { status }
    });

    // Update User role depending on whether they are active or inactive
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true }
    });
    if (emp && emp.userId) {
      const newUserRole = status === 'active'
        ? (member.role === 'team_lead' ? 'Team Lead' : 'SDR')
        : 'Employee';
      await prisma.user.update({
        where: { id: emp.userId },
        data: { role: newUserRole }
      });
    }

    await logAudit(req.user.id, 'TOGGLE_MEMBER_STATUS', 'CampaignMember', member.id, { status });
    res.json(member);
  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// Commission Structure & Slab Builders
// ==============================================================================

exports.getStructures = async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const structures = await prisma.commissionStructure.findMany({
      where: { campaignId },
      include: { slabs: true }
    });
    res.json(structures);
  } catch (err) {
    next(err);
  }
};

exports.createStructure = async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const { name, startDate, endDate, slabs = [] } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Structure name is required' });
    }

    // Range/Overlap validation
    const validationError = validateSlabs(slabs);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const structure = await prisma.commissionStructure.create({
      data: {
        campaignId,
        name,
        status: 'draft',
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        slabs: {
          create: slabs.map(s => ({
            minShowups: parseInt(s.minShowups) || 0,
            maxShowups: s.maxShowups !== null && s.maxShowups !== undefined ? parseInt(s.maxShowups) : null,
            rate: parseFloat(s.rate) || 0,
            type: s.type || 'per_showup'
          }))
        }
      },
      include: { slabs: true }
    });

    await logAudit(req.user.id, 'CREATE_COMMISSION_STRUCTURE', 'CommissionStructure', structure.id);
    res.status(201).json(structure);
  } catch (err) {
    next(err);
  }
};

exports.updateStructure = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, status, startDate, endDate, slabs = [] } = req.body;

    // Range/Overlap validation
    const validationError = validateSlabs(slabs);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Perform database transaction to recreate slabs and update structure
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Delete current slabs
      await tx.commissionSlab.deleteMany({
        where: { structureId: id }
      });

      // 2. Update structure
      return tx.commissionStructure.update({
        where: { id },
        data: {
          name,
          status,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          slabs: {
            create: slabs.map(s => ({
              minShowups: parseInt(s.minShowups) || 0,
              maxShowups: s.maxShowups !== null && s.maxShowups !== undefined ? parseInt(s.maxShowups) : null,
              rate: parseFloat(s.rate) || 0,
              type: s.type || 'per_showup'
            }))
          }
        },
        include: { slabs: true }
      });
    });

    await logAudit(req.user.id, 'UPDATE_COMMISSION_STRUCTURE', 'CommissionStructure', id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.deleteStructure = async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.commissionStructure.delete({
      where: { id }
    });

    await logAudit(req.user.id, 'DELETE_COMMISSION_STRUCTURE', 'CommissionStructure', id);
    res.json({ message: 'Commission structure deleted successfully' });
  } catch (err) {
    next(err);
  }
};

exports.activateStructure = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch the structure to verify campaign
    const struct = await prisma.commissionStructure.findUnique({
      where: { id }
    });

    if (!struct) {
      return res.status(404).json({ error: 'Commission structure not found' });
    }

    // Only one commission structure can be active for a campaign at any given time.
    // Deactivate all others for this campaign
    await prisma.$transaction([
      prisma.commissionStructure.updateMany({
        where: {
          campaignId: struct.campaignId,
          id: { not: id }
        },
        data: { status: 'archived' }
      }),
      prisma.commissionStructure.update({
        where: { id },
        data: { status: 'active' }
      })
    ]);

    await logAudit(req.user.id, 'ACTIVATE_COMMISSION_STRUCTURE', 'CommissionStructure', id, { campaignId: struct.campaignId });
    res.json({ message: 'Commission structure activated' });
  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// Commission Preview Simulator
// ==============================================================================

exports.previewCommission = async (req, res, next) => {
  try {
    const { campaignId, showups } = req.body;
    const count = parseInt(showups) || 0;

    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId is required' });
    }

    // Fetch active commission structure
    const structure = await prisma.commissionStructure.findFirst({
      where: { campaignId, status: 'active' },
      include: { slabs: true }
    });

    if (!structure) {
      return res.status(400).json({ error: 'No active commission structure found for this campaign' });
    }

    // Find matching slab
    const slab = structure.slabs.find(s => 
      count >= s.minShowups && 
      (s.maxShowups === null || count <= s.maxShowups)
    );

    let amount = 0;
    let description = '';

    if (!slab) {
      description = `0 showups (No matching slab found for ${count} showups)`;
    } else {
      const rate = slab.rate;
      if (slab.type === 'per_showup') {
        amount = count * rate;
        description = `${count} Show-Ups × PKR ${rate.toLocaleString()} / show-up = PKR ${amount.toLocaleString()}`;
      } else if (slab.type === 'fixed_monthly') {
        amount = rate;
        description = `Fixed Monthly payout: PKR ${amount.toLocaleString()} (matched slab ${slab.minShowups}-${slab.maxShowups ?? '∞'})`;
      } else if (slab.type === 'percentage') {
        amount = rate * count; // custom multiplier
        description = `Percentage slab multiplier: ${rate}% / PKR override × ${count} = PKR ${amount.toLocaleString()}`;
      } else if (slab.type === 'hybrid') {
        // e.g. base amount (slab rate) + PKR 2000 per showup
        const base = rate;
        const perShowupExtra = 2000;
        amount = base + (count * perShowupExtra);
        description = `Hybrid: Fixed Base PKR ${base.toLocaleString()} + (${count} × PKR ${perShowupExtra.toLocaleString()}/show-up) = PKR ${amount.toLocaleString()}`;
      } else {
        amount = count * rate;
        description = `Custom: ${count} × PKR ${rate.toLocaleString()} = PKR ${amount.toLocaleString()}`;
      }
    }

    res.json({
      campaignId,
      showups: count,
      structureName: structure.name,
      slabMatched: slab ? { min: slab.minShowups, max: slab.maxShowups, rate: slab.rate, type: slab.type } : null,
      calculatedCommission: amount,
      formulaExplanation: description
    });

  } catch (err) {
    next(err);
  }
};

// ==============================================================================
// Campaign Performance Dashboard
// ==============================================================================

exports.getCampaignDashboard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;

    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        members: {
          where: { status: 'active' },
          include: {
            employee: true
          }
        },
        commissionStructures: {
          where: { status: 'active' },
          include: { slabs: true }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Find the Team Lead
    const teamLeadMember = campaign.members.find(m => m.role === 'team_lead');
    const teamLeadName = teamLeadMember?.employee.fullName || 'No Lead Assigned';

    // Filter SDRs
    const sdrs = campaign.members.filter(m => m.role === 'sdr');
    const sdrIds = sdrs.map(s => s.employee.id);

    // Fetch Performance entries
    const performances = await prisma.campaignPerformance.findMany({
      where: {
        campaignId: id,
        month: m,
        year: y
      },
      include: {
        employee: { select: { fullName: true, employeeCode: true } }
      }
    });

    // Sum overall campaign numbers
    let totalMeetingsBooked = 0;
    let totalShowups = 0;
    let totalNoShows = 0;
    let totalCancelled = 0;
    let totalCommissionPaid = 0;

    // Leaderboard mapping
    const leaderboard = sdrs.map(sdr => {
      const perf = performances.find(p => p.employeeId === sdr.employee.id) || {
        meetingsBooked: 0,
        showups: 0,
        noShows: 0,
        cancelledMeetings: 0
      };

      totalMeetingsBooked += perf.meetingsBooked;
      totalShowups += perf.showups;
      totalNoShows += perf.noShows;
      totalCancelled += perf.cancelledMeetings;

      // Calculate individual commission
      let commission = 0;
      const activeStructure = campaign.commissionStructures[0];
      if (activeStructure && activeStructure.slabs.length > 0) {
        const slab = activeStructure.slabs.find(s => 
          perf.showups >= s.minShowups && 
          (s.maxShowups === null || perf.showups <= s.maxShowups)
        );
        if (slab) {
          if (slab.type === 'per_showup') {
            commission = perf.showups * slab.rate;
          } else if (slab.type === 'fixed_monthly') {
            commission = slab.rate;
          } else if (slab.type === 'percentage') {
            commission = slab.rate * perf.showups;
          } else if (slab.type === 'hybrid') {
            commission = slab.rate + (perf.showups * 2000);
          }
        }
      }
      totalCommissionPaid += commission;

      return {
        employeeId: sdr.employee.id,
        fullName: sdr.employee.fullName,
        code: sdr.employee.employeeCode,
        meetingsBooked: perf.meetingsBooked,
        showups: perf.showups,
        noShows: perf.noShows,
        cancelledMeetings: perf.cancelledMeetings,
        commissionEarned: commission
      };
    });

    // Sort leaderboard by showups descending
    leaderboard.sort((a, b) => b.showups - a.showups);

    // Conversion rate: Showups / Meetings Booked
    const conversionRate = totalMeetingsBooked > 0
      ? parseFloat(((totalShowups / totalMeetingsBooked) * 100).toFixed(1))
      : 0;

    // Calculate Team Lead Override Commission
    let teamLeadCommission = 0;
    if (teamLeadMember && leaderboard.length > 0) {
      const avgShowups = totalShowups / leaderboard.length;
      const activeStructure = campaign.commissionStructures[0];
      if (activeStructure && activeStructure.slabs.length > 0) {
        // We look for overriding slabs configured for team leads
        // Or default override calculation
        const slab = activeStructure.slabs.find(s => 
          avgShowups >= s.minShowups && 
          (s.maxShowups === null || avgShowups <= s.maxShowups)
        );
        if (slab) {
          teamLeadCommission = totalShowups * (slab.rate * 0.1); // e.g. 10% TL override rate
        }
      }
    }

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        teamLead: teamLeadName,
        totalSdrs: sdrs.length
      },
      stats: {
        meetingsBooked: totalMeetingsBooked,
        showups: totalShowups,
        noShows: totalNoShows,
        cancelledMeetings: totalCancelled,
        conversionRate,
        commissionPaid: totalCommissionPaid + teamLeadCommission
      },
      leaderboard,
      recentActivity: performances.map(p => ({
        timestamp: p.updatedAt,
        message: `${p.employee.fullName} updated: Show-Ups: ${p.showups}, No-Shows: ${p.noShows}`
      })).slice(0, 10)
    });

  } catch (err) {
    next(err);
  }
};

exports.logPerformance = async (req, res, next) => {
  try {
    const { employeeId, campaignId, month, year, meetingsBooked, showups, noShows, cancelledMeetings } = req.body;

    if (!employeeId || !campaignId || !month || !year) {
      return res.status(400).json({ error: 'employeeId, campaignId, month, and year are required' });
    }

    const performance = await prisma.campaignPerformance.upsert({
      where: {
        employeeId_campaignId_month_year: {
          employeeId,
          campaignId,
          month: parseInt(month),
          year: parseInt(year)
        }
      },
      create: {
        employeeId,
        campaignId,
        month: parseInt(month),
        year: parseInt(year),
        meetingsBooked: parseInt(meetingsBooked) || 0,
        showups: parseInt(showups) || 0,
        noShows: parseInt(noShows) || 0,
        cancelledMeetings: parseInt(cancelledMeetings) || 0
      },
      update: {
        meetingsBooked: meetingsBooked !== undefined ? parseInt(meetingsBooked) : undefined,
        showups: showups !== undefined ? parseInt(showups) : undefined,
        noShows: noShows !== undefined ? parseInt(noShows) : undefined,
        cancelledMeetings: cancelledMeetings !== undefined ? parseInt(cancelledMeetings) : undefined
      }
    });

    await logAudit(req.user.id, 'LOG_CAMPAIGN_PERFORMANCE', 'CampaignPerformance', performance.id, { employeeId, month, year });
    res.json(performance);
  } catch (err) {
    next(err);
  }
};
