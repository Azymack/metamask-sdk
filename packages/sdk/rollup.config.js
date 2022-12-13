import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import builtins from 'rollup-plugin-node-builtins';
import globals from 'rollup-plugin-node-globals';
import nativePlugin from 'rollup-plugin-natives';
import jscc from 'rollup-plugin-jscc';
import { terser } from "rollup-plugin-terser";
import nodePolyfills from 'rollup-plugin-polyfill-node';

const listDepForRollup = [];

/**
 * @type {import('rollup').RollupOptions}
 */
const config = [
  {
    external: listDepForRollup,
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/browser/cjs/metamask-sdk.js',
        format: 'cjs',
      },
      {
        file: 'dist/browser/es/metamask-sdk.js',
        format: 'es',
      },
      {
        name: 'browser',
        file: 'dist/browser/umd/metamask-sdk.js',
        format: 'umd',
      },
      {
        file: 'dist/browser/iife/metamask-sdk.js',
        format: 'iife',
        name: 'MetaMaskSDK',
      },
    ],
    plugins: [
      jscc({
        values: { _WEB: 1 },
      }),
      typescript(),
      nodeResolve({ browser: true, preferBuiltins: false }),
      commonjs({ transformMixedEsModules: true }),
      globals(),
      builtins({ crypto: false }),
      json(),
      nodePolyfills(),
      terser()
    ],
  },
  {
    external: listDepForRollup,
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/react-native/cjs/metamask-sdk.js',
        format: 'cjs',
        sourcemap: true
      },
      {
        file: 'dist/react-native/es/metamask-sdk.js',
        format: 'es',
        sourcemap: true
      },
    ],
    plugins: [
      jscc({
        values: { _REACTNATIVE: 1 },
      }),
      typescript(),
      commonjs({ transformMixedEsModules: true }),
      // nodeResolve({
      //   mainFields: ['react-native', 'node', 'browser'],
      //   exportConditions: ['react-native', 'node', 'browser'],
      //   browser: true,
      //   preferBuiltins: true,
      // }),
      nodePolyfills(),
      json(),
      terser()
    ],
  },
  {
    external: listDepForRollup,
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/node/cjs/metamask-sdk.js',
        format: 'cjs',
      },
      {
        file: 'dist/node/es/metamask-sdk.js',
        format: 'es',
      },
    ],
    plugins: [
      jscc({
        values: { _NODEJS: 1 },
      }),
      nativePlugin({
        // Use `dlopen` instead of `require`/`import`.
        // This must be set to true if using a different file extension that '.node'
        dlopen: false,
        // Generate sourcemap
        sourcemap: true,
      }),
      typescript(),
      nodeResolve({ browser: false, preferBuiltins: false }),
      commonjs({ transformMixedEsModules: true }),
      json(),
      nodePolyfills(),
      terser()
    ],
  },
];

export default config;
