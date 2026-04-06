import { builtinModules } from 'module'
import { defineConfig } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import { swc } from 'rollup-plugin-swc3'
import analyzer, { adapter } from 'vite-bundle-analyzer'

const external = [...builtinModules]

export default defineConfig([
  {
    input: {
      index: 'src/index.ts',
      plugin: 'src/plugins/index.ts'
    },
    external,
    output: [
      { dir: 'dist', format: 'esm', exports: 'named', entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' },
      { dir: 'dist', format: 'cjs', exports: 'named', entryFileNames: '[name].js' }
    ],
    plugins: [swc(), adapter(analyzer({ enabled: !!process.env.ANALYZE }))]
  },
  {
    input: {
      index: 'src/index.ts',
      plugin: 'src/plugins/index.ts'
    },
    external,
    output: [
      { dir: 'dist', format: 'esm', entryFileNames: '[name].d.mts' },
      { dir: 'dist', format: 'cjs', entryFileNames: '[name].d.ts' }
    ],
    plugins: [
      dts({
        respectExternal: true,
        compilerOptions: {
          composite: true,
          preserveSymlinks: false
        }
      })
    ]
  }
])
