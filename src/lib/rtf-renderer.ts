/**
 * Universal RTF Rendering Engine
 * 
 * This module handles the rendering of laboratory exam reports using RTF templates
 * stored in the LAYOUT_LAUDOS table. It supports over 1000 different exam models
 * by dynamically substituting tags with real data.
 * 
 * Tags supported:
 * - [NOMEEXAME], [DATACOLETA], [METODO], [MATERIAL] - Exam header
 * - [NOMECOMPONENTE], [RESULTADO], [UNIDADE], [VALOR_REF] - Component data
 * - [GRAFICO_RESUL_ANT], [DATA_RESUL_ANT1-3], [RESUL_ANT1-3] - Historical results
 */

import { RTFJS, WMFJS, EMFJS } from 'rtf.js';

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

export interface ExamData {
  nomeExame: string;
  dataColeta: string;
  metodo: string;
  material: string;
}

export interface ComponentData {
  nomeComponente: string;
  resultado: string;
  unidade: string;
  valorRef: string;
  // Historical results (optional)
  graficoResulAnt?: string;
  dataResulAnt1?: string;
  dataResulAnt2?: string;
  dataResulAnt3?: string;
  resulAnt1?: string;
  resulAnt2?: string;
  resulAnt3?: string;
}

export interface LayoutTemplates {
  dadosExame: string;        // RTF template for exam header
  dadosComponente: string;   // RTF template for each component
  dadosSolicitacao?: string; // RTF template for request data (optional)
}

export interface SolicitacaoData {
  protocolo: string;
  paciente: string;
  dataNascimento: string;
  sexo: string;
  convenio: string;
  medico: string;
  dataRequisicao: string;
}

/**
 * Substitutes tags in RTF template with actual values
 * Handles both [TAG] and [ TAG ] formats (with spaces)
 */
function substituteTag(rtf: string, tag: string, value: string): string {
  // Handle both [TAG] and [ TAG ] formats
  const patterns = [
    new RegExp(`\\[\\s*${tag}\\s*\\]`, 'gi'),
    new RegExp(`\\[ ${tag} \\]`, 'gi'),
  ];
  
  let result = rtf;
  for (const pattern of patterns) {
    result = result.replace(pattern, value || '');
  }
  return result;
}

/**
 * Processes an RTF template for exam header data
 */
export function processExamTemplate(rtfTemplate: string, examData: ExamData): string {
  let result = rtfTemplate;
  
  result = substituteTag(result, 'NOMEEXAME', examData.nomeExame);
  result = substituteTag(result, 'DATACOLETA', examData.dataColeta);
  result = substituteTag(result, 'METODO', examData.metodo);
  result = substituteTag(result, 'MATERIAL', examData.material);
  
  return result;
}

/**
 * Processes an RTF template for component data
 */
export function processComponentTemplate(rtfTemplate: string, componentData: ComponentData): string {
  let result = rtfTemplate;
  
  // Main component data
  result = substituteTag(result, 'NOMECOMPONENTE', componentData.nomeComponente);
  result = substituteTag(result, 'RESULTADO', componentData.resultado);
  result = substituteTag(result, 'UNIDADE', componentData.unidade);
  result = substituteTag(result, 'VALOR_REF', componentData.valorRef);
  
  // Historical results
  result = substituteTag(result, 'GRAFICO_RESUL_ANT', componentData.graficoResulAnt || '');
  result = substituteTag(result, 'DATA_RESUL_ANT1', componentData.dataResulAnt1 || '');
  result = substituteTag(result, 'DATA_RESUL_ANT2', componentData.dataResulAnt2 || '');
  result = substituteTag(result, 'DATA_RESUL_ANT3', componentData.dataResulAnt3 || '');
  result = substituteTag(result, 'RESUL_ANT1', componentData.resulAnt1 || '');
  result = substituteTag(result, 'RESUL_ANT2', componentData.resulAnt2 || '');
  result = substituteTag(result, 'RESUL_ANT3', componentData.resulAnt3 || '');
  
  return result;
}

/**
 * Processes an RTF template for solicitation/request data
 */
export function processSolicitacaoTemplate(rtfTemplate: string, solicitacao: SolicitacaoData): string {
  let result = rtfTemplate;
  
  result = substituteTag(result, 'PROTOCOLO', solicitacao.protocolo);
  result = substituteTag(result, 'PACIENTE', solicitacao.paciente);
  result = substituteTag(result, 'DATANASCIMENTO', solicitacao.dataNascimento);
  result = substituteTag(result, 'SEXO', solicitacao.sexo);
  result = substituteTag(result, 'CONVENIO', solicitacao.convenio);
  result = substituteTag(result, 'MEDICO', solicitacao.medico);
  result = substituteTag(result, 'DATAREQUISICAO', solicitacao.dataRequisicao);
  
  return result;
}

