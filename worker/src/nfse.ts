/**
 * NFS-e Nacional - Módulo de Emissão
 * Integração direta com a API Sefin Nacional via mTLS + XML assinado
 * 
 * Endpoints:
 *  - Homologação: https://sefin.producaorestrita.nfse.gov.br/SefinNacional
 *  - Produção:    https://sefin.nfse.gov.br/SefinNacional
 */

import https from 'https';
import crypto from 'crypto';
import tls from 'tls';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

// ─── Pasta local para salvar PDFs ───
const DANFSE_DIR = path.resolve(process.cwd(), 'danfse-pdfs');
if (!fs.existsSync(DANFSE_DIR)) {
  fs.mkdirSync(DANFSE_DIR, { recursive: true });
}

/**
 * Salva o PDF do DANFSE em disco local
 */
export function saveDanfsePdf(chaveAcesso: string, pdfBase64: string, protocolo?: string): string {
  const filename = protocolo
    ? `${protocolo.replace(/[^a-zA-Z0-9\-_]/g, '_')}_${chaveAcesso.slice(-10)}.pdf`
    : `${chaveAcesso}.pdf`;
  const filepath = path.join(DANFSE_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(pdfBase64, 'base64'));
  console.log(`💾 DANFSE PDF salvo: ${filepath}`);
  return filepath;
}

/**
 * Retorna o caminho do PDF salvo, se existir
 */
export function getDanfsePdfPath(chaveAcesso: string): string | null {
  // Procura qualquer arquivo que contenha a chave de acesso
  const files = fs.readdirSync(DANFSE_DIR);
  const match = files.find(f => f.includes(chaveAcesso) || f.includes(chaveAcesso.slice(-10)));
  return match ? path.join(DANFSE_DIR, match) : null;
}

export function getDanfseDir(): string {
  return DANFSE_DIR;
}

// ─── Tipos ───

export interface NfseEmissor {
  cnpj: string;          // 14 dígitos
  im: string;            // Inscrição Municipal
  razaoSocial: string;
  cMunIBGE: string;      // 7 dígitos
}

export interface NfseTomador {
  cpf?: string;           // 11 dígitos (PF)
  cnpj?: string;          // 14 dígitos (PJ)
  nome: string;
  email?: string;
  fone?: string;
}

export interface NfseServico {
  cTribNac: string;       // Código tributação nacional (ex: "04.02.01" → "040201")
  xDescServ: string;      // Descrição do serviço
  cNBS?: string;          // Código NBS
  cLocPrestacao: string;  // Código IBGE do local de prestação
}

export interface NfseValores {
  vServ: number;          // Valor do serviço
  aliqISS?: number;       // Alíquota ISS (ex: 3.00)
}

export interface NfseRequest {
  ambiente: 1 | 2;        // 1=Produção, 2=Homologação
  emissor: NfseEmissor;
  tomador: NfseTomador;
  servico: NfseServico;
  valores: NfseValores;
  nDPS: string;           // Número sequencial da DPS
  serie?: string;         // Série (padrão "900")
  dCompet: string;        // Data competência YYYY-MM-DD
  formaPagamento?: string;
  protocolo?: string;     // Para informações complementares
  dataAtendimento?: string; // DD-MM-AAAA
}

export interface NfseResult {
  success: boolean;
  chNFSe?: string;
  nNFSe?: string;
  nDFSe?: string;
  nDPS?: string;
  chDPS?: string;
  xmlRetorno?: string;
  pdfBase64?: string;
  error?: string;
  jaEmitida?: boolean;
  detalhes?: unknown;
}

// ─── Configuração do Emissor (Klett) ───

export const KLETT_EMISSOR: NfseEmissor = {
  cnpj: '16842718000165',
  im: '153',
  razaoSocial: 'LABORATORIO KLETT DE ANALISES CLINICAS TOXICOLOGI',
  cMunIBGE: '3140001', // Mariana - MG
};

const KLETT_SERVICO_PADRAO: NfseServico = {
  cTribNac: '040201',        // 04.02.01 - Análises clínicas e congêneres
  xDescServ: 'Serviços prestados',
  cNBS: '123019300',         // 1.2301.93.00 - Serviços laboratoriais
  cLocPrestacao: '3140001',  // Mariana
};

// ─── Certificado A1 ───

interface CertData {
  key: string;   // PEM private key
  cert: string;  // PEM certificate
  pfx: Buffer;
  passphrase: string;
}

