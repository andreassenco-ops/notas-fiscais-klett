/**
 * Universal RTF Tag Parser
 * 
 * Handles substitution of all Autolac/Lifesys template tags with real patient data.
 * Supports conditional blocks that are removed when data is empty.
 */

// ============================================================================
// TAG SUBSTITUTION
// ============================================================================

/**
 * Substitutes a single tag in RTF content with a value
 * Handles formats: [TAG], [ TAG ], R001 (for results)
 */
export function substituteTag(rtf: string, tag: string, value: string): string {
  // Clean the value to avoid RTF corruption
  const safeValue = value?.toString() || '';
  
  // Handle both [TAG] and [ TAG ] formats (with spaces)
  const patterns = [
    new RegExp(`\\[\\s*${escapeRegex(tag)}\\s*\\]`, 'gi'),
    new RegExp(`\\[ ${escapeRegex(tag)} \\]`, 'gi'),
  ];
  
  let result = rtf;
  for (const pattern of patterns) {
    result = result.replace(pattern, safeValue);
  }
  return result;
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// EXAM HEADER SUBSTITUTION (DADOS_EXAME template)
// ============================================================================

export interface ExamHeaderData {
  nomeExame: string;
  dataColeta: string;
  metodo: string;
  material: string;
}

/**
 * Processes the DADOS_EXAME template with exam header data
 */
export function processExamHeader(template: string, data: ExamHeaderData): string {
  let result = template;
  
  result = substituteTag(result, 'NOMEEXAME', data.nomeExame);
  result = substituteTag(result, 'DATACOLETA', data.dataColeta);
  result = substituteTag(result, 'METODO', data.metodo);
  result = substituteTag(result, 'MATERIAL', data.material);
  
  return result;
}

// ============================================================================
// COMPONENT SUBSTITUTION (DADOS_COMPONENTE template)
// ============================================================================

export interface ComponentData {
  nomeComponente: string;
  resultado: string;
  unidade: string;
  valorRef: string;
  // Historical results (optional)
  dataResulAnt1?: string;
  dataResulAnt2?: string;
  dataResulAnt3?: string;
  dataResulAnt4?: string;
  dataResulAnt5?: string;
  dataResulAnt6?: string;
  dataResulAnt7?: string;
  dataResulAnt8?: string;
  resulAnt1?: string;
  resulAnt2?: string;
  resulAnt3?: string;
  resulAnt4?: string;
  resulAnt5?: string;
  resulAnt6?: string;
  resulAnt7?: string;
  resulAnt8?: string;
}

/**
 * Processes the DADOS_COMPONENTE template with component data
 */
export function processComponentTemplate(template: string, data: ComponentData): string {
  let result = template;
  
  // Primary result data - handle both [TAG] and R001 formats
  result = substituteTag(result, 'NOMECOMPONENTE', data.nomeComponente);
  result = substituteTag(result, 'RESULTADO', data.resultado);
  result = substituteTag(result, 'UNIDADE', data.unidade);
  result = substituteTag(result, 'VALOR_REF', cleanReferenceValue(data.valorRef));
  
  // Also substitute R001 placeholders (common in some templates)
  result = result.replace(/\bR001\b(?!_)/g, data.resultado || '');
  
  // Historical results (1-8)
  const historicalFields = [
    { dateTag: 'DATA_RESUL_ANT1', resultTag: 'RESUL_ANT1', date: data.dataResulAnt1, result: data.resulAnt1 },
    { dateTag: 'DATA_RESUL_ANT2', resultTag: 'RESUL_ANT2', date: data.dataResulAnt2, result: data.resulAnt2 },
    { dateTag: 'DATA_RESUL_ANT3', resultTag: 'RESUL_ANT3', date: data.dataResulAnt3, result: data.resulAnt3 },
    { dateTag: 'DATA_RESUL_ANT4', resultTag: 'RESUL_ANT4', date: data.dataResulAnt4, result: data.resulAnt4 },
    { dateTag: 'DATA_RESUL_ANT5', resultTag: 'RESUL_ANT5', date: data.dataResulAnt5, result: data.resulAnt5 },
    { dateTag: 'DATA_RESUL_ANT6', resultTag: 'RESUL_ANT6', date: data.dataResulAnt6, result: data.resulAnt6 },
    { dateTag: 'DATA_RESUL_ANT7', resultTag: 'RESUL_ANT7', date: data.dataResulAnt7, result: data.resulAnt7 },
    { dateTag: 'DATA_RESUL_ANT8', resultTag: 'RESUL_ANT8', date: data.dataResulAnt8, result: data.resulAnt8 },
  ];
  
  for (const field of historicalFields) {
    result = substituteTag(result, field.dateTag, field.date || '');
    result = substituteTag(result, field.resultTag, field.result || '');
    
    // Also handle R001_RA_D1, R001_RA_R1 format
    const idx = field.dateTag.replace('DATA_RESUL_ANT', '');
    result = result.replace(new RegExp(`R001_RA_D${idx}`, 'g'), field.date || '');
    result = result.replace(new RegExp(`R001_RA_R${idx}`, 'g'), field.result || '');
  }
  
  // Remove graph placeholder (not supported in HTML rendering)
  result = substituteTag(result, 'GRAFICO_RESUL_ANT', '');
  
  return result;
}

// ============================================================================
// SOLICITATION SUBSTITUTION (DADOS_SOLICITACAO template)
// ============================================================================

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
 * Processes the DADOS_SOLICITACAO template with patient/request data
 */
export function processSolicitacaoTemplate(template: string, data: SolicitacaoData): string {
  let result = template;
  
  result = substituteTag(result, 'PROTOCOLO', data.protocolo);
  result = substituteTag(result, 'PACIENTE', data.paciente);
  result = substituteTag(result, 'DATANASCIMENTO', data.dataNascimento);
  result = substituteTag(result, 'SEXO', data.sexo);
  result = substituteTag(result, 'CONVENIO', data.convenio);
  result = substituteTag(result, 'MEDICO', data.medico);
  result = substituteTag(result, 'DATAREQUISICAO', data.dataRequisicao);
  
  return result;
}

// ============================================================================
// CONDITIONAL BLOCK HANDLING
// ============================================================================

/**
 * Removes conditional blocks when their data is empty
 * Handles patterns like: {$P1}[Resultados anteriores:] or {$P2}[some content]
 * 
 * Rule: If the content inside [...] references data that doesn't exist,
 * remove the entire block including the {$Pn} marker
 */
export function processConditionalBlocks(rtf: string, hasHistoricalData: boolean): string {
  let result = rtf;
  
  // Pattern: {$P1}[...content...] or {$P2}[...content...]
  // If no historical data, remove these blocks entirely
  if (!hasHistoricalData) {
    // Remove {$Pn}[...] blocks
    result = result.replace(/\{\$P\d+\}\[([^\]]*)\]/g, '');
    
    // Also clean up orphaned historical labels
    result = result.replace(/Resultados anteriores:/gi, '');
  } else {
    // Just remove the {$Pn} markers, keep the content
    result = result.replace(/\{\$P\d+\}/g, '');
  }
  
  // Remove REGRA/COMENTARIO blocks (internal logic, not for display)
  result = result.replace(/\/\/COMENTARIO E REGRA[\s\S]*?\/\/FINAL COMENTARIO E REGRA/gi, '');
  result = result.replace(/\/\/COMENTARIO[\s\S]*$/gi, '');
  result = result.replace(/REGRA[\s\S]*?\$R\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|/g, '');
  result = result.replace(/\$R\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|/g, '');
  
  return result;
}

