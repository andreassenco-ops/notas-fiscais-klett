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
}

export interface NfseResult {
  success: boolean;
  chNFSe?: string;
  chDPS?: string;
  xmlRetorno?: string;
  error?: string;
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
  cTribNac: '040201',        // 04.02.01
  xDescServ: 'Análises Clínicas',
  cNBS: '1.2301.93.00',
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

  // Testa se o PFX é válido criando um secure context
  // Usa openssl legacy provider para suportar certificados com algoritmos antigos
  try {
    tls.createSecureContext({
      pfx: pfxBuffer,
      passphrase: password,
    });
  } catch (err: any) {
    // Se falhar com formato não suportado, tenta com flag legacy
    if (err.message?.includes('Unsupported') || err.message?.includes('PKCS12')) {
      console.warn('⚠️ PFX com formato legado detectado. Tentando conversão...');
      // Node 17+ com OpenSSL 3.x precisa do legacy provider
      // Alternativa: converter via spawn openssl, ou indicar ao usuário
      throw new Error(
        'Certificado PFX usa algoritmo não suportado pelo OpenSSL 3.x. ' +
        'Converta o certificado com: openssl pkcs12 -in cert.pfx -out temp.pem -nodes -legacy && ' +
        'openssl pkcs12 -export -in temp.pem -out cert_novo.pfx -passout pass:SUASENHA. ' +
        'Ou inicie o Railway com NODE_OPTIONS=--openssl-legacy-provider'
      );
    }
    throw err;
  }

  cachedCert = {
    key: '',
    cert: '',
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
  const now = new Date();
  const dhEmi = now.toISOString().replace(/\.\d+Z$/, '-03:00');
  
  // Calcular ISS
  const vServ = req.valores.vServ;
  const aliqISS = req.valores.aliqISS || 3.00;
  const vISS = vServ * (aliqISS / 100);
  const vLiq = vServ - vISS;
  
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

  // Código IBGE da inscrição (tipo 2 = CNPJ)
  const idDPS = `${req.emissor.cMunIBGE}2${req.emissor.cnpj}${serie.padStart(5, '0')}${req.nDPS.padStart(15, '0')}`;

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
    <subst>2</subst>
    <prest>
      <CNPJ>${req.emissor.cnpj}</CNPJ>
      <IM>${req.emissor.im}</IM>
      <xNome>${escapeXml(req.emissor.razaoSocial)}</xNome>
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
      <cServ>
        <cTribNac>${req.servico.cTribNac}</cTribNac>
        <xDescServ>${escapeXml(req.servico.xDescServ)}</xDescServ>
        <cNBS>${req.servico.cNBS || ''}</cNBS>
      </cServ>
      <cLocPrestacao>${req.servico.cLocPrestacao}</cLocPrestacao>
    </serv>
    <valores>
      <vServPrest>
        <vServ>${formatDecimal(vServ)}</vServ>
      </vServPrest>
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <cPaisResult>1058</cPaisResult>
          <tpRetISSQN>1</tpRetISSQN>
        </tribMun>
        <totTrib>
          <indTotTrib>0</indTotTrib>
        </totTrib>
      </trib>
    </valores>
  </infDPS>
</DPS>`;

  return xml;
}

// ─── Assinatura Digital XML ───

async function signXml(xml: string): Promise<string> {
  try {
    // Dynamic import for xml-crypto
    const { SignedXml } = await import('xml-crypto');
    const cert = loadCertificate();

    const sig = new SignedXml({
      privateKey: cert.pfx,
      publicCert: cert.pfx,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    });

    // Add reference to infDPS
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
    // Fallback: if xml-crypto not available or pfx parsing fails,
    // try without signature (for testing/homologação)
    console.error('⚠️ Erro ao assinar XML:', error);
    throw new Error(`Falha na assinatura digital: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

// ─── API Client (mTLS) ───

const API_URLS = {
  1: 'https://sefin.nfse.gov.br/SefinNacional',       // Produção
  2: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional', // Homologação
};

function makeRequest(
  url: string,
  method: string,
  body: string,
  cert: CertData,
  contentType = 'application/xml; charset=utf-8'
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method,
      headers: {
        'Content-Type': contentType,
        'Accept': 'application/xml, text/xml, */*',
        'Content-Length': Buffer.byteLength(body, 'utf-8'),
      },
      // mTLS - certificado A1
      pfx: cert.pfx,
      passphrase: cert.passphrase,
      rejectUnauthorized: true,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 500, body: data }));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
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

    // 4. Enviar para API via mTLS
    const apiUrl = `${API_URLS[request.ambiente]}/nfse`;
    console.log(`📤 Enviando para ${apiUrl}...`);

    let response = await makeRequest(apiUrl, 'POST', signedXml, cert, 'application/xml; charset=utf-8');

    // Alguns ambientes exigem content-type específico; tenta fallback em HTTP 415
    if (response.statusCode === 415) {
      console.warn('⚠️ HTTP 415 com application/xml; tentando text/xml...');
      response = await makeRequest(apiUrl, 'POST', signedXml, cert, 'text/xml; charset=utf-8');
    }

    console.log(`📥 Resposta: HTTP ${response.statusCode} (${response.body.length} bytes)`);

    // 5. Processar resposta
    if (response.statusCode >= 200 && response.statusCode < 300) {
      // Extrair chave da NFS-e da resposta
      const chNFSeMatch = response.body.match(/<chNFSe>([^<]+)<\/chNFSe>/);
      const chDPSMatch = response.body.match(/<chDPS>([^<]+)<\/chDPS>/);

      return {
        success: true,
        chNFSe: chNFSeMatch?.[1],
        chDPS: chDPSMatch?.[1],
        xmlRetorno: response.body,
      };
    } else {
      // Extrair mensagem de erro
      const msgMatch = response.body.match(/<xMotivo>([^<]+)<\/xMotivo>/);
      const cStatMatch = response.body.match(/<cStat>([^<]+)<\/cStat>/);

      return {
        success: false,
        error: msgMatch?.[1] || `HTTP ${response.statusCode}`,
        detalhes: {
          cStat: cStatMatch?.[1],
          httpStatus: response.statusCode,
          xmlRetorno: response.body,
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

    const response = await makeRequest(apiUrl, 'GET', '', cert);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return {
        success: true,
        chNFSe: chaveAcesso,
        xmlRetorno: response.body,
      };
    } else {
      return {
        success: false,
        error: `HTTP ${response.statusCode}`,
        detalhes: { xmlRetorno: response.body },
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
}): Promise<NfseResult> {
  const hoje = new Date().toISOString().slice(0, 10);

  return emitirNFSe({
    ambiente: params.ambiente || 2, // Homologação por padrão
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
  });
}

// ─── Health Check ───

export function isNfseConfigured(): boolean {
  return !!process.env.NFSE_CERT_PFX_BASE64;
}
