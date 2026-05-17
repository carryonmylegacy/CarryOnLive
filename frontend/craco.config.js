// craco.config.js
const path = require("path");
require("dotenv").config();

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
  enableVisualEdits: isDevServer, // Only enable during dev server
};

// Conditionally load visual edits modules only in dev mode
let setupDevServer;
let babelMetadataPlugin;

if (config.enableVisualEdits) {
  setupDevServer = require("./plugins/visual-edits/dev-server-setup");
  babelMetadataPlugin = require("./plugins/visual-edits/babel-metadata-plugin");
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

const webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Suppress source-map-loader warnings from packages that ship without source files
      webpackConfig.ignoreWarnings = [
        /Failed to parse source map/,
      ];

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }

      // Strip console.* + debugger in production builds. CRA ships with
      // terser-webpack-plugin under webpackConfig.optimization.minimizer;
      // we extend its existing terserOptions rather than replacing the
      // plugin instance so all other CRA defaults (mangling, format,
      // sourceMap behavior) stay intact. Logs are kept in dev so we can
      // still debug locally. Audited Feb 2026 — eliminates 195 prod
      // log statements that were leaking to user devtools and adding
      // bundle weight.
      if (process.env.NODE_ENV === 'production' && webpackConfig.optimization?.minimizer) {
        webpackConfig.optimization.minimizer.forEach((plugin) => {
          if (plugin?.constructor?.name === 'TerserPlugin' && plugin.options?.terserOptions) {
            const compress = plugin.options.terserOptions.compress;
            if (compress && typeof compress === 'object') {
              compress.drop_console = ['log', 'info', 'debug', 'trace'];
              compress.drop_debugger = true;
              compress.pure_funcs = [
                'console.log',
                'console.info',
                'console.debug',
                'console.trace',
              ];
            }
          }
        });
      }

      return webpackConfig;
    },
  },
};

// Only add babel metadata plugin during dev server
if (config.enableVisualEdits && babelMetadataPlugin) {
  webpackConfig.babel = {
    plugins: [babelMetadataPlugin],
  };
}

webpackConfig.devServer = (devServerConfig) => {
  // ── CVE mitigation (Feb 2026) ────────────────────────────────────────
  // CVE-2025-30359 + CVE-2025-30360: webpack-dev-server <=5.2.0 (which
  // react-scripts 5.0.1 still pins) can leak source code if a developer
  // visits a malicious site while their dev server is running. Until CRA
  // ships v6 with webpack-dev-server 5.2.1+, mitigate at config-level:
  //   1. Restrict allowedHosts so the dev server refuses arbitrary
  //      Host: headers (closes the cross-origin proxy attack).
  //   2. Pin the HMR client's web-socket URL so a remote attacker can't
  //      coerce it onto an attacker-controlled WS endpoint.
  // These do NOT require upgrading webpack-dev-server.
  devServerConfig.allowedHosts = ["localhost", "127.0.0.1", ".emergentagent.com"];
  devServerConfig.client = {
    ...(devServerConfig.client || {}),
    webSocketURL: {
      hostname: "0.0.0.0",
      pathname: "/ws",
      protocol: "ws",
    },
  };

  // Apply visual edits dev server setup only if enabled
  if (config.enableVisualEdits && setupDevServer) {
    devServerConfig = setupDevServer(devServerConfig);
  }

  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

module.exports = webpackConfig;
