const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { generatePayslipPdf } = require('../utils/payslipPdf');
const supabase = require('../config/supabase');
const { logAudit } = require('../utils/audit');

const prisma = new PrismaClient();

// Helper to get days in month
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Run Payroll: Generate Draft Payslips
 */
exports.runPayroll = async (req, res, next) => {
  try {
    const { month, year, performance = [] } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const endOfMonth = new Date(Date.UTC(year, month, 0));
    const daysInPeriod = getDaysInMonth(year, month);

    // Create or find the PayrollRun
    const payrollRun = await prisma.payrollRun.upsert({
      where: {
        periodMonth_periodYear: {
          periodMonth: parseInt(month),
          periodYear: parseInt(year)
        }
      },
      create: {
        periodMonth: parseInt(month),
        periodYear: parseInt(year),
        status: 'draft',
        createdById: req.user.id
      },
      update: {
        status: 'draft',
        createdById: req.user.id
      }
    });

    // Delete existing payslips under this draft run if any
    await prisma.payslip.deleteMany({
      where: { payrollRunId: payrollRun.id }
    });

    // Fetch all active employees
    const employees = await prisma.employee.findMany({
      where: { status: 'active' },
      include: {
        campaignMembers: {
          where: { status: 'active' },
          include: { campaign: true }
        },
        user: true
      }
    });

    const payslips = [];

    for (const emp of employees) {
      // 1. Base Salary
      const baseSalary = emp.baseSalary;

      // Find performance record for this employee from database or payload
      const dbPerf = await prisma.campaignPerformance.findFirst({
        where: { employeeId: emp.id, month: parseInt(month), year: parseInt(year) }
      });

      const payloadPerf = performance.find(p => p.employeeId === emp.id);

      const showupsCount = payloadPerf ? (payloadPerf.showups || 0) : (dbPerf ? dbPerf.showups : 0);
      const meetingsScheduledCount = payloadPerf ? (payloadPerf.meetingsScheduled || 0) : (dbPerf ? dbPerf.meetingsBooked : 0);
      const noShowsCount = payloadPerf ? (payloadPerf.noShows || 0) : (dbPerf ? dbPerf.noShows : 0);
      const bonusAmount = payloadPerf ? (payloadPerf.bonus || 0) : 0;
      const otherDeductionsAmount = payloadPerf ? (payloadPerf.otherDeductions || 0) : 0;

      // 2. Attendance metrics (present, late count)
      const attendanceRecords = await prisma.attendance.findMany({
        where: {
          employeeId: emp.id,
          date: { gte: startOfMonth, lte: endOfMonth }
        }
      });

      let daysPresent = 0;
      let lateCount = 0;

      attendanceRecords.forEach(rec => {
        if (rec.status === 'present' || rec.status === 'wfh' || rec.status === 'leave') {
          daysPresent += 1.0;
        } else if (rec.status === 'half_day') {
          daysPresent += 0.5;
        }
        if (rec.late > 0) {
          lateCount++;
        }
      });

      // 3. Unpaid leaves deduction
      const unpaidLeaves = await prisma.leaveRequest.aggregate({
        _sum: { days: true },
        where: {
          employeeId: emp.id,
          status: 'approved',
          type: { contains: 'unpaid', mode: 'insensitive' },
          startDate: { gte: startOfMonth },
          endDate: { lte: endOfMonth }
        }
      });
      const unpaidDays = unpaidLeaves._sum.days || 0;
      const unpaidLeaveDeduction = (baseSalary / daysInPeriod) * unpaidDays;

      // 4. Late deduction (3 lates = 1 day salary deduction)
      const lateDeduction = Math.floor(lateCount / 3) * (baseSalary / daysInPeriod);

      // 5. Loans deduction for this month/year
      const loans = await prisma.loanRequest.aggregate({
        _sum: { amount: true },
        where: {
          employeeId: emp.id,
          status: 'approved',
          repaymentMonth: parseInt(month),
          repaymentYear: parseInt(year)
        }
      });
      const loansDeduction = loans._sum.amount || 0;

      // 6. Spiffs for this month/year
      const spiffsSum = await prisma.spiff.aggregate({
        _sum: { amount: true },
        where: {
          employeeId: emp.id,
          date: { gte: startOfMonth, lte: endOfMonth }
        }
      });
      const spiffs = spiffsSum._sum.amount || 0;

      // 7. Campaign Commissions (Dynamic Commission Engine)
      let commission = 0;

      const activeMembership = emp.campaignMembers[0];
      if (activeMembership) {
        const campaignId = activeMembership.campaignId;
        const role = activeMembership.role;

        // Fetch active structure
        const activeStructure = await prisma.commissionStructure.findFirst({
          where: { campaignId, status: 'active' },
          include: { slabs: true }
        });

        if (activeStructure && activeStructure.slabs.length > 0) {
          // SDR calculation (Showup Slabs)
          if (role === 'sdr') {
            const matchedSlab = activeStructure.slabs.find(slab => 
              showupsCount >= slab.minShowups && 
              (slab.maxShowups === null || showupsCount <= slab.maxShowups)
            );
            if (matchedSlab) {
              if (matchedSlab.type === 'per_showup') {
                commission = showupsCount * matchedSlab.rate;
              } else if (matchedSlab.type === 'fixed_monthly') {
                commission = matchedSlab.rate;
              } else if (matchedSlab.type === 'percentage') {
                commission = matchedSlab.rate * showupsCount;
              } else if (matchedSlab.type === 'hybrid') {
                commission = matchedSlab.rate + (showupsCount * 2000);
              }
            }
          }
          // Team Lead calculation (Team Average Slabs override)
          else if (role === 'team_lead') {
            // Find all active SDRs in this campaign
            const teamSdrs = await prisma.campaignMember.findMany({
              where: { campaignId, role: 'sdr', status: 'active' }
            });
            const teamSdrIds = teamSdrs.map(s => s.employeeId);

            // Fetch team members' performance
            const teamPerfs = await prisma.campaignPerformance.findMany({
              where: {
                employeeId: { in: teamSdrIds },
                campaignId,
                month: parseInt(month),
                year: parseInt(year)
              }
            });

            const teamShowups = teamPerfs.reduce((sum, p) => sum + p.showups, 0);
            const teamSize = teamSdrs.length;

            if (teamSize > 0) {
              const avgShowups = teamShowups / teamSize;
              const matchedSlab = activeStructure.slabs.find(slab => 
                avgShowups >= slab.minShowups && 
                (slab.maxShowups === null || avgShowups <= slab.maxShowups)
              );
              if (matchedSlab) {
                if (matchedSlab.type === 'per_showup') {
                  commission = teamShowups * matchedSlab.rate;
                } else if (matchedSlab.type === 'fixed_monthly') {
                  commission = matchedSlab.rate;
                } else if (matchedSlab.type === 'percentage') {
                  commission = matchedSlab.rate * teamShowups;
                } else if (matchedSlab.type === 'hybrid') {
                  commission = matchedSlab.rate + (teamShowups * 2000);
                }
              }
            }
          }
        }
      }

      // 8. Final Calculation
      const earnings = baseSalary + bonusAmount + commission + spiffs;
      const deductions = unpaidLeaveDeduction + lateDeduction + loansDeduction + otherDeductionsAmount;
      const netPay = Math.max(0, earnings - deductions);

      // Create Payslip entry in DB
      const payslip = await prisma.payslip.create({
        data: {
          payrollRunId: payrollRun.id,
          employeeId: emp.id,
          baseSalary,
          daysPresent,
          daysInPeriod,
          unpaidLeaveDeduction,
          lateDeduction,
          loansDeduction,
          otherDeductions: otherDeductionsAmount,
          bonus: bonusAmount,
          commission,
          spiffs,
          netPay,
          showups: showupsCount,
          meetingsScheduled: meetingsScheduledCount,
          noShows: noShowsCount
        },
        include: {
          employee: {
            include: {
              campaignMembers: {
                where: { status: 'active' },
                include: { campaign: true }
              }
            }
          }
        }
      });

      payslips.push(payslip);
    }

    res.json({
      payrollRun,
      payslipsCount: payslips.length,
      payslips
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Finalize Payroll Run, Generate PDFs, and upload to Supabase Storage
 */
exports.finalizePayroll = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payrollRun = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: {
          include: {
            employee: {
              include: {
                campaignMembers: {
                  where: { status: 'active' },
                  include: { campaign: true }
                }
              }
            }
          }
        }
      }
    });

    if (!payrollRun) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    if (payrollRun.status === 'finalized') {
      return res.status(400).json({ error: 'Payroll run is already finalized' });
    }

    // Process and generate PDF for each payslip
    for (const payslip of payrollRun.payslips) {
      // 1. Path to temporary PDF file
      const tempFileName = `payslip-${payslip.id}-${Date.now()}.pdf`;
      const tempFilePath = path.join(__dirname, '..', '..', tempFileName);
      const writeStream = fs.createWriteStream(tempFilePath);

      // 2. Generate PDF into temporary file
      generatePayslipPdf(writeStream, payslip, { name: 'Brandigade HRIS', address: 'Karachi, Pakistan' });

      // Wait for stream to finish writing
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // 3. Upload to Supabase Storage (if configured)
      let pdfUrl = null;
      if (supabase) {
        const fileBuffer = fs.readFileSync(tempFilePath);
        const storagePath = `${payrollRun.periodYear}/${payrollRun.periodMonth}/${payslip.id}.pdf`;

        const { data, error } = await supabase.storage
          .from('payslips')
          .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true
          });

        if (error) {
          console.error(`[Supabase Upload Error] employee ${payslip.employeeId}:`, error.message);
        } else {
          // Get public URL
          const { data: publicData } = supabase.storage
            .from('payslips')
            .getPublicUrl(storagePath);
          pdfUrl = publicData.publicUrl;
        }
      }

      // 4. Update payslip with pdfUrl
      await prisma.payslip.update({
        where: { id: payslip.id },
        data: { pdfUrl }
      });

      // 5. Delete temporary file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (err) {
        console.error('Failed to clean up temp file:', err.message);
      }
    }

    // Mark payroll run as finalized
    const updatedRun = await prisma.payrollRun.update({
      where: { id },
      data: {
        status: 'finalized',
        finalizedAt: new Date()
      }
    });

    await logAudit(req.user.id, 'FINALIZE_PAYROLL_RUN', 'PayrollRun', id);
    res.json({ message: 'Payroll run finalized and payslip PDFs generated successfully', payrollRun: updatedRun });
  } catch (err) {
    next(err);
  }
};

