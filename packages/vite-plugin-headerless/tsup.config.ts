import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  // virtual:headerless only exists inside the consuming app's build —
  // it must survive as a bare import for that build to resolve.
  external: ['vite', 'headerless', 'virtual:headerless']
})
