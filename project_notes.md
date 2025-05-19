# Aviation Quality Control App - Project Notes

## Overview

The Aviation Quality Control App is a React Native application designed for aircraft maintenance personnel to document and report quality control inspections. The app allows users to capture photos, annotate defects, generate PDF reports, and share them with relevant stakeholders.

## Key Features Implemented

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

**Key Code Snippet (Drawing Tools):**
```typescript
// Drawing tool types
type DrawingTool = 'pointer' | 'circle' | 'rectangle' | 'arrow' | 'freehand' | 'text';
type DrawingMode = 'draw' | 'select' | 'erase';

// Line thickness options
const LINE_THICKNESS = {
  thin: 2,
  medium: 4,
  thick: 6
};

// Handle start of drawing on the image
const handleDrawStart = useCallback((event: GestureResponderEvent) => {
  if (!imageUri || currentTool === 'pointer') return;
  
  const { locationX, locationY } = event.nativeEvent;
  setIsDrawing(true);
  
  // Initialize path based on selected tool
  let initialPath = '';
  
  switch (currentTool) {
    case 'freehand':
      initialPath = `M ${locationX} ${locationY}`;
      break;
    case 'circle':
    case 'rectangle':
    case 'arrow':
      // Just store the starting point for shapes
      initialPath = `${locationX},${locationY}`;
      break;
    case 'text':
      // For text tool, show text input at tap location
      setTextInputPosition({ x: locationX, y: locationY });
      setShowTextInput(true);
      setIsDrawing(false); // Not actually drawing for text
      return;
  }
  
  setCurrentPath(initialPath);
}, [imageUri, currentTool]);
```

### 3. Barcode Scanning for ID Recognition

We implemented automatic barcode scanning in the PhotoCaptureScreen:

- **Auto-Recognition**: Camera automatically recognizes barcodes and uses them as IDs
- **ID Type Detection**: Automatically determines if the scanned code is an inventory ID or order number
- **Haptic Feedback**: Provides vibration feedback when a barcode is detected
- **Fallback to Manual Entry**: Users can still manually enter IDs if needed

**Key Code Snippet (Barcode Scanning):**
```typescript
// Handle barcode scanning results
const handleBarCodeScanned = useCallback(({ type, data }: BarcodeScanningResult) => {
  const now = Date.now();
  // Debounce scans to prevent duplicates
  if (now - lastScanTime.current < SCAN_DEBOUNCE_DELAY) {
    return;
  }
  lastScanTime.current = now;
  
  // Only process if scanning is active and we don't have a current batch
  if (!isScanningActive || currentBatch) {
    return;
  }
  
  console.log(`Barcode scanned: ${type} - ${data}`);
  
  // Provide haptic feedback
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    Vibration.vibrate(100); // Short vibration
  }
  
  // Update UI with scanned data
  setScannedData(data);
  setScanFeedback(`Barcode detected: ${data}`);
  
  // Auto-use the scanned barcode as the identifier
  setManualIdentifier(data);
  
  // Automatically submit the scanned barcode as the ID
  handleScannedIdSubmit(data);
}, [isScanningActive, currentBatch]);
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

## Known Issues and Limitations

1. **iOS Filename Limitations**:
   - iOS has strict limitations on how filenames are handled during sharing
   - Our solution works by copying the file with the desired name, but this creates duplicate files
   - The filename is also embedded in the PDF content as a header for identification

2. **Drawing Tools Performance**:
   - Complex drawings with many paths may cause performance issues on older devices
   - Text annotations have limited styling options currently

3. **Barcode Scanning**:
   - Some barcode formats may not be recognized reliably
   - Low-light conditions can affect scanning accuracy

## Next Steps

1. **Optimize Drawing Performance**:
   - Implement a more efficient rendering system for complex drawings
   - Add the ability to select and modify existing drawings

2. **Enhance PDF Generation**:
   - Add options for PDF templates with company branding
   - Implement PDF compression for faster sharing
   - Add support for including metadata like inspection date, inspector name, etc.

3. **Improve Barcode Scanning**:
   - Add support for more barcode formats
   - Implement a guided scanning interface with visual feedback
   - Add the ability to scan multiple barcodes in sequence

4. **Data Synchronization**:
   - Implement offline-first data storage with background sync
   - Add conflict resolution for cases where the same record is modified on multiple devices

5. **User Experience Improvements**:
   - Add onboarding tutorials for new users
   - Implement user preferences for default settings
   - Add accessibility features for users with disabilities

## Dependencies and APIs

- **Expo Print**: Used for generating PDFs from HTML content
- **Expo Sharing**: Used for sharing generated PDFs
- **Expo FileSystem**: Used for file operations like copying and deleting
- **Expo Camera**: Used for photo capture and barcode scanning
- **React Navigation**: Used for screen navigation
- **Expo Image Manipulator**: Used for image processing before PDF generation

## Testing Recommendations

1. Test PDF generation and sharing on both iOS and Android devices
2. Verify that barcode scanning works with various barcode formats and lighting conditions
3. Test drawing tools with complex annotations to ensure performance is acceptable
4. Verify that the app works properly in offline mode
5. Test with large batches of photos to ensure memory usage is optimized

## Conclusion

The Aviation Quality Control App has been significantly enhanced with advanced defect markup tools, improved PDF generation and naming, and automatic barcode scanning. These features make the app more user-friendly and efficient for aircraft maintenance personnel to document and report quality control inspections.
