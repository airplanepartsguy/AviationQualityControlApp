/**
 * Salesforce Upload Test Screen
 * Test interface for PDF upload functionality
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, CARD_STYLES } from '../styles/theme';
import salesforceUploadService from '../services/salesforceUploadService';

const SalesforceTestScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  
  const [scannedId, setScannedId] = useState('INV-420');
  const [testResult, setTestResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTestUploadFlow = async () => {
    if (!currentCompany) {
      Alert.alert('Error', 'No company selected');
      return;
    }

    if (!scannedId.trim()) {
      Alert.alert('Error', 'Please enter a scanned ID');
      return;
    }

    try {
      setIsLoading(true);
      setTestResult(null);

      console.log('[SalesforceTest] Testing upload flow for:', scannedId);
      
      const result = await salesforceUploadService.testUploadFlow(
        currentCompany.id,
        scannedId.trim()
      );

      setTestResult(result);
      
      if (result.success) {
        Alert.alert(
          'Test Successful!', 
          result.message,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Test Failed', 
          result.message,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[SalesforceTest] Test failed:', error);
      Alert.alert(
        'Test Error',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleActualUpload = async () => {
    if (!currentCompany) {
      Alert.alert('Error', 'No company selected');
      return;
    }

    if (!scannedId.trim()) {
      Alert.alert('Error', 'Please enter a scanned ID');
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      'Confirm Upload',
      `This will upload a test PDF to the Salesforce record for ${scannedId}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upload', onPress: performActualUpload }
      ]
    );
  };

  const performActualUpload = async () => {
    try {
      setIsLoading(true);
      setTestResult(null);

      // Create a simple test PDF (base64 encoded)
      const testPdfBase64 = createTestPdfBase64();

      console.log('[SalesforceTest] Performing actual upload for:', scannedId);
      
      const result = await salesforceUploadService.uploadPdfByScannedId(
        currentCompany!.id,
        scannedId.trim(),
        testPdfBase64
      );

      setTestResult(result);
      
      if (result.success) {
        Alert.alert(
          'Upload Successful!', 
          result.message,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Upload Failed', 
          result.message,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[SalesforceTest] Upload failed:', error);
      Alert.alert(
        'Upload Error',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Create a simple test PDF in base64 format
  const createTestPdfBase64 = (): string => {
    // This is a minimal PDF file in base64 format
    // In a real app, this would be the merged PDF from photos
    return 'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovQ29udGVudHMgNCAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCA0NAo+PgpzdHJlYW0KQLQKMC4wNzUgMCAwIDAuMDc1IDAgMCBjbQpCVAovRjEgMTIgVGYKNzIgNzIwIFRkCihUZXN0IFBERikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQo+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjA3IDAwMDAwIG4gCjAwMDAwMDAzMDEgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA2Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgozNzAKJSVFT0Y=';
  };

  const renderTestResult = () => {
    if (!testResult) return null;

    return (
      <View style={styles.resultSection}>
        <Text style={styles.resultTitle}>Test Result</Text>
        <View style={[
          styles.resultCard,
          { backgroundColor: testResult.success ? COLORS.success + '20' : COLORS.error + '20' }
        ]}>
          <View style={styles.resultHeader}>
            <Ionicons
              name={testResult.success ? 'checkmark-circle' : 'alert-circle'}
              size={24}
              color={testResult.success ? COLORS.success : COLORS.error}
            />
            <Text style={[
              styles.resultStatus,
              { color: testResult.success ? COLORS.success : COLORS.error }
            ]}>
              {testResult.success ? 'SUCCESS' : 'FAILED'}
            </Text>
          </View>
          
          <Text style={styles.resultMessage}>{testResult.message}</Text>
          
          {testResult.details && (
            <View style={styles.detailsSection}>
              <Text style={styles.detailsTitle}>Details:</Text>
              <Text style={styles.detailsText}>
                {JSON.stringify(testResult.details, null, 2)}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Salesforce Upload Test</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Test PDF Upload Flow</Text>
          <Text style={styles.sectionDescription}>
            Test the complete flow: parse scanned ID → find Salesforce record → upload PDF
          </Text>
          
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Scanned ID</Text>
              <TextInput
                style={styles.textInput}
                value={scannedId}
                onChangeText={setScannedId}
                placeholder="Enter scanned ID (e.g., INV-420)"
                autoCapitalize="characters"
              />
              <Text style={styles.inputHint}>
                Format: PREFIX-NUMBER (e.g., INV-420, PO-123, RLS-456)
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.testButton]}
                onPress={handleTestUploadFlow}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Ionicons name="search" size={20} color={COLORS.primary} />
                )}
                <Text style={styles.testButtonText}>
                  {isLoading ? 'Testing...' : 'Test Flow (Dry Run)'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.uploadButton]}
                onPress={handleActualUpload}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Ionicons name="cloud-upload" size={20} color={COLORS.white} />
                )}
                <Text style={styles.uploadButtonText}>
                  {isLoading ? 'Uploading...' : 'Upload Test PDF'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {renderTestResult()}

        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Object Prefix Mappings</Text>
          <Text style={styles.helpText}>
            RLS → inscor__Release__c{'\n'}
            PO → inscor__Purchase_Order__c{'\n'}
            SO → inscor__Sales_Order__c{'\n'}
            INV → inscor__Inventory_Line__c{'\n'}
            RO → inscor__Repair_Order__c{'\n'}
            WO → inscor__Work_Order__c{'\n'}
            INVC → inscor__Invoice__c{'\n'}
            RMA → inscor__RMA__c
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  backButton: {
    padding: SPACING.small,
  },
  headerTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: SPACING.large,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginHorizontal: SPACING.medium,
    marginBottom: SPACING.small,
  },
  sectionDescription: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginBottom: SPACING.small,
    lineHeight: 20,
    marginHorizontal: SPACING.medium,
  },
  card: {
    ...CARD_STYLES.elevated,
    marginHorizontal: SPACING.medium,
  },
  inputGroup: {
    marginBottom: SPACING.medium,
  },
  inputLabel: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.medium,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    marginBottom: SPACING.small,
  },
  inputHint: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.medium,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    gap: SPACING.small,
  },
  testButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  testButtonText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.primary,
  },
  uploadButton: {
    backgroundColor: COLORS.success,
  },
  uploadButtonText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.white,
  },
  resultSection: {
    marginHorizontal: SPACING.medium,
    marginBottom: SPACING.large,
  },
  resultTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  resultCard: {
    padding: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.small,
  },
  resultStatus: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    marginLeft: SPACING.small,
  },
  resultMessage: {
    fontSize: FONTS.medium,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  detailsSection: {
    marginTop: SPACING.small,
    padding: SPACING.small,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.small,
  },
  detailsTitle: {
    fontSize: FONTS.small,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.tiny,
  },
  detailsText: {
    fontSize: FONTS.tiny,
    color: COLORS.textLight,
    fontFamily: 'monospace',
  },
  helpSection: {
    marginHorizontal: SPACING.medium,
    marginBottom: SPACING.large,
    padding: SPACING.medium,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.medium,
  },
  helpTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  helpText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
});

export default SalesforceTestScreen;
