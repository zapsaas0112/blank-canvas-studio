/**
 * WhatsApp utility functions for ZapDesk
 * Single source of truth for number normalization and validation
 */

/**
 * Normalizes any phone input to WhatsApp format: 5511999999999
 * Handles: (11) 99888-7777, +55 11 99888-7777, 11998887777, etc.
 * Groups with @g.us are returned as-is.
 */
export function normalizeWhatsAppNumber(input: string): string {
  if (!input) return '';
  
  // Groups - keep as-is
  if (input.includes('@g.us')) return input.trim();
  
  // Remove everything that's not a digit
  let digits = input.replace(/\D/g, '');
  
  // If starts with 0, remove leading 0 (local format)
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  
  // If doesn't start with 55, add country code
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }
  
  return digits;
}

/**
 * Validates if a normalized number looks valid for WhatsApp Brazil
 * Expected: 55 + 2-digit DDD + 8-9 digit number = 12-13 digits total
 */
export function isValidWhatsAppNumber(normalized: string): boolean {
  if (!normalized) return false;
  if (normalized.includes('@g.us')) return true;
  
  // Brazilian: 55 + DD + 8-9 digits = 12-13 chars
  if (!/^55\d{10,11}$/.test(normalized)) return false;
  
  // DDD valid range (11-99)
  const ddd = parseInt(normalized.substring(2, 4));
  if (ddd < 11 || ddd > 99) return false;
  
  return true;
}

/**
 * Formats a normalized number for display: +55 (11) 99999-9999
 */
export function formatPhoneDisplay(normalized: string): string {
  if (!normalized || normalized.includes('@g.us')) return normalized;
  
  const digits = normalized.replace(/\D/g, '');
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return normalized;
}

/**
 * Validates a WhatsApp API send response.
 * Returns true only if the API confirmed the message was accepted.
 */
export function isSendSuccess(responseData: any): boolean {
  if (!responseData) return false;
  
  // Check for explicit error indicators
  if (responseData._status && responseData._status !== 200) return false;
  if (responseData.error) return false;
  
  // Check for positive indicators
  if (responseData.messageId) return true;
  if (responseData.messageid) return true;
  if (responseData.key) return true;
  if (responseData.success === true) return true;
  if (responseData.status === 'PENDING' || responseData.status === 'sent') return true;
  
  // Check nested data
  if (responseData.data?.messageId) return true;
  if (responseData.data?.key) return true;
  
  return false;
}

/**
 * Parse instance status from UAZAPI response
 */
export function parseInstanceStatus(data: any): {
  connected: boolean;
  connecting: boolean;
  status: 'connected' | 'connecting' | 'disconnected';
  phoneNumber: string | null;
  profileName: string | null;
  qrCode: string | null;
} {
  const inst = data?.instance || data || {};
  const statusObj = data?.status || {};
  
  const isConnected = 
    statusObj?.connected === true ||
    inst?.status === 'open' ||
    inst?.status === 'connected' ||
    data?.status === 'connected';
  
  const isConnecting = 
    inst?.status === 'connecting' ||
    data?.status === 'connecting';
  
  const phoneNumber = inst?.owner || inst?.phone || data?.phone || null;
  const profileName = inst?.profileName || inst?.name || data?.name || null;
  const qrCode = inst?.qrcode || data?.qrcode || data?.qr || data?.base64 || null;
  
  return {
    connected: isConnected,
    connecting: isConnecting,
    status: isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected',
    phoneNumber,
    profileName,
    qrCode: isConnected ? null : qrCode,
  };
}
