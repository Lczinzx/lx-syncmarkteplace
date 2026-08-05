import crypto from 'node:crypto';
import URL from 'node:url';

export interface UploadedImageMetadata {
  id: string;
  organizationId: string;
  url: string;
  storageKey: string;
  originalFilename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
  width: number;
  height: number;
  status: 'READY' | 'SYNCED' | 'FAILED';
  createdAt: string;
}

export class ImageStorageService {
  private static readonly MAX_FILE_SIZE = Number(process.env.MAX_IMAGE_SIZE_BYTES || 5 * 1024 * 1024); // 5 MB por padrão
  private static readonly ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  /**
   * Valida Magic Bytes de imagens (Assinatura binária real)
   */
  static validateMagicBytes(buffer: Buffer): { valid: boolean; mime?: 'image/jpeg' | 'image/png' | 'image/webp' } {
    if (!buffer || buffer.length < 12) {
      return { valid: false };
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { valid: true, mime: 'image/jpeg' };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A
    ) {
      return { valid: true, mime: 'image/png' };
    }

    // WEBP: RIFF .... WEBP
    if (
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50    // P
    ) {
      return { valid: true, mime: 'image/webp' };
    }

    return { valid: false };
  }

  /**
   * Valida URL contra ataques SSRF (Server-Side Request Forgery)
   */
  static validateExternalUrlForSsrf(inputUrl: string): { safe: boolean; reason?: string } {
    try {
      const parsed = new URL.URL(inputUrl);

      if (parsed.protocol !== 'https:') {
        return { safe: false, reason: 'Apenas URLs com protocolo seguro HTTPS são permitidas.' };
      }

      const hostname = parsed.hostname.toLowerCase();

      // Bloqueia localhost, ips de loopback e ips privados
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('169.254.') || // AWS Metadata IP
        hostname.endsWith('.internal') ||
        hostname.endsWith('.local')
      ) {
        return { safe: false, reason: 'Acesso a endereços locais ou redes privadas é estritamente proibido (Proteção SSRF).' };
      }

      return { safe: true };
    } catch (err) {
      return { safe: false, reason: 'URL inválida ou malformada.' };
    }
  }

  /**
   * Processa o upload de um arquivo de imagem recebido em base64 ou buffer
   */
  static processUpload(
    organizationId: string,
    filename: string,
    buffer: Buffer
  ): UploadedImageMetadata {
    if (!organizationId) {
      throw new Error('organizationId é obrigatório e deve vir do JWT.');
    }

    if (buffer.length > this.MAX_FILE_SIZE) {
      throw new Error(`Arquivo excede o limite máximo permitido de ${Math.round(this.MAX_FILE_SIZE / (1024 * 1024))}MB.`);
    }

    const magicCheck = this.validateMagicBytes(buffer);
    if (!magicCheck.valid || !magicCheck.mime) {
      throw new Error('Assinatura de arquivo inválida ou formato de imagem não suportado (aceito apenas JPG, PNG, WEBP).');
    }

    // Sanitização e chave de armazenamento imprevisível
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
    const datePrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const ext = magicCheck.mime === 'image/jpeg' ? 'jpg' : magicCheck.mime === 'image/png' ? 'png' : 'webp';
    const storageKey = `${organizationId}/images/${datePrefix}/${fileHash}.${ext}`;
    const imageId = `img-${Date.now()}-${fileHash.substring(0, 6)}`;

    const dataUrl = `data:${magicCheck.mime};base64,${buffer.toString('base64')}`;

    return {
      id: imageId,
      organizationId,
      url: dataUrl,
      storageKey,
      originalFilename: filename.replace(/[^a-zA-Z0-9._-]/g, '_'),
      mimeType: magicCheck.mime,
      fileSize: buffer.length,
      width: 1200,
      height: 1200,
      status: 'READY',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Retorna a URL com fallback em 4 níveis para exibição segura na interface
   */
  static get4TierFallbackUrl(params: {
    variationImageUrl?: string | null;
    listingImageUrl?: string | null;
    masterProductImageUrl?: string | null;
  }): string {
    if (params.variationImageUrl && params.variationImageUrl.trim() !== '') {
      return params.variationImageUrl;
    }
    if (params.listingImageUrl && params.listingImageUrl.trim() !== '') {
      return params.listingImageUrl;
    }
    if (params.masterProductImageUrl && params.masterProductImageUrl.trim() !== '') {
      return params.masterProductImageUrl;
    }

    // Fallback Nível 4: Placeholder SVG LX Sync inline
    return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4OCIgaGVpZ2h0PSI4OCIgdmlld0JveD0iMCAwIDg4IDg4Ij48cmVjdCB3aWR0aD0iODgiIGhlaWdodD0iODgiIHJ4PSIxMiIgZmlsbD0iIzE5MTIxNCIgc3Ryb2tlPSJyZ2JhKDIzOSwgNjgsIDY4LCAwLjMpIiBzdHJva2Utd2lkdGg9IjEiLz48dGV4dCB4PSI1MCUiIHk9IjQyJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI0VGNDQ0NCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSI4MDAiPkxYPC90ZXh0Pjx0ZXh0IHg9IjUwJSIgeT0iNjIlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOUNBM0FGIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSI5IiBmb250LXdlaWdodD0iNjAwIj5TeW5jPC90ZXh0Pjwvc3ZnPg==';
  }
}
