import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'us.carryon.app',
  appName: 'CarryOn',
  webDir: 'build',
  server: {
    // In production, the app loads from the built files
    // For development, you can set this to your dev server URL
    // url: 'https://carryon.us',
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Camera: {
      // No special config needed
    },
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0a1628',
  },
  android: {
    backgroundColor: '#0a1628',
  },
};

export default config;
