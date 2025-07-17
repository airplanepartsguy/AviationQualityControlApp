/**
 * Salesforce PDF Upload Service
 * Handles uploading merged PDFs to Salesforce records based on scanned IDs
 */

import { salesforceOAuthService } from './salesforceOAuthService';
import companyIntegrationsService from './companyIntegrationsService';
import { salesforceObjectMappingService, ParsedDocumentId } from './salesforceObjectMappingService';

export interface UploadResult {
  success: boolean;
  message: string;
  recordId?: string;
  attachmentId?: string;
  details?: any;
}

export interface ScannedIdInfo {
  fullId: string;
  prefix: string;
  number: string;
  objectName?: string;
  nameField?: string;
}

class SalesforceUploadService {
  /**
   * Parse scanned ID to extract prefix and number
   * Examples: "INV-420" -> { prefix: "INV", number: "420" }
   */
  parseScannedId(scannedId: string): ScannedIdInfo {
    const match = scannedId.match(/^([A-Z]+)-?(.+)$/);
    
    if (!match) {
      throw new Error(`Invalid scanned ID format: ${scannedId}. Expected format: PREFIX-NUMBER (e.g., INV-420)`);
    }

    return {
      fullId: scannedId,
      prefix: match[1],
      number: match[2]
    };
  }

  /**
   * Get Salesforce object information for a given prefix
   */
  async getObjectInfoForPrefix(companyId: string, prefix: string): Promise<{ objectName: string; nameField: string }> {
    try {
      // Get company's Salesforce configuration
      const config = await companyIntegrationsService.getActiveSalesforceConfig(companyId);
      if (!config) {
        throw new Error('No active Salesforce configuration found for company');
      }

      // Look up the prefix in the mapping
      const prefixMapping = config.prefix_mappings[prefix];
      if (!prefixMapping) {
        throw new Error(`No Salesforce object mapping found for prefix: ${prefix}`);
      }

      return {
        objectName: prefixMapping.object_name,
        nameField: prefixMapping.name_field
      };
    } catch (error) {
      console.error('[SalesforceUpload] Error getting object info for prefix:', error);
      throw error;
    }
  }

  /**
   * Search for a Salesforce record by name
   */
  async findRecordByName(
    companyId: string, 
    objectName: string, 
    nameField: string, 
    recordName: string
  ): Promise<{ id: string; name: string } | null> {
    try {
      console.log(`[SalesforceUpload] Searching for record: ${recordName} in ${objectName}.${nameField}`);

      // Get OAuth tokens
      const tokens = await salesforceOAuthService.getStoredTokens(companyId);
      if (!tokens) {
        throw new Error('No Salesforce OAuth tokens found. Please authenticate first.');
      }

      // Get Salesforce configuration
      const config = await companyIntegrationsService.getActiveSalesforceConfig(companyId);
      if (!config) {
        throw new Error('No active Salesforce configuration found');
      }

      // Build SOQL query
      const soqlQuery = `SELECT Id, ${nameField} FROM ${objectName} WHERE ${nameField} = '${recordName}' LIMIT 1`;
      const queryUrl = `${config.instance_url}/services/data/v${config.api_version}/query/?q=${encodeURIComponent(soqlQuery)}`;

      console.log(`[SalesforceUpload] SOQL Query: ${soqlQuery}`);

      // Execute query
      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Salesforce query failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const queryResult = await response.json();
      
      if (queryResult.records && queryResult.records.length > 0) {
        const record = queryResult.records[0];
        console.log(`[SalesforceUpload] Found record: ${record.Id} - ${record[nameField]}`);
        return {
          id: record.Id,
          name: record[nameField]
        };
      }

      console.log(`[SalesforceUpload] No record found with name: ${recordName}`);
      return null;
    } catch (error) {
      console.error('[SalesforceUpload] Error finding record by name:', error);
      throw error;
    }
  }

  /**
   * Upload PDF file as attachment to Salesforce record
   */
  async uploadPdfToRecord(
    companyId: string,
    recordId: string,
    pdfBase64: string,
    fileName: string
  ): Promise<{ attachmentId: string }> {
    try {
      console.log(`[SalesforceUpload] Uploading PDF ${fileName} to record ${recordId}`);

      // Get OAuth tokens
      const tokens = await salesforceOAuthService.getStoredTokens(companyId);
      if (!tokens) {
        throw new Error('No Salesforce OAuth tokens found. Please authenticate first.');
      }

      // Get Salesforce configuration
      const config = await companyIntegrationsService.getActiveSalesforceConfig(companyId);
      if (!config) {
        throw new Error('No active Salesforce configuration found');
      }

      // Create attachment record
      const attachmentData = {
        Name: fileName,
        ParentId: recordId,
        Body: pdfBase64,
        ContentType: 'application/pdf'
      };

      const createUrl = `${config.instance_url}/services/data/v${config.api_version}/sobjects/Attachment`;

      const response = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(attachmentData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Salesforce attachment upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`[SalesforceUpload] PDF uploaded successfully. Attachment ID: ${result.id}`);

      return {
        attachmentId: result.id
      };
    } catch (error) {
      console.error('[SalesforceUpload] Error uploading PDF to record:', error);
      throw error;
    }
  }