// ============================================================================
// REFERENCE VALUE CLEANING
// ============================================================================

/**
 * Cleans reference values from internal placeholders and control sequences
 */
export function cleanReferenceValue(value: string): string {
  if (!value) return '';
  
  let cleaned = value
    // Remove control sequences like {$P1}, {$P2}, etc.
    .replace(/\{\$P\d+\}/g, '')
    // Remove placeholders like R001, R001_RA_D1, R001_RA_R1, etc.
    .replace(/R\d{3}(_RA_[DR]\d+)?/g, '')
    // Remove [MATERIAL], [METODO], [OBSERVACAO], etc.
    .replace(/\[[A-Z_]+\]/g, '')
    // Remove comment/rule sections
    .replace(/\/\/COMENTARIO E REGRA[\s\S]*?\/\/FINAL COMENTARIO E REGRA/gi, '')
    .replace(/\/\/COMENTARIO[\s\S]*$/gi, '')
    .replace(/REGRA[\s\S]*?\$R\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|/g, '')
    .replace(/\$R\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|/g, '')
    // Remove "Resultados anteriores:" labels with no data
    .replace(/\[?Resultados anteriores:\]?/gi, '')
    // Clean up multiple spaces and line breaks while preserving structure
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  
  return cleaned;
}

// ============================================================================
// RTF CLEANUP (post-substitution)
// ============================================================================

