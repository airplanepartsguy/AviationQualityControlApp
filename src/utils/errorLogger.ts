/**
 * Comprehensive Error Logging Utility
 * Captures all errors with full context and stack traces
 */

import { Platform } from 'react-native';

export interface ErrorContext {
  userId?: string;
  companyId?: string;
  batchId?: string;
  photoId?: string;
  operation?: string;
  additionalData?: any;
}

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  context: ErrorContext;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  platform: string;
  resolved: boolean;
}

class ErrorLogger {
  private static instance: ErrorLogger;
  private errors: ErrorLogEntry[] = [];
  private maxErrors = 1000;

  private constructor() {
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
  }

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  private setupGlobalErrorHandlers() {
    console.log('🔧 [ERROR_LOGGER] Global error handlers initialized');
    // Note: Promise rejection handlers could be added here if needed
    // For now, we rely on explicit error logging in catch blocks
  }

  /**
   * Log an error with full context
   */
  logError(
    error: Error | string | any,
    context: ErrorContext = {},
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    category: string = 'general'
  ): string {
    const errorObj = this.normalizeError(error);
    
    const errorEntry: ErrorLogEntry = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      error: errorObj,
      context,
      severity,
      category,
      platform: Platform.OS,
      resolved: false
    };

    // Add to internal storage
    this.errors.unshift(errorEntry);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Enhanced console logging with full details
    const logLevel = this.getConsoleLogLevel(severity);
    const logMessage = this.formatErrorMessage(errorEntry);
    
    console[logLevel](`🚨 [ERROR_LOGGER] ${logMessage}`);
    
    // If it's a critical error, also log to console.error regardless
    if (severity === 'critical') {
      console.error(`🔥 CRITICAL ERROR: ${errorEntry.error.name}: ${errorEntry.error.message}`);
      if (errorEntry.error.stack) {
        console.error(`Stack: ${errorEntry.error.stack}`);
      }
      console.error(`Context:`, JSON.stringify(context, null, 2));
    }

