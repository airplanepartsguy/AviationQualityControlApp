/**
 * Admin Service - Real Supabase API Integration
 * Provides admin functionality for managing users, licenses, and device registrations
 */

import supabaseService from './supabaseService';
import licensingService from './licensingService';
import { openDatabase } from './databaseService';

export interface UserLicenseInfo {
  userId: string;
  email: string;
  fullName: string;
  licenseType: 'trial' | 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'expired' | 'suspended' | 'cancelled';
  activeDevices: number;
  maxDevices: number;
  expiresAt: string | null;
  role: 'admin' | 'member';
  createdAt: string;
  lastActiveAt: string | null;
  companyId: string | null;
}

export interface DeviceInfo {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  lastActiveAt: string;
  isActive: boolean;
  userEmail: string;
  registeredAt: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalDevices: number;
  activeDevices: number;
  licenseDistribution: {
    trial: number;
    basic: number;
    premium: number;
    enterprise: number;
  };
}

class AdminService {
  /**
   * Get all users with their license and device information
   */
  async getAllUsers(): Promise<UserLicenseInfo[]> {
    try {
      console.log('[AdminService] Fetching all users...');
      
      // Get all profiles from Supabase
      const { data: profiles, error: profilesError } = await supabaseService.supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          created_at,
          updated_at,
          company_id
        `);

      if (profilesError) {
        console.error('[AdminService] Error fetching profiles:', profilesError);
        throw profilesError;
      }

      if (!profiles || profiles.length === 0) {
        console.log('[AdminService] No profiles found');
        return [];
      }

      // Get license information for each user
      const usersWithLicenses: UserLicenseInfo[] = [];
      
      for (const profile of profiles) {
        try {
          // Get user license
          const license = await licensingService.getUserLicense(profile.id);
          
          // Get active device count
          const deviceCount = await licensingService.getActiveDeviceCount(profile.id);
          
          // Get user role (default to member if not found)
          const userRole = await this.getUserRole(profile.id);
          
          const userInfo: UserLicenseInfo = {
            userId: profile.id,
            email: profile.email || 'No email',
            fullName: profile.full_name || 'Unknown User',
            licenseType: license?.licenseType || 'trial',
            status: license?.status || 'active',
            activeDevices: deviceCount,
            maxDevices: this.getMaxDevicesForLicense(license?.licenseType || 'trial'),
            expiresAt: license?.expiresAt || null,
            role: userRole,
            createdAt: profile.created_at,
            lastActiveAt: profile.updated_at,
            companyId: profile.company_id
          };
          
          usersWithLicenses.push(userInfo);
        } catch (error) {
          console.error(`[AdminService] Error processing user ${profile.id}:`, error);
          // Continue with next user instead of failing completely
        }
      }

      console.log(`[AdminService] Successfully fetched ${usersWithLicenses.length} users`);
      return usersWithLicenses;
      
    } catch (error) {
      console.error('[AdminService] Error in getAllUsers:', error);
      throw error;
    }
  }

  /**
   * Get all registered devices
   */
  async getAllDevices(): Promise<DeviceInfo[]> {
    try {
      console.log('[AdminService] Fetching all devices...');
      
      // Get all device registrations from local database
      const devices = await this.getAllDeviceRegistrations();
      
      // Get user emails for each device
      const devicesWithUserInfo: DeviceInfo[] = [];
      
      for (const device of devices) {
        try {
          // Get user profile for email
          const { data: profile } = await supabaseService.supabase
            .from('profiles')
            .select('email')
            .eq('id', device.userId)
            .single();

          const deviceInfo: DeviceInfo = {
            id: device.id,
            userId: device.userId,
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            platform: device.platform,
            lastActiveAt: device.lastActiveAt,
            isActive: device.isActive,
            userEmail: profile?.email || 'Unknown',
            registeredAt: device.registeredAt
          };
          
          devicesWithUserInfo.push(deviceInfo);
        } catch (error) {
          console.error(`[AdminService] Error processing device ${device.id}:`, error);
        }
      }

      console.log(`[AdminService] Successfully fetched ${devicesWithUserInfo.length} devices`);
      return devicesWithUserInfo;
      
    } catch (error) {
      console.error('[AdminService] Error in getAllDevices:', error);
      throw error;
    }
  }

  /**
   * Get admin statistics
   */
  async getAdminStats(): Promise<AdminStats> {
    try {
      console.log('[AdminService] Fetching admin statistics...');
      
      const users = await this.getAllUsers();
      const devices = await this.getAllDevices();
      
      const stats: AdminStats = {
        totalUsers: users.length,
        activeUsers: users.filter(u => u.status === 'active').length,
        totalDevices: devices.length,
        activeDevices: devices.filter(d => d.isActive).length,
        licenseDistribution: {
          trial: users.filter(u => u.licenseType === 'trial').length,
          basic: users.filter(u => u.licenseType === 'basic').length,
          premium: users.filter(u => u.licenseType === 'premium').length,
          enterprise: users.filter(u => u.licenseType === 'enterprise').length
        }
      };

      console.log('[AdminService] Admin stats:', stats);
      return stats;
      
    } catch (error) {
      console.error('[AdminService] Error in getAdminStats:', error);
      throw error;
    }
  }

  /**
   * Create a new user (admin function)
   */
  async createUser(email: string, role: 'admin' | 'member', licenseType: 'trial' | 'basic' | 'premium' | 'enterprise'): Promise<void> {
    try {
      console.log('[AdminService] Creating user:', { email, role, licenseType });
      
      // Create user via Supabase Auth
      const { data: authData, error: authError } = await supabaseService.supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          role,
          licenseType
        }
      });

      if (authError) {
        console.error('[AdminService] Error creating auth user:', authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Failed to create user - no user data returned');
      }

      // Create license for the user (assuming default companyId for now)
      await licensingService.createUserLicense(authData.user.id, 'default-company', licenseType);
      
      // Set user role
      await this.setUserRole(authData.user.id, role);
      
      console.log('[AdminService] User created successfully:', authData.user.id);
      
    } catch (error) {
      console.error('[AdminService] Error in createUser:', error);
      throw error;
    }
  }

  /**
   * Suspend a user
   */
  async suspendUser(userId: string): Promise<void> {
    try {
      console.log('[AdminService] Suspending user:', userId);
      
      // Update license status to suspended
      await this.updateLicenseStatus(userId, 'suspended');
      
      // Revoke all active devices for this user
      const devices = await this.getUserDevices(userId);
      for (const device of devices) {
        if (device.isActive) {
          await this.revokeDeviceInternal(device.id);
        }
      }
      
      console.log('[AdminService] User suspended successfully:', userId);
      
    } catch (error) {
      console.error('[AdminService] Error in suspendUser:', error);
      throw error;
    }
  }

  /**
   * Activate a suspended user
   */
  async activateUser(userId: string): Promise<void> {
    try {
      console.log('[AdminService] Activating user:', userId);
      
      // Update license status to active
      await this.updateLicenseStatus(userId, 'active');
      
      console.log('[AdminService] User activated successfully:', userId);
      
    } catch (error) {
      console.error('[AdminService] Error in activateUser:', error);
      throw error;
    }
  }

  /**
   * Revoke a device registration
   */
  async revokeDevice(deviceId: string): Promise<void> {
    try {
      console.log('[AdminService] Revoking device:', deviceId);
      
      await this.revokeDeviceInternal(deviceId);
      
      console.log('[AdminService] Device revoked successfully:', deviceId);
      
    } catch (error) {
      console.error('[AdminService] Error in revokeDevice:', error);
      throw error;
    }
  }

  /**
   * Get all device registrations from database
   */
  private async getAllDeviceRegistrations(): Promise<any[]> {
    try {
      const db = await openDatabase();
      const result = await db.getAllAsync(`
        SELECT * FROM device_registrations 
        ORDER BY registeredAt DESC
      `);
      return result || [];
    } catch (error) {
      console.error('[AdminService] Error getting all device registrations:', error);
      return [];
    }
  }

  /**
   * Update license status for a user
   */
  private async updateLicenseStatus(userId: string, status: 'active' | 'suspended' | 'expired' | 'cancelled'): Promise<void> {
    try {
      const db = await openDatabase();
      await db.runAsync(`
        UPDATE user_licenses 
        SET status = ?, updatedAt = CURRENT_TIMESTAMP 
        WHERE userId = ?
      `, [status, userId]);
    } catch (error) {
      console.error('[AdminService] Error updating license status:', error);
      throw error;
    }
  }

  /**
   * Get all devices for a specific user
   */
  private async getUserDevices(userId: string): Promise<any[]> {
    try {
      const db = await openDatabase();
      const result = await db.getAllAsync(`
        SELECT * FROM device_registrations 
        WHERE userId = ? 
        ORDER BY registeredAt DESC
      `, [userId]);
      return result || [];
    } catch (error) {
      console.error('[AdminService] Error getting user devices:', error);
      return [];
    }
  }

  /**
   * Revoke a specific device (internal implementation)
   */
  private async revokeDeviceInternal(deviceId: string): Promise<void> {
    try {
      const db = await openDatabase();
      await db.runAsync(`
        UPDATE device_registrations 
        SET isActive = 0, lastActiveAt = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [deviceId]);
    } catch (error) {
      console.error('[AdminService] Error revoking device:', error);
      throw error;
    }
  }

  /**
   * Get user role from database
   */
  private async getUserRole(userId: string): Promise<'admin' | 'member'> {
    try {
      const role = await licensingService.getUserRole(userId, 'default-company');
      return role?.role || 'member';
    } catch (error) {
      console.error('[AdminService] Error getting user role:', error);
      return 'member';
    }
  }

  /**
   * Set user role in database
   */
  private async setUserRole(userId: string, role: 'admin' | 'member'): Promise<void> {
    try {
      const currentUser = await supabaseService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No authenticated user found');
      }
      await licensingService.assignUserRole(userId, 'default-company', role, currentUser.id);
    } catch (error) {
      console.error('[AdminService] Error setting user role:', error);
      throw error;
    }
  }

  /**
   * Get maximum devices allowed for license type
   */
  private getMaxDevicesForLicense(licenseType: string): number {
    switch (licenseType) {
      case 'trial':
        return 1;
      case 'basic':
        return 2;
      case 'premium':
        return 5;
      case 'enterprise':
        return 10;
      default:
        return 1;
    }
  }

  /**
   * Check if current user has admin privileges
   */
  async isCurrentUserAdmin(): Promise<boolean> {
    try {
      const currentUser = await supabaseService.getCurrentUser();
      if (!currentUser) {
        return false;
      }
      
      const role = await this.getUserRole(currentUser.id);
      return role === 'admin';
      
    } catch (error) {
      console.error('[AdminService] Error checking admin status:', error);
      return false;
    }
  }
}

// Export singleton instance
const adminService = new AdminService();
export default adminService;
