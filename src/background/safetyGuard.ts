// Security Sandbox, Domain Blacklist, and Safety Guard for Sahayak
import type { SecurityAssessment, SecurityCategory, ProposedAction, ActionElement } from '../shared/types';
import { SENSITIVE_INPUT_REGEX } from '../shared/constants';

/**
 * 1. Banking, Fintech & Payment Providers
 */
export const BANKING_DOMAINS = [
  // US & Global Major Banks
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citi.com',
  'citigroup.com',
  'capitalone.com',
  'usbank.com',
  'pnc.com',
  'barclays.co.uk',
  'barclays.com',
  'hsbc.com',
  'hsbc.co.in',
  // Indian Banking & Financial Institutions
  'hdfcbank.com',
  'hdfcbank.co.in',
  'icicibank.com',
  'icicibank.co.in',
  'sbi.co.in',
  'onlinesbi.sbi',
  'axisbank.com',
  'axisbank.co.in',
  'kotak.com',
  'kotak.co.in',
  'bankofbaroda.in',
  'bankofbaroda.com',
  'punjabnationalbank.in',
  'canarabank.com',
  'canarabank.in',
  // Wallets, Payments & Crypto
  'paypal.com',
  'stripe.com',
  'razorpay.com',
  'paytm.com',
  'phonepe.com',
  'venmo.com',
  'cash.app',
  'coinbase.com',
  'binance.com',
  'kraken.com',
];

/**
 * 2. Authentication, Single Sign-On & Password Recovery Portals
 */
export const AUTH_DOMAINS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'auth0.com',
  'okta.com',
  'appleid.apple.com',
  'auth.amazon.com',
  'id.atlassian.com',
  'identity.oracle.com',
  'signin.aws.amazon.com',
];

/**
 * Path-specific authentication entrypoints on shared web platforms
 */
export const AUTH_PATHS = [
  { domain: 'github.com', paths: ['/login', '/password_reset', '/sessions/two-factor'] },
  { domain: 'gitlab.com', paths: ['/users/sign_in', '/users/password/new'] },
  { domain: 'twitter.com', paths: ['/i/flow/login', '/i/flow/password_reset'] },
  { domain: 'x.com', paths: ['/i/flow/login', '/i/flow/password_reset'] },
  { domain: 'facebook.com', paths: ['/login', '/recover/initiate'] },
  { domain: 'linkedin.com', paths: ['/checkpoint', '/uas/login'] },
];

/**
 * 3. Government, Tax, Social Security & National Identity Portals
 */
export const GOVERNMENT_DOMAINS = [
  // India
  'incometax.gov.in',
  'uidai.gov.in',
  'passportindia.gov.in',
  'epfindia.gov.in',
  'myaadhaar.uidai.gov.in',
  // USA
  'irs.gov',
  'ssa.gov',
  'va.gov',
  'login.gov',
  'usps.com',
  // UK & Commonwealth
  'gov.uk',
  'servicesaustralia.gov.au',
];

/**
 * 4. Browser Internal & Protected Schemes
 */
export const RESTRICTED_SCHEMES = [
  'chrome://',
  'chrome-extension://',
  'devtools://',
  'edge://',
  'about:',
  'view-source:',
  'https://chromewebstore.google.com',
];

/**
 * Checks whether a given URL hostname matches a target domain or its subdomains.
 * e.g., netbanking.hdfcbank.com -> matches hdfcbank.com
 */
export function isDomainOrSubdomain(hostname: string, targetDomain: string): boolean {
  const host = (hostname || '').toLowerCase().trim();
  const target = (targetDomain || '').toLowerCase().trim();
  return host === target || host.endsWith('.' + target);
}

export interface AssessUrlSecurityOptions {
  hasPasswordField?: boolean;
  allowLocalhost?: boolean;
  strictPasswordLockout?: boolean;
}

/**
 * Evaluates whether a raw URL matches any known domain blacklist category
 */