/**
 * Get Payroll History / Draft Runs
 */
exports.getPayrollRuns = async (req, res, next) => {
  try {
    const runs = await prisma.payrollRun.findMany({
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }]
    });
    res.json(runs);
  } catch (err) {
    next(err);
  }
};

/**
 * Get Payslips of a Run
 */
exports.getPayslipsByRun = async (req, res, next) => {
  try {
    const { runId } = req.params;
    
    // RBAC: Standard Employee should use /my-payslips instead
    if (req.user.role === 'Employee') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: runId },
      include: {
        employee: {
          select: { id: true, fullName: true, employeeCode: true, designation: true }
        }
      }
    });
    res.json(payslips);
  } catch (err) {
    next(err);
  }
};

/**
 * Standard employee fetch their own payslips
 */
exports.getMyPayslips = async (req, res, next) => {
  try {
    if (!req.user.employee) {
      return res.status(400).json({ error: 'No employee profile linked to user.' });
    }

    const payslips = await prisma.payslip.findMany({
      where: {
        employeeId: req.user.employee.id,
        payrollRun: { status: 'finalized' } // Only finalized payslips
      },
      include: {
        payrollRun: true
      },
      orderBy: { generatedAt: 'desc' }
    });

    res.json(payslips);
  } catch (err) {
    next(err);
  }
};

/**
 * Stream/Download PDF payslip directly from server on-the-fly
 */
exports.getPayslipPdfFile = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch the payslip
    const payslip = await prisma.payslip.findUnique({
      where: { id },
      include: {
          employee: {
            include: {
              campaignMembers: {
                where: { status: 'active' },
                include: { campaign: true }
              }
            }
          },
        payrollRun: true
      }
    });

    if (!payslip) {
      return res.status(404).json({ error: 'Payslip not found' });
    }

    // Role check: Normal Employee can only download their own payslip
    if (req.user.role === 'Employee' && (!req.user.employee || req.user.employee.id !== payslip.employeeId)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    // Stream PDF directly to client response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="payslip-${payslip.id}.pdf"`);

    generatePayslipPdf(res, payslip, { name: 'Brandigade', address: 'Karachi, Pakistan' });
  } catch (err) {
    next(err);
  }
};
