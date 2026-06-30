const { PrismaClient } = require('@prisma/client');
const supabase = require('../config/supabase');
const { logAudit } = require('../utils/audit');

const prisma = new PrismaClient();

exports.uploadDocument = async (req, res, next) => {
  try {
    const { employeeId, name, type } = req.body;
    const file = req.file;

    if (!employeeId || !name || !type || !file) {
      return res.status(400).json({ error: 'employeeId, name, type, and file are required' });
    }

    // Verify employee exists
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    let fileUrl = '';
    if (supabase) {
      // Create path: /employee-id/timestamp-filename
      const fileExt = file.originalname.split('.').pop();
      const storagePath = `${employeeId}/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('employee-documents')
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });

      if (error) {
        return res.status(500).json({ error: `Supabase upload failed: ${error.message}` });
      }

      const { data: publicData } = supabase.storage
        .from('employee-documents')
        .getPublicUrl(storagePath);
      fileUrl = publicData.publicUrl;
    } else {
      return res.status(500).json({ error: 'Supabase storage is not configured' });
    }

    const doc = await prisma.document.create({
      data: {
        employeeId,
        name,
        type,
        fileUrl,
        uploadedById: req.user.id
      }
    });

    await logAudit(req.user.id, 'UPLOAD_DOCUMENT', 'Document', doc.id, { name, type, employeeId });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

exports.getDocuments = async (req, res, next) => {
  try {
    const { employeeId } = req.query;

    const where = {};

    // RBAC
    if (req.user.role === 'Employee') {
      where.employeeId = req.user.employee.id;
    } else if (req.user.role === 'Team Lead') {
      if (employeeId) {
        const targetEmp = await prisma.employee.findUnique({
          where: { id: employeeId },
          select: { teamId: true }
        });
        if (!targetEmp || targetEmp.teamId !== req.user.employee?.teamId) {
          return res.status(403).json({ error: 'Access denied.' });
        }
        where.employeeId = employeeId;
      } else {
        where.employee = { teamId: req.user.employee?.teamId };
      }
    } else {
      if (employeeId) where.employeeId = employeeId;
    }

    const docs = await prisma.document.findMany({
      where,
      include: {
        employee: {
          select: { id: true, fullName: true, employeeCode: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(docs);
  } catch (err) {
    next(err);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Try to remove from Supabase Storage
    if (supabase) {
      // fileUrl looks like: .../storage/v1/object/public/employee-documents/EMPLOYEE_ID/FILENAME
      // We need to extract the path: EMPLOYEE_ID/FILENAME
      const parts = doc.fileUrl.split('employee-documents/');
      if (parts.length > 1) {
        const storagePath = parts[1];
        const { error } = await supabase.storage
          .from('employee-documents')
          .remove([storagePath]);
        if (error) {
          console.error('[Supabase Storage Delete Error]:', error.message);
        }
      }
    }

    await prisma.document.delete({ where: { id } });

    await logAudit(req.user.id, 'DELETE_DOCUMENT', 'Document', id, { name: doc.name });
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    next(err);
  }
};
