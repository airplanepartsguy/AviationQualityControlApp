import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Company, CompanyUser } from '../services/companyService';
import companyService from '../services/companyService';
import dataIsolationService from '../services/dataIsolationService';
import { useAuth } from './AuthContext';

/**
 * Company Context - Multi-Tenant State Management
 * Manages current company selection and user permissions within companies
 */

interface CompanyContextType {
  // Current company state
  currentCompany: Company | null;
  currentCompanyUser: CompanyUser | null;
  userCompanies: Company[];
  
  // Loading states
  isLoading: boolean;
  isLoadingCompanies: boolean;
  
  // Actions
  switchCompany: (companyId: string) => Promise<boolean>;
  refreshCompanies: () => Promise<void>;
  refreshCurrentCompany: () => Promise<void>;
  
  // Permissions
  hasPermission: (permission: string) => boolean;
  isAdmin: () => boolean;
  isOwner: () => boolean;
  canManageUsers: () => boolean;
  canManageBatches: () => boolean;
  canViewReports: () => boolean;
  
  // Company info
  getCompanySettings: () => any;
  getSubscriptionInfo: () => any;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

interface CompanyProviderProps {
  children: ReactNode;
}

export const CompanyProvider: React.FC<CompanyProviderProps> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  
  // State
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [currentCompanyUser, setCurrentCompanyUser] = useState<CompanyUser | null>(null);
  const [userCompanies, setUserCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  /**
   * Load user's companies
   */
  const loadUserCompanies = async (): Promise<void> => {
    if (!user?.id) return;
    
    setIsLoadingCompanies(true);
    try {
      const companies = await companyService.getUserCompanies(user.id);
      setUserCompanies(companies);
      
      // If no current company is set and we have companies, set the first one
      if (!currentCompany && companies.length > 0) {
        await switchCompany(companies[0].id);
      }
    } catch (error) {
      console.error('[CompanyContext] Error loading user companies:', error);
    } finally {
      setIsLoadingCompanies(false);
    }
  };

  /**
   * Switch to a different company
   */
  const switchCompany = async (companyId: string): Promise<boolean> => {
    if (!user?.id) return false;
    
    setIsLoading(true);
    try {
      // Get company details
      const company = await companyService.getCompanyById(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      // Get user's role in this company
      const companyUsers = await companyService.getCompanyUsers(companyId);
      const companyUser = companyUsers.find(cu => cu.userId === user.id);
      
      if (!companyUser || !companyUser.isActive) {
        throw new Error('User not authorized for this company');
      }

      // Set tenant context for data isolation
      dataIsolationService.setTenantContext({
        userId: user.id,
        companyId: companyId,
        role: companyUser.role,
        permissions: companyUser.permissions
      });

      // Update state
      setCurrentCompany(company);
      setCurrentCompanyUser(companyUser);
      
      console.log('[CompanyContext] Switched to company:', company.name, companyUser.role);
      return true;
    } catch (error) {
      console.error('[CompanyContext] Error switching company:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Refresh companies list
   */
  const refreshCompanies = async (): Promise<void> => {
    await loadUserCompanies();
  };

  /**
   * Refresh current company data
   */
  const refreshCurrentCompany = async (): Promise<void> => {
    if (currentCompany) {
      const updated = await companyService.getCompanyById(currentCompany.id);
      if (updated) {
        setCurrentCompany(updated);
      }
    }
  };

  /**
   * Check if user has specific permission
   */
  const hasPermission = (permission: string): boolean => {
    if (!currentCompanyUser) return false;
    
    const { role, permissions } = currentCompanyUser;
    
    // Owner and admin have all permissions
    if (role === 'owner' || role === 'admin') {
      return true;
    }
    
    // Check specific permission
    return permissions.includes(permission) || permissions.includes('*');
  };

  /**
   * Check if user is admin
   */
  const isAdmin = (): boolean => {
    return currentCompanyUser?.role === 'admin' || currentCompanyUser?.role === 'owner';
  };

  /**
   * Check if user is owner
   */
  const isOwner = (): boolean => {
    return currentCompanyUser?.role === 'owner';
  };

  /**
   * Check if user can manage users
   */
  const canManageUsers = (): boolean => {
    return hasPermission('manage_users') || isAdmin();
  };

  /**
   * Check if user can manage batches
   */
  const canManageBatches = (): boolean => {
    return hasPermission('manage_batches') || hasPermission('create_batches');
  };

  /**
   * Check if user can view reports
   */
  const canViewReports = (): boolean => {
    return hasPermission('view_reports') || isAdmin();
  };

  /**
   * Get company settings
   */
  const getCompanySettings = () => {
    return currentCompany?.settings || {};
  };

  /**
   * Get subscription info
   */
  const getSubscriptionInfo = () => {
    return currentCompany?.subscription || {};
  };

  // Load companies when user changes
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      loadUserCompanies();
    } else {
      // Clear state when user logs out
      setCurrentCompany(null);
      setCurrentCompanyUser(null);
      setUserCompanies([]);
      dataIsolationService.clearTenantContext();
    }
  }, [isAuthenticated, user?.id]);

  // Context value
  const contextValue: CompanyContextType = {
    // State
    currentCompany,
    currentCompanyUser,
    userCompanies,
    isLoading,
    isLoadingCompanies,
    
    // Actions
    switchCompany,
    refreshCompanies,
    refreshCurrentCompany,
    
    // Permissions
    hasPermission,
    isAdmin,
    isOwner,
    canManageUsers,
    canManageBatches,
    canViewReports,
    
    // Company info
    getCompanySettings,
    getSubscriptionInfo
  };

  return (
    <CompanyContext.Provider value={contextValue}>
      {children}
    </CompanyContext.Provider>
  );
};

/**
 * Hook to use company context
 */
export const useCompany = (): CompanyContextType => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

/**
 * Hook to get current company (with null check)
 */
export const useCurrentCompany = (): Company | null => {
  const { currentCompany } = useCompany();
  return currentCompany;
};

/**
 * Hook to check permissions
 */
export const useCompanyPermissions = () => {
  const { 
    hasPermission, 
    isAdmin, 
    isOwner, 
    canManageUsers, 
    canManageBatches, 
    canViewReports 
  } = useCompany();
  
  return {
    hasPermission,
    isAdmin,
    isOwner,
    canManageUsers,
    canManageBatches,
    canViewReports
  };
};

export default CompanyContext;
