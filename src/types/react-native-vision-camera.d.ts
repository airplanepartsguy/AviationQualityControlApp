// Minimal declaration file for react-native-vision-camera
// This file tells TypeScript that the module exists but doesn't define specific types.

declare module 'react-native-vision-camera' {
  // You can add basic type definitions here if needed later, but for now, 
  // just declaring the module is enough to silence the "Cannot find module" error.
  // Example:
  // export const useCameraDevice: any;
  // export const useCameraPermissions: any;
  // export const Camera: any;
  
  // For now, just export 'any' to satisfy the compiler.
  const Camera: any;
  const useCameraDevice: any;
  const useCameraPermissions: any;
  
  export { Camera, useCameraDevice, useCameraPermissions };
  export * from 'react-native-vision-camera'; // Re-export everything else as any
}
