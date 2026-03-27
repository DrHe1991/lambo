import type { CapacitorConfig } from '@capacitor/cli';

const isProd = process.env.NODE_ENV === 'production';

const config: CapacitorConfig = {
  appId: 'com.bitlink.app',
  appName: 'BitLink',
  webDir: 'dist',
  android: {
    allowMixedContent: !isProd,
  },
  server: {
    androidScheme: isProd ? 'https' : 'http',
  },
};

export default config;
