import { openDatabase } from './databaseService';
import dataIsolationService from './dataIsolationService';
import companyService from './companyService';

/**
 * Batch Management Service - Enhanced Photo Organization Workflows
 * Handles batch creation, organization, approval workflows, and business logic
 */

export interface BatchTemplate {
  id: string;
  companyId: string;
  name: string;
  description: string;
  category: 'inspection' | 'maintenance' | 'inventory' | 'quality_control' | 'custom';
  requiredFields: BatchField[];
  photoRequirements: PhotoRequirement[];
  approvalWorkflow: ApprovalWorkflow;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchField {
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
  label: string;
  required: boolean;
  options?: string[]; // For select/multiselect
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

export interface PhotoRequirement {
  category: string;
  minPhotos: number;
  maxPhotos: number;
  description: string;
  required: boolean;
}

export interface ApprovalWorkflow {
  enabled: boolean;
  stages: ApprovalStage[];
  autoApprove?: {
    conditions: string[];
    enabled: boolean;
  };
}

export interface ApprovalStage {
  id: string;
  name: string;
  approvers: string[]; // User IDs or roles
  requiredApprovals: number;
  order: number;
  conditions?: string[];
}

export interface EnhancedBatch {
  id: string;
  companyId: string;
  templateId?: string;
  name: string;
  description: string;
  category: string;
  status: 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'rejected' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  reviewedBy?: string;
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';
  currentApprovalStage?: string;
  metadata: Record<string, any>;
  tags: string[];
  dueDate?: string;
  completedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  photoCount: number;
  totalSize: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchApproval {
  id: string;
  batchId: string;
  stageId: string;
  approverId: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  approvedAt?: string;
  rejectedAt?: string;
  createdAt: string;
}

export interface BatchComment {
  id: string;
  batchId: string;
  userId: string;
  comment: string;
  type: 'general' | 'approval' | 'rejection' | 'system';
  createdAt: string;
}

/**
 * Initialize batch management tables
 */
export const initializeBatchManagementTables = async (): Promise<void> => {
  try {
    const db = await openDatabase();
    
    // Batch templates table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS batch_templates (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        requiredFields TEXT NOT NULL, -- JSON
        photoRequirements TEXT NOT NULL, -- JSON
        approvalWorkflow TEXT NOT NULL, -- JSON
        isActive INTEGER DEFAULT 1,
        createdBy TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        syncStatus TEXT DEFAULT 'pending',
        lastSyncAt TEXT,
        version INTEGER DEFAULT 1,
        FOREIGN KEY (companyId) REFERENCES companies (id) ON DELETE CASCADE
      );
    `);

    // Enhanced batch approvals table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS batch_approvals (
        id TEXT PRIMARY KEY,
        batchId TEXT NOT NULL,
        stageId TEXT NOT NULL,
        approverId TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        comments TEXT,
        approvedAt TEXT,
        rejectedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        syncStatus TEXT DEFAULT 'pending',
        lastSyncAt TEXT,
        version INTEGER DEFAULT 1,
        FOREIGN KEY (batchId) REFERENCES photo_batches (id) ON DELETE CASCADE
      );
    `);

    // Batch comments table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS batch_comments (
        id TEXT PRIMARY KEY,
        batchId TEXT NOT NULL,
        userId TEXT NOT NULL,
        comment TEXT NOT NULL,
        type TEXT DEFAULT 'general' CHECK (type IN ('general', 'approval', 'rejection', 'system')),
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        syncStatus TEXT DEFAULT 'pending',
        lastSyncAt TEXT,
        version INTEGER DEFAULT 1,
        FOREIGN KEY (batchId) REFERENCES photo_batches (id) ON DELETE CASCADE
      );
    `);

    // Update existing photo_batches table with new fields
    try {
      await db.execAsync(`
        ALTER TABLE photo_batches ADD COLUMN templateId TEXT;
        ALTER TABLE photo_batches ADD COLUMN category TEXT DEFAULT 'general';
        ALTER TABLE photo_batches ADD COLUMN priority TEXT DEFAULT 'medium';
        ALTER TABLE photo_batches ADD COLUMN assignedTo TEXT;
        ALTER TABLE photo_batches ADD COLUMN reviewedBy TEXT;
        ALTER TABLE photo_batches ADD COLUMN approvalStatus TEXT DEFAULT 'none';
        ALTER TABLE photo_batches ADD COLUMN currentApprovalStage TEXT;
        ALTER TABLE photo_batches ADD COLUMN metadata TEXT DEFAULT '{}';
        ALTER TABLE photo_batches ADD COLUMN tags TEXT DEFAULT '[]';
        ALTER TABLE photo_batches ADD COLUMN dueDate TEXT;
        ALTER TABLE photo_batches ADD COLUMN completedAt TEXT;
        ALTER TABLE photo_batches ADD COLUMN approvedAt TEXT;
        ALTER TABLE photo_batches ADD COLUMN rejectedAt TEXT;
        ALTER TABLE photo_batches ADD COLUMN rejectionReason TEXT;
        ALTER TABLE photo_batches ADD COLUMN totalSize INTEGER DEFAULT 0;
      `);
    } catch (error) {
      // Columns might already exist
      console.log('[BatchManagement] Some columns already exist in photo_batches');
    }

    // Create indexes
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_batch_templates_company ON batch_templates (companyId);
      CREATE INDEX IF NOT EXISTS idx_batch_templates_category ON batch_templates (category);
      CREATE INDEX IF NOT EXISTS idx_batch_approvals_batch ON batch_approvals (batchId);
      CREATE INDEX IF NOT EXISTS idx_batch_approvals_approver ON batch_approvals (approverId);
      CREATE INDEX IF NOT EXISTS idx_batch_approvals_status ON batch_approvals (status);
      CREATE INDEX IF NOT EXISTS idx_batch_comments_batch ON batch_comments (batchId);
      CREATE INDEX IF NOT EXISTS idx_photo_batches_category ON photo_batches (category);
      CREATE INDEX IF NOT EXISTS idx_photo_batches_status ON photo_batches (status);
      CREATE INDEX IF NOT EXISTS idx_photo_batches_priority ON photo_batches (priority);
      CREATE INDEX IF NOT EXISTS idx_photo_batches_assigned ON photo_batches (assignedTo);
      CREATE INDEX IF NOT EXISTS idx_photo_batches_approval ON photo_batches (approvalStatus);
    `);