    return errorEntry.id;
  }

  /**
   * Log Supabase-specific errors with enhanced context
   */
  logSupabaseError(
    error: any,
    operation: string,
    context: ErrorContext = {}
  ): string {
    const enhancedContext = {
      ...context,
      operation: `supabase_${operation}`,
      supabaseDetails: {
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        statusCode: error?.status || error?.statusCode
      }
    };

    return this.logError(
      error,
      enhancedContext,
      'high',
      'supabase'
    );
  }

  /**
   * Log database-specific errors
   */
  logDatabaseError(
    error: any,
    operation: string,
    context: ErrorContext = {}
  ): string {
    const enhancedContext = {
      ...context,
      operation: `database_${operation}`,
      databaseDetails: {
        sqlError: error?.message?.includes('SQL') || error?.message?.includes('database'),
        timeoutError: error?.message?.includes('timeout') || error?.message?.includes('timed out')
      }
    };

    return this.logError(
      error,
      enhancedContext,
      error?.message?.includes('timeout') ? 'critical' : 'high',
      'database'
    );
  }

  /**
   * Log network/API errors
   */
  logNetworkError(
    error: any,
    url: string,
    method: string = 'GET',
    context: ErrorContext = {}
  ): string {
    const enhancedContext = {
      ...context,
      operation: `network_${method.toLowerCase()}`,
      networkDetails: {
        url,
        method,
        status: error?.status || error?.statusCode,
        responseText: error?.responseText,
        timeout: error?.timeout
      }
    };

    return this.logError(
      error,
      enhancedContext,
      'high',
      'network'
    );
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 50): ErrorLogEntry[] {
    return this.errors.slice(0, limit);
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category: string, limit: number = 50): ErrorLogEntry[] {
    return this.errors
      .filter(error => error.category === category)
      .slice(0, limit);
  }

  /**
   * Get unresolved critical errors
   */
  getCriticalErrors(): ErrorLogEntry[] {
    return this.errors.filter(error => 
      error.severity === 'critical' && !error.resolved
    );
  }

  /**
   * Mark error as resolved
   */
  markErrorResolved(errorId: string): boolean {
    const error = this.errors.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      console.log(`✅ [ERROR_LOGGER] Error ${errorId} marked as resolved`);
      return true;
    }
    return false;
  }

  /**
   * Clear all errors (for testing/cleanup)
   */
  clearErrors(): void {
    const count = this.errors.length;
    this.errors = [];
    console.log(`🧹 [ERROR_LOGGER] Cleared ${count} errors`);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    unresolved: number;
  } {
    const stats = {
      total: this.errors.length,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      unresolved: this.errors.filter(e => !e.resolved).length
    };

    this.errors.forEach(error => {
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    });

    return stats;
  }

  /**
   * Dump all errors to console for debugging
   */
  dumpErrorsToConsole(): void {
    console.log(`📊 [ERROR_LOGGER] Error Statistics:`, this.getErrorStats());
    console.log(`📜 [ERROR_LOGGER] Recent Errors:`);
    
    this.getRecentErrors(20).forEach((error, index) => {
      console.log(`${index + 1}. [${error.severity.toUpperCase()}] ${error.category}: ${error.error.name}`);
      console.log(`   Message: ${error.error.message}`);
      console.log(`   Time: ${error.timestamp}`);
      console.log(`   Context:`, error.context);
      if (error.error.stack) {
        console.log(`   Stack: ${error.error.stack.split('\n')[0]}`);
      }
      console.log('   ---');
    });
  }

  private normalizeError(error: any): { name: string; message: string; stack?: string } {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    if (typeof error === 'string') {
      return {
        name: 'StringError',
        message: error
      };
    }

    if (error && typeof error === 'object') {
      return {
        name: error.name || error.type || 'UnknownError',
        message: error.message || error.error || JSON.stringify(error),
        stack: error.stack
      };
    }

    return {
      name: 'UnknownError',
      message: String(error)
    };
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getConsoleLogLevel(severity: string): 'log' | 'warn' | 'error' {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      default:
        return 'log';
    }
  }

  private formatErrorMessage(entry: ErrorLogEntry): string {
    const contextStr = Object.keys(entry.context).length > 0 
      ? ` | Context: ${JSON.stringify(entry.context)}` 
      : '';
    
    return `[${entry.severity.toUpperCase()}] [${entry.category}] ${entry.error.name}: ${entry.error.message}${contextStr}`;
  }
}

// Export singleton instance
export const errorLogger = ErrorLogger.getInstance();

// Convenience functions
export const logError = (error: any, context?: ErrorContext, severity?: 'low' | 'medium' | 'high' | 'critical', category?: string) => 
  errorLogger.logError(error, context, severity, category);

export const logSupabaseError = (error: any, operation: string, context?: ErrorContext) =>
  errorLogger.logSupabaseError(error, operation, context);

export const logDatabaseError = (error: any, operation: string, context?: ErrorContext) =>
  errorLogger.logDatabaseError(error, operation, context);

export const logNetworkError = (error: any, url: string, method?: string, context?: ErrorContext) =>
  errorLogger.logNetworkError(error, url, method, context);

// Global error monitoring functions
export const dumpErrors = () => errorLogger.dumpErrorsToConsole();
export const getErrorStats = () => errorLogger.getErrorStats();
export const clearAllErrors = () => errorLogger.clearErrors();

// Debug helper - call this from console to see all errors
if (__DEV__) {
  (global as any).dumpErrors = dumpErrors;
  (global as any).getErrorStats = getErrorStats;
  (global as any).clearAllErrors = clearAllErrors;
  
  console.log('🔧 [ERROR_LOGGER] Debug helpers available: dumpErrors(), getErrorStats(), clearAllErrors()');
} 