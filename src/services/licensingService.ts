import { openDatabase } from './databaseService';
import supabaseService from './supabaseService';
import { getDeviceInfo } from '../utils/deviceInfo';

/**
 * Licensing Service - Manages user licenses, device registration, and access control
 * Implements single-device enforcement and role-based permissions
 */

export interface LicenseInfo {
  id: string;
  userId: string;
  companyId: string;
  licenseType: 'trial' | 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'expired' | 'suspended' | 'cancelled';
  maxDevices: number;
  activeDevices: number;
  expiresAt: string | null;
  features: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRegistration {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  appVersion: string;
  registeredAt: string;
  lastActiveAt: string;
  isActive: boolean;
}

export interface UserRole {
  userId: string;
  companyId: string;
  role: 'admin' | 'member';
  permissions: string[];
  assignedBy: string;
  assignedAt: string;
}

export interface LicenseValidationResult {
  isValid: boolean;
  license: LicenseInfo | null;
  device: DeviceRegistration | null;
  message: string;
  canUseApp: boolean;
  restrictions: string[];
}

/**
 * Initialize licensing tables in local database
 */
export const initializeLicensingTables = async (): Promise<void> => {
  console.log('[Licensing] Initializing licensing tables...');
  const db = await openDatabase();
  
  try {
    await db.execAsync(`
      -- User licenses table
      CREATE TABLE IF NOT EXISTS user_licenses (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        companyId TEXT NOT NULL,
        licenseType TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        maxDevices INTEGER NOT NULL DEFAULT 1,
        activeDevices INTEGER NOT NULL DEFAULT 0,
        expiresAt TEXT,
        features TEXT NOT NULL, -- JSON array of feature strings
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        syncStatus TEXT DEFAULT 'pending'
      );
      
      -- Device registrations table
      CREATE TABLE IF NOT EXISTS device_registrations (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        deviceId TEXT NOT NULL UNIQUE,
        deviceName TEXT NOT NULL,
        deviceType TEXT NOT NULL,
        platform TEXT NOT NULL,
        appVersion TEXT NOT NULL,
        registeredAt TEXT DEFAULT CURRENT_TIMESTAMP,
        lastActiveAt TEXT DEFAULT CURRENT_TIMESTAMP,
        isActive INTEGER NOT NULL DEFAULT 1,
        syncStatus TEXT DEFAULT 'pending'
      );
      
      -- User roles table
      CREATE TABLE IF NOT EXISTS user_roles (
        userId TEXT NOT NULL,
        companyId TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        permissions TEXT NOT NULL, -- JSON array of permission strings
        assignedBy TEXT NOT NULL,
        assignedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        syncStatus TEXT DEFAULT 'pending',
        PRIMARY KEY (userId, companyId)
      );
      
      -- License validation cache
      CREATE TABLE IF NOT EXISTS license_cache (
        userId TEXT PRIMARY KEY,
        validationData TEXT NOT NULL, -- JSON of validation result
        cachedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        expiresAt TEXT NOT NULL
      );
      
      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_user_licenses_userId ON user_licenses(userId);
      CREATE INDEX IF NOT EXISTS idx_user_licenses_status ON user_licenses(status);
      CREATE INDEX IF NOT EXISTS idx_device_registrations_userId ON device_registrations(userId);
      CREATE INDEX IF NOT EXISTS idx_device_registrations_deviceId ON device_registrations(deviceId);
      CREATE INDEX IF NOT EXISTS idx_user_roles_userId ON user_roles(userId);
      CREATE INDEX IF NOT EXISTS idx_user_roles_companyId ON user_roles(companyId);
    `);
    
    console.log('[Licensing] Licensing tables initialized successfully');
  } catch (error) {
    console.error('[Licensing] Error initializing licensing tables:', error);
    throw error;
  }
};

/**
 * Get current device information
 */
export const getCurrentDevice = async (): Promise<DeviceRegistration | null> => {
  try {
    const deviceInfo = await getDeviceInfo();
    const db = await openDatabase();
    
    const result = await db.getFirstAsync(`
      SELECT * FROM device_registrations 
      WHERE deviceId = ? AND isActive = 1
    `, [deviceInfo.deviceId]) as any;
    
    if (!result) {
      return null;
    }
    
    return {
      id: result.id as string,
      userId: result.userId as string,
      deviceId: result.deviceId as string,
      deviceName: result.deviceName as string,
      deviceType: result.deviceType as string,
      platform: result.platform as string,
      appVersion: result.appVersion as string,
      registeredAt: result.registeredAt as string,
      lastActiveAt: result.lastActiveAt as string,
      isActive: result.isActive === 1
    };
  } catch (error) {
    console.error('[Licensing] Error getting current device:', error);
    return null;
  }
};

/**
 * Register current device for a user
 */
export const registerDevice = async (userId: string): Promise<DeviceRegistration> => {
  console.log(`[Licensing] Registering device for user: ${userId}`);
  
  try {
    const deviceInfo = await getDeviceInfo();
    const db = await openDatabase();
    
    // Check if device is already registered
    const existingDevice = await getCurrentDevice();
    if (existingDevice && existingDevice.userId === userId) {
      // Update last active time
      await db.runAsync(`
        UPDATE device_registrations 
        SET lastActiveAt = ?, syncStatus = 'pending'
        WHERE id = ?
      `, [new Date().toISOString(), existingDevice.id]);
      
      return existingDevice;
    }
    
    // Create new device registration
    const deviceRegistration: DeviceRegistration = {
      id: `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      platform: deviceInfo.platform,
      appVersion: deviceInfo.appVersion,
      registeredAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      isActive: true
    };
    
    await db.runAsync(`
      INSERT INTO device_registrations 
      (id, userId, deviceId, deviceName, deviceType, platform, appVersion, registeredAt, lastActiveAt, isActive, syncStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      deviceRegistration.id,
      deviceRegistration.userId,
      deviceRegistration.deviceId,
      deviceRegistration.deviceName,
      deviceRegistration.deviceType,
      deviceRegistration.platform,
      deviceRegistration.appVersion,
      deviceRegistration.registeredAt,
      deviceRegistration.lastActiveAt,
      deviceRegistration.isActive ? 1 : 0,
      'pending'
    ]);
    
    console.log(`[Licensing] Device registered successfully: ${deviceRegistration.id}`);
    return deviceRegistration;
  } catch (error) {
    console.error('[Licensing] Error registering device:', error);
    throw error;
  }
};

/**
 * Get user license information
 */
export const getUserLicense = async (userId: string): Promise<LicenseInfo | null> => {
  try {
    const db = await openDatabase();
    
    const result = await db.getFirstAsync(`
      SELECT * FROM user_licenses 
      WHERE userId = ? AND status = 'active'
      ORDER BY createdAt DESC
      LIMIT 1
    `, [userId]) as any;
    
    if (!result) {
      return null;
    }
    
    return {
      id: result.id as string,
      userId: result.userId as string,
      companyId: result.companyId as string,
      licenseType: result.licenseType as 'trial' | 'basic' | 'premium' | 'enterprise',
      status: result.status as 'active' | 'expired' | 'suspended' | 'cancelled',
      maxDevices: result.maxDevices as number,
      activeDevices: result.activeDevices as number,
      expiresAt: result.expiresAt as string | null,
      features: JSON.parse(result.features as string),
      createdAt: result.createdAt as string,
      updatedAt: result.updatedAt as string
    };
  } catch (error) {
    console.error('[Licensing] Error getting user license:', error);
    return null;
  }
};

/**
 * Create a new license for a user
 */
export const createUserLicense = async (
  userId: string,
  companyId: string,
  licenseType: 'trial' | 'basic' | 'premium' | 'enterprise',
  maxDevices: number = 1,
  expiresAt: string | null = null
): Promise<LicenseInfo> => {
  console.log(`[Licensing] Creating license for user: ${userId}, type: ${licenseType}`);
  
  try {
    const db = await openDatabase();
    
    // Define features based on license type
    const features = getLicenseFeatures(licenseType);
    
    const license: LicenseInfo = {
      id: `license_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      companyId,
      licenseType,
      status: 'active',
      maxDevices,
      activeDevices: 0,
      expiresAt,
      features,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await db.runAsync(`
      INSERT INTO user_licenses 
      (id, userId, companyId, licenseType, status, maxDevices, activeDevices, expiresAt, features, createdAt, updatedAt, syncStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      license.id,
      license.userId,
      license.companyId,
      license.licenseType,
      license.status,
      license.maxDevices,
      license.activeDevices,
      license.expiresAt,
      JSON.stringify(license.features),
      license.createdAt,
      license.updatedAt,
      'pending'
    ]);
    
    console.log(`[Licensing] License created successfully: ${license.id}`);
    return license;
  } catch (error) {
    console.error('[Licensing] Error creating user license:', error);
    throw error;
  }
};

/**
 * Get license features based on license type
 */
export const getLicenseFeatures = (licenseType: string): string[] => {
  const baseFeatures = ['photo_capture', 'local_storage', 'basic_sync'];
  
  switch (licenseType) {
    case 'trial':
      return [...baseFeatures, 'limited_batches'];
    case 'basic':
      return [...baseFeatures, 'unlimited_batches', 'cloud_storage'];
    case 'premium':
      return [...baseFeatures, 'unlimited_batches', 'cloud_storage', 'advanced_analytics', 'priority_support'];
    case 'enterprise':
      return [...baseFeatures, 'unlimited_batches', 'cloud_storage', 'advanced_analytics', 'priority_support', 'multi_tenant', 'api_access', 'custom_integrations'];
    default:
      return baseFeatures;
  }
};

/**
 * Validate user license and device registration
 */
export const validateLicense = async (userId: string): Promise<LicenseValidationResult> => {
  console.log(`[Licensing] Validating license for user: ${userId}`);
  
  try {
    // Check cache first
    const deviceInfo = await getDeviceInfo();
    const cachedResult = await getCachedValidation(userId, deviceInfo.deviceId);
    if (cachedResult) {
      console.log('[Licensing] Using cached validation result');
      return cachedResult;
    }
    
    // Get user license
    const license = await getUserLicense(userId);
    if (!license) {
      return {
        isValid: false,
        license: null,
        device: null,
        message: 'No valid license found',
        canUseApp: false,
        restrictions: ['no_license']
      };
    }
    
    // Check license expiration
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      return {
        isValid: false,
        license,
        device: null,
        message: 'License has expired',
        canUseApp: false,
        restrictions: ['license_expired']
      };
    }
    
    // Get current device
    const device = await getCurrentDevice();
    if (!device) {
      return {
        isValid: false,
        license,
        device: null,
        message: 'Device not registered',
        canUseApp: false,
        restrictions: ['device_not_registered']
      };
    }
    
    // Check device limit
    const activeDeviceCount = await getActiveDeviceCount(userId);
    if (activeDeviceCount > license.maxDevices) {
      return {
        isValid: false,
        license,
        device,
        message: `Too many active devices (${activeDeviceCount}/${license.maxDevices})`,
        canUseApp: false,
        restrictions: ['device_limit_exceeded']
      };
    }
    
    // All checks passed
    const result: LicenseValidationResult = {
      isValid: true,
      license,
      device,
      message: 'License valid',
      canUseApp: true,
      restrictions: []
    };
    
    // Cache the result
    await cacheValidationResult(userId, result);
    
    console.log(`[Licensing] License validation successful for user: ${userId}`);
    return result;
  } catch (error) {
    console.error('[Licensing] Error validating license:', error);
    return {
      isValid: false,
      license: null,
      device: null,
      message: `Validation error: ${error}`,
      canUseApp: false,
      restrictions: ['validation_error']
    };
  }
};

