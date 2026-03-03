/**
 * PDF Generator using jsPDF + html2canvas
 * Converts rendered HTML from RTF templates into downloadable PDFs
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface PdfGeneratorResult {
  success: boolean;
  error?: string;
}

/**
 * Generates a PDF from HTML content and triggers download
 */
export async function generatePdfFromHtml(
  htmlContent: string,
  filename: string = "laudo.pdf"
): Promise<PdfGeneratorResult> {
  try {
    console.log("[PDF Generator] Starting PDF generation...");

    // Create a temporary container to render the HTML
    const container = document.createElement("div");
    container.innerHTML = htmlContent;
    
    // Apply laboratory-standard styling
    container.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: 210mm;
      min-height: 297mm;
      padding: 20mm;
      background: white;
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.4;
      color: #000;
      box-sizing: border-box;
    `;
    
    // Add styles for tables and content
    const style = document.createElement("style");
    style.textContent = `
      .rtf-rendered-content table {
        width: 100%;
        border-collapse: collapse;
        margin: 8px 0;
      }
      .rtf-rendered-content td,
      .rtf-rendered-content th {
        border: 1px solid #333;
        padding: 4px 8px;
        text-align: left;
        vertical-align: top;
      }
      .rtf-rendered-content p {
        margin: 4px 0;
      }
      .rtf-rendered-content b,
      .rtf-rendered-content strong {
        font-weight: bold;
      }
    `;
    container.appendChild(style);
    
    document.body.appendChild(container);

    // Wait for content to render
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Convert HTML to canvas
    const canvas = await html2canvas(container, {
      scale: 2, // Higher resolution
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      width: container.scrollWidth,
      height: container.scrollHeight,
    });

    // Clean up the temporary container
    document.body.removeChild(container);

    // Calculate dimensions for A4 PDF
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Create PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/png");

    // Handle multi-page PDFs
    let heightLeft = imgHeight;
    let position = 0;
    let pageNumber = 1;

    // Add first page
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = -pageHeight * pageNumber;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      pageNumber++;
    }

    // Save the PDF
    pdf.save(filename);

    console.log("[PDF Generator] PDF generated successfully:", filename);
    return { success: true };
  } catch (error) {
    console.error("[PDF Generator] Error generating PDF:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar PDF",
    };
  }
}

/**
 * Generates a PDF from a DOM element directly
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  filename: string = "laudo.pdf"
): Promise<PdfGeneratorResult> {
  try {
    console.log("[PDF Generator] Starting PDF generation from element...");

    // Clone the element to avoid modifying the original
    const clone = element.cloneNode(true) as HTMLElement;
    
    // Create container with proper styling
    const container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: 210mm;
      min-height: 297mm;
      padding: 15mm;
      background: white;
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.4;
      color: #000;
      box-sizing: border-box;
    `;
    container.appendChild(clone);
    document.body.appendChild(container);

    // Wait for content to render
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Convert to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    // Clean up
    document.body.removeChild(container);

    // Create PDF
    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/png");

    let heightLeft = imgHeight;
    let position = 0;
    let pageNumber = 1;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = -pageHeight * pageNumber;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      pageNumber++;
    }

    pdf.save(filename);

    console.log("[PDF Generator] PDF generated successfully:", filename);
    return { success: true };
  } catch (error) {
    console.error("[PDF Generator] Error generating PDF:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar PDF",
    };
  }
}
