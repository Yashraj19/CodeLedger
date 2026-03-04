import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/__mocks__/**',
        'src/extension.ts',
        'src/questionPanel.ts',
        'src/sidebarProvider.ts',
      ],
    },
  },
  resolve: {
    alias: { vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts') },
  },
});
