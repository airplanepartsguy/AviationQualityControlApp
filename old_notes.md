# Aviation Quality Control App - Project Notes

## Overview

The Aviation Quality Control App is a React Native application designed for aircraft maintenance personnel to document and report quality control inspections in shipping & receiving environments. The app allows users to capture photos, scan barcodes for parts identification, annotate defects, generate PDF reports, and share them with relevant stakeholders. It has been optimized for high-volume photography workflows in industrial settings.

## Key Features Implemented

### User Authentication & Licensing (Supabase Integration)

Implemented a robust user authentication and session management system using Supabase as the backend. This forms the foundation for a per-user annual subscription model.

- **Supabase Client Setup**: Configured `supabaseClient.ts` to initialize the Supabase client using environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) and `expo-secure-store` for session persistence.
- **Authentication Context**: Refactored `AuthContext.tsx` to handle:
    - User sign-up (`supabase.auth.signUp`), login (`supabase.auth.signInWithPassword`), and logout (`supabase.auth.signOut`).
    - Session management via `onAuthStateChange` to update user and session state globally.
    - Loading and error states for auth operations.
- **Supabase Backend Configuration**:
    - **`profiles` Table**: Created a `public.profiles` table to store user-specific data linked to `auth.users.id`, including `license_status` and `license_expiry_date`.
    - **SQL Function & Trigger**: Implemented `public.handle_new_user()` SQL function and a trigger on `auth.users` (for `INSERT` events) to automatically populate the `public.profiles` table upon new user registration.
    - **Row Level Security (RLS)**: Configured RLS policies on `public.profiles` to ensure users can only access and manage their own data.
- **Application Code Updates**:
    - `DashboardScreen.tsx`: Updated to use `AuthContext` for user data, handle nullability of user object, and pass `userId` to data fetching functions.
    - `navigation.ts`: Adjusted `RootStackParamList` for `PhotoCapture` route to make `userId` optional.
- **Licensing Model Foundation**: The above setup supports a per-user annual subscription model. License status and expiry will be managed in the `profiles` table. (Future: device management for one-device-at-a-time rule).


### 1. PDF Generation and File Naming

We implemented a robust PDF generation system that creates well-formatted documents with the following features:

- **Custom Filename Format**: `RecordID - PictureType - Notes.pdf`
- **User Input for Notes**: Limited to 30 characters for manageable filenames
- **Picture Type Selection**: Option to include all pictures or defect pictures only
- **iOS Filename Fix**: Special handling for iOS to ensure proper filenames appear when sharing

