// Android emulator uses 10.0.2.2 to reach the host machine's localhost
const isAndroidEmulator = typeof window !== 'undefined'
  && window.location.hostname === 'localhost'
  && (import.meta.env.VITE_API_URL?.includes('10.0.2.2') ?? false);

export const fixUrl = (url: string): string => {
  if (!isAndroidEmulator) return url;
  return url.replace(/http:\/\/localhost:/g, 'http://10.0.2.2:');
};

export const fixHtmlUrls = (html: string): string => {
  if (!isAndroidEmulator) return html;
  return html.replace(/http:\/\/localhost:/g, 'http://10.0.2.2:');
};
