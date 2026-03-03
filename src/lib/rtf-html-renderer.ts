/**
 * RTF to HTML Renderer
 * 
 * Uses rtf.js library to convert RTF content to displayable HTML.
 * Falls back to simple table-based rendering if RTF parsing fails.
 */

import { RTFJS, WMFJS, EMFJS } from 'rtf.js';
import { ComponentData, cleanReferenceValue } from './rtf-tag-parser';

// Initialize RTFJS with logging disabled for production
RTFJS.loggingEnabled(false);
WMFJS.loggingEnabled(false);
EMFJS.loggingEnabled(false);

/**
 * Converts a string to ArrayBuffer for rtf.js
 */
function stringToArrayBuffer(str: string): ArrayBuffer {
  const buffer = new ArrayBuffer(str.length);
  const bufferView = new Uint8Array(buffer);
  for (let i = 0; i < str.length; i++) {
    bufferView[i] = str.charCodeAt(i);
  }
  return buffer;
}

/**
 * Renders RTF content to HTML using rtf.js
 * Returns an HTML string that can be inserted into the DOM
 */
export async function renderRtfToHtml(rtfContent: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Convert RTF string to ArrayBuffer
      const rtfBuffer = stringToArrayBuffer(rtfContent);
      
      // Create RTF document
      const doc = new RTFJS.Document(rtfBuffer, {});
      
      // Render to HTML elements
      doc.render().then((htmlElements: HTMLElement[]) => {
        // Combine all HTML elements into a single container
        const container = document.createElement('div');
        container.className = 'rtf-rendered-content';
        
        for (const element of htmlElements) {
          container.appendChild(element.cloneNode(true));
        }
        
        resolve(container.outerHTML);
      }).catch((error: Error) => {
        console.error('[RTF Renderer] Error rendering RTF:', error);
        reject(error);
      });
    } catch (error) {
      console.error('[RTF Renderer] Error parsing RTF:', error);
      reject(error);
    }
  });
}

/**
 * Generates a fallback HTML table when RTF rendering fails
 * This provides a clean, professional layout for exam results
 */