  /**
   * Complete upload flow: parse ID, find record, upload PDF
   */
  async uploadPdfByScannedId(
    companyId: string,
    scannedId: string,
    pdfBase64: string
  ): Promise<UploadResult> {
    try {
      console.log(`[SalesforceUpload] Starting upload flow for scanned ID: ${scannedId}`);

      // Step 1: Parse scanned ID and find object mapping
      const parsedId = await salesforceObjectMappingService.parseDocumentIdWithMapping(companyId, scannedId);
      if (!parsedId.mapping) {
        return {
          success: false,
          message: `No object mapping found for prefix '${parsedId.prefix}'. Please configure object mappings in settings.`,
          details: {
            scannedId,
            prefix: parsedId.prefix,
            availableMappings: await salesforceObjectMappingService.getCompanyObjectMappings(companyId)
          }
        };
      }

      console.log(`[SalesforceUpload] Found mapping: ${parsedId.prefix} -> ${parsedId.mapping.salesforce_object}`);

      // Step 2: Get Salesforce integration and tokens
      const integration = await companyIntegrationsService.getIntegration(companyId, 'salesforce');
      if (!integration || integration.status !== 'active') {
        return {
          success: false,
          message: 'Salesforce integration is not active for this company',
          details: { integrationStatus: integration?.status || 'not_found' }
        };
      }

      const tokens = await salesforceOAuthService.getStoredTokens(companyId);
      if (!tokens || !tokens.access_token) {
        return {
          success: false,
          message: 'No valid Salesforce OAuth tokens found. Please re-authenticate.',
          details: { tokenStatus: 'missing_or_invalid' }
        };
      }

      // Step 3: Search for record by name
      const record = await this.findRecordByName(
        companyId,
        parsedId.mapping.salesforce_object,
        parsedId.mapping.name_field,
        parsedId.fullId
      );

      if (!record) {
        return {
          success: false,
          message: `No ${parsedId.mapping.salesforce_object} record found with ${parsedId.mapping.name_field} = '${parsedId.fullId}'`,
          details: {
            scannedId,
            objectName: parsedId.mapping.salesforce_object,
            searchField: parsedId.mapping.name_field,
            searchValue: parsedId.fullId
          }
        };
      }

      console.log(`[SalesforceUpload] Found record: ${record.id}`);

      // Step 4: Upload PDF as attachment
      const fileName = `${parsedId.fullId} - Pics.pdf`;
      const uploadResult = await this.uploadPdfToRecord(
        companyId,
        record.id,
        pdfBase64,
        fileName
      );

      return {
        success: true,
        message: `PDF successfully uploaded to ${parsedId.mapping.salesforce_object} record ${parsedId.fullId}`,
        recordId: record.id,
        attachmentId: uploadResult.attachmentId,
        details: {
          scannedId,
          objectName: parsedId.mapping.salesforce_object,
          fileName
        }
      };

    } catch (error) {
      console.error('[SalesforceUpload] Upload flow failed:', error);
      return {
        success: false,
        message: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {
          scannedId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Test the upload flow without actually uploading (dry run)
   */
  async testUploadFlow(companyId: string, scannedId: string): Promise<UploadResult> {
    try {
      console.log(`[SalesforceUpload] Testing upload flow for scanned ID: ${scannedId}`);

      // Step 1: Parse scanned ID
      const idInfo = this.parseScannedId(scannedId);

      // Step 2: Get object information for prefix
      const objectInfo = await this.getObjectInfoForPrefix(companyId, idInfo.prefix);

      // Step 3: Search for record by name (dry run - just check if record exists)
      const record = await this.findRecordByName(
        companyId,
        objectInfo.objectName,
        objectInfo.nameField,
        scannedId
      );

      if (!record) {
        return {
          success: false,
          message: `TEST: No ${objectInfo.objectName} record found with name: ${scannedId}`,
          details: {
            scannedId,
            objectName: objectInfo.objectName,
            searchField: objectInfo.nameField,
            testMode: true
          }
        };
      }

      return {
        success: true,
        message: `TEST: Found ${objectInfo.objectName} record: ${record.name}. PDF upload would succeed.`,
        recordId: record.id,
        details: {
          scannedId,
          recordName: record.name,
          objectName: objectInfo.objectName,
          fileName: `${scannedId} - Pics.pdf`,
          testMode: true
        }
      };

    } catch (error) {
      console.error('[SalesforceUpload] Test upload flow failed:', error);
      return {
        success: false,
        message: `TEST FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {
          scannedId,
          error: error instanceof Error ? error.message : 'Unknown error',
          testMode: true
        }
      };
    }
  }
}

export default new SalesforceUploadService();
