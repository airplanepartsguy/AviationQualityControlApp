/**
 * Performance Optimization Service for Day 7
 * Monitors and optimizes app performance for production deployment
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

interface PerformanceMetrics {
  appStartTime: number;
  screenLoadTimes: Record<string, number>;
  databaseQueryTimes: Record<string, number>;
  memoryUsage: number;
  networkRequests: number;
  syncOperations: number;
  errorCount: number;
  crashCount: number;
}

interface PerformanceThresholds {
  maxAppStartTime: number; // 3 seconds
  maxScreenLoadTime: number; // 2 seconds
  maxDatabaseQueryTime: number; // 500ms
  maxMemoryUsage: number; // 100MB
  maxErrorRate: number; // 5%
}

class PerformanceService {
  private metrics: PerformanceMetrics = {
    appStartTime: 0,
    screenLoadTimes: {},
    databaseQueryTimes: {},
    memoryUsage: 0,
    networkRequests: 0,
    syncOperations: 0,
    errorCount: 0,
    crashCount: 0
  };

  private thresholds: PerformanceThresholds = {
    maxAppStartTime: 3000,
    maxScreenLoadTime: 2000,
    maxDatabaseQueryTime: 500,
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    maxErrorRate: 0.05 // 5%
  };

  private startTimes: Map<string, number> = new Map();

  /**
   * Initialize performance monitoring
   */
  async initialize(): Promise<void> {
    console.log('🚀 Performance Service initialized');
    
    // Load previous metrics
    await this.loadMetrics();
    
    // Start app performance tracking
    this.trackAppStart();
    
    // Set up periodic monitoring
    this.startPeriodicMonitoring();
  }

  /**
   * Track app startup time
   */
  trackAppStart(): void {
    const startTime = Date.now();
    this.metrics.appStartTime = startTime;
    
    // Track when app is fully loaded
    setTimeout(() => {
      const loadTime = Date.now() - startTime;
      console.log(`📱 App startup time: ${loadTime}ms`);
      
      if (loadTime > this.thresholds.maxAppStartTime) {
        console.warn(`⚠️ Slow app startup: ${loadTime}ms (threshold: ${this.thresholds.maxAppStartTime}ms)`);
      }
    }, 100);
  }

  /**
   * Start tracking screen load time
   */
  startScreenLoad(screenName: string): void {
    this.startTimes.set(`screen_${screenName}`, Date.now());
  }

  /**
   * End tracking screen load time
   */
  endScreenLoad(screenName: string): void {
    const startTime = this.startTimes.get(`screen_${screenName}`);
    if (startTime) {
      const loadTime = Date.now() - startTime;
      this.metrics.screenLoadTimes[screenName] = loadTime;
      
      console.log(`📱 ${screenName} load time: ${loadTime}ms`);
      
      if (loadTime > this.thresholds.maxScreenLoadTime) {
        console.warn(`⚠️ Slow screen load: ${screenName} ${loadTime}ms`);
      }
      
      this.startTimes.delete(`screen_${screenName}`);
    }
  }

  /**
   * Start tracking database query time
   */
  startDatabaseQuery(queryName: string): void {
    this.startTimes.set(`db_${queryName}`, Date.now());
  }

  /**
   * End tracking database query time
   */
  endDatabaseQuery(queryName: string): void {
    const startTime = this.startTimes.get(`db_${queryName}`);
    if (startTime) {
      const queryTime = Date.now() - startTime;
      this.metrics.databaseQueryTimes[queryName] = queryTime;
      
      if (queryTime > this.thresholds.maxDatabaseQueryTime) {
        console.warn(`⚠️ Slow database query: ${queryName} ${queryTime}ms`);
      }
      
      this.startTimes.delete(`db_${queryName}`);
    }
  }

  /**
   * Track network request
   */
  trackNetworkRequest(): void {
    this.metrics.networkRequests++;
  }

  /**
   * Track sync operation
   */
  trackSyncOperation(): void {
    this.metrics.syncOperations++;
  }

  /**
   * Track error occurrence
   */
  trackError(error: Error, context?: string): void {
    this.metrics.errorCount++;
    console.error(`❌ Performance tracked error in ${context}:`, error);
    
    // Log to crash reporting in production
    // crashlytics().recordError(error);
  }

  /**
   * Track app crash
   */
  trackCrash(): void {
    this.metrics.crashCount++;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): string {
    const report = [
      '📊 PERFORMANCE REPORT',
      '='.repeat(40),
      `App Start Time: ${this.metrics.appStartTime ? 'Tracked' : 'Not tracked'}`,
      `Screen Loads: ${Object.keys(this.metrics.screenLoadTimes).length} tracked`,
      `Database Queries: ${Object.keys(this.metrics.databaseQueryTimes).length} tracked`,
      `Network Requests: ${this.metrics.networkRequests}`,
      `Sync Operations: ${this.metrics.syncOperations}`,
      `Errors: ${this.metrics.errorCount}`,
      `Crashes: ${this.metrics.crashCount}`,
      '',
      '🐌 SLOWEST OPERATIONS:',
    ];

    // Add slowest screen loads
    const slowestScreens = Object.entries(this.metrics.screenLoadTimes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);
    
    slowestScreens.forEach(([screen, time]) => {
      report.push(`   ${screen}: ${time}ms`);
    });

    // Add slowest database queries
    const slowestQueries = Object.entries(this.metrics.databaseQueryTimes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);
    
    if (slowestQueries.length > 0) {
      report.push('', '🗄️ SLOWEST DATABASE QUERIES:');
      slowestQueries.forEach(([query, time]) => {
        report.push(`   ${query}: ${time}ms`);
      });
    }

    return report.join('\n');
  }

  /**
   * Check if performance is within acceptable thresholds
   */
  isPerformanceAcceptable(): boolean {
    // Check screen load times
    const slowScreens = Object.values(this.metrics.screenLoadTimes)
      .filter(time => time > this.thresholds.maxScreenLoadTime);
    
    // Check database query times
    const slowQueries = Object.values(this.metrics.databaseQueryTimes)
      .filter(time => time > this.thresholds.maxDatabaseQueryTime);
    
    // Check error rate
    const totalOperations = this.metrics.networkRequests + this.metrics.syncOperations + 1;
    const errorRate = this.metrics.errorCount / totalOperations;
    
    return slowScreens.length === 0 && 
           slowQueries.length === 0 && 
           errorRate <= this.thresholds.maxErrorRate;
  }

  /**
   * Get performance optimization suggestions
   */
  getOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];

    // Check screen load times
    const slowScreens = Object.entries(this.metrics.screenLoadTimes)
      .filter(([, time]) => time > this.thresholds.maxScreenLoadTime);
    
    if (slowScreens.length > 0) {
      suggestions.push(`Optimize slow screens: ${slowScreens.map(([name]) => name).join(', ')}`);
      suggestions.push('Consider implementing loading skeletons for slow screens');
      suggestions.push('Review component rendering and state management');
    }

    // Check database performance
    const slowQueries = Object.entries(this.metrics.databaseQueryTimes)
      .filter(([, time]) => time > this.thresholds.maxDatabaseQueryTime);
    
    if (slowQueries.length > 0) {
      suggestions.push(`Optimize slow database queries: ${slowQueries.map(([name]) => name).join(', ')}`);
      suggestions.push('Consider adding database indexes');
      suggestions.push('Review query complexity and data fetching patterns');
    }

    // Check error rate
    const totalOperations = this.metrics.networkRequests + this.metrics.syncOperations + 1;
    const errorRate = this.metrics.errorCount / totalOperations;
    
    if (errorRate > this.thresholds.maxErrorRate) {
      suggestions.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
      suggestions.push('Review error handling and retry logic');
      suggestions.push('Implement better offline handling');
    }

    if (suggestions.length === 0) {
      suggestions.push('Performance is within acceptable thresholds! 🎉');
    }

    return suggestions;
  }

  /**
   * Start periodic performance monitoring
   */
  private startPeriodicMonitoring(): void {
    // Monitor memory usage every 30 seconds
    setInterval(() => {
      this.checkMemoryUsage();
    }, 30000);

    // Save metrics every 5 minutes
    setInterval(() => {
      this.saveMetrics();
    }, 300000);
  }

  /**
   * Check current memory usage
   */
  private checkMemoryUsage(): void {
    // In React Native, we can't directly measure memory usage
    // This would be implemented with native modules in production
    const estimatedMemory = Object.keys(this.metrics.screenLoadTimes).length * 1024 * 1024; // Rough estimate
    this.metrics.memoryUsage = estimatedMemory;
    
    if (estimatedMemory > this.thresholds.maxMemoryUsage) {
      console.warn(`⚠️ High memory usage: ${(estimatedMemory / 1024 / 1024).toFixed(1)}MB`);
    }
  }

  /**
   * Save metrics to local storage
   */
  private async saveMetrics(): Promise<void> {
    try {
      await AsyncStorage.setItem('performance_metrics', JSON.stringify(this.metrics));
    } catch (error) {
      console.error('Failed to save performance metrics:', error);
    }
  }

  /**
   * Load metrics from local storage
   */
  private async loadMetrics(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem('performance_metrics');
      if (saved) {
        this.metrics = { ...this.metrics, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load performance metrics:', error);
    }
  }

  /**
   * Reset all metrics
   */
  async resetMetrics(): Promise<void> {
    this.metrics = {
      appStartTime: 0,
      screenLoadTimes: {},
      databaseQueryTimes: {},
      memoryUsage: 0,
      networkRequests: 0,
      syncOperations: 0,
      errorCount: 0,
      crashCount: 0
    };
    
    await this.saveMetrics();
    console.log('📊 Performance metrics reset');
  }

  /**
   * Show performance alert if needed
   */
  showPerformanceAlert(): void {
    if (!this.isPerformanceAcceptable()) {
      const suggestions = this.getOptimizationSuggestions();
      Alert.alert(
        'Performance Notice',
        `Some operations are running slower than expected:\n\n${suggestions.slice(0, 2).join('\n')}`,
        [{ text: 'OK' }]
      );
    }
  }
}

// Export singleton instance
export const performanceService = new PerformanceService();