/**
 * Get active device count for a user
 */
export const getActiveDeviceCount = async (userId: string): Promise<number> => {
  try {
    const db = await openDatabase();
    
    const result = await db.getFirstAsync(`
      SELECT COUNT(*) as count 
      FROM device_registrations 
      WHERE userId = ? AND isActive = 1
    `, [userId]) as any;
    
    return (result?.count as number) || 0;
  } catch (error) {
    console.error('[Licensing] Error getting active device count:', error);
    return 0;
  }
};

/**
 * Get cached license validation result
 */
const getCachedValidation = async (userId: string, deviceId: string): Promise<LicenseValidationResult | null> => {
  try {
    const db = await openDatabase();
    
    const cached = await db.getFirstAsync(`
      SELECT validationData FROM license_validation_cache 
      WHERE userId = ? AND deviceId = ? AND expiresAt > datetime('now')
    `, [userId, deviceId]) as any;
    
    if (cached) {
      return JSON.parse(cached.validationData as string);
    }
    return null;
  } catch (error) {
    console.error('[Licensing] Error getting cached validation:', error);
    return null;
  }
};

/**
 * Cache validation result
 */
const cacheValidationResult = async (userId: string, result: LicenseValidationResult): Promise<void> => {
  try {
    const db = await openDatabase();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
    
    await db.runAsync(`
      INSERT OR REPLACE INTO license_cache 
      (userId, validationData, cachedAt, expiresAt)
      VALUES (?, ?, ?, ?)
    `, [userId, JSON.stringify(result), new Date().toISOString(), expiresAt]);
  } catch (error) {
    console.error('[Licensing] Error caching validation result:', error);
  }
};

