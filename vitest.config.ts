import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      NODE_ENV: 'test'
    }
  },
  resolve: {
    alias: {
      'obsidian': resolve(__dirname, './tests/__mocks__/obsidian.ts')
    }
  }
})