    console.log('[BatchManagement] Batch management tables initialized successfully');
  } catch (error) {
    console.error('[BatchManagement] Error initializing batch management tables:', error);
    throw error;
  }
};

/**
 * Create batch template
 */
export const createBatchTemplate = async (templateData: Omit<BatchTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<BatchTemplate> => {
  const tenantContext = dataIsolationService.getTenantContext();
  if (!tenantContext || !dataIsolationService.validateTenantAccess(templateData.companyId)) {
    throw new Error('Access denied');
  }

  try {
    const db = await openDatabase();
    const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const template: BatchTemplate = {
      ...templateData,
      id: templateId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.runAsync(`
      INSERT INTO batch_templates (
        id, companyId, name, description, category, requiredFields,
        photoRequirements, approvalWorkflow, isActive, createdBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      template.id,
      template.companyId,
      template.name,
      template.description,
      template.category,
      JSON.stringify(template.requiredFields),
      JSON.stringify(template.photoRequirements),
      JSON.stringify(template.approvalWorkflow),
      template.isActive ? 1 : 0,
      template.createdBy,
      template.createdAt,
      template.updatedAt
    ]);

    await dataIsolationService.logTenantOperation('CREATE', 'batch_template', templateId, template);
    console.log('[BatchManagement] Batch template created:', templateId);
    return template;
  } catch (error) {
    console.error('[BatchManagement] Error creating batch template:', error);
    throw error;
  }
};

/**
 * Get batch templates for company
 */
export const getBatchTemplates = async (companyId: string): Promise<BatchTemplate[]> => {
  if (!dataIsolationService.validateTenantAccess(companyId)) {
    throw new Error('Access denied');
  }

  try {
    const db = await openDatabase();
    
    const results = await db.getAllAsync(`
      SELECT * FROM batch_templates 
      WHERE companyId = ? AND isActive = 1
      ORDER BY name ASC
    `, [companyId]) as any[];
    
    return results.map(result => ({
      id: result.id,
      companyId: result.companyId,
      name: result.name,
      description: result.description,
      category: result.category,
      requiredFields: JSON.parse(result.requiredFields),
      photoRequirements: JSON.parse(result.photoRequirements),
      approvalWorkflow: JSON.parse(result.approvalWorkflow),
      isActive: result.isActive === 1,
      createdBy: result.createdBy,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }));
  } catch (error) {
    console.error('[BatchManagement] Error getting batch templates:', error);
    return [];
  }
};

/**
 * Create enhanced batch from template
 */
export const createBatchFromTemplate = async (
  templateId: string,
  batchData: {
    name: string;
    description?: string;
    assignedTo?: string;
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    metadata?: Record<string, any>;
    tags?: string[];
  }
): Promise<EnhancedBatch> => {
  const tenantContext = dataIsolationService.getTenantContext();
  if (!tenantContext) {
    throw new Error('No tenant context');
  }

  try {
    const db = await openDatabase();
    
    // Get template
    const template = await db.getFirstAsync(`
      SELECT * FROM batch_templates WHERE id = ? AND companyId = ? AND isActive = 1
    `, [templateId, tenantContext.companyId]) as any;
    
    if (!template) {
      throw new Error('Template not found');
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const batch: EnhancedBatch = {
      id: batchId,
      companyId: tenantContext.companyId,
      templateId: templateId,
      name: batchData.name,
      description: batchData.description || template.description,
      category: template.category,
      status: 'draft',
      priority: batchData.priority || 'medium',
      assignedTo: batchData.assignedTo,
      approvalStatus: 'none',
      metadata: batchData.metadata || {},
      tags: batchData.tags || [],
      dueDate: batchData.dueDate,
      photoCount: 0,
      totalSize: 0,
      createdBy: tenantContext.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Insert into photo_batches table (enhanced)
    await db.runAsync(`
      INSERT INTO photo_batches (
        id, companyId, templateId, name, description, category, status, priority,
        assignedTo, approvalStatus, metadata, tags, dueDate, photoCount, totalSize,
        createdBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      batch.id,
      batch.companyId,
      batch.templateId || null,
      batch.name,
      batch.description || null,
      batch.category,
      batch.status,
      batch.priority,
      batch.assignedTo || null,
      batch.approvalStatus,
      JSON.stringify(batch.metadata),
      JSON.stringify(batch.tags),
      batch.dueDate || null,
      batch.photoCount,
      batch.totalSize,
      batch.createdBy,
      batch.createdAt,
      batch.updatedAt
    ]);

    await dataIsolationService.logTenantOperation('CREATE', 'batch', batchId, batch);
    console.log('[BatchManagement] Enhanced batch created from template:', batchId);
    return batch;
  } catch (error) {
    console.error('[BatchManagement] Error creating batch from template:', error);
    throw error;
  }
};

/**
 * Get enhanced batches with filtering and sorting
 */
export const getEnhancedBatches = async (
  companyId: string,
  filters?: {
    status?: string[];
    category?: string[];
    priority?: string[];
    assignedTo?: string;
    createdBy?: string;
    dateRange?: { start: string; end: string };
    tags?: string[];
  },
  sorting?: {
    field: string;
    direction: 'ASC' | 'DESC';
  },
  pagination?: {
    limit: number;
    offset: number;
  }
): Promise<{ batches: EnhancedBatch[]; total: number }> => {
  if (!dataIsolationService.validateTenantAccess(companyId)) {
    throw new Error('Access denied');
  }

  try {
    const db = await openDatabase();
    
    let whereClause = 'WHERE companyId = ?';
    const params: any[] = [companyId];
    
    // Apply filters
    if (filters) {
      if (filters.status && filters.status.length > 0) {
        whereClause += ` AND status IN (${filters.status.map(() => '?').join(',')})`;
        params.push(...filters.status);
      }
      
      if (filters.category && filters.category.length > 0) {
        whereClause += ` AND category IN (${filters.category.map(() => '?').join(',')})`;
        params.push(...filters.category);
      }
      
      if (filters.priority && filters.priority.length > 0) {
        whereClause += ` AND priority IN (${filters.priority.map(() => '?').join(',')})`;
        params.push(...filters.priority);
      }
      
      if (filters.assignedTo) {
        whereClause += ' AND assignedTo = ?';
        params.push(filters.assignedTo);
      }
      
      if (filters.createdBy) {
        whereClause += ' AND createdBy = ?';
        params.push(filters.createdBy);
      }
      
      if (filters.dateRange) {
        whereClause += ' AND createdAt BETWEEN ? AND ?';
        params.push(filters.dateRange.start, filters.dateRange.end);
      }
    }
    
    // Get total count
    const countResult = await db.getFirstAsync(`
      SELECT COUNT(*) as total FROM photo_batches ${whereClause}
    `, params) as any;
    
    const total = countResult?.total || 0;
    
    // Apply sorting
    let orderClause = 'ORDER BY createdAt DESC';
    if (sorting) {
      orderClause = `ORDER BY ${sorting.field} ${sorting.direction}`;
    }
    
    // Apply pagination
    let limitClause = '';
    if (pagination) {
      limitClause = `LIMIT ${pagination.limit} OFFSET ${pagination.offset}`;
    }
    
    const results = await db.getAllAsync(`
      SELECT * FROM photo_batches ${whereClause} ${orderClause} ${limitClause}
    `, params) as any[];
    
    const batches: EnhancedBatch[] = results.map(result => ({
      id: result.id,
      companyId: result.companyId,
      templateId: result.templateId,
      name: result.name,
      description: result.description,
      category: result.category,
      status: result.status,
      priority: result.priority,
      assignedTo: result.assignedTo,
      reviewedBy: result.reviewedBy,
      approvalStatus: result.approvalStatus,
      currentApprovalStage: result.currentApprovalStage,
      metadata: result.metadata ? JSON.parse(result.metadata) : {},
      tags: result.tags ? JSON.parse(result.tags) : [],
      dueDate: result.dueDate,
      completedAt: result.completedAt,
      approvedAt: result.approvedAt,
      rejectedAt: result.rejectedAt,
      rejectionReason: result.rejectionReason,
      photoCount: result.photoCount || 0,
      totalSize: result.totalSize || 0,
      createdBy: result.createdBy,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }));
    
    return { batches, total };
  } catch (error) {
    console.error('[BatchManagement] Error getting enhanced batches:', error);
    return { batches: [], total: 0 };
  }
};

/**
 * Update batch status with workflow validation
 */
export const updateBatchStatus = async (
  batchId: string,
  newStatus: EnhancedBatch['status'],
  comments?: string
): Promise<boolean> => {
  const tenantContext = dataIsolationService.getTenantContext();
  if (!tenantContext) {
    throw new Error('No tenant context');
  }

  try {
    const db = await openDatabase();
    
    // Get current batch
    const batch = await db.getFirstAsync(`
      SELECT * FROM photo_batches WHERE id = ? AND companyId = ?
    `, [batchId, tenantContext.companyId]) as any;
    
    if (!batch) {
      throw new Error('Batch not found');
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      'draft': ['in_progress', 'archived'],
      'in_progress': ['pending_approval', 'completed', 'draft'],
      'pending_approval': ['approved', 'rejected', 'in_progress'],
      'approved': ['completed', 'archived'],
      'rejected': ['in_progress', 'draft'],
      'completed': ['archived'],
      'archived': []
    };

    if (!validTransitions[batch.status]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${batch.status} to ${newStatus}`);
    }

    // Update batch
    const updateFields: string[] = ['status = ?', 'updatedAt = ?'];
    const updateParams: any[] = [newStatus, new Date().toISOString()];

    if (newStatus === 'completed') {
      updateFields.push('completedAt = ?');
      updateParams.push(new Date().toISOString());
    }

    await db.runAsync(`
      UPDATE photo_batches 
      SET ${updateFields.join(', ')}
      WHERE id = ? AND companyId = ?
    `, [...updateParams, batchId, tenantContext.companyId]);

    // Add comment if provided
    if (comments) {
      await addBatchComment(batchId, comments, 'system');
    }

    await dataIsolationService.logTenantOperation('UPDATE', 'batch', batchId, { 
      oldStatus: batch.status, 
      newStatus, 
      comments 
    });

    console.log('[BatchManagement] Batch status updated:', batchId, newStatus);
    return true;
  } catch (error) {
    console.error('[BatchManagement] Error updating batch status:', error);
    return false;
  }
};

/**
 * Add batch comment
 */
export const addBatchComment = async (
  batchId: string,
  comment: string,
  type: BatchComment['type'] = 'general'
): Promise<BatchComment> => {
  const tenantContext = dataIsolationService.getTenantContext();
  if (!tenantContext) {
    throw new Error('No tenant context');
  }

  try {
    const db = await openDatabase();
    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const batchComment: BatchComment = {
      id: commentId,
      batchId,
      userId: tenantContext.userId,
      comment,
      type,
      createdAt: new Date().toISOString()
    };

    await db.runAsync(`
      INSERT INTO batch_comments (id, batchId, userId, comment, type, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      batchComment.id,
      batchComment.batchId,
      batchComment.userId,
      batchComment.comment,
      batchComment.type,
      batchComment.createdAt
    ]);

    console.log('[BatchManagement] Batch comment added:', commentId);
    return batchComment;
  } catch (error) {
    console.error('[BatchManagement] Error adding batch comment:', error);
    throw error;
  }
};

/**
 * Get batch analytics for company
 */
export const getBatchAnalytics = async (companyId: string): Promise<any> => {
  if (!dataIsolationService.validateTenantAccess(companyId)) {
    throw new Error('Access denied');
  }

  try {
    const db = await openDatabase();
    
    const analytics = {
      totalBatches: 0,
      batchesByStatus: {},
      batchesByCategory: {},
      batchesByPriority: {},
      averageCompletionTime: 0,
      pendingApprovals: 0,
      overdueBatches: 0
    };

    // Total batches
    const totalResult = await db.getFirstAsync(`
      SELECT COUNT(*) as count FROM photo_batches WHERE companyId = ?
    `, [companyId]) as any;
    analytics.totalBatches = totalResult?.count || 0;

    // Batches by status
    const statusResults = await db.getAllAsync(`
      SELECT status, COUNT(*) as count 
      FROM photo_batches 
      WHERE companyId = ? 
      GROUP BY status
    `, [companyId]) as any[];
    
    analytics.batchesByStatus = statusResults.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});

    // Batches by category
    const categoryResults = await db.getAllAsync(`
      SELECT category, COUNT(*) as count 
      FROM photo_batches 
      WHERE companyId = ? 
      GROUP BY category
    `, [companyId]) as any[];
    
    analytics.batchesByCategory = categoryResults.reduce((acc, row) => {
      acc[row.category] = row.count;
      return acc;
    }, {});

    // Pending approvals
    const pendingResult = await db.getFirstAsync(`
      SELECT COUNT(*) as count 
      FROM photo_batches 
      WHERE companyId = ? AND approvalStatus = 'pending'
    `, [companyId]) as any;
    analytics.pendingApprovals = pendingResult?.count || 0;

    // Overdue batches
    const overdueResult = await db.getFirstAsync(`
      SELECT COUNT(*) as count 
      FROM photo_batches 
      WHERE companyId = ? AND dueDate < ? AND status NOT IN ('completed', 'archived')
    `, [companyId, new Date().toISOString()]) as any;
    analytics.overdueBatches = overdueResult?.count || 0;

    return analytics;
  } catch (error) {
    console.error('[BatchManagement] Error getting batch analytics:', error);
    return {};
  }
};

export default {
  initializeBatchManagementTables,
  createBatchTemplate,
  getBatchTemplates,
  createBatchFromTemplate,
  getEnhancedBatches,
  updateBatchStatus,
  addBatchComment,
  getBatchAnalytics
};
