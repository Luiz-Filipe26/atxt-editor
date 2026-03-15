import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
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
