/**
 * PDF Generation Service
 * Generates PDFs from photo batches for Salesforce upload
 */

import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { PhotoData } from '../types/data';

export interface PdfGenerationResult {
  success: boolean;
  pdfBase64?: string;
  pdfUri?: string;
  error?: string;
  photoCount?: number;
}

class PdfGenerationService {
  /**
   * Generate PDF from photo batch
   * Creates a multi-page PDF with actual embedded photos
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

      // Convert photos to base64 data URLs
      const photoBase64Array: string[] = [];
      
      for (const photo of photos) {
        try {
          let base64Data: string;
          
          if (photo.uri.startsWith('data:')) {
            // Already base64 encoded
            base64Data = photo.uri;
          } else {
            // Read file and convert to base64
            const fileInfo = await FileSystem.getInfoAsync(photo.uri);
            if (!fileInfo.exists) {
              console.warn(`[PDFGeneration] Photo file not found: ${photo.uri}`);
              continue;
            }
            
            const base64File = await FileSystem.readAsStringAsync(photo.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            base64Data = `data:image/jpeg;base64,${base64File}`;
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

      // Generate PDF with actual photos
      const pdfResult = await this.createPdfWithEmbeddedPhotos(
        photoBase64Array,
        scannedId,
        options
      );

      console.log(`[PDFGeneration] PDF generated successfully with ${photoBase64Array.length} photos`);
      
      // Convert to base64 for upload
      const pdfBase64 = await FileSystem.readAsStringAsync(pdfResult, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      return {
        success: true,
        pdfBase64,
        pdfUri: pdfResult,
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
   * Create PDF with embedded photos using expo-print
   * This creates actual PDFs with photos, not just text
   */
  private async createPdfWithEmbeddedPhotos(
    photoBase64Array: string[],
    scannedId: string,
    options: {
      title?: string;
      includeMetadata?: boolean;
    }
  ): Promise<string> {
    const title = options.title || `${scannedId} - Quality Control Photos`;
    
    // Create HTML content with embedded photos (same approach as PDFGenerationScreen)
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
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
            height: 100%;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
          }
          .page:last-child {
            page-break-after: auto;
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
            object-fit: cover;
            display: block;
          }
          .header {
            position: absolute;
            top: 10px;
            left: 10px;
            right: 10px;
            background-color: rgba(255, 255, 255, 0.9);
            padding: 10px;
            text-align: center;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: bold;
            border-radius: 5px;
            z-index: 10;
          }
        </style>
      </head>
      <body>
        ${photoBase64Array.map((dataUrl, index) => `
          <div class="page">
            <div class="header">${title} - Page ${index + 1} of ${photoBase64Array.length}</div>
            <div class="image-container">
              <img class="image" src="${dataUrl}" alt="Photo ${index + 1}" />
            </div>
          </div>
        `).join('')}
      </body>
      </html>
    `;
    
    // Create the PDF using expo-print
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      width: 612, // 8.5 inches at 72 PPI
      height: 792, // 11 inches at 72 PPI
    });
    
    return uri;
  }

  /**
   * Create a test PDF for development/testing
   */
  createTestPdf(scannedId: string): string {
    // This method is now deprecated - use generatePdfFromPhotos instead
    console.warn('[PDFGeneration] createTestPdf is deprecated. Use generatePdfFromPhotos with actual photos.');
    
    // Return a simple base64 PDF for backward compatibility
    const basicPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
72 720 Td
(Test PDF - ${scannedId}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000207 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
301
%%EOF`;
    
    return btoa(basicPdf);
  }
}

export const pdfGenerationService = new PdfGenerationService();