export function generateFallbackHtml(
  protocolo: number,
  components: ComponentData[],
  patientName?: string,
  examDate?: string
): string {
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString('pt-BR');
  const formattedTime = currentDate.toLocaleTimeString('pt-BR');
  
  // Group components by exam type if possible
  const groupedComponents = groupComponentsByExam(components);
  
  let html = `
    <div class="laudo-container" style="
      font-family: 'Times New Roman', Times, serif;
      padding: 30px;
      max-width: 800px;
      margin: 0 auto;
      background: white;
      color: #000;
    ">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #333; padding-bottom: 20px;">
        <h1 style="margin: 0; font-size: 24pt; font-weight: bold; color: #1a1a1a;">
          LAUDO DE EXAMES LABORATORIAIS
        </h1>
        <p style="margin: 10px 0 0 0; font-size: 14pt; color: #444;">
          Protocolo: <strong>${protocolo}</strong>
        </p>
        ${patientName ? `<p style="margin: 5px 0 0 0; font-size: 12pt; color: #666;">Paciente: ${patientName}</p>` : ''}
        ${examDate ? `<p style="margin: 5px 0 0 0; font-size: 11pt; color: #666;">Data: ${examDate}</p>` : ''}
      </div>
  `;
  
  // Render each exam group
  for (const [examName, examComponents] of Object.entries(groupedComponents)) {
    html += `
      <div style="margin-bottom: 25px;">
        ${examName !== 'default' ? `
          <h3 style="
            margin: 0 0 15px 0;
            font-size: 14pt;
            font-weight: bold;
            color: #1a1a1a;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
          ">${examName}</h3>
        ` : ''}
        <table style="width: 100%; border-collapse: collapse; font-size: 11pt;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="border: 1px solid #999; padding: 10px 12px; text-align: left; font-weight: bold; width: 35%;">
                Exame
              </th>
              <th style="border: 1px solid #999; padding: 10px 12px; text-align: center; font-weight: bold; width: 20%;">
                Resultado
              </th>
              <th style="border: 1px solid #999; padding: 10px 12px; text-align: center; font-weight: bold; width: 15%;">
                Unidade
              </th>
              <th style="border: 1px solid #999; padding: 10px 12px; text-align: left; font-weight: bold; width: 30%;">
                Valor de Referência
              </th>
            </tr>
          </thead>
          <tbody>
    `;
    
    for (const comp of examComponents) {
      // Skip empty rows or note-only rows
      if (!comp.nomeComponente?.trim() || comp.nomeComponente === '-') continue;
      
      // Skip rows that are just notes/text without results
      if (comp.resultado === '[TEXTO]' || (!comp.resultado && !comp.unidade)) {
        // Render as a note row spanning all columns
        if (comp.resultado && comp.resultado !== '[TEXTO]') {
          html += `
            <tr>
              <td colspan="4" style="border: 1px solid #999; padding: 8px 12px; font-style: italic; color: #555; font-size: 10pt;">
                ${comp.resultado}
              </td>
            </tr>
          `;
        }
        continue;
      }
      
      const cleanedRef = cleanReferenceValue(comp.valorRef);
      
      html += `
        <tr>
          <td style="border: 1px solid #999; padding: 8px 12px;">
            ${comp.nomeComponente}
          </td>
          <td style="border: 1px solid #999; padding: 8px 12px; text-align: center; font-weight: bold;">
            ${comp.resultado || '-'}
          </td>
          <td style="border: 1px solid #999; padding: 8px 12px; text-align: center;">
            ${comp.unidade || '-'}
          </td>
          <td style="border: 1px solid #999; padding: 8px 12px; white-space: pre-line; font-size: 10pt;">
            ${formatReferenceValue(cleanedRef)}
          </td>
        </tr>
      `;
    }
    
    html += `
          </tbody>
        </table>
      </div>
    `;
  }
  
  // Footer
  html += `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; text-align: center;">
        <p style="margin: 0; font-size: 9pt; color: #888;">
          Documento gerado em ${formattedDate} às ${formattedTime}
        </p>
        <p style="margin: 5px 0 0 0; font-size: 9pt; color: #888;">
          Este documento é uma representação digital do laudo laboratorial.
        </p>
      </div>
    </div>
  `;
  
  return html;
}

/**
 * Groups components by exam type based on naming patterns
 */
function groupComponentsByExam(components: ComponentData[]): Record<string, ComponentData[]> {
  const groups: Record<string, ComponentData[]> = { default: [] };
  
  // For now, put all in default group
  // Could be enhanced to parse exam names and group logically
  groups.default = components;
  
  return groups;
}

/**
 * Formats reference values for better display
 * Handles multi-line values and age-based references
 */
function formatReferenceValue(value: string): string {
  if (!value || value === '-' || value === '0') return '-';
  
  // Replace common patterns for better readability
  let formatted = value
    // Add line breaks after age ranges
    .replace(/(anos?)\s+/gi, '$1\n')
    // Add line breaks before descriptors
    .replace(/\s+(Desejável|Baixo|Alto|Normal|Aceitável):/gi, '\n$1:')
    // Clean up excessive newlines
    .replace(/\n\s*\n/g, '\n')
    .trim();
  
  return formatted;
}

/**
 * Attempts to render RTF, falls back to HTML table on failure
 */
export async function renderExamReport(
  rtfContent: string | null,
  protocolo: number,
  components: ComponentData[],
  patientName?: string,
  examDate?: string
): Promise<string> {
  // If we have RTF content, try to render it
  if (rtfContent && rtfContent.includes('{\\rtf')) {
    try {
      const html = await renderRtfToHtml(rtfContent);
      console.log('[RTF Renderer] Successfully rendered RTF to HTML');
      return html;
    } catch (error) {
      console.warn('[RTF Renderer] RTF rendering failed, using fallback:', error);
    }
  }
  
  // Fallback to table-based rendering
  console.log('[RTF Renderer] Using fallback HTML table rendering');
  return generateFallbackHtml(protocolo, components, patientName, examDate);
}
