import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const workspaceOpenRtcTestingAlias = process.env.PORTFOLIO_OPENRTC_TESTING_ALIAS?.trim();
const workspaceEmulatorApiTarget = process.env.PORTFOLIO_OPENRTC_EMULATOR_API_TARGET?.trim();

export default defineConfig({
  optimizeDeps: workspaceOpenRtcTestingAlias ? { exclude: ["openrtc"] } : undefined,
  resolve: workspaceOpenRtcTestingAlias ? {
    alias: [{ find: /^openrtc$/, replacement: workspaceOpenRtcTestingAlias }],
  } : undefined,
  server: {
    proxy: workspaceEmulatorApiTarget ? {
      "/openrtc-api": {
        target: workspaceEmulatorApiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openrtc-api/, ""),
      },
    } : undefined,
    fs: {
      strict: false,
      // Alternatively, allow specific paths:
      // allow: ['..'] 
    }
  },
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
});
