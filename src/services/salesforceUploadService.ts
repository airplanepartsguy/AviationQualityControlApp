/**
 * Salesforce PDF Upload Service
 * Handles uploading merged PDFs to Salesforce records based on scanned IDs
 */

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
      // Use the same object mapping service as the main upload flow
      const mapping = await salesforceObjectMappingService.findMappingForPrefix(companyId, prefix);
      if (!mapping) {
        throw new Error(`No Salesforce object mapping found for prefix: ${prefix}`);
      }

      return {
        objectName: mapping.salesforce_object,
        nameField: mapping.name_field
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

      // Get OAuth tokens from Supabase (same place OAuth flow stores them)
      const integration = await companyIntegrationsService.getIntegration(companyId, 'salesforce');
      if (!integration || integration.status !== 'active') {
        throw new Error('No active Salesforce integration found. Please authenticate first.');
      }
      
      const config = integration.config;
      if (!config || !config.access_token) {
        throw new Error('No valid Salesforce OAuth tokens found. Please re-authenticate.');
      }
      
      const tokens = {
        access_token: config.access_token,
        refresh_token: config.refresh_token,
        instance_url: config.instance_url
      };

      // Config is already available from integration above

      // Build SOQL query
      const soqlQuery = `SELECT Id, ${nameField} FROM ${objectName} WHERE ${nameField} = '${recordName}' LIMIT 1`;
      const apiVersion = config.api_version || 'v58.0';
      // Ensure API version has 'v' prefix
      const formattedApiVersion = apiVersion.startsWith('v') ? apiVersion : `v${apiVersion}`;
      const queryUrl = `${config.instance_url}/services/data/${formattedApiVersion}/query/?q=${encodeURIComponent(soqlQuery)}`;

      console.log(`[SalesforceUpload] SOQL Query: ${soqlQuery}`);
      console.log(`[SalesforceUpload] Query URL: ${queryUrl}`);
      console.log(`[SalesforceUpload] Instance URL: ${config.instance_url}`);
      console.log(`[SalesforceUpload] API Version: ${apiVersion}`);
      console.log(`[SalesforceUpload] Object Name: ${objectName}`);
      console.log(`[SalesforceUpload] Access Token (first 20 chars): ${tokens.access_token.substring(0, 20)}...`);

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
  ): Promise<{ attachmentId: string; contentVersionId?: string; contentDocumentLinkId?: string }> {
    try {
      console.log(`[SalesforceUpload] Uploading PDF ${fileName} to record ${recordId}`);

      // Get OAuth tokens from Supabase (same place OAuth flow stores them)
      const integration = await companyIntegrationsService.getIntegration(companyId, 'salesforce');
      if (!integration || integration.status !== 'active') {
        throw new Error('No active Salesforce integration found. Please authenticate first.');
      }
      
      const config = integration.config;
      if (!config || !config.access_token) {
        throw new Error('No valid Salesforce OAuth tokens found. Please re-authenticate.');
      }
      
      const tokens = {
        access_token: config.access_token,
        refresh_token: config.refresh_token,
        instance_url: config.instance_url
      };

      // Config is already available from integration above

      // Ensure API version has 'v' prefix (same logic as query method)
      const apiVersion = config.api_version || 'v58.0';
      const formattedApiVersion = apiVersion.startsWith('v') ? apiVersion : `v${apiVersion}`;

      // Step 1: Create ContentVersion (the file content)
      const contentVersionData = {
        Title: fileName.replace('.pdf', ''), // Remove extension for title
        PathOnClient: fileName,
        VersionData: pdfBase64,
        ContentLocation: 'S' // Stored in Salesforce
      };

      const contentVersionUrl = `${config.instance_url}/services/data/${formattedApiVersion}/sobjects/ContentVersion`;
      
      console.log(`[SalesforceUpload] Creating ContentVersion at: ${contentVersionUrl}`);
      console.log(`[SalesforceUpload] ContentVersion data:`, {
        Title: contentVersionData.Title,
        PathOnClient: contentVersionData.PathOnClient,
        ContentLocation: contentVersionData.ContentLocation,
        VersionDataLength: pdfBase64.length
      });

      const contentVersionResponse = await fetch(contentVersionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(contentVersionData)
      });

      if (!contentVersionResponse.ok) {
        const errorText = await contentVersionResponse.text();
        throw new Error(`Salesforce ContentVersion creation failed: ${contentVersionResponse.status} ${contentVersionResponse.statusText} - ${errorText}`);
      }

      const contentVersionResult = await contentVersionResponse.json();
      console.log(`[SalesforceUpload] ContentVersion created successfully. ID: ${contentVersionResult.id}`);

      // Step 2: Get the ContentDocumentId from the ContentVersion
      const queryUrl = `${config.instance_url}/services/data/${formattedApiVersion}/query/?q=SELECT%20ContentDocumentId%20FROM%20ContentVersion%20WHERE%20Id%20%3D%20'${contentVersionResult.id}'`;
      
      const queryResponse = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!queryResponse.ok) {
        const errorText = await queryResponse.text();
        throw new Error(`Failed to get ContentDocumentId: ${queryResponse.status} ${queryResponse.statusText} - ${errorText}`);
      }

      const queryResult = await queryResponse.json();
      const contentDocumentId = queryResult.records[0]?.ContentDocumentId;
      
      if (!contentDocumentId) {
        throw new Error('Failed to retrieve ContentDocumentId from ContentVersion');
      }

      console.log(`[SalesforceUpload] ContentDocumentId: ${contentDocumentId}`);

      // Step 3: Create ContentDocumentLink to associate file with record
      const contentDocumentLinkData = {
        ContentDocumentId: contentDocumentId,
        LinkedEntityId: recordId,
        ShareType: 'V', // Viewer permission
        Visibility: 'AllUsers'
      };

      const contentDocumentLinkUrl = `${config.instance_url}/services/data/${formattedApiVersion}/sobjects/ContentDocumentLink`;
      
      console.log(`[SalesforceUpload] Creating ContentDocumentLink at: ${contentDocumentLinkUrl}`);
      console.log(`[SalesforceUpload] ContentDocumentLink data:`, contentDocumentLinkData);

      const linkResponse = await fetch(contentDocumentLinkUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(contentDocumentLinkData)
      });

      if (!linkResponse.ok) {
        const errorText = await linkResponse.text();
        throw new Error(`Salesforce ContentDocumentLink creation failed: ${linkResponse.status} ${linkResponse.statusText} - ${errorText}`);
      }

      const linkResult = await linkResponse.json();
      console.log(`[SalesforceUpload] ContentDocumentLink created successfully. ID: ${linkResult.id}`);
      console.log(`[SalesforceUpload] PDF uploaded successfully as modern Salesforce File. ContentDocument ID: ${contentDocumentId}`);

      return {
        attachmentId: contentDocumentId, // Return ContentDocument ID for modern files
        contentVersionId: contentVersionResult.id,
        contentDocumentLinkId: linkResult.id
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

      // Tokens are already validated in the integration check above
      const tokens = {
        access_token: integration.config.access_token,
        refresh_token: integration.config.refresh_token,
        instance_url: integration.config.instance_url
      };

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
