import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Platform,
  Share
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

import { RootStackParamList } from '../types/navigation';
import { COLORS, FONTS, SPACING } from '../styles/theme';
import { PhotoData } from '../types/data';

// Update the PhotoData type to include isDefect property
declare module '../types/data' {
  interface PhotoData {
    isDefect?: boolean;
  }
}

// Add custom property to global for filename tracking
declare global {
  interface Window {
    customPdfFilename?: string;
  }
}
import { logAnalyticsEvent, logErrorToFile } from '../services/analyticsService';
import * as databaseService from '../services/databaseService';

type PDFGenerationScreenProps = StackScreenProps<RootStackParamList, 'PDFGeneration'>;


// Type for PDF file naming options
type PictureType = 'Pictures' | 'Defect Pictures';

const PDFGenerationScreen = ({ route, navigation }: PDFGenerationScreenProps) => {
  // Extract parameters from route
  const { batchId, reportType: routeReportType, orderNumber: routeOrderNumber, inventorySessionId: routeInventorySessionId, pictureType: routePictureType } = route.params;
  
  // State variables
  const [isLoading, setIsLoading] = useState(true);
  const [progressMessage, setProgressMessage] = useState('Loading batch details...');
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pictureType, setPictureType] = useState<PictureType>(routePictureType || 'Pictures');
  const [showPictureTypeModal, setShowPictureTypeModal] = useState<boolean>(!routePictureType);
  const [notes, setNotes] = useState<string>('');
  const [showNotesInput, setShowNotesInput] = useState<boolean>(false);
  
  // Reference to track if component is mounted
  const isMounted = useRef(true);
  
  // Context identifier for the PDF
  const contextIdentifier = routeOrderNumber || routeInventorySessionId || `Batch-${batchId}`;
  
  // Generate a filename for the PDF based on the record ID, picture type, and optional notes
  const generateFileName = (recordId: string, type: PictureType, userNotes?: string): string => {
    // Trim and limit notes to 30 characters
    const trimmedNotes = userNotes?.trim();
    const limitedNotes = trimmedNotes && trimmedNotes.length > 0 
      ? ` - ${trimmedNotes.substring(0, 30)}` 
      : '';
    
    return `${recordId} - ${type}${limitedNotes}.pdf`;
  };

  // Cleanup function to remove temporary files
  const cleanupTempFiles = async () => {
    try {
      const tempDir = `${FileSystem.cacheDirectory}temp/`;
      await FileSystem.deleteAsync(tempDir, { idempotent: true });
      console.log('Temp directory cleaned up successfully');
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  };

  // Convert a single photo to base64 data URL
  const convertPhotoToBase64 = async (photo: PhotoData): Promise<string> => {
    try {
      console.log(`Converting photo to base64: ${photo.uri}`);
      
      // Check if the source file exists
      const fileInfo = await FileSystem.getInfoAsync(photo.uri);
      if (!fileInfo.exists) {
        throw new Error(`Source image file not found: ${photo.uri}`);
      }
      
      // Convert the image to base64 using the original URI
      const base64 = await FileSystem.readAsStringAsync(photo.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      console.error(`Error converting photo to base64:`, error);
      throw error;
    }
  };
  
  // Process all photos and convert them to base64 data URLs
  const processAllPhotos = async (photos: PhotoData[]): Promise<string[]> => {
    const processedImages: string[] = [];
    
    // Process one image at a time to avoid memory issues
    for (let i = 0; i < photos.length; i++) {
      try {
        setProgressMessage(`Processing image ${i+1} of ${photos.length}...`);
        setProgressPercent(Math.floor(30 + (i / photos.length * 40)));
        
        const base64Image = await convertPhotoToBase64(photos[i]);
        processedImages.push(base64Image);
        
        console.log(`Successfully processed image ${i+1} of ${photos.length}`);
      } catch (error) {
        console.error(`Error processing image ${i+1}:`, error);
        // Continue with other images even if one fails
      }
    }
    
    return processedImages;
  };

  // Function to create PDF from images - using data URLs for reliable rendering
  const createPdf = async (dataUrls: string[]): Promise<string | null> => {
    try {
      console.log('Creating PDF with images:', dataUrls.length);
      
      // Generate the filename based on record ID, picture type, and notes
      const fileName = generateFileName(contextIdentifier, pictureType, notes);
      console.log(`Using filename: ${fileName}`);
      
      // Store the filename in a global variable for sharing
      if (typeof window !== 'undefined') {
        window.customPdfFilename = fileName;
      }
      
      // Create HTML content with images and a VERY PROMINENT filename header on EVERY page
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${fileName}</title>
          <style>
            body, html {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
            }
            .page {
              page-break-after: always;
              page-break-inside: avoid;
              width: 100%;
              height: 100%; /* Use percentage height to fit PDF page */
              margin: 0;
              padding: 0;
              display: flex; /* Use flex to center image */
              justify-content: center;
              align-items: center;
              overflow: hidden; /* Hide any overflow if image is larger than page */
            }
            .image-container {
              width: 100%;
              height: 100%;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .image {
              width: 100%;
              height: 100%;
              object-fit: cover; /* Ensures image covers the page, cropping if necessary */
              display: block;
            }
            /* Last page should not have a page break after it */
            .page:last-child {
              page-break-after: auto;
            }
          </style>
        </head>
        <body>
          ${dataUrls.map((dataUrl, index) => `
            <div class="page">
              <div class="image-container">
                <img class="image" src="${dataUrl}" alt="Image ${index+1}" />
              </div>
            </div>
          `).join('')}
        </body>
        </html>
      `;
      
      // For debugging
      console.log('HTML content length:', htmlContent.length);
      console.log('First 100 chars of HTML:', htmlContent.substring(0, 100));
      
      // Create the PDF directly in the cache directory
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        width: 612, // 8.5 inches at 72 PPI
        height: 792, // 11 inches at 72 PPI
      });
      
      console.log('PDF created successfully at:', uri);
      return uri;
    } catch (error) {
      console.error('Error creating PDF:', error);
      throw error;
    }
  };

  // Function to open the PDF with a custom filename
  const openPdf = async (pdfUri: string) => {
    try {
      // Get our custom filename
      const customName = typeof window !== 'undefined' ? window.customPdfFilename : null;
      const displayName = customName || generateFileName(contextIdentifier, pictureType, notes);
      
      console.log(`Preparing to share PDF: ${pdfUri} with name: ${displayName}`);
      
      if (Platform.OS === 'ios') {
        // On iOS, we need a special approach to ensure the filename is preserved
        // Create a temporary directory for our PDFs if it doesn't exist
        const pdfTempDir = `${FileSystem.cacheDirectory}pdf-temp/`;
        const dirInfo = await FileSystem.getInfoAsync(pdfTempDir);
        
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(pdfTempDir, { intermediates: true });
        }
        
        // Use a unique identifier for this specific PDF to avoid duplicates
        // But store it in a way that doesn't affect the visible filename
        const uniqueId = Date.now().toString();
        // Store the unique ID in the directory path instead of the filename
        const uniqueDir = `${pdfTempDir}${uniqueId}/`;
        await FileSystem.makeDirectoryAsync(uniqueDir, { intermediates: true });
        const targetPath = `${uniqueDir}${displayName}`;
        
        try {
          // Copy the file to our temp directory with the unique name
          await FileSystem.copyAsync({
            from: pdfUri,
            to: targetPath
          });
          
          console.log(`File copied to: ${targetPath}`);
          
          // Share the file with the custom name
          const result = await Sharing.shareAsync(targetPath, {
            UTI: 'com.adobe.pdf',
            mimeType: 'application/pdf',
            dialogTitle: displayName
          });
          
          console.log(`PDF shared with result:`, result);
          
          // Schedule cleanup of the temp file after sharing is complete
          // This prevents accumulation of temporary files in the cache directory
          setTimeout(async () => {
            try {
              // Clean up the entire unique directory instead of just the file
              await FileSystem.deleteAsync(uniqueDir, { idempotent: true });
              console.log(`Temporary directory cleaned up: ${uniqueDir}`);
              
              // Check if the parent temp directory is empty and clean it up if it is
              try {
                const tempDirContents = await FileSystem.readDirectoryAsync(pdfTempDir);
                if (tempDirContents.length === 0) {
                  await FileSystem.deleteAsync(pdfTempDir, { idempotent: true });
                  console.log('Empty parent temp directory cleaned up');
                }
              } catch (parentDirError) {
                // Non-critical error, just log it
                console.warn('Error checking parent directory:', parentDirError);
              }
            } catch (cleanupError) {
              console.warn('Error cleaning up temp files:', cleanupError);
              // Non-critical error, don't alert the user
            }
          }, 10000); // Wait 10 seconds after sharing to clean up
        } catch (copyError) {
          console.error('Error copying file:', copyError);
          // Fall back to sharing the original file
          await Sharing.shareAsync(pdfUri, {
            UTI: 'com.adobe.pdf',
            mimeType: 'application/pdf',
            dialogTitle: displayName
          });
        }
      } else {
        // For Android, use the standard sharing approach
        const fileUri = pdfUri.replace('file://', '');
        
        // Use React Native's Share API
        const result = await Share.share({
          title: displayName,
          message: displayName, // Used as the filename on some platforms
          url: `file://${fileUri}`,
        }, {
          subject: displayName, // Used for email subject
          dialogTitle: `Share ${displayName}`,
        });
        
        console.log(`PDF shared with result:`, result);
      }
      
      // Show a helpful message about the PDF
      setTimeout(() => {
        Alert.alert(
          'PDF Shared',
          `Your PDF "${displayName}" has been shared successfully.`,
          [{ text: 'OK' }]
        );
      }, 1000);
    } catch (error) {
      console.error('Error opening PDF:', error);
      Alert.alert('Error', 'Could not open the PDF file');
    }
  };

  // Main function to generate PDF with a simpler approach
  const generatePdf = async (photos: PhotoData[]) => {
    try {
      console.log(`Starting PDF generation with ${photos.length} photos`);
      
      if (photos.length === 0) {
        throw new Error('No photos available to generate PDF');
      }
      
      // Process images one by one to avoid memory issues
      setProgressMessage(`Processing ${photos.length} images...`);
      setProgressPercent(30);
      
      // Log the first photo URI for debugging
      console.log('First photo URI:', photos[0].uri);
      
      // Process all photos to base64 data URLs
      const processedImages = await processAllPhotos(photos);
      
      if (processedImages.length === 0) {
        throw new Error('Failed to process any images');
      }
      
      console.log(`Successfully processed ${processedImages.length} images to data URLs`);
      
      // Create PDF
      setProgressMessage('Creating PDF document...');
      setProgressPercent(70);
      const pdfResult = await createPdf(processedImages);
      
      if (pdfResult) {
        setPdfUri(pdfResult);
        setProgressMessage('PDF generated successfully!');
        setProgressPercent(100);
        
        // Log analytics
        logAnalyticsEvent('pdf_generation_completed', {
          batchId,
          photoCount: photos.length
        });
        
        // Open PDF
        await openPdf(pdfResult);
        
        // Return to previous screen after delay
        setTimeout(() => {
          if (isMounted.current) {
            navigation.goBack();
          }
        }, 2000); // Slightly longer delay to ensure PDF opens
      }
    } catch (error) {
      if (isMounted.current) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('PDF generation error:', errorMessage);
        setError(`Failed to generate PDF: ${errorMessage}`);
        Alert.alert('Error', `Failed to generate PDF: ${errorMessage}`);
        logErrorToFile('generatePdf', error as Error);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  };

  // Function to select picture type and show notes input
  const selectPictureTypeAndContinue = (type: PictureType) => {
    setPictureType(type);
    setShowPictureTypeModal(false);
    setShowNotesInput(true); // Show notes input after selecting picture type
  };
  
  // Function to submit notes and continue with PDF generation
  const submitNotesAndContinue = () => {
    setShowNotesInput(false);
    fetchAndGeneratePDF();
  };
  
  // Function to fetch batch data and generate PDF
  const fetchAndGeneratePDF = async () => {
    try {
      setIsLoading(true);
      setProgressMessage('Loading batch details...');
      
      console.log(`[PDFGenerationScreen] Fetching details for batch: ${batchId}`);
      
      // Use the database service to get the actual batch details and photos
      const { batch, photos } = await databaseService.getBatchDetails(batchId);
      
      console.log(`[PDFGenerationScreen] Database returned ${photos.length} photos for batch ${batchId}`);
      
      if (batch && photos.length > 0) {
        // Filter photos based on pictureType if needed
        const filteredPhotos = pictureType === 'Defect Pictures' 
          ? photos.filter(photo => photo.isDefect) 
          : photos;
        
        console.log(`[PDFGenerationScreen] Using ${filteredPhotos.length} ${pictureType} for PDF generation`);
        
        if (filteredPhotos.length === 0) {
          Alert.alert(
            'No Photos Found',
            `No ${pictureType.toLowerCase()} found in this batch.`,
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
          return;
        }
        
        // Automatically generate the PDF with the filtered photos
        await generatePdf(filteredPhotos);
      } else {
        console.warn(`[PDFGenerationScreen] No batch or photos found with ID ${batchId}`);
        Alert.alert(
          'No Photos Found',
          'No photos found in this batch. Please capture photos before generating a PDF.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[PDFGenerationScreen] Error: ${errorMessage}`);
      logErrorToFile('fetchAndGeneratePDF', error as Error);
      Alert.alert(
        'Error',
        `Failed to generate PDF: ${errorMessage}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  };
  
  // Start the PDF generation process when component mounts
  useEffect(() => {
    // If picture type is already provided, show notes input
    if (routePictureType) {
      setShowNotesInput(true);
    }
    // Otherwise, we'll show the picture type modal first
    
    // Cleanup when component unmounts
    return () => {
      isMounted.current = false;
      cleanupTempFiles();
    };
  }, [batchId, navigation]);
  
  // Render the screen content
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      
      {/* Picture Type Selection Modal */}
      {showPictureTypeModal && (
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select PDF Content</Text>
            <Text style={styles.modalSubtitle}>What type of pictures would you like to include?</Text>
            
            <TouchableOpacity 
              style={styles.optionButton}
              onPress={() => selectPictureTypeAndContinue('Pictures')}
            >
              <Ionicons name="images-outline" size={24} color={COLORS.primary} />
              <Text style={styles.optionText}>All Pictures</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.optionButton}
              onPress={() => selectPictureTypeAndContinue('Defect Pictures')}
            >
              <Ionicons name="warning-outline" size={24} color={COLORS.error} />
              <Text style={styles.optionText}>Defect Pictures Only</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      {/* Notes Input Modal */}
      {showNotesInput && (
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Notes (Optional)</Text>
            <Text style={styles.modalSubtitle}>Add notes to include in the filename (30 char max)</Text>
            
            <TextInput
              style={styles.notesInput}
              placeholder="Enter notes (e.g., Housing Bore)"
              value={notes}
              onChangeText={setNotes}
              maxLength={30}
            />
            
            <View style={styles.notesButtonContainer}>
              <TouchableOpacity 
                style={styles.skipButton}
                onPress={() => {
                  setNotes('');
                  submitNotesAndContinue();
                }}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.continueButton}
                onPress={submitNotesAndContinue}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      
      <View style={styles.loadingContainer}>
        {isLoading && (
          <>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>{progressMessage}</Text>
            
            {progressPercent > 0 && (
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
              </View>
            )}
            <Text style={styles.progressText}>{progressPercent}%</Text>
          </>
        )}
        
        {error && (
          <>
            <Ionicons name="alert-circle" size={48} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
            <View style={styles.buttonContainer}>
              <View style={styles.button}>
                <Text style={styles.buttonText} onPress={() => navigation.goBack()}>Back to Batch</Text>
              </View>
            </View>
          </>
        )}
        
        {pdfUri && !isLoading && (
          <>
            <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
            <Text style={styles.successText}>PDF Generated Successfully!</Text>
            <Text style={styles.loadingText}>Opening PDF...</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
  progressContainer: {
    width: '80%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginTop: 20,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.error,
    marginTop: 10,
    marginBottom: 20,
    textAlign: 'center',
  },
  successText: {
    fontSize: 18,
    color: COLORS.success,
    marginTop: 10,
    marginBottom: 10,
    textAlign: 'center',
  },
  buttonContainer: {
    marginTop: 20,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal styles
  modalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 20,
    width: '80%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 10,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: COLORS.grey700,
    marginBottom: 20,
    textAlign: 'center',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 15,
    borderRadius: 8,
    marginVertical: 8,
    width: '100%',
  },
  optionText: {
    fontSize: 16,
    marginLeft: 10,
    color: COLORS.grey800,
    fontWeight: '500',
  },
  cancelButton: {
    marginTop: 20,
    padding: 10,
  },
  cancelText: {
    color: COLORS.grey600,
    fontSize: 16,
  },
  notesInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.grey400,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  notesButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  skipButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.grey300,
    width: '45%',
    alignItems: 'center',
  },
  skipButtonText: {
    color: COLORS.grey700,
    fontSize: 16,
    fontWeight: '500',
  },
  continueButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    width: '45%',
    alignItems: 'center',
  },
  continueButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '500',
  }
});

export default PDFGenerationScreen;
