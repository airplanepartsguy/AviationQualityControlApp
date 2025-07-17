/**
 * User Profile Service - Fetches real user data from Supabase
 * Replaces placeholder data with actual user information
 */

import supabaseService from './supabaseService';
import { openDatabase } from './databaseService';
import licensingService from './licensingService';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  company: string;
  role: string;
  licenseType: string;
  deviceCount: number;
  maxDevices: number;
  avatar?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface CompanyInfo {
  id: string;
  name: string;
  industry: string;
  size: string;
  createdAt: string;
}

/**
 * Fetch complete user profile with real data from Supabase
 */
export const fetchCompleteUserProfile = async (): Promise<UserProfile | null> => {
  try {
    console.log('[UserProfileService] Fetching complete user profile...');
    
    // Get authenticated user
    const user = await supabaseService.getCurrentUser();
    if (!user) {
      console.log('[UserProfileService] No authenticated user found');
      return null;
    }

    // Get user profile from Supabase profiles table
    const { data: profileData, error: profileError } = await supabaseService.supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[UserProfileService] Profile fetch error:', profileError);
    }

    // Get company information
    let companyInfo: CompanyInfo | null = null;
    if (profileData?.company_id) {
      const { data: companyData, error: companyError } = await supabaseService.supabase
        .from('companies')
        .select('*')
        .eq('id', profileData.company_id)
        .single();

      if (companyError) {
        console.error('[UserProfileService] Company fetch error:', companyError);
      } else {
        companyInfo = companyData;
      }
    }

    // Get license information
    const licenseInfo = await licensingService.getUserLicense(user.id);
    const deviceCount = await licensingService.getActiveDeviceCount(user.id);

    // Get user role
    const userRole = profileData?.company_id 
      ? await licensingService.getUserRole(user.id, profileData.company_id)
      : null;

    // Construct complete profile with real data
    const completeProfile: UserProfile = {
      id: user.id,
      email: user.email || 'No email provided',
      name: profileData?.full_name || 
            user.user_metadata?.full_name || 
            user.user_metadata?.name || 
            extractNameFromEmail(user.email || ''),
      company: companyInfo?.name || 
               profileData?.company || 
               'Aviation Quality Control',
      role: userRole?.role || 
            profileData?.role || 
            'Member',
      licenseType: licenseInfo?.licenseType || 'basic',
      deviceCount: deviceCount || 1,
      maxDevices: licenseInfo?.maxDevices || 5,
      avatar: profileData?.avatar_url || user.user_metadata?.avatar_url,
      createdAt: user.created_at || new Date().toISOString(),
      lastLoginAt: user.last_sign_in_at || new Date().toISOString()
    };

    console.log('[UserProfileService] Complete profile fetched:', {
      name: completeProfile.name,
      company: completeProfile.company,
      role: completeProfile.role,
      licenseType: completeProfile.licenseType
    });

    return completeProfile;

  } catch (error) {
    console.error('[UserProfileService] Failed to fetch complete profile:', error);
    return null;
  }
};

/**
 * Extract name from email address as fallback
 */
const extractNameFromEmail = (email: string): string => {
  if (!email) return 'User';
  
  const localPart = email.split('@')[0];
  const name = localPart
    .replace(/[._-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return name || 'User';
};

/**
 * Update user profile in Supabase
 */
export const updateUserProfile = async (updates: Partial<UserProfile>): Promise<boolean> => {
  try {
    console.log('[UserProfileService] Updating user profile:', updates);
    
    const user = await supabaseService.getCurrentUser();
    if (!user) {
      throw new Error('No authenticated user');
    }

    // Update profiles table in Supabase
    const { error } = await supabaseService.supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: updates.name,
        company: updates.company,
        role: updates.role,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('[UserProfileService] Profile update error:', error);
      return false;
    }

    // Update local database
    const db = await openDatabase();
    await db.runAsync(`
      INSERT OR REPLACE INTO user_profiles 
      (userId, full_name, company, role, updated_at, syncStatus)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      user.id,
      updates.name || '',
      updates.company || '',
      updates.role || '',
      new Date().toISOString(),
      'synced'
    ]);

    console.log('[UserProfileService] Profile updated successfully');
    return true;

  } catch (error) {
    console.error('[UserProfileService] Profile update failed:', error);
    return false;
  }
};

/**
 * Get company information by ID
 */
export const getCompanyInfo = async (companyId: string): Promise<CompanyInfo | null> => {
  try {
    const { data, error } = await supabaseService.supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (error) {
      console.error('[UserProfileService] Company fetch error:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[UserProfileService] Get company info failed:', error);
    return null;
  }
};

/**
 * Get user's device information with real data
 */
export const getUserDeviceInfo = async (): Promise<{
  currentDevice: any;
  totalDevices: number;
  maxDevices: number;
  deviceList: any[];
}> => {
  try {
    const user = await supabaseService.getCurrentUser();
    if (!user) {
      throw new Error('No authenticated user');
    }

    const currentDevice = await licensingService.getCurrentDevice();
    const totalDevices = await licensingService.getActiveDeviceCount(user.id);
    const license = await licensingService.getUserLicense(user.id);
    
    // Get all user devices from local database
    const db = await openDatabase();
    const deviceList = await db.getAllAsync(
      'SELECT * FROM device_registrations WHERE userId = ? AND isActive = 1',
      [user.id]
    ) as any[];

    return {
      currentDevice,
      totalDevices,
      maxDevices: license?.maxDevices || 5,
      deviceList
    };

  } catch (error) {
    console.error('[UserProfileService] Get device info failed:', error);
    return {
      currentDevice: null,
      totalDevices: 1,
      maxDevices: 5,
      deviceList: []
    };
  }
};

export default {
  fetchCompleteUserProfile,
  updateUserProfile,
  getCompanyInfo,
  getUserDeviceInfo,
  extractNameFromEmail
};
