import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

export default defineConfig({
    plugins: [viteSingleFile()],

    root: "src/pages",

    resolve: {
        tsconfigPaths: true,
    },

    envDir: path.resolve(__dirname),
    publicDir: path.resolve(__dirname, "public"),

    build: {
        outDir: path.resolve(__dirname, "dist"),
        emptyOutDir: true,
        target: "es2018",
        assetsInlineLimit: 30000000,
        chunkSizeWarningLimit: 30000,
        cssCodeSplit: false,
        reportCompressedSize: false,
    },

    test: {
        root: path.resolve(__dirname),
        environment: "node",
        globals: true,
        include: ["tests/**/*.{test,spec}.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            reportsDirectory: path.resolve(__dirname, "coverage"),
            include: ["src/core/atxt/**/*.ts"],
            exclude: [
                "src/core/atxt/types/**/*.ts",
                "src/core/atxt/index.ts",
                "src/pages/main.ts",
                "src/components/atxtDocument.ts",
            ],
            thresholds: {
                statements: 90,
                branches: 85,
                functions: 95,
                lines: 90,
            },
        },
    },
});