/**
 * Final cleanup of RTF content after all substitutions
 * Removes empty lines, orphaned tags, and normalizes whitespace
 */
export function cleanupRtf(rtf: string): string {
  let result = rtf;
  
  // Remove any remaining unsubstituted tags (safety cleanup)
  result = result.replace(/\[\s*[A-Z_]+\s*\]/g, '');
  
  // Remove orphaned R001_* placeholders
  result = result.replace(/R\d{3}_RA_[DR]\d+/g, '');
  
  // Clean up excessive whitespace in RTF while preserving formatting
  result = result.replace(/\\par\s*\\par\s*\\par/g, '\\par\\par');
  
  return result;
}

// ============================================================================
// FULL REPORT BUILDER
// ============================================================================

export interface LayoutTemplates {
  dadosExame: string;
  dadosComponente: string;
  dadosSolicitacao?: string;
}

/**
 * Builds a complete exam report by processing all templates
 * and combining them into a single RTF document
 */
export function buildCompleteReport(
  templates: LayoutTemplates,
  headerData: ExamHeaderData,
  components: ComponentData[],
  solicitacao?: SolicitacaoData
): string {
  const rtfParts: string[] = [];
  
  // 1. Process solicitation header if available
  if (templates.dadosSolicitacao && solicitacao) {
    let solHeader = processSolicitacaoTemplate(templates.dadosSolicitacao, solicitacao);
    solHeader = processConditionalBlocks(solHeader, false);
    rtfParts.push(solHeader);
  }
  
  // 2. Process exam header
  let examHeader = processExamHeader(templates.dadosExame, headerData);
  examHeader = processConditionalBlocks(examHeader, false);
  rtfParts.push(examHeader);
  
  // 3. Process each component
  for (const component of components) {
    const hasHistory = !!(component.dataResulAnt1 || component.resulAnt1);
    let componentRtf = processComponentTemplate(templates.dadosComponente, component);
    componentRtf = processConditionalBlocks(componentRtf, hasHistory);
    rtfParts.push(componentRtf);
  }
  
  // 4. Combine all parts
  const combined = combineRtfDocuments(rtfParts);
  
  // 5. Final cleanup
  return cleanupRtf(combined);
}

/**
 * Combines multiple RTF document fragments into one
 */
function combineRtfDocuments(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  
  // Check if first part has RTF header
  const hasHeader = parts[0].startsWith('{\\rtf');
  
  if (!hasHeader) {
    // Simple text concatenation with paragraph breaks
    return parts.join('\n\\par\\par\n');
  }
  
  // Remove closing brace from first document
  let combined = parts[0].replace(/\}[\s]*$/, '');
  combined += '\\par\\par\n';
  
  // For subsequent parts, extract just the content
  for (let i = 1; i < parts.length; i++) {
    let content = parts[i]
      // Remove RTF header
      .replace(/^\{\\rtf1[^}]*\{[^}]*\}\s*/i, '')
      // Remove viewkind and other preamble
      .replace(/\\viewkind[^\s]*/gi, '')
      .replace(/\\uc1/gi, '')
      .replace(/\\pard/gi, '')
      .replace(/\\lang\d+/gi, '')
      // Remove closing brace
      .replace(/\}[\s]*$/g, '');
    
    combined += content;
    
    if (i < parts.length - 1) {
      combined += '\\par\\par\n';
    }
  }
  
  combined += '\n}';
  return combined;
}
