const express = require('express');
const multer = require('multer');
const router = express.Router();
const documentController = require('../controllers/document');
const { requireAuth, requireRole } = require('../middlewares/auth');

const adminRoles = ['Admin', 'CEO', 'COO'];
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', requireAuth, documentController.getDocuments);
router.post('/', requireAuth, requireRole(adminRoles), upload.single('file'), documentController.uploadDocument);
router.delete('/:id', requireAuth, requireRole(adminRoles), documentController.deleteDocument);

module.exports = router;