/**
 * Combines multiple RTF documents into a single document
 * Removes RTF headers from subsequent documents and merges content
 */
function combineRtfDocuments(rtfParts: string[]): string {
  if (rtfParts.length === 0) return '';
  if (rtfParts.length === 1) return rtfParts[0];
  
  // Start with the first document but remove closing brace
  let combined = rtfParts[0].replace(/\}[\s]*$/, '');
  
  // Add a page separator
  combined += '\\par\\par\n';
  
  // For subsequent documents, extract just the content (skip headers)
  for (let i = 1; i < rtfParts.length; i++) {
    // Remove RTF header and closing brace, keep just content
    const content = rtfParts[i]
      .replace(/^\{\\rtf1[^}]*\{[^}]*\}\s*/i, '') // Remove header
      .replace(/\\viewkind[^\s]*/gi, '')          // Remove viewkind
      .replace(/\\uc1/gi, '')                      // Remove uc1
      .replace(/\\pard/gi, '')                     // Remove first pard
      .replace(/\\lang\d+/gi, '')                  // Remove language codes
      .replace(/\}[\s]*$/g, '');                   // Remove closing brace
    
    combined += content;
    
    if (i < rtfParts.length - 1) {
      combined += '\\par\\par\n';
    }
  }
  
  // Close the combined document
  combined += '\n}';
  
  return combined;
}

/**
 * Builds a complete exam report RTF from templates and data
 */
export function buildExamReport(
  templates: LayoutTemplates,
  examData: ExamData,
  components: ComponentData[],
  solicitacao?: SolicitacaoData
): string {
  const rtfParts: string[] = [];
  
  // 1. Add solicitation header if template and data available
  if (templates.dadosSolicitacao && solicitacao) {
    const solicitacaoRtf = processSolicitacaoTemplate(templates.dadosSolicitacao, solicitacao);
    rtfParts.push(solicitacaoRtf);
  }
  
  // 2. Add exam header
  const examRtf = processExamTemplate(templates.dadosExame, examData);
  rtfParts.push(examRtf);
  
  // 3. Add each component
  for (const component of components) {
    const componentRtf = processComponentTemplate(templates.dadosComponente, component);
    rtfParts.push(componentRtf);
  }
  
  return combineRtfDocuments(rtfParts);
}

/**
 * Renders RTF content to HTML using rtf.js
 * Returns an HTML string that can be inserted into the DOM
 */
export async function renderRtfToHtml(rtfContent: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Convert RTF string to ArrayBuffer using proper encoding
      const rtfBuffer = stringToArrayBuffer(rtfContent);
      
      // Create RTF document with empty settings
      const doc = new RTFJS.Document(rtfBuffer, {});
      
      // Render to HTML elements
      doc.render().then((htmlElements: HTMLElement[]) => {
        // Combine all HTML elements into a single string
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
 * Renders RTF content directly to DOM elements
 * More efficient than string-based rendering for direct DOM insertion
 */
export async function renderRtfToElements(rtfContent: string): Promise<HTMLElement[]> {
  return new Promise((resolve, reject) => {
    try {
      // Convert RTF string to ArrayBuffer using proper encoding
      const rtfBuffer = stringToArrayBuffer(rtfContent);
      
      // Create RTF document with empty settings
      const doc = new RTFJS.Document(rtfBuffer, {});
      
      // Render to HTML elements
      doc.render().then((htmlElements: HTMLElement[]) => {
        resolve(htmlElements);
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
 * Extracts all tags from an RTF template for debugging/validation
 */
export function extractTags(rtfTemplate: string): string[] {
  const tagPattern = /\[\s*([A-Z_0-9]+)\s*\]/gi;
  const tags: string[] = [];
  let match;
  
  while ((match = tagPattern.exec(rtfTemplate)) !== null) {
    const tag = match[1].toUpperCase();
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  
  return tags.sort();
}

/**
 * Validates that all required tags in a template have corresponding data
 */
export function validateTemplateData(
  rtfTemplate: string, 
  dataObject: Record<string, string | undefined>
): { valid: boolean; missingTags: string[] } {
  const tags = extractTags(rtfTemplate);
  const missingTags: string[] = [];
  
  for (const tag of tags) {
    const normalizedKey = tag.toLowerCase().replace(/_/g, '');
    const hasValue = Object.entries(dataObject).some(([key, value]) => {
      const normalizedDataKey = key.toLowerCase().replace(/_/g, '');
      return normalizedDataKey === normalizedKey && value !== undefined && value !== '';
    });
    
    if (!hasValue) {
      missingTags.push(tag);
    }
  }
  
  return {
    valid: missingTags.length === 0,
    missingTags,
  };
}