let cachedCert: CertData | null = null;

function loadCertificate(): CertData {
  if (cachedCert) return cachedCert;

  const pfxBase64 = process.env.NFSE_CERT_PFX_BASE64;
  const password = process.env.NFSE_CERT_PASSWORD || '';

  if (!pfxBase64) {
    throw new Error('NFSE_CERT_PFX_BASE64 não configurado. Configure o certificado A1 no Railway.');
  }

  const pfxBuffer = Buffer.from(pfxBase64, 'base64');

  // Extrair PEM key e cert do PFX usando OpenSSL via Node crypto
  let pemKey = '';
  let pemCert = '';

  try {
    // Node 21.7+ tem crypto.X509Certificate e PKCS12 parsing,
    // mas para compatibilidade usamos tls.createSecureContext para validar
    // e child_process openssl para extrair PEM
    tls.createSecureContext({ pfx: pfxBuffer, passphrase: password });

    // Extrair key e cert via openssl CLI (disponível no container)
    const { execSync } = require('child_process');
    const tmpPfx = '/tmp/nfse_cert.pfx';
    require('fs').writeFileSync(tmpPfx, pfxBuffer);

    try {
      // Extrair chave privada
      pemKey = execSync(
        `openssl pkcs12 -in ${tmpPfx} -nocerts -nodes -passin pass:${password} 2>/dev/null || ` +
        `openssl pkcs12 -in ${tmpPfx} -nocerts -nodes -passin pass:${password} -legacy 2>/dev/null`,
        { encoding: 'utf-8' }
      ).trim();

      // Extrair certificado
      pemCert = execSync(
        `openssl pkcs12 -in ${tmpPfx} -clcerts -nokeys -passin pass:${password} 2>/dev/null || ` +
        `openssl pkcs12 -in ${tmpPfx} -clcerts -nokeys -passin pass:${password} -legacy 2>/dev/null`,
        { encoding: 'utf-8' }
      ).trim();
    } finally {
      try { require('fs').unlinkSync(tmpPfx); } catch { /* ignore */ }
    }

    if (!pemKey || !pemCert) {
      throw new Error('Não foi possível extrair key/cert do PFX via openssl');
    }

    console.log('🔐 Certificado A1: PEM key e cert extraídos com sucesso');
  } catch (err: any) {
    console.warn('⚠️ Falha ao extrair PEM do PFX:', err.message);
    console.warn('⚠️ Usando PFX direto (requer NODE_OPTIONS=--openssl-legacy-provider)');
  }

  cachedCert = {
    key: pemKey,
    cert: pemCert,
    pfx: pfxBuffer,
    passphrase: password,
  };

  console.log('🔐 Certificado A1 carregado e validado com sucesso');
  return cachedCert;
}

