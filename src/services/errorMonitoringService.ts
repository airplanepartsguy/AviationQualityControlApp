/**
 * Error Monitoring Service
 * Centralized error logging and monitoring for Salesforce integration
 */

import { supabase } from './supabaseService';
import { logErrorToFile } from './analyticsService';

export interface IntegrationError {
  id?: string;
  company_id: string;
  error_type: 'oauth' | 'token_refresh' | 'upload' | 'mapping' | 'network' | 'unknown';
  error_message: string;
  error_details?: any;
  component: string;
  user_id?: string;
  batch_id?: string | number; // BIGINT comes as string in JSON, but allow number too
  created_at?: string;
}

class ErrorMonitoringService {
  private errorQueue: IntegrationError[] = [];
  private isOnline: boolean = true;

  /**
   * Log an integration error
   */
  async logIntegrationError(error: IntegrationError): Promise<void> {
    try {
      console.error(`[ErrorMonitoring] ${error.component}: ${error.error_message}`, error.error_details);
      
      // Add to queue
      this.errorQueue.push({
        ...error,
        created_at: new Date().toISOString()
      });
      
      // Try to send to Supabase
      if (this.isOnline) {
        await this.flushErrorQueue();
      }
      
      // Also log to file for offline analysis
      logErrorToFile(`integration_${error.error_type}`, new Error(error.error_message));
    } catch (err) {
      console.error('[ErrorMonitoring] Failed to log error:', err);
    }
  }

  /**
   * Flush error queue to Supabase
   */
  async flushErrorQueue(): Promise<void> {
    if (this.errorQueue.length === 0) return;
    
    const errors = [...this.errorQueue];
    this.errorQueue = [];
    
    try {
      // Create integration_errors table if it doesn't exist
      const { error } = await supabase
        .from('integration_errors')
        .insert(errors);
      
      if (error) {
        // Put errors back in queue if insert failed
        this.errorQueue.unshift(...errors);
        console.error('[ErrorMonitoring] Failed to flush errors to Supabase:', error);
      }
    } catch (err) {
      // Put errors back in queue
      this.errorQueue.unshift(...errors);
      console.error('[ErrorMonitoring] Error flushing queue:', err);
    }
  }

  /**
   * Log OAuth error with context
   */
  async logOAuthError(
    companyId: string,
    message: string,
    details?: any,
    userId?: string
  ): Promise<void> {
    await this.logIntegrationError({
      company_id: companyId,
      error_type: 'oauth',
      error_message: message,
      error_details: details,
      component: 'SalesforceOAuth',
      user_id: userId
    });
  }

  /**
   * Log token refresh error
   */
  async logTokenRefreshError(
    companyId: string,
    message: string,
    details?: any
  ): Promise<void> {
    await this.logIntegrationError({
      company_id: companyId,
      error_type: 'token_refresh',
      error_message: message,
      error_details: details,
      component: 'TokenRefresh'
    });
  }

  /**
   * Log upload error
   */
  async logUploadError(
    companyId: string,
    batchId: string,
    message: string,
    details?: any,
    userId?: string
  ): Promise<void> {
    await this.logIntegrationError({
      company_id: companyId,
      error_type: 'upload',
      error_message: message,
      error_details: details,
      component: 'SalesforceUpload',
      batch_id: batchId,
      user_id: userId
    });
  }

  /**
   * Get recent errors for a company
   */
  async getRecentErrors(
    companyId: string,
    limit: number = 50
  ): Promise<IntegrationError[]> {
    try {
      const { data, error } = await supabase
        .from('integration_errors')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('[ErrorMonitoring] Failed to fetch errors:', error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      console.error('[ErrorMonitoring] Error fetching recent errors:', err);
      return [];
    }
  }

  /**
   * Get error summary for a company
   */
  async getErrorSummary(companyId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    last24Hours: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('integration_errors')
        .select('error_type, created_at')
        .eq('company_id', companyId);
      
      if (error || !data) {
        return { total: 0, byType: {}, last24Hours: 0 };
      }
      
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const summary = {
        total: data.length,
        byType: {} as Record<string, number>,
        last24Hours: 0
      };
      
      data.forEach(error => {
        // Count by type
        summary.byType[error.error_type] = (summary.byType[error.error_type] || 0) + 1;
        
        // Count last 24 hours
        if (new Date(error.created_at) > yesterday) {
          summary.last24Hours++;
        }
      });
      
      return summary;
    } catch (err) {
      console.error('[ErrorMonitoring] Error getting summary:', err);
      return { total: 0, byType: {}, last24Hours: 0 };
    }
  }

  /**
   * Set online status
   */
  setOnlineStatus(isOnline: boolean): void {
    this.isOnline = isOnline;
    
    // Flush queue when coming back online
    if (isOnline && this.errorQueue.length > 0) {
      this.flushErrorQueue();
    }
  }

  /**
   * Clear old errors (retention policy)
   */
  async clearOldErrors(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const { error } = await supabase
        .from('integration_errors')
        .delete()
        .lt('created_at', cutoffDate.toISOString());
      
      if (error) {
        console.error('[ErrorMonitoring] Failed to clear old errors:', error);
      }
    } catch (err) {
      console.error('[ErrorMonitoring] Error clearing old errors:', err);
    }
  }
}

export const errorMonitoringService = new ErrorMonitoringService();