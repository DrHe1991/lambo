import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.bitlink.app',
  appName: 'BitLink',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    GoogleSignIn: {
      serverClientId: '292172431256-hotp58doi02m8do3kg64qq2qn9qjil9f.apps.googleusercontent.com',
    },
  },
};

export default config;
