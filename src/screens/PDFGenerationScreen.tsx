import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator
} from 'react-native';
import { PDFGenerationScreenProps } from '../types/navigation';
import CustomButton from '../components/CustomButton';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import { logErrorToFile } from '../services/analyticsService'; // Corrected import path
import { mockSyncToErp } from '../services/erpService'; // Corrected import name
import { PhotoData } from '../types/data';

const PDFGenerationScreen = ({ route, navigation }: PDFGenerationScreenProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Correctly destructure params based on updated RootStackParamList
  const { photos, reportType, orderNumber, inventorySessionId, userId } = route.params;

  const contextIdentifier = orderNumber || inventorySessionId || 'UnknownContext';

  const generatePdfContent = async (): Promise<string> => {
    let contentHtml = '';

    if (reportType === 'simple') {
      // Generate simple image list
      for (const photo of photos) {
        let imageBase64 = '';

        try {
          const imageInfo = await FileSystem.getInfoAsync(photo.uri);
          if (imageInfo.exists) {
            imageBase64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 });
          } else {
            console.warn(`[PDFGenerationScreen] Image file not found: ${photo.uri}`);
          }
        } catch (e) {
          console.error(`[PDFGenerationScreen] Failed to read image file: ${photo.uri}`, e);
          await logErrorToFile(`[PDFGenerationScreen] Failed to read image ${photo.uri}`, e instanceof Error ? e : new Error(String(e)));
        }
        contentHtml += `
          <div class="simple-photo-item">
            <img src="data:image/jpeg;base64,${imageBase64}" />
          </div>
        `;
      }
      // Return simple HTML structure
      return `
        <html>
          <head>
            <style>
              body { margin: 0; padding: 0; }
              .simple-photo-item { 
                page-break-after: always; /* Ensure each image starts on a new page */
                width: 100%; 
                height: 100vh; /* Try to fill the page height */
                display: flex; 
                justify-content: center; 
                align-items: center; 
                overflow: hidden; /* Prevent image overflow */
              }
              .simple-photo-item img { 
                max-width: 100%; 
                max-height: 100vh; /* Fit image within viewport height */
                object-fit: contain; /* Scale image while preserving aspect ratio */
              }
              /* Hide the last page break */
              .simple-photo-item:last-child { page-break-after: auto; }
            </style>
          </head>
          <body>${contentHtml}</body>
        </html>
      `;
    } else {
      // Generate detailed defect report (existing logic)
      for (const photo of photos) {
        let imageBase64 = '';

        try {
          const imageInfo = await FileSystem.getInfoAsync(photo.uri);
          if (imageInfo.exists) {
            imageBase64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 });
          } else {
            console.warn(`[PDFGenerationScreen] Image file not found: ${photo.uri}`);
          }
        } catch (e) {
          console.error(`[PDFGenerationScreen] Failed to read image file: ${photo.uri}`, e);
          await logErrorToFile(`[PDFGenerationScreen] Failed to read image ${photo.uri}`, e instanceof Error ? e : new Error(String(e)));
        }

        // Detailed photo item HTML
        contentHtml += `
          <div class="detailed-photo-item">
            <h3>Photo ID: ${photo.id} (Part: ${photo.metadata.partNumber || 'N/A'})</h3>
            <div class="image-container">
              <img src="data:image/jpeg;base64,${imageBase64}" />
              ${photo.metadata.annotationUri ? `<img src="${photo.metadata.annotationUri}" class="annotation-overlay" />` : ''}
            </div>
            <div class="metadata">
              <p><strong>Timestamp:</strong> ${new Date(photo.metadata.timestamp).toLocaleString()}</p>
              <p><strong>User ID:</strong> ${photo.metadata.userId}</p>
              <p><strong>Defects Marked:</strong> ${photo.metadata.hasDefects ? 'Yes' : 'No'}${photo.metadata.defectNotes ? ` - Notes: ${photo.metadata.defectNotes}` : ''}</p>
            </div>
          </div>
        `;
      }

      // Return detailed HTML structure
      return `
        <html>
          <head>
            <style>
              body { font-family: sans-serif; margin: 20px; }
              h1 { text-align: center; color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
              .summary { margin-bottom: 20px; padding: 10px; background-color: #f9f9f9; border: 1px solid #eee; page-break-after: avoid; }
              .detailed-photo-item { 
                border: 1px solid #ccc; 
                margin-bottom: 20px; 
                padding: 15px; 
                page-break-inside: avoid; /* Crucial: Prevent item from splitting across pages */
                background-color: #fff; /* Ensure background for visibility */
              }
              .image-container { 
                position: relative; 
                max-width: 100%; 
                margin-bottom: 10px; 
                border: 1px solid #eee; 
                display: inline-block; /* Helps with page-break control */
              }
              .image-container img { 
                display: block; /* Prevents extra space below image */
                max-width: 100%; 
                height: auto; /* Maintain aspect ratio */
              }
              .annotation-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none; /* Allows interaction with underlying image if needed */
              }
              .metadata p { margin: 5px 0; font-size: 0.9em; color: #555; }
              .metadata strong { color: #000; }
            </style>
          </head>
          <body>
            <h1>Quality Control Report</h1>
            <div class="summary">
              <h2>Summary</h2>
              <p><strong>Context:</strong> ${orderNumber || inventorySessionId || 'Unknown Context'}</p>
              <p><strong>Generated By:</strong> User ${userId}</p>
              <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              <p><strong>Total Photos:</strong> ${photos.length}</p>
            </div>
            ${contentHtml}
          </body>
        </html>
      `;
    }
  };

  // Generate PDF effect
  useEffect(() => {
    const createPdf = async () => {
      if (photos.length === 0) {
        Alert.alert("Error", "No photos available to generate PDF.");
        navigation.goBack();
        return;
      }
      setIsLoading(true);
      try {
        const pdfFilename = `Report_${contextIdentifier}_${new Date().toISOString().split('T')[0]}.pdf`;
        const pdfDirectory = `${FileSystem.documentDirectory}pdf_reports/`;
        const targetPdfPath = `${pdfDirectory}${pdfFilename}`;

        await FileSystem.makeDirectoryAsync(pdfDirectory, { intermediates: true });

        console.log("[PDFGenerationScreen] Generating HTML content...");
        const html = await generatePdfContent();
        console.log(`[PDFGenerationScreen] Generating ${reportType} PDF file at ${targetPdfPath}...`);
        const { uri: tempUri } = await Print.printToFileAsync({ html: html, width: 612, height: 792 });
        console.log(`[PDFGenerationScreen] Moving PDF from ${tempUri} to ${targetPdfPath}`);
        await FileSystem.moveAsync({ from: tempUri, to: targetPdfPath });
        console.log(`[PDFGenerationScreen] PDF generated and saved to: ${targetPdfPath}`);
        setPdfUri(targetPdfPath);
      } catch (err) {
        console.error("[PDFGenerationScreen] Failed to generate PDF:", err);
        await logErrorToFile(`[PDFGenerationScreen] PDF generation failed`, err instanceof Error ? err : new Error(String(err)));
        Alert.alert("PDF Generation Failed", "Could not create the PDF report.");
        navigation.goBack();
      } finally {
        setIsLoading(false);
      }
    };

    createPdf();
  }, [photos, reportType]);

  const handlePreview = async () => {
    if (!pdfUri) return;
    try {
      console.log(`[PDFGenerationScreen] Attempting to share/preview PDF: ${pdfUri}`);
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("Preview Not Available", "Sharing/Preview functionality is not available on this device.");
        return;
      }
      await Sharing.shareAsync(pdfUri, { dialogTitle: 'Preview PDF Report', mimeType: 'application/pdf' });
    } catch (err) {
      console.error("[PDFGenerationScreen] Failed to preview PDF:", err);
      await logErrorToFile(`[PDFGenerationScreen] PDF preview failed`, err instanceof Error ? err : new Error(String(err)));
      Alert.alert("Preview Failed", "Could not open PDF for preview.");
    }
  };

  const handleShare = async () => {
    if (!pdfUri) return;
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Sharing Not Available", "Sharing is not available on this device.");
      return;
    }
    try {
      console.log(`[PDFGenerationScreen] Sharing PDF: ${pdfUri}`);
      await Sharing.shareAsync(pdfUri, { dialogTitle: 'Share PDF Report', mimeType: 'application/pdf' });
    } catch (err) {
      console.error("[PDFGenerationScreen] Failed to share PDF:", err);
      await logErrorToFile(`[PDFGenerationScreen] PDF sharing failed`, err instanceof Error ? err : new Error(String(err)));
      Alert.alert("Share Failed", "Could not share PDF report.");
    }
  };

  const handleSave = () => {
    if (!pdfUri) return;
    Alert.alert("File Saved", `PDF report saved successfully in the app's documents folder as: ${pdfUri.split('/').pop()}`);
  };

  const handleSyncERP = async () => {
    if (!pdfUri) {
      Alert.alert("Error", "PDF is not yet generated or failed to generate.");
      return;
    }
    Alert.alert("Syncing to ERP", "Attempting to upload PDF report... (Mock)", [{ text: "OK" }]);
    try {
      // Construct the SyncData object expected by mockSyncToErp
      const syncData = {
        pdfUri: pdfUri,
        metadata: {
          reportType: reportType, // Include report type in synced data
          partNumber: photos[0]?.metadata.partNumber || 'N/A', // Use first photo's part number or N/A
          batchId: contextIdentifier, // Use order/inventory ID as batch ID
          timestamp: new Date().toISOString(), // Current timestamp for sync
          userId: userId
        }
      };
      const { success } = await mockSyncToErp(syncData);
      if (success) {
        Alert.alert("Sync Successful", "Report successfully synced to ERP (Mock).");
      } else {
        Alert.alert("Sync Failed", "Could not sync report to ERP (Mock). Check connection or queue.");
      }
    } catch (err) {
      console.error("[PDFGenerationScreen] ERP Sync failed:", err);
      await logErrorToFile(`[PDFGenerationScreen] ERP Sync failed`, err instanceof Error ? err : new Error(String(err)));
      Alert.alert("Sync Error", "An error occurred during ERP sync.");
    }
  };

  const handleDone = () => {
    console.log("[PDFGenerationScreen] Process complete. Navigating to Dashboard.");
    navigation.popToTop();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeAreaCentered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Generating PDF Report...</Text>
      </SafeAreaView>
    );
  }

  if (!pdfUri) {
    return (
      <SafeAreaView style={styles.safeAreaCentered}>
        <Ionicons name="alert-circle-outline" size={60} color={COLORS.error} />
        <Text style={styles.errorText}>Failed to generate PDF report.</Text>
        <CustomButton title="Go Back" onPress={() => navigation.goBack()} variant='outline' />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Ionicons name="checkmark-done-outline" size={50} color={pdfUri ? COLORS.success : COLORS.textDisabled} />
          <Text style={styles.title}>PDF Report Generated</Text>
          <Text style={styles.subtitle}>{pdfUri.split('/').pop()}</Text>
        </View>

        <View style={styles.previewPlaceholder}>
          <Ionicons name="document-text-outline" size={30} color={COLORS.grey500} style={{ marginBottom: SPACING.small }} />
          <Text style={styles.previewText}>Context: {contextIdentifier}</Text>
          <Text style={styles.previewText}>Photos included: {photos.length}</Text>
          <Text style={styles.previewText}>Saved to device documents.</Text>
        </View>

        <View style={styles.actionsContainer}>
          <CustomButton
            title="Preview / Open"
            onPress={handlePreview}
            variant="outline"
            icon={<Ionicons name="eye-outline" size={20} color={COLORS.primary} />}
            style={styles.actionButton}
          />
          <CustomButton
            title="Share"
            onPress={handleShare}
            variant="outline"
            icon={<Ionicons name="share-social-outline" size={20} color={COLORS.primary} />}
            style={styles.actionButton}
          />
          <CustomButton
            title="Confirm Saved"
            onPress={handleSave}
            variant="outline"
            icon={<Ionicons name="checkmark-done-outline" size={20} color={COLORS.success} />}
            style={styles.actionButton}
          />
        </View>

        <View style={styles.syncContainer}>
          <CustomButton
            title="Sync to ERP (Mock)"
            onPress={handleSyncERP}
            variant="secondary"
            icon={<Ionicons name="cloud-upload-outline" size={20} color={COLORS.white} />}
          />
        </View>

        <View style={styles.doneButtonContainer}>
          <CustomButton
            title="Finish & Go Home"
            onPress={handleDone}
            variant="primary"
            icon={<Ionicons name="home-outline" size={20} color={COLORS.white} />}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeAreaCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.large,
  },
  container: {
    flexGrow: 1,
    padding: SPACING.medium,
    alignItems: 'center',
    paddingBottom: SPACING.xlarge,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.large,
    paddingTop: SPACING.medium,
  },
  title: {
    fontSize: FONTS.xlarge,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SPACING.small,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: SPACING.tiny,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.large,
    color: COLORS.textSecondary,
  },
  errorText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.large,
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: SPACING.medium,
  },
  previewPlaceholder: {
    width: '100%',
    padding: SPACING.large,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    marginBottom: SPACING.large,
    ...SHADOWS.small,
    alignItems: 'center',
    borderLeftWidth: 5,
    borderLeftColor: COLORS.primary,
  },
  previewText: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: SPACING.small,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: SPACING.large,
    flexWrap: 'wrap',
  },
  actionButton: {
    marginVertical: SPACING.tiny,
    marginHorizontal: SPACING.tiny,
    flexBasis: '45%',
    flexGrow: 1,
  },
  syncContainer: {
    width: '100%',
    marginBottom: SPACING.large,
    paddingHorizontal: SPACING.medium,
  },
  doneButtonContainer: {
    width: '100%',
    paddingHorizontal: SPACING.large,
    marginTop: SPACING.medium,
    paddingBottom: SPACING.large,
  },
});

export default PDFGenerationScreen;
