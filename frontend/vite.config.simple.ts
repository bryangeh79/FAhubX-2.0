import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 简化的Vite配置，用于快速验证
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-simple',
    rollupOptions: {
      external: [], // 不排除任何依赖
    }
  },
  server: {
    port: 5174,
    open: true
  },
  // 禁用TypeScript检查
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        // 宽松的TypeScript配置
        strict: false,
        noImplicitAny: false,
        strictNullChecks: false,
        strictFunctionTypes: false,
        strictBindCallApply: false,
        noImplicitThis: false,
        alwaysStrict: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
        noImplicitReturns: false,
        noFallthroughCasesInSwitch: false,
        skipLibCheck: true,
        skipDefaultLibCheck: true
      }
    }
  }
})