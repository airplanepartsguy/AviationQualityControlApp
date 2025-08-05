/**
 * Centralized Salesforce Configuration
 * All Salesforce OAuth and API configuration in one place
 */

export const SALESFORCE_CONFIG = {
  // OAuth URLs
  OAUTH: {
    PRODUCTION: {
      AUTH_URL: 'https://login.salesforce.com/services/oauth2/authorize',
      TOKEN_URL: 'https://login.salesforce.com/services/oauth2/token',
      REVOKE_URL: 'https://login.salesforce.com/services/oauth2/revoke'
    },
    SANDBOX: {
      AUTH_URL: 'https://test.salesforce.com/services/oauth2/authorize',
      TOKEN_URL: 'https://test.salesforce.com/services/oauth2/token',
      REVOKE_URL: 'https://test.salesforce.com/services/oauth2/revoke'
    }
  },
  
  // API Configuration
  API: {
    VERSION: 'v59.0',
    TIMEOUT: 30000, // 30 seconds
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000 // 1 second
  },
  
  // Token Configuration
  TOKEN: {
    ACCESS_TOKEN_EXPIRY: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
    REFRESH_BUFFER: 5 * 60 * 1000, // Refresh 5 minutes before expiry
    CACHE_DURATION: 5 * 60 * 1000 // Cache tokens for 5 minutes
  },
  
  // Scopes required for the app
  REQUIRED_SCOPES: [
    'api',
    'web',
    'refresh_token',
    'offline_access'
  ],
  
  // File attachment limits
  ATTACHMENT: {
    MAX_SIZE: 25 * 1024 * 1024, // 25MB (Salesforce limit)
    ALLOWED_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
    BATCH_SIZE: 10 // Max attachments per request
  },
  
  // Error messages
  ERRORS: {
    NO_TOKEN: 'No Salesforce connection found. Admin must connect Salesforce first.',
    EXPIRED_TOKEN: 'Salesforce session expired. Please reconnect.',
    INVALID_REFRESH: 'Unable to refresh Salesforce connection. Admin must reconnect.',
    UPLOAD_FAILED: 'Failed to upload to Salesforce. Please try again.',
    OBJECT_NOT_FOUND: 'Salesforce object not found for this document type.'
  },
  
  // Monitoring configuration
  MONITORING: {
    LOG_LEVEL: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
    ENABLE_ANALYTICS: true,
    TRACK_TOKEN_USAGE: true
  }
};

// Helper to get OAuth URLs based on environment
export const getOAuthUrls = (isSandbox: boolean) => {
  return isSandbox ? SALESFORCE_CONFIG.OAUTH.SANDBOX : SALESFORCE_CONFIG.OAUTH.PRODUCTION;
};

// Helper to check if token needs refresh
export const shouldRefreshToken = (expiresAt: string | Date): boolean => {
  const expiry = new Date(expiresAt).getTime();
  const now = Date.now();
  return (expiry - now) < SALESFORCE_CONFIG.TOKEN.REFRESH_BUFFER;
};

// Helper to format Salesforce API endpoint
export const formatApiEndpoint = (instanceUrl: string, path: string): string => {
  const cleanUrl = instanceUrl.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${cleanUrl}/services/data/${SALESFORCE_CONFIG.API.VERSION}/${cleanPath}`;
};