export function assessUrlSecurity(
  rawUrl: string,
  options?: AssessUrlSecurityOptions
): SecurityAssessment {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      isBlocked: true,
      category: 'restricted_browser',
      reason: 'Invalid or missing webpage URL.',
      advice: 'Navigate to an active HTTP/HTTPS webpage.',
    };
  }

  // 1. Restricted browser schemes
  for (const scheme of RESTRICTED_SCHEMES) {
    if (rawUrl.startsWith(scheme)) {
      return {
        isBlocked: true,
        category: 'restricted_browser',
        reason: 'Chrome extensions cannot run automated scripts on internal browser pages.',
        advice: 'Sahayak is locked on Chrome system and extension store pages.',
      };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      isBlocked: true,
      category: 'restricted_browser',
      reason: 'Malformed or unparseable webpage URL.',
      advice: 'Check the URL format in your browser address bar.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  // 2. Local internal network addresses
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  ) {
    const isAllowedLocalhost =
      (hostname === 'localhost' || hostname === '127.0.0.1') &&
      (options?.allowLocalhost !== false);

    if (isAllowedLocalhost) {
      // Localhost allowed for developer / practice sandbox testing
    } else {
      return {
        isBlocked: true,
        category: 'restricted_browser',
        domain: hostname,
        reason: 'Internal private network host detected.',
        advice: 'Automation is restricted on local private network addresses.',
      };
    }
  }

  // 3. Banking & Fintech
  for (const bankDomain of BANKING_DOMAINS) {
    if (isDomainOrSubdomain(hostname, bankDomain)) {
      return {
        isBlocked: true,
        category: 'banking',
        domain: bankDomain,
        reason: 'Sensitive banking or financial transaction domain detected.',
        advice: 'Sahayak is paused for your safety on this sensitive financial page.',
      };
    }
  }

  // 4. Dedicated Authentication & Identity Providers
  for (const authDomain of AUTH_DOMAINS) {
    if (isDomainOrSubdomain(hostname, authDomain)) {
      return {
        isBlocked: true,
        category: 'auth',
        domain: authDomain,
        reason: 'Single Sign-On (SSO) or primary identity authentication provider detected.',
        advice: 'Sahayak is paused for your safety on this authentication portal.',
      };
    }
  }

  // 5. Shared platform auth paths (e.g. github.com/login)
  for (const entry of AUTH_PATHS) {
    if (isDomainOrSubdomain(hostname, entry.domain)) {
      for (const p of entry.paths) {
        if (pathname.startsWith(p)) {
          return {
            isBlocked: true,
            category: 'auth',
            domain: `${entry.domain}${p}`,
            reason: 'Account login or password reset path detected.',
            advice: 'Sahayak is paused for your safety on this login page.',
          };
        }
      }
    }
  }

  // 6. Government, Tax & National ID
  for (const govDomain of GOVERNMENT_DOMAINS) {
    if (isDomainOrSubdomain(hostname, govDomain)) {
      return {
        isBlocked: true,
        category: 'government',
        domain: govDomain,
        reason: 'Government identity or taxation services portal detected.',
        advice: 'Sahayak is paused for your safety on this government portal.',
      };
    }
  }

  // 7. Dynamic DOM credential check (if page metadata provided)
  // Password inputs are automatically sanitized and omitted from the Set-of-Marks Action Map
  // so the AI never sees or interacts with sensitive credential fields.
  // The page itself is NOT blocked: users can autofill safe profile fields (name, email, etc.)
  // and manually type their credentials themselves.
  if (options?.strictPasswordLockout && options?.hasPasswordField) {
    return {
      isBlocked: true,
      category: 'password_detected',
      domain: hostname,
      reason: 'Webpage contains active password input fields.',
      advice: 'Sahayak is paused for your safety on credential entry forms.',
      hasSensitiveInputs: true,
    };
  }

  // Page is verified safe
  return {
    isBlocked: false,
    reason: options?.hasPasswordField
      ? 'Webpage contains password fields (sensitive credentials are hidden and excluded from automation).'
      : 'Page is safe for grounded chat and human-in-the-loop actions.',
    domain: hostname,
    advice: '',
    hasSensitiveInputs: Boolean(options?.hasPasswordField),
  };
}

/**
 * Convenient boolean check for safety blocking
 */
export function isSecurityBlockedUrl(
  rawUrl: string,
  options?: AssessUrlSecurityOptions
): boolean {
  const assessment = assessUrlSecurity(rawUrl, options);
  return assessment.isBlocked;
}

/**
 * Inspects a document DOM to detect sensitive inputs or password forms
 */
export function detectSensitivePageFeatures(doc: Document): {
  hasPasswordField: boolean;
  sensitiveElementCount: number;
} {
  if (!doc) {
    return { hasPasswordField: false, sensitiveElementCount: 0 };
  }

  const passwordInputs = doc.querySelectorAll('input[type="password"]');
  const hasPasswordField = passwordInputs.length > 0;

  let sensitiveElementCount = passwordInputs.length;

  const allInputs = doc.querySelectorAll('input, textarea, select');
  allInputs.forEach((el) => {
    const input = el as HTMLInputElement;
    if (input.type === 'password') return; // already counted

    const auto = (input.autocomplete || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const aria = (input.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();

    const isSensitive =
      auto.includes('password') ||
      auto.includes('cc-') ||
      auto.includes('one-time-code') ||
      SENSITIVE_INPUT_REGEX.test(name) ||
      SENSITIVE_INPUT_REGEX.test(id) ||
      SENSITIVE_INPUT_REGEX.test(aria) ||
      SENSITIVE_INPUT_REGEX.test(placeholder);

    if (isSensitive) {
      sensitiveElementCount++;
    }
  });

  return {
    hasPasswordField,
    sensitiveElementCount,
  };
}

/**
 * Verifies that a proposed action does not interact with any sensitive DOM field
 */
export function validateActionTargetSafety(
  action: ProposedAction,
  element?: Partial<ActionElement>
): { safe: boolean; reason?: string } {
  if (!action) {
    return { safe: false, reason: 'Invalid or undefined action proposal.' };
  }

  if (element) {
    if (element.type === 'password') {
      return {
        safe: false,
        reason: 'Target element is a password field; automated interaction is forbidden.',
      };
    }

    const testTokens = [
      element.name || '',
      element.label || '',
      element.placeholder || '',
      element.selector || '',
    ].join(' ');

    if (SENSITIVE_INPUT_REGEX.test(testTokens)) {
      return {
        safe: false,
        reason: `Target element matches sensitive credential token: "${element.label || element.name}".`,
      };
    }
  }

  return { safe: true };
}
