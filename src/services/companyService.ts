import { openDatabase } from './databaseService';
import supabaseService from './supabaseService';
import { supabase } from './supabaseService';

/**
 * Company Service - Multi-Tenant Organization Management
 * Handles company/organization structure and data isolation between tenants
 */

export interface Company {
  id: string;
  name: string;
  code: string; // Unique company identifier
  industry: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  settings: CompanySettings;
  subscription: CompanySubscription;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  timezone: string;
  dateFormat: string;
  currency: string;
  language: string;
  photoQuality: 'low' | 'medium' | 'high';
  maxPhotosPerBatch: number;
  autoSync: boolean;
  retentionDays: number;
  allowGuestAccess: boolean;
  requireApproval: boolean;
}

export interface CompanySubscription {
  plan: 'trial' | 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'expired' | 'suspended' | 'cancelled';
  maxUsers: number;
  maxDevices: number;
  maxStorage: number; // in MB
  features: string[];
  expiresAt: string | null;
  billingCycle: 'monthly' | 'yearly';
}

export interface CompanyUser {
  id: string;
  companyId: string;
  userId: string;
  role: 'owner' | 'admin' | 'manager' | 'member' | 'guest';
  permissions: string[];
  department?: string;
  title?: string;
  invitedBy: string;
  joinedAt: string;
  lastActiveAt: string;
  isActive: boolean;
}

export interface CompanyInvitation {
  id: string;
  companyId: string;
  email: string;
  role: 'admin' | 'manager' | 'member' | 'guest';
  permissions: string[];
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  token: string;
}

/**
 * Initialize company-related database tables
 */
export const initializeCompanyTables = async (): Promise<void> => {
  try {
    const db = await openDatabase();
    
    // Companies table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        industry TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        email TEXT,
        website TEXT,
        logoUrl TEXT,
        settings TEXT NOT NULL, -- JSON string
        subscription TEXT NOT NULL, -- JSON string
        isActive INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        syncStatus TEXT DEFAULT 'pending',
        lastSyncAt TEXT,
        version INTEGER DEFAULT 1
      );
    `);

    // Company users table (many-to-many relationship)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS company_users (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        userId TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'member', 'guest')),
        permissions TEXT NOT NULL, -- JSON array
        department TEXT,
        title TEXT,
        invitedBy TEXT NOT NULL,
        joinedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        lastActiveAt TEXT DEFAULT CURRENT_TIMESTAMP,
        isActive INTEGER DEFAULT 1,
        syncStatus TEXT DEFAULT 'pending',
        lastSyncAt TEXT,
        version INTEGER DEFAULT 1,
        FOREIGN KEY (companyId) REFERENCES companies (id) ON DELETE CASCADE,
        UNIQUE(companyId, userId)
      );
    `);

    // Company invitations table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS company_invitations (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'member', 'guest')),
        permissions TEXT NOT NULL, -- JSON array
        invitedBy TEXT NOT NULL,
        invitedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        expiresAt TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
        token TEXT UNIQUE NOT NULL,
        syncStatus TEXT DEFAULT 'pending',
        lastSyncAt TEXT,
        version INTEGER DEFAULT 1,
        FOREIGN KEY (companyId) REFERENCES companies (id) ON DELETE CASCADE
      );
    `);

    // Create indexes for performance
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_companies_code ON companies (code);
      CREATE INDEX IF NOT EXISTS idx_companies_active ON companies (isActive);
      CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users (companyId);
      CREATE INDEX IF NOT EXISTS idx_company_users_user ON company_users (userId);
      CREATE INDEX IF NOT EXISTS idx_company_users_active ON company_users (isActive);
      CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON company_invitations (companyId);
      CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON company_invitations (email);
      CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON company_invitations (token);
      CREATE INDEX IF NOT EXISTS idx_company_invitations_status ON company_invitations (status);
    `);

    console.log('[CompanyService] Company tables initialized successfully');
  } catch (error) {
    console.error('[CompanyService] Error initializing company tables:', error);
    throw error;
  }
};

/**
 * Create a new company
 */
export const createCompany = async (companyData: Omit<Company, 'id' | 'createdAt' | 'updatedAt'>): Promise<Company> => {
  try {
    const db = await openDatabase();
    const companyId = `company_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const company: Company = {
      ...companyData,
      id: companyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.runAsync(`
      INSERT INTO companies (
        id, name, code, industry, address, phone, email, website, logoUrl,
        settings, subscription, isActive, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      company.id,
      company.name,
      company.code,
      company.industry,
      company.address || null,
      company.phone || null,
      company.email || null,
      company.website || null,
      company.logoUrl || null,
      JSON.stringify(company.settings),
      JSON.stringify(company.subscription),
      company.isActive ? 1 : 0,
      company.createdAt,
      company.updatedAt
    ]);

    console.log('[CompanyService] Company created:', company.id);
    return company;
  } catch (error) {
    console.error('[CompanyService] Error creating company:', error);
    throw error;
  }
};



