'use server';

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // AWS/GCP metadata endpoint
  /^metadata\.google\.internal$/i,
  /^0\.0\.0\.0$/,
  /^\[::1?\]$/,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOSTNAME_PATTERNS.some(pattern => pattern.test(hostname));
}

export async function proxyFetch(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { success: false, error: 'Only HTTPS URLs are allowed.' };
    }
    if (isBlockedHost(parsed.hostname)) {
      return { success: false, error: 'Fetching from internal/private addresses is not allowed.' };
    }
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `Failed to fetch: ${response.status} ${response.statusText}` };
    }
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return { success: true, data };
    } else {
      const text = await response.text();
      return { success: true, data: text };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