**Key Code Snippet (PDF Generation):**
```typescript
// Function to create PDF from images - using data URLs for reliable rendering
const createPdf = async (dataUrls: string[]): Promise<string | null> => {
  try {
    // Generate the filename based on record ID, picture type, and notes
    const fileName = generateFileName(contextIdentifier, pictureType, notes);
    
    // Create HTML content with images and a prominent filename header on every page
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${fileName}</title>
        <style>
          /* CSS styles */
          .header {
            width: 100%;
            background-color: #f0f0f0;
            padding: 15px;
            text-align: center;
            border-bottom: 1px solid #ccc;
            font-family: Arial, sans-serif;
            font-size: 16px;
            font-weight: bold;
            color: #333;
          }
        </style>
      </head>
      <body>
        ${dataUrls.map((dataUrl, index) => `
          <div class="page">
            <div class="header">${fileName}</div>
            <div class="image-container">
              <img class="image" src="${dataUrl}" alt="Image ${index+1}" />
            </div>
          </div>
        `).join('')}
      </body>
      </html>
    `;
    
    // Create the PDF
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      width: 612, // 8.5 inches at 72 PPI
      height: 792, // 11 inches at 72 PPI
    });
    
    return uri;
  } catch (error) {
    console.error('Error creating PDF:', error);
    throw error;
  }
};
```

**iOS Filename Fix:**
```typescript
// Function to open the PDF with a custom filename
const openPdf = async (pdfUri: string) => {
  try {
    const displayName = customName || generateFileName(contextIdentifier, pictureType, notes);
    
    if (Platform.OS === 'ios') {
      // On iOS, copy the file to the documents directory with our desired name
      const documentsDir = FileSystem.documentDirectory;
      const targetPath = `${documentsDir}${displayName}`;
      
      // Check if the file already exists and remove it if it does
      const fileInfo = await FileSystem.getInfoAsync(targetPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(targetPath, { idempotent: true });
      }
      
      // Copy the file to the documents directory with our custom name
      await FileSystem.copyAsync({
        from: pdfUri,
        to: targetPath
      });
      
      // Now share the file with the custom name
      const result = await Sharing.shareAsync(targetPath, {
        UTI: 'com.adobe.pdf',
        mimeType: 'application/pdf',
        dialogTitle: displayName
      });
    } else {
      // For Android, use the standard sharing approach
      // ...Android sharing code...
    }
  } catch (error) {
    console.error('Error opening PDF:', error);
    Alert.alert('Error', 'Could not open the PDF file');
  }
};
```

### 2. Defect Highlighting and Markup Tools

We enhanced the DefectHighlightingScreen with advanced markup capabilities:

- **Multiple Drawing Tools**: Pointer (selection), freehand drawing, circles, rectangles, arrows, and text annotations
- **Line Thickness Controls**: Options for thin, medium, and thick lines
- **Color-Coded Severity Levels**: Minor (yellow), Moderate (orange), Critical (red), None (grey)
- **Text Annotations**: Ability to add text labels directly on the image
(Note: The DefectHighlightingScreen.tsx component was completely replaced and optimized, improving performance, error handling, memory management, UX, and offline capabilities. The specific code snippet previously here may no longer be representative of the current advanced implementation.)

### 3. Barcode Scanning for ID Recognition

We implemented automatic barcode scanning in the PhotoCaptureScreen with recent significant improvements:

- **Auto-Recognition**: Camera automatically recognizes barcodes and uses them as IDs
- **More Permissive ID Format**: Accepts any alphanumeric string with at least 4 characters
- **Haptic Feedback**: Provides vibration feedback when a barcode is detected
- **Fallback to Manual Entry**: Users can still manually enter IDs if needed
- **Improved UI Feedback**: Clear visual feedback during scanning process

**Key Code Snippet (Barcode Scanning):**
```typescript
// Handle barcode scanning with debouncing to prevent duplicates
const handleBarCodeScanned = useCallback(({ data }: { data: string }) => {
  // Skip if scanning is inactive or if we're already loading
  if (!isScanningActive || isLoading) return;
  
  // Debounce scans to prevent duplicate processing
  const now = Date.now();
  if (now - lastScanTime.current < SCAN_DEBOUNCE_DELAY) return;
  lastScanTime.current = now;
  
  // Prevent processing the same code multiple times in succession
  if (data === lastScannedRef.current) return;
  lastScannedRef.current = data;
  
  console.log('Barcode scanned:', data);
  
  // Provide haptic feedback to indicate successful scan
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  
  // Clean the scanned data
  const cleanData = data.trim();
  
  // Update UI to show we're processing the scan
  setScanFeedback(`Processing: ${cleanData}`);
  
  // Process the scanned ID
  handleScannedIdSubmit(cleanData);
}, [isScanningActive, isLoading, handleScannedIdSubmit]);
```

## Design Decisions

1. **PDF Filename Approach**:
   - Initially tried to rename files during sharing (didn't work reliably on iOS)
   - Then tried using React Native's Share API (still had issues on iOS)
   - Final solution: Copy the file with the desired name before sharing and add a visible header in the PDF

2. **Drawing Tools Implementation**:
   - Used SVG paths for all drawing tools for consistent rendering
   - Implemented a tool selection system with visual feedback
   - Added line thickness controls for better defect highlighting
   - Maintained backward compatibility with the existing annotation system

3. **Barcode Scanning**:
   - Used Expo Camera's built-in barcode scanning capabilities
   - Added debouncing to prevent duplicate scans
   - Implemented automatic ID type detection based on prefix conventions
   - Provided fallback to manual entry for cases where scanning fails

## Recent Improvements

### 1. Camera Functionality Enhancements

- **Fixed Camera View**: Resolved issues with the camera not being visible in the PhotoCaptureScreen
- **Updated Camera API**: Implemented the latest Expo Camera API with proper barcode scanning settings
- **Improved Photo Capture**: Added a small delay before taking a picture to ensure camera readiness
- **Enhanced Error Handling**: Better error messages and recovery mechanisms for camera issues

### 2. UI/UX Improvements

- **Streamlined Interface**: Removed redundant back button for cleaner UI
- **Enhanced Button Styling**: Improved visual feedback for capture and defect buttons
- **Better Disabled States**: Clear visual indication when buttons are inactive
- **More Responsive Controls**: Improved touch responsiveness and haptic feedback

### 4. ID Format Recognition

- **More Permissive Validation**: Accepts various ID formats common in aviation environments
- **Simplified Manual Input**: Clearer error messages with examples of valid formats
- **Focus Management**: Automatic focus on input fields for better user experience

## Known Issues and Limitations

### Authentication & Licensing Loose Ends:
- **UI for Auth Errors**: Login/SignUp screens need to display user-friendly messages based on `error` state from `AuthContext`.
- **UI for Loading States**: Login/SignUp screens should utilize `isLoading` from `AuthContext` to show activity indicators during auth operations.
- **Root Navigator Logic**: The main app navigator (`App.tsx` or equivalent) needs to robustly switch between authentication screens (Login/SignUp) and the main application based on `session` or `user` state from `AuthContext`. This is critical for the auth flow to work correctly.
- **License Management UI**: No UI currently exists for users to view their license status or for admins to manage licenses. This is a future enhancement.
- **Device Management for Licensing**: The "one active device per license" rule is a future enhancement requiring custom logic (likely Supabase Functions and an `active_devices` table).
- **Password Reset Flow**: While Supabase supports it, the UI and flow for password reset haven't been explicitly implemented in the app yet.
- **Email Confirmation Customization**: Supabase email templates for confirmation, password reset, etc., can be customized for branding.


1. **iOS Filename Limitations**:
   - iOS has strict limitations on how filenames are handled during sharing
   - Our solution works by copying the file with the desired name, but this creates duplicate files
   - The filename is also embedded in the PDF content as a header for identification

2. **Drawing Tools Performance**:
   - Complex drawings with many paths may cause performance issues on older devices
   - Text annotations have limited styling options currently

3. **Barcode Scanning in Low Light**:
   - Low-light conditions can still affect scanning accuracy
   - Some reflective surfaces may cause scanning issues

## Next Steps

### 1. Test User Authentication & Initial Licensing Flow
- **Verify `.env` file**: Ensure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are correctly set in the project's root `.env` file.
- **Test Sign-Up**: Create a new user through the app.
    - Verify user creation in `auth.users` table in Supabase.
    - Verify automatic profile creation in `public.profiles` table with default license status.
- **Test Login/Logout**: Ensure users can log in with new credentials, are directed to the Dashboard, and can log out.
- **Session Persistence**: Verify that the session persists after closing and reopening the app.
- **Review Root Navigator**: Confirm the app correctly navigates between auth screens and main app content based on authentication state.

### 2. Refine Auth UI & User Experience
- Implement clear error message display on Login/SignUp screens using `error` state from `AuthContext`.
- Add loading indicators to Login/SignUp screens using `isLoading` state from `AuthContext`.
- Design and implement a basic password reset flow.

### 3. Further Camera Optimizations

1. **Further Camera Optimizations**:
   - Optimize camera settings for better performance in various lighting conditions
   - Implement a flash control button for low-light environments
   - Add a zoom capability for scanning small barcodes

2. **Enhance Batch Management**:
   - Implement batch merging for combining related records
   - Add batch tagging for better organization
   - Improve the batch preview interface

3. **Sync Status UI Integration**:
   - Move the sync status panel from a floating overlay to an integrated component in the Dashboard
   - Add visual indicators for sync progress and status
   - Implement retry mechanisms for failed syncs

4. **ERP Integration**:
   - Prepare for future Salesforce integration using n8n
   - Implement user-friendly batch renaming with confirmation dialogs
   - Add data validation to ensure compatibility with ERP systems

5. **Performance Optimizations**:
   - Reduce app loading times and camera initialization delays
   - Optimize memory usage for handling large batches of photos
   - Implement better caching strategies for frequently accessed data

## Dependencies and APIs

- **Supabase Client (`@supabase/supabase-js`)**: Used for all backend interactions including authentication and database operations.
- **Expo Secure Store (`expo-secure-store`)**: Used for persisting Supabase session data securely on the device.
- **React Native URL Polyfill (`react-native-url-polyfill`)**: Required for Supabase client to function correctly in React Native.

- **Expo Camera**: Used for photo capture and barcode scanning with the latest API implementation
- **Expo Haptics**: Used for providing tactile feedback to users during scanning and photo capture
- **Expo Image Manipulator**: Used for image processing and optimization
- **Expo FileSystem**: Used for file operations like copying and deleting
- **Expo Print**: Used for generating PDFs from HTML content
- **Expo Sharing**: Used for sharing generated PDFs
- **React Navigation**: Used for screen navigation
- **React Native Safe Area Context**: Used for handling safe areas on different devices

## Testing Recommendations

1. Test PDF generation and sharing on both iOS and Android devices
2. Verify that barcode scanning works with various barcode formats and lighting conditions
3. Test drawing tools with complex annotations to ensure performance is acceptable
4. Verify that the app works properly in offline mode
5. Test with large batches of photos to ensure memory usage is optimized

## Conclusion

The Aviation Quality Control App has been significantly enhanced with improved camera functionality, more reliable barcode scanning, and a more intuitive user interface. Recent fixes have focused on making the app more robust and user-friendly for high-volume photography workflows in shipping & receiving inspection environments. 

The app now provides enterprise-grade functionality with improved error handling, better visual feedback, and optimized performance for industrial use cases. These enhancements make the app more efficient for aviation quality control personnel to document and report inspections while preparing for future ERP integration with Salesforce.
