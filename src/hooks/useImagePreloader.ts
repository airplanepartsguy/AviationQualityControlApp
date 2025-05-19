import { useState, useEffect } from 'react';
import { Image, Platform } from 'react-native';
import { trackPerformance } from '../utils/performanceMonitor';

interface ImageDimensions {
  width: number;
  height: number;
}

interface PreloadResult {
  isLoaded: boolean;
  dimensions: ImageDimensions;
  error: Error | null;
  aspectRatio: number;
}

/**
 * Custom hook for preloading images and getting their dimensions
 * 
 * This hook helps optimize image loading performance by:
 * 1. Preloading images in the background
 * 2. Caching image dimensions
 * 3. Providing loading state for better UX
 * 4. Calculating aspect ratio for responsive layouts
 * 
 * @param uri The URI of the image to preload
 */
export const useImagePreloader = (uri: string | null): PreloadResult => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [dimensions, setDimensions] = useState<ImageDimensions>({ width: 0, height: 0 });
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    if (!uri) {
      setIsLoaded(false);
      setError(new Error('No image URI provided'));
      return;
    }
    
    setIsLoaded(false);
    setError(null);
    
    const loadImageDimensions = async () => {
      await trackPerformance(`Preload image: ${uri.substring(0, 30)}...`, async () => {
        return new Promise<void>((resolve, reject) => {
          // For native platforms, use Image.getSize
          if (Platform.OS !== 'web') {
            Image.getSize(
              uri,
              (width, height) => {
                setDimensions({ width, height });
                setIsLoaded(true);
                resolve();
              },
              (err) => {
                const error = new Error(`Failed to load image: ${err}`);
                setError(error);
                reject(error);
              }
            );
          } else {
            // For web platforms, use a different approach
            // This is a simplified version since we're primarily targeting mobile
            console.log('Web platform detected - using fallback method');
            setDimensions({ width: 300, height: 300 }); // Default fallback size
            setIsLoaded(true);
            resolve();
          }
          
          // Prefetch the image for better performance
          if (Platform.OS !== 'web') {
            Image.prefetch(uri).catch(err => {
              console.warn('Image prefetch warning:', err);
              // Don't reject here, as getSize might still work
            });
          }
        });
      });
    };
    
    loadImageDimensions().catch(err => {
      console.error('Failed to preload image:', err);
    });
    
    return () => {
      // Cleanup - cancel any pending operations if possible
    };
  }, [uri]);
  
  // Calculate aspect ratio, defaulting to 1 if no dimensions
  const aspectRatio = dimensions.height > 0 ? dimensions.width / dimensions.height : 1;
  
  return {
    isLoaded,
    dimensions,
    error,
    aspectRatio
  };
};

export default useImagePreloader;