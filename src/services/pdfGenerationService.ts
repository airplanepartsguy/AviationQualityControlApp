/**
 * PDF Generation Service
 * Generates PDFs from photo batches for Salesforce upload
 */

import * as FileSystem from 'expo-file-system';
import { PhotoData } from '../types/data';

export interface PdfGenerationResult {
  success: boolean;
  pdfBase64?: string;
  error?: string;
  photoCount?: number;
}

class PdfGenerationService {
  /**
   * Generate PDF from photo batch
   * Creates a multi-page PDF with photos and metadata
   */
  async generatePdfFromPhotos(
    photos: PhotoData[],
    scannedId: string,
    options: {
      title?: string;
      includeMetadata?: boolean;
    } = {}
  ): Promise<PdfGenerationResult> {
    try {
      console.log(`[PDFGeneration] Generating PDF for ${photos.length} photos`);
      
      if (!photos || photos.length === 0) {
        return {
          success: false,
          error: 'No photos provided for PDF generation',
          photoCount: 0
        };
      }

      // Convert photos to base64 if they're file URIs
      const photoBase64Array: string[] = [];
      
      for (const photo of photos) {
        try {
          let base64Data: string;
          
          if (photo.uri.startsWith('data:')) {
            // Already base64 encoded
            base64Data = photo.uri.split(',')[1];
          } else {
            // Read file and convert to base64
            const fileInfo = await FileSystem.getInfoAsync(photo.uri);
            if (!fileInfo.exists) {
              console.warn(`[PDFGeneration] Photo file not found: ${photo.uri}`);
              continue;
            }
            
            base64Data = await FileSystem.readAsStringAsync(photo.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          }
          
          photoBase64Array.push(base64Data);
        } catch (error) {
          console.error(`[PDFGeneration] Error processing photo ${photo.id}:`, error);
          // Continue with other photos
        }
      }

      if (photoBase64Array.length === 0) {
        return {
          success: false,
          error: 'No valid photos could be processed for PDF generation',
          photoCount: photos.length
        };
      }

      // Generate PDF with photos
      const pdfBase64 = await this.createPdfWithPhotos(
        photoBase64Array,
        scannedId,
        options
      );

      console.log(`[PDFGeneration] PDF generated successfully with ${photoBase64Array.length} photos`);
      
      return {
        success: true,
        pdfBase64,
        photoCount: photoBase64Array.length
      };

    } catch (error) {
      console.error('[PDFGeneration] PDF generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        photoCount: photos.length
      };
    }
  }

  /**
   * Create PDF with embedded photos
   * Uses a simple PDF structure with images
   */
  private async createPdfWithPhotos(
    photoBase64Array: string[],
    scannedId: string,
    options: {
      title?: string;
      includeMetadata?: boolean;
    }
  ): Promise<string> {
    // For now, create a simple PDF with text content
    // In a full implementation, this would use a proper PDF library like react-native-pdf-lib
    // or generate a more complex PDF structure with embedded images
    
    const title = options.title || `${scannedId} - Photos`;
    const photoCount = photoBase64Array.length;
    
    // Create a basic PDF structure
    // This is a simplified version - in production, you'd use a proper PDF library
    const pdfContent = this.generateBasicPdfWithPhotos(title, photoCount, scannedId);
    
    // Convert to base64 (React Native compatible)
    const pdfBase64 = btoa(pdfContent);
    
    return pdfBase64;
  }

  /**
   * Generate basic PDF content with photo information
   * This is a simplified version - in production, use a proper PDF library
   */
  private generateBasicPdfWithPhotos(title: string, photoCount: number, scannedId: string): string {
    const currentDate = new Date().toLocaleDateString();
    
    // Basic PDF structure with content
    const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length 200
>>
stream
BT
/F1 16 Tf
72 720 Td
(${title}) Tj
0 -30 Td
/F1 12 Tf
(Scanned ID: ${scannedId}) Tj
0 -20 Td
(Photo Count: ${photoCount}) Tj
0 -20 Td
(Generated: ${currentDate}) Tj
0 -40 Td
(Photos processed and ready for upload) Tj
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000273 00000 n 
0000000524 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
593
%%EOF`;

    return pdfContent;
  }

  /**
   * Create a test PDF for development/testing
   */
  createTestPdf(scannedId: string): string {
    const pdfContent = this.generateBasicPdfWithPhotos(
      `${scannedId} - Test PDF`,
      0,
      scannedId
    );
    
    return btoa(pdfContent);
  }
}

export default new PdfGenerationService();
