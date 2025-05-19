import React from 'react';

/**
 * Performance Monitoring Utility
 * 
 * A simple utility to track performance metrics during development.
 * This helps identify bottlenecks in the application.
 */

let isEnabled = __DEV__;

/**
 * Enable or disable performance monitoring
 * Only works in development mode
 */
export const setPerformanceMonitoringEnabled = (enabled: boolean) => {
  isEnabled = __DEV__ && enabled;
};

/**
 * Track the time taken to execute a function
 * @param name Label for the operation being measured
 * @param operation Function to execute and measure
 * @returns The result of the operation
 */
export const trackPerformance = async <T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> => {
  if (!isEnabled) return operation();
  
  const startTime = performance.now();
  try {
    const result = await operation();
    const endTime = performance.now();
    console.log(`[PERF] ${name}: ${(endTime - startTime).toFixed(2)}ms`);
    return result;
  } catch (error) {
    const endTime = performance.now();
    console.log(`[PERF] ${name} (ERROR): ${(endTime - startTime).toFixed(2)}ms`);
    throw error;
  }
};

/**
 * React hook for component rendering performance tracking
 * @param componentName Name of the component to track
 */
export const useRenderTracker = (componentName: string) => {
  if (isEnabled) {
    const renderCount = React.useRef(0);
    console.log(`[RENDER] ${componentName} rendered ${++renderCount.current} times`);
  }
};

/**
 * Creates a performance-tracked version of a function
 * @param name Label for the function
 * @param fn Function to track
 * @returns Tracked function
 */
export const createTrackedFunction = <T extends (...args: any[]) => any>(
  name: string,
  fn: T
): T => {
  if (!isEnabled) return fn;
  
  return ((...args: Parameters<T>): ReturnType<T> => {
    const startTime = performance.now();
    const result = fn(...args);
    const endTime = performance.now();
    console.log(`[PERF] ${name}: ${(endTime - startTime).toFixed(2)}ms`);
    return result;
  }) as T;
};

export default {
  trackPerformance,
  useRenderTracker,
  createTrackedFunction,
  setPerformanceMonitoringEnabled,
};