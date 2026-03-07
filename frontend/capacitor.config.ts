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
    CapacitorUpdater: {
      autoUpdate: true,
    },
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0F1629',
    allowsLinkPreview: false,
    scrollEnabled: true,
    webView: {
      allowsInlineMediaPlayback: true,
      mediaTypesRequiringUserActionForPlayback: 'none',
    },
  },
  android: {
    backgroundColor: '#0F1629',
  },
};

export default config;