/**
 * Get company by code
 */
export const getCompanyByCode = async (code: string): Promise<Company | null> => {
  try {
    const db = await openDatabase();
    
    const result = await db.getFirstAsync(`
      SELECT * FROM companies WHERE code = ? AND isActive = 1
    `, [code]) as any;
    
    if (!result) {
      return null;
    }
    
    return {
      id: result.id,
      name: result.name,
      code: result.code,
      industry: result.industry,
      address: result.address,
      phone: result.phone,
      email: result.email,
      website: result.website,
      logoUrl: result.logoUrl,
      settings: JSON.parse(result.settings),
      subscription: JSON.parse(result.subscription),
      isActive: result.isActive === 1,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    };
  } catch (error) {
    console.error('[CompanyService] Error getting company by code:', error);
    return null;
  }
};

/**
 * Add user to company
 */
export const addUserToCompany = async (
  companyId: string,
  userId: string,
  role: CompanyUser['role'],
  permissions: string[],
  invitedBy: string,
  department?: string,
  title?: string
): Promise<CompanyUser> => {
  try {
    const db = await openDatabase();
    const companyUserId = `cu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const companyUser: CompanyUser = {
      id: companyUserId,
      companyId,
      userId,
      role,
      permissions,
      department,
      title,
      invitedBy,
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      isActive: true
    };

    await db.runAsync(`
      INSERT INTO company_users (
        id, companyId, userId, role, permissions, department, title,
        invitedBy, joinedAt, lastActiveAt, isActive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      companyUser.id,
      companyUser.companyId,
      companyUser.userId,
      companyUser.role,
      JSON.stringify(companyUser.permissions),
      companyUser.department || null,
      companyUser.title || null,
      companyUser.invitedBy,
      companyUser.joinedAt,
      companyUser.lastActiveAt,
      companyUser.isActive ? 1 : 0
    ]);

    console.log('[CompanyService] User added to company:', companyUserId);
    return companyUser;
  } catch (error) {
    console.error('[CompanyService] Error adding user to company:', error);
    throw error;
  }
};

/**
 * Get user's companies
 */
export const getUserCompanies = async (userId: string): Promise<Company[]> => {
  try {
    console.log('[CompanyService] Getting companies for user:', userId);
    
    // Validate userId
    if (!userId || typeof userId !== 'string') {
      console.error('[CompanyService] Invalid userId provided:', userId);
      return await createDefaultCompanyForUser('temp_user');
    }
    
    // First, try to get user's profile to check for company_id
    const profileResponse = await supabase
      .from('profiles')
      .select('company_id, full_name, email')
      .eq('id', userId)
      .single();
    
    // Check if response exists and handle errors
    if (!profileResponse || profileResponse.error) {
      console.error('[CompanyService] Error fetching user profile:', profileResponse?.error || 'No response');
      return await createDefaultCompanyForUser(userId);
    }
    
    const profileData = profileResponse.data;
    
    // If user has a company_id, try to get the company details
    if (profileData?.company_id) {
      const companyResponse = await supabase
        .from('companies')
        .select('*')
        .eq('id', profileData.company_id)
        .single();
      
      // Check if company response exists and is valid
      if (companyResponse && !companyResponse.error && companyResponse.data) {
        const companyData = companyResponse.data;
        
        const company: Company = {
          id: companyData.id || `temp_${userId}`,
          name: companyData.name || 'Default Company',
          code: companyData.code || 'DEFAULT',
          industry: companyData.industry || 'Aviation',
          address: companyData.address || '',
          phone: companyData.phone || '',
          email: companyData.email || '',
          website: companyData.website || '',
          logoUrl: companyData.logo_url || '',
          settings: getDefaultCompanySettings(),
          subscription: getDefaultCompanySubscription(),
          isActive: true,
          createdAt: companyData.created_at || new Date().toISOString(),
          updatedAt: companyData.updated_at || companyData.created_at || new Date().toISOString()
        };
        
        console.log('[CompanyService] Found existing company:', company.name);
        return [company];
      } else {
        console.warn('[CompanyService] Company not found or error:', companyResponse?.error);
      }
    }
    
    // If no company found or company_id is null, create a default company
    console.log('[CompanyService] No company found, creating default company for user');
    return await createDefaultCompanyForUser(userId, profileData?.full_name, profileData?.email);
    
  } catch (error) {
    console.error('[CompanyService] Error getting user companies:', error);
    return await createDefaultCompanyForUser(userId || 'temp_user');
  }
};

/**
 * Create a default company for a user who doesn't have one
 */
const createDefaultCompanyForUser = async (
  userId: string, 
  userName?: string, 
  userEmail?: string
): Promise<Company[]> => {
  try {
    console.log('[CompanyService] Creating default company for user:', userId);
    
    // Create a default company in Supabase
    const companyName = userName ? `${userName}'s Company` : 'Default Company';
    const companyCode = `USER_${userId.substring(0, 8).toUpperCase()}`;
    
    const companyResponse = await supabase
      .from('companies')
      .insert({
        name: companyName,
        code: companyCode,
        industry: 'Aviation',
        email: userEmail || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    // Check if response exists and handle errors
    if (!companyResponse || companyResponse.error) {
      console.error('[CompanyService] Error creating default company:', companyResponse?.error || 'No response');
      // Return a temporary company object for the session
      return [{
        id: `temp_${userId}`,
        name: companyName,
        code: companyCode,
        industry: 'Aviation',
        address: '',
        phone: '',
        email: userEmail || '',
        website: '',
        logoUrl: '',
        settings: getDefaultCompanySettings(),
        subscription: getDefaultCompanySubscription(),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }];
    }
    
    const newCompany = companyResponse.data;
    
    // Validate that newCompany data exists
    if (!newCompany || !newCompany.id) {
      console.error('[CompanyService] Invalid company data returned from Supabase');
      // Return a temporary company object for the session
      return [{
        id: `temp_${userId}`,
        name: companyName,
        code: companyCode,
        industry: 'Aviation',
        address: '',
        phone: '',
        email: userEmail || '',
        website: '',
        logoUrl: '',
        settings: getDefaultCompanySettings(),
        subscription: getDefaultCompanySubscription(),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }];
    }
    
    // Update user's profile with the new company_id
    await supabase
      .from('profiles')
      .update({ company_id: newCompany.id })
      .eq('id', userId);
    
    // Create default ERP integration permissions for the new company
    try {
      const { createDefaultERPPermissions } = await import('./erpIntegrationPermissionsService');
      await createDefaultERPPermissions(newCompany.id);
      console.log('[CompanyService] Created default ERP permissions for company:', newCompany.id);
    } catch (erpError) {
      console.warn('[CompanyService] Could not create ERP permissions (table may not exist):', erpError);
      // Don't fail company creation if ERP permissions fail
    }
    
    const company: Company = {
      id: newCompany.id,
      name: newCompany.name,
      code: newCompany.code,
      industry: newCompany.industry || 'Aviation',
      address: newCompany.address || '',
      phone: newCompany.phone || '',
      email: newCompany.email || '',
      website: newCompany.website || '',
      logoUrl: newCompany.logo_url || '',
      settings: getDefaultCompanySettings(),
      subscription: getDefaultCompanySubscription(),
      isActive: true,
      createdAt: newCompany.created_at,
      updatedAt: newCompany.updated_at || newCompany.created_at
    };
    
    console.log('[CompanyService] Created new company:', company.name);
    return [company];
    
  } catch (error) {
    console.error('[CompanyService] Error creating default company:', error);
    // Return a fallback temporary company
    return [{
      id: `temp_${userId}`,
      name: userName ? `${userName}'s Company` : 'Default Company',
      code: `USER_${userId.substring(0, 8).toUpperCase()}`,
      industry: 'Aviation',
      address: '',
      phone: '',
      email: userEmail || '',
      website: '',
      logoUrl: '',
      settings: getDefaultCompanySettings(),
      subscription: getDefaultCompanySubscription(),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }];
  }
};



/**
 * Check if user has permission in company
 */
export const hasCompanyPermission = async (
  userId: string,
  companyId: string,
  permission: string
): Promise<boolean> => {
  try {
    const db = await openDatabase();
    
    const result = await db.getFirstAsync(`
      SELECT permissions, role FROM company_users 
      WHERE userId = ? AND companyId = ? AND isActive = 1
    `, [userId, companyId]) as any;
    
    if (!result) {
      return false;
    }
    
    const permissions = JSON.parse(result.permissions) as string[];
    const role = result.role as string;
    
    // Owner and admin have all permissions
    if (role === 'owner' || role === 'admin') {
      return true;
    }
    
    // Check specific permission
    return permissions.includes(permission);
  } catch (error) {
    console.error('[CompanyService] Error checking company permission:', error);
    return false;
  }
};

/**
 * Update company settings
 */
export const updateCompanySettings = async (
  companyId: string,
  settings: Partial<CompanySettings>
): Promise<boolean> => {
  try {
    const db = await openDatabase();
    
    // Get current settings
    const company = await getCompanyById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }
    
    const updatedSettings = { ...company.settings, ...settings };
    
    await db.runAsync(`
      UPDATE companies 
      SET settings = ?, updatedAt = ?
      WHERE id = ?
    `, [
      JSON.stringify(updatedSettings),
      new Date().toISOString(),
      companyId
    ]);
    
    console.log('[CompanyService] Company settings updated:', companyId);
    return true;
  } catch (error) {
    console.error('[CompanyService] Error updating company settings:', error);
    return false;
  }
};

/**
 * Get company by ID
 */
export const getCompanyById = async (companyId: string): Promise<Company | null> => {
  try {
    console.log('[CompanyService] Getting company by ID:', companyId);
    
    const { data: companyData, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    
    if (error) {
      console.error('[CompanyService] Error fetching company:', error);
      return null;
    }
    
    if (!companyData) {
      console.log('[CompanyService] Company not found:', companyId);
      return null;
    }
    
    // Convert to Company format
    const company: Company = {
      id: companyData.id,
      name: companyData.name,
      code: '', // Not in current schema
      industry: '', // Not in current schema
      address: '', // Not in current schema
      phone: '', // Not in current schema
      email: '', // Not in current schema
      website: '', // Not in current schema
      logoUrl: '', // Not in current schema
      settings: {
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        currency: 'USD',
        language: 'en',
        photoQuality: 'medium',
        maxPhotosPerBatch: 50,
        autoSync: true,
        retentionDays: 365,
        allowGuestAccess: false,
        requireApproval: false
      },
      subscription: {
        plan: 'basic',
        status: 'active',
        maxUsers: 10,
        maxDevices: 5,
        maxStorage: 1000,
        features: [],
        expiresAt: null,
        billingCycle: 'monthly'
      },
      isActive: true,
      createdAt: companyData.created_at,
      updatedAt: companyData.created_at
    };
    
    console.log('[CompanyService] Found company:', company.name);
    return company;
    
  } catch (error) {
    console.error('[CompanyService] Error getting company by ID:', error);
    return null;
  }
};

/**
 * Get company users (simplified for current schema)
 */
export const getCompanyUsers = async (companyId: string): Promise<CompanyUser[]> => {
  try {
    console.log('[CompanyService] Getting users for company:', companyId);
    
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('company_id', companyId);
    
    if (error) {
      console.error('[CompanyService] Error fetching company users:', error);
      return [];
    }
    
    // Convert profiles to CompanyUser format
    const companyUsers: CompanyUser[] = profiles.map(profile => ({
      id: `${profile.id}-${companyId}`, // Generate a compound ID
      userId: profile.id,
      companyId: companyId,
      role: profile.role || 'member',
      permissions: [], // Default empty permissions
      isActive: true,
      joinedAt: profile.created_at,
      lastActiveAt: profile.updated_at || profile.created_at,
      invitedBy: '',
      invitedAt: null
    }));
    
    console.log('[CompanyService] Found company users:', companyUsers.length);
    return companyUsers;
    
  } catch (error) {
    console.error('[CompanyService] Error getting company users:', error);
    return [];
  }
};

/**
 * Get default company settings
 */
export const getDefaultCompanySettings = (): CompanySettings => {
  return {
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    currency: 'USD',
    language: 'en',
    photoQuality: 'high',
    maxPhotosPerBatch: 50,
    autoSync: true,
    retentionDays: 365,
    allowGuestAccess: false,
    requireApproval: true
  };
};

/**
 * Get default company subscription
 */
export const getDefaultCompanySubscription = (): CompanySubscription => {
  return {
    plan: 'trial',
    status: 'active',
    maxUsers: 5,
    maxDevices: 10,
    maxStorage: 1024, // 1GB
    features: ['photo_capture', 'basic_reporting', 'cloud_sync'],
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    billingCycle: 'monthly'
  };
};

export default {
  initializeCompanyTables,
  createCompany,
  getCompanyById,
  getCompanyByCode,
  addUserToCompany,
  getUserCompanies,
  getCompanyUsers,
  hasCompanyPermission,
  updateCompanySettings,
  getDefaultCompanySettings,
  getDefaultCompanySubscription
};