/**
 * Get user role and permissions
 */
export const getUserRole = async (userId: string, companyId: string): Promise<UserRole | null> => {
  try {
    const db = await openDatabase();
    
    const result = await db.getFirstAsync(`
      SELECT * FROM user_roles 
      WHERE userId = ? AND companyId = ?
    `, [userId, companyId]) as any;
    
    if (!result) {
      return null;
    }
    
    return {
      userId: result.userId as string,
      companyId: result.companyId as string,
      role: result.role as 'admin' | 'member',
      permissions: JSON.parse(result.permissions as string),
      assignedBy: result.assignedBy as string,
      assignedAt: result.assignedAt as string
    };
  } catch (error) {
    console.error('[Licensing] Error getting user role:', error);
    return null;
  }
};

/**
 * Assign role to user
 */
export const assignUserRole = async (
  userId: string,
  companyId: string,
  role: 'admin' | 'member',
  assignedBy: string
): Promise<UserRole> => {
  console.log(`[Licensing] Assigning role ${role} to user: ${userId}`);
  
  try {
    const db = await openDatabase();
    
    // Define permissions based on role
    const permissions = getRolePermissions(role);
    
    const userRole: UserRole = {
      userId,
      companyId,
      role,
      permissions,
      assignedBy,
      assignedAt: new Date().toISOString()
    };
    
    await db.runAsync(`
      INSERT OR REPLACE INTO user_roles 
      (userId, companyId, role, permissions, assignedBy, assignedAt, syncStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userRole.userId,
      userRole.companyId,
      userRole.role,
      JSON.stringify(userRole.permissions),
      userRole.assignedBy,
      userRole.assignedAt,
      'pending'
    ]);
    
    console.log(`[Licensing] Role assigned successfully: ${role} for user ${userId}`);
    return userRole;
  } catch (error) {
    console.error('[Licensing] Error assigning user role:', error);
    throw error;
  }
};

/**
 * Get role permissions
 */
export const getRolePermissions = (role: string): string[] => {
  switch (role) {
    case 'admin':
      return [
        'manage_users',
        'manage_licenses',
        'view_analytics',
        'manage_company',
        'export_data',
        'manage_integrations',
        'view_all_batches',
        'delete_batches'
      ];
    case 'member':
      return [
        'create_batches',
        'view_own_batches',
        'upload_photos',
        'basic_analytics'
      ];
    default:
      return ['create_batches', 'view_own_batches'];
  }
};

/**
 * Check if user has specific permission
 */
export const hasPermission = async (userId: string, companyId: string, permission: string): Promise<boolean> => {
  try {
    const userRole = await getUserRole(userId, companyId);
    if (!userRole) {
      return false;
    }
    
    return userRole.permissions.includes(permission);
  } catch (error) {
    console.error('[Licensing] Error checking permission:', error);
    return false;
  }
};

/**
 * Sync licensing data with Supabase
 */
export const syncLicensingData = async (userId: string): Promise<void> => {
  console.log(`[Licensing] Syncing licensing data for user: ${userId}`);
  
  try {
    // This would integrate with supabaseService to sync licensing data
    // Implementation depends on Supabase schema structure
    console.log('[Licensing] Licensing data sync completed');
  } catch (error) {
    console.error('[Licensing] Error syncing licensing data:', error);
    throw error;
  }
};

export default {
  initializeLicensingTables,
  getCurrentDevice,
  registerDevice,
  getUserLicense,
  createUserLicense,
  getLicenseFeatures,
  validateLicense,
  getActiveDeviceCount,
  getUserRole,
  assignUserRole,
  getRolePermissions,
  hasPermission,
  syncLicensingData
};
