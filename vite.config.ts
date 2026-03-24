import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
    plugins: [tsconfigPaths(), viteSingleFile()],
    build: {
        target: "esnext",
        assetsInlineLimit: 30000000,
        chunkSizeWarningLimit: 30000,
        cssCodeSplit: false,
        reportCompressedSize: false,
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    test: {
        environment: "node",
        globals: true,
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/core/**/*.ts", "src/domain/**/*.ts", "src/utils/**/*.ts"],
            exclude: ["src/types/**/*.ts", "src/main.ts"],
            thresholds: {
                statements: 90,
                branches: 85,
                functions: 95,
                lines: 90,
            },
        },
    },
});