// ─── XML Builder ───

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function buildDpsXml(req: NfseRequest): string {
  const serie = req.serie || '900';
  // Calcular horário de Brasília (UTC-3) corretamente
  const now = new Date();
  const brasiliaOffset = -3 * 60; // UTC-3 em minutos
  const brasiliaTime = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dhEmi = `${brasiliaTime.getFullYear()}-${pad(brasiliaTime.getMonth() + 1)}-${pad(brasiliaTime.getDate())}T${pad(brasiliaTime.getHours())}:${pad(brasiliaTime.getMinutes())}:${pad(brasiliaTime.getSeconds())}-03:00`;
  
  const vServ = req.valores.vServ;
  
  // Tomador - CPF ou CNPJ
  let tomadorDoc = '';
  if (req.tomador.cpf) {
    tomadorDoc = `<CPF>${req.tomador.cpf.replace(/\D/g, '')}</CPF>`;
  } else if (req.tomador.cnpj) {
    tomadorDoc = `<CNPJ>${req.tomador.cnpj.replace(/\D/g, '')}</CNPJ>`;
  }

  const tomadorEmail = req.tomador.email 
    ? `<email>${escapeXml(req.tomador.email)}</email>` 
    : '';
  const tomadorFone = req.tomador.fone 
    ? `<fone>${req.tomador.fone.replace(/\D/g, '')}</fone>` 
    : '';

  // ID da DPS: cMunIBGE(7) + tipoInsc(1=CPF,2=CNPJ) + inscFederal(14) + serie(5) + nDPS(15)
  const idDPS = `${req.emissor.cMunIBGE}2${req.emissor.cnpj}${serie.padStart(5, '0')}${req.nDPS.padStart(15, '0')}`;

  // Informações complementares (filho de serv, não de infDPS!)
  const infComplParts = [];
  if (req.protocolo) infComplParts.push(`PROTOCOLO: ${req.protocolo}`);
  if (req.formaPagamento) infComplParts.push(`FORMA DE PAGAMENTO: ${req.formaPagamento}`);
  if (req.dataAtendimento) infComplParts.push(`DATA DO ATENDIMENTO: ${req.dataAtendimento}`);
  const xInfComp = infComplParts.length > 0 ? infComplParts.join(', ') : '';

  // Tributação federal (PIS/COFINS) - conforme screenshot do portal
  const aliqPIS = 0.65;
  const aliqCOFINS = 3.00;
  const vPIS = vServ * (aliqPIS / 100);
  const vCOFINS = vServ * (aliqCOFINS / 100);

  // Tributos aproximados (valores monetários) - Lei 12.741/2012
  const pTotTribFed = 3.65;  // PIS + COFINS + outros
  const pTotTribEst = 0;
  const pTotTribMun = 3.00;  // ISS
  const vTotTribFed = vServ * (pTotTribFed / 100);
  const vTotTribEst = 0;
  const vTotTribMun = vServ * (pTotTribMun / 100);

  // ── Montar XML conforme schema DPS v1.01 ──
  // Ordem dos filhos de infDPS:
  //   tpAmb, dhEmi, verAplic, serie, nDPS, dCompet, tpEmit, cLocEmi,
  //   [subst], prest, [toma], [interm], serv, valores, [IBSCBS]
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS Id="DPS${idDPS}">
    <tpAmb>${req.ambiente}</tpAmb>
    <dhEmi>${dhEmi}</dhEmi>
    <verAplic>KlettSender/1.0</verAplic>
    <serie>${serie}</serie>
    <nDPS>${req.nDPS}</nDPS>
    <dCompet>${req.dCompet}</dCompet>
    <tpEmit>1</tpEmit>
    <cLocEmi>${req.emissor.cMunIBGE}</cLocEmi>
    <prest>
      <CNPJ>${req.emissor.cnpj}</CNPJ>
      <IM>${req.emissor.im}</IM>
      <regTrib>
        <opSimpNac>1</opSimpNac>
        <regEspTrib>0</regEspTrib>
      </regTrib>
    </prest>
    <toma>
      ${tomadorDoc}
      <xNome>${escapeXml(req.tomador.nome)}</xNome>
      ${tomadorFone}
      ${tomadorEmail}
    </toma>
    <serv>
      <locPrest>
        <cLocPrestacao>${req.servico.cLocPrestacao}</cLocPrestacao>
      </locPrest>
      <cServ>
        <cTribNac>${req.servico.cTribNac}</cTribNac>
        <xDescServ>${escapeXml(req.servico.xDescServ)}</xDescServ>${req.servico.cNBS ? `
        <cNBS>${req.servico.cNBS}</cNBS>` : ''}
      </cServ>${xInfComp ? `
      <infoCompl>
        <xInfComp>${escapeXml(xInfComp)}</xInfComp>
      </infoCompl>` : ''}
    </serv>
    <valores>
      <vServPrest>
        <vServ>${formatDecimal(vServ)}</vServ>
      </vServPrest>
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <tpRetISSQN>1</tpRetISSQN>
        </tribMun>
        <tribFed>
          <piscofins>
            <CST>01</CST>
            <vBCPisCofins>${formatDecimal(vServ)}</vBCPisCofins>
            <pAliqPis>${formatDecimal(aliqPIS)}</pAliqPis>
            <pAliqCofins>${formatDecimal(aliqCOFINS)}</pAliqCofins>
            <vPis>${formatDecimal(vPIS)}</vPis>
            <vCofins>${formatDecimal(vCOFINS)}</vCofins>
            <tpRetPisCofins>0</tpRetPisCofins>
          </piscofins>
        </tribFed>
        <totTrib>
          <pTotTrib>
            <pTotTribFed>${formatDecimal(pTotTribFed)}</pTotTribFed>
            <pTotTribEst>${formatDecimal(pTotTribEst)}</pTotTribEst>
            <pTotTribMun>${formatDecimal(pTotTribMun)}</pTotTribMun>
          </pTotTrib>
        </totTrib>
      </trib>
    </valores>
  </infDPS>
</DPS>`;

  return xml;
}

// ─── Assinatura Digital XML ───

async function signXml(xml: string): Promise<string> {
  const cert = loadCertificate();

  if (!cert.key || !cert.cert) {
    throw new Error(
      'Chave PEM não disponível para assinatura. ' +
      'Configure NODE_OPTIONS=--openssl-legacy-provider no Railway ou reconverta o PFX.'
    );
  }

  try {
    const { SignedXml } = await import('xml-crypto');

    const sig = new SignedXml({
      privateKey: cert.key,
      publicCert: cert.cert,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    });

    const idMatch = xml.match(/Id="(DPS[^"]+)"/);
    const refUri = idMatch ? `#${idMatch[1]}` : '';

    sig.addReference({
      xpath: `//*[local-name(.)='infDPS']`,
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      ],
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      uri: refUri,
    });

    sig.computeSignature(xml, {
      location: { reference: `//*[local-name(.)='infDPS']`, action: 'after' },
    });

    return sig.getSignedXml();
  } catch (error) {
    console.error('⚠️ Erro ao assinar XML:', error);
    throw new Error(`Falha na assinatura digital: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

// ─── API Client (mTLS) ───

const API_URLS = {
  1: 'https://sefin.nfse.gov.br/SefinNacional', // Produção
  2: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional', // Homologação (produção restrita)
};

function makeRequest(
  url: string,
  method: string,
  body: string,
  cert: CertData,
  contentType = 'application/json',
  redirectCount = 0,
  acceptBinary = false
): Promise<{ statusCode: number; body: string; rawBody?: Buffer; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: `${urlObj.pathname}${urlObj.search || ''}`,
      method,
      headers: {
        'Content-Type': contentType,
        'Accept': acceptBinary ? 'application/pdf' : 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body, 'utf-8') } : {}),
      },
      // mTLS - usar sempre PFX para preservar cadeia completa do certificado cliente
      pfx: cert.pfx,
      passphrase: cert.passphrase,
      rejectUnauthorized: true,
    };

    const req = https.request(options, async (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', async () => {
        const statusCode = res.statusCode || 500;
        const rawBody = Buffer.concat(chunks);

        // Segue redirects (301/302/307/308)
        if ([301, 302, 307, 308].includes(statusCode)) {
          const location = res.headers.location;
          if (location && redirectCount < 5) {
            const nextUrl = new URL(location, urlObj).toString();
            console.warn(`↪️ Redirect ${statusCode}: ${url} -> ${nextUrl}`);
            try {
              const redirected = await makeRequest(nextUrl, method, body, cert, contentType, redirectCount + 1, acceptBinary);
              resolve(redirected);
              return;
            } catch (err) {
              reject(err);
              return;
            }
          }
        }

        resolve({
          statusCode,
          body: rawBody.toString('utf-8'),
          rawBody: acceptBinary ? rawBody : undefined,
          headers: res.headers as Record<string, string | string[] | undefined>,
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── GZip + Base64 helper ───

function gzipBase64(input: string): string {
  const gzipped = zlib.gzipSync(Buffer.from(input, 'utf-8'));
  return gzipped.toString('base64');
}

function ungzipBase64(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  return zlib.gunzipSync(buf).toString('utf-8');
}

// ─── Emissão ───

export async function emitirNFSe(request: NfseRequest): Promise<NfseResult> {
  try {
    console.log(`📋 Iniciando emissão NFS-e (ambiente ${request.ambiente === 1 ? 'Produção' : 'Homologação'})...`);

    // 1. Carregar certificado
    const cert = loadCertificate();
    console.log('🔐 Certificado carregado');

    // 2. Construir XML da DPS
    const dpsXml = buildDpsXml(request);
    console.log(`📝 DPS XML construído (${dpsXml.length} bytes)`);

    // 3. Assinar XML
    let signedXml: string;
    try {
      signedXml = await signXml(dpsXml);
      console.log('✍️ XML assinado digitalmente');
    } catch (signErr) {
      // Em homologação, tentar enviar sem assinatura como fallback
      if (request.ambiente === 2) {
        console.warn('⚠️ Falha na assinatura, tentando sem assinatura (homologação)...');
        signedXml = dpsXml;
      } else {
        throw signErr;
      }
    }

    // 4. Compactar XML com GZip e codificar em Base64
    const dpsXmlGZipB64 = gzipBase64(signedXml);
    console.log(`📦 DPS compactado: ${dpsXmlGZipB64.length} chars (base64 gzip)`);

    // 5. Montar body JSON conforme especificação da API
    const jsonBody = JSON.stringify({ dpsXmlGZipB64 });

    // 6. Enviar para API via mTLS
    const apiUrl = `${API_URLS[request.ambiente]}/nfse`;
    console.log(`📤 Enviando POST ${apiUrl} (application/json, ${jsonBody.length} bytes)...`);

    const response = await makeRequest(apiUrl, 'POST', jsonBody, cert, 'application/json');

    console.log(`📥 Resposta: HTTP ${response.statusCode}`);
    console.log(`📥 Body (primeiros 500 chars): ${response.body.substring(0, 500)}`);

    // 7. Processar resposta JSON
    let parsed: any;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      parsed = null;
    }

    if (response.statusCode === 201 || (response.statusCode === 200 && parsed?.chaveAcesso)) {
      // Sucesso - NFS-e gerada
      let nfseXml = '';
      if (parsed?.nfseXmlGZipB64) {
        try {
          nfseXml = ungzipBase64(parsed.nfseXmlGZipB64);
        } catch { /* ignore */ }
      }

      // Extract nNFSe and nDFSe from XML if available (handle namespace prefixes)
      let nNFSe: string | undefined;
      let nDFSe: string | undefined;
      // Regex handles optional namespace prefix e.g. <ns3:nDFSe>, <NFSe:nDFSe>, <nDFSe>
      const nNFSeMatch = nfseXml.match(/<(?:\w+:)?nNFSe>(\d+)<\/(?:\w+:)?nNFSe>/);
      if (nNFSeMatch) nNFSe = nNFSeMatch[1];
      const nDFSeMatch = nfseXml.match(/<(?:\w+:)?nDFSe>(\d+)<\/(?:\w+:)?nDFSe>/);
      if (nDFSeMatch) nDFSe = nDFSeMatch[1];
      // Fallback to JSON response fields
      if (!nNFSe && parsed?.nNFSe) nNFSe = String(parsed.nNFSe);
      if (!nDFSe && parsed?.nDFSe) nDFSe = String(parsed.nDFSe);
      // Also check nested paths common in Sefin responses
      if (!nDFSe && parsed?.nfse?.infNFSe?.nDFSe) nDFSe = String(parsed.nfse.infNFSe.nDFSe);
      if (!nNFSe && parsed?.nfse?.infNFSe?.nNFSe) nNFSe = String(parsed.nfse.infNFSe.nNFSe);
      // If we have nNFSe but not nDFSe, use nNFSe as nDFSe (they're often the same)
      if (!nDFSe && nNFSe) nDFSe = nNFSe;
      
      console.log(`📋 Números extraídos - nDFSe: ${nDFSe || 'N/A'}, nNFSe: ${nNFSe || 'N/A'}, nDPS: ${request.nDPS}`);

      // Try to fetch DANFSE PDF
      let pdfBase64: string | undefined;
      if (parsed?.chaveAcesso) {
        try {
          const danfse = await fetchDanfsePdf(parsed.chaveAcesso, request.ambiente);
          if (danfse.success && danfse.pdfBase64) {
            pdfBase64 = danfse.pdfBase64;
          }
        } catch (e) {
          console.warn('⚠️ Falha ao buscar DANFSE PDF:', e);
        }
      }

      return {
        success: true,
        chNFSe: parsed?.chaveAcesso,
        nNFSe,
        nDFSe,
        nDPS: request.nDPS,
        chDPS: parsed?.idDps,
        xmlRetorno: nfseXml || response.body,
        pdfBase64,
      };
    } else {
      // Erro - extrair mensagens
      let errorMessage = `HTTP ${response.statusCode}`;
      let jaEmitida = false;

      if (parsed?.erros && Array.isArray(parsed.erros)) {
        const msgs = parsed.erros.map((e: any) =>
          [e.codigo, e.mensagem, e.descricao, e.complemento].filter(Boolean).join(' - ')
        );
        errorMessage = msgs.join(' | ') || errorMessage;
        // Detect already-emitted DPS
        jaEmitida = parsed.erros.some((e: any) => 
          /j[aá]\s*(foi\s*)?autoriz|DPS\s*j[aá]\s*process|duplici/i.test(
            [e.mensagem, e.descricao, e.complemento].filter(Boolean).join(' ')
          )
        );
      } else if (parsed?.erro) {
        const e = parsed.erro;
        errorMessage = [e.codigo, e.mensagem, e.descricao, e.complemento].filter(Boolean).join(' - ') || errorMessage;
        jaEmitida = /j[aá]\s*(foi\s*)?autoriz|DPS\s*j[aá]\s*process|duplici/i.test(
          [e.mensagem, e.descricao, e.complemento].filter(Boolean).join(' ')
        );
      } else if (parsed?.message) {
        errorMessage = `HTTP ${response.statusCode} - ${parsed.message}`;
      } else {
        const bodyPreview = response.body.replace(/\s+/g, ' ').trim().slice(0, 280);
        if (bodyPreview) errorMessage = `HTTP ${response.statusCode} - ${bodyPreview}`;
      }

      return {
        success: false,
        error: errorMessage,
        nDPS: request.nDPS,
        jaEmitida,
        detalhes: {
          httpStatus: response.statusCode,
          jsonRetorno: parsed || response.body,
        },
      };
    }
  } catch (error) {
    console.error('❌ Erro na emissão NFS-e:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido na emissão',
    };
  }
}

// ─── Consulta ───

export async function consultarNFSe(chaveAcesso: string, ambiente: 1 | 2 = 2): Promise<NfseResult> {
  try {
    const cert = loadCertificate();
    const apiUrl = `${API_URLS[ambiente]}/nfse/${chaveAcesso}`;

    const response = await makeRequest(apiUrl, 'GET', '', cert, 'application/json');

    let parsed: any;
    try { parsed = JSON.parse(response.body); } catch { parsed = null; }

    if (response.statusCode >= 200 && response.statusCode < 300 && parsed?.chaveAcesso) {
      let nfseXml = '';
      if (parsed?.nfseXmlGZipB64) {
        try { nfseXml = ungzipBase64(parsed.nfseXmlGZipB64); } catch { /* ignore */ }
      }
      return {
        success: true,
        chNFSe: parsed.chaveAcesso,
        xmlRetorno: nfseXml || response.body,
      };
    } else {
      return {
        success: false,
        error: parsed?.erro?.mensagem || `HTTP ${response.statusCode}`,
        detalhes: { jsonRetorno: parsed || response.body },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// ─── Emissão simplificada a partir de dados do Autolac ───

export async function emitirNFSeFromProtocolo(params: {
  protocolo: string;
  pacienteNome: string;
  cpf: string;
  valor: number;
  formaPagamento?: string;
  observacao?: string;
  ambiente?: 1 | 2;
  nDPS: string;
  dataAtendimento?: string; // YYYY-MM-DD format from frontend
}): Promise<NfseResult> {
  const hoje = new Date().toISOString().slice(0, 10);
  
  // Use provided service date, fallback to today
  const dataBase = params.dataAtendimento || hoje;
  // Formatar data de atendimento como DD-MM-AAAA
  const parts = dataBase.split('-');
  const dataAtend = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dataBase;

  return emitirNFSe({
    ambiente: params.ambiente || 2,
    emissor: KLETT_EMISSOR,
    tomador: {
      cpf: params.cpf,
      nome: params.pacienteNome,
    },
    servico: KLETT_SERVICO_PADRAO,
    valores: {
      vServ: params.valor,
      aliqISS: 3.00,
    },
    nDPS: params.nDPS,
    dCompet: hoje,
    formaPagamento: params.formaPagamento,
    protocolo: params.protocolo,
    dataAtendimento: dataAtend,
  });
}

// ─── DANFSE (PDF da NFS-e) ───

export async function fetchDanfsePdf(chaveAcesso: string, _ambiente: 1 | 2 = 1): Promise<{ success: boolean; pdfBase64?: string; error?: string }> {
  try {
    const cert = loadCertificate();
    // URL correta do DANFSE - migrou de sefin.nfse.gov.br para adn.nfse.gov.br em set/2025
    const apiUrl = `https://adn.nfse.gov.br/danfse/${chaveAcesso}`;
    console.log(`📄 Buscando DANFSE PDF: GET ${apiUrl}`);

    const urlObj = new URL(apiUrl);

    // Try multiple TLS configurations: PEM first, then PFX, then PFX without strict validation
    const attempts: Array<{ label: string; tlsOpts: Record<string, unknown> }> = [];

    if (cert.key && cert.cert) {
      attempts.push({
        label: 'PEM key+cert',
        tlsOpts: { key: cert.key, cert: cert.cert, rejectUnauthorized: true },
      });
      attempts.push({
        label: 'PEM key+cert (relaxed)',
        tlsOpts: { key: cert.key, cert: cert.cert, rejectUnauthorized: false },
      });
    }
    attempts.push({
      label: 'PFX',
      tlsOpts: { pfx: cert.pfx, passphrase: cert.passphrase, rejectUnauthorized: true },
    });
    attempts.push({
      label: 'PFX (relaxed)',
      tlsOpts: { pfx: cert.pfx, passphrase: cert.passphrase, rejectUnauthorized: false },
    });

    for (const attempt of attempts) {
      try {
        console.log(`  🔑 Tentando com ${attempt.label}...`);
        const result = await new Promise<{ success: boolean; pdfBase64?: string; error?: string }>((resolve) => {
          const options: https.RequestOptions = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname,
            method: 'GET',
            headers: { 'Accept': 'application/pdf, */*' },
            ...attempt.tlsOpts,
            timeout: 30000,
          };

          const req = https.request(options, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              const statusCode = res.statusCode || 500;
              const rawBody = Buffer.concat(chunks);

              console.log(`  📥 ${attempt.label}: HTTP ${statusCode}, ${rawBody.length} bytes, CT: ${res.headers['content-type'] || 'none'}`);

              // Follow redirects
              if ([301, 302, 307, 308].includes(statusCode) && res.headers.location) {
                console.log(`  ↪️ Redirect: ${res.headers.location}`);
                // Re-try with redirected URL (simple GET, same TLS options)
                const redirectUrl = new URL(res.headers.location, urlObj);
                const rOpts: https.RequestOptions = {
                  hostname: redirectUrl.hostname,
                  port: 443,
                  path: `${redirectUrl.pathname}${redirectUrl.search || ''}`,
                  method: 'GET',
                  headers: { 'Accept': 'application/pdf, */*' },
                  ...attempt.tlsOpts,
                  timeout: 30000,
                };
                const rReq = https.request(rOpts, (rRes) => {
                  const rChunks: Buffer[] = [];
                  rRes.on('data', (c: Buffer) => rChunks.push(c));
                  rRes.on('end', () => {
                    const rBody = Buffer.concat(rChunks);
                    if ((rRes.statusCode || 500) >= 200 && (rRes.statusCode || 500) < 300 && rBody.length > 100) {
                      resolve({ success: true, pdfBase64: rBody.toString('base64') });
                    } else {
                      resolve({ success: false, error: `HTTP ${rRes.statusCode} após redirect` });
                    }
                  });
                });
                rReq.on('error', (e) => resolve({ success: false, error: e.message }));
                rReq.end();
                return;
              }

              if (statusCode >= 200 && statusCode < 300 && rawBody.length > 100) {
                const contentType = res.headers['content-type'] || '';
                if (contentType.includes('pdf') || rawBody[0] === 0x25) {
                  resolve({ success: true, pdfBase64: rawBody.toString('base64') });
                } else {
                  resolve({ success: false, error: `Resposta não é PDF (${contentType}), ${rawBody.length} bytes` });
                }
              } else {
                const bodyStr = rawBody.toString('utf-8').substring(0, 300);
                resolve({ success: false, error: `HTTP ${statusCode} - ${bodyStr}` });
              }
            });
          });

          req.on('error', (err) => {
            console.error(`  ❌ ${attempt.label}: ${err.message}`);
            resolve({ success: false, error: err.message });
          });

          req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Timeout (30s)' });
          });

          req.end();
        });

        if (result.success) {
          console.log(`✅ DANFSE PDF obtido via ${attempt.label}`);
          return result;
        }
        console.warn(`  ⚠️ ${attempt.label} falhou: ${result.error}`);
      } catch (e: any) {
        console.warn(`  ⚠️ ${attempt.label} exceção: ${e.message}`);
      }
    }

    return { success: false, error: 'Todas as tentativas de download do DANFSE falharam' };
  } catch (error) {
    console.error('❌ Erro ao buscar DANFSE:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

// ─── Health Check ───

export function isNfseConfigured(): boolean {
  return !!process.env.NFSE_CERT_PFX_BASE64;
}
