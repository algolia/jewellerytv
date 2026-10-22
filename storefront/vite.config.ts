import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],test:{include:['tests/**/*.test.{ts,tsx}','evaluation/**/*.test.{ts,tsx}'],exclude:['tests/e2e/**','node_modules/**']},server:{host:'localhost',port:5173,strictPort:true,proxy:{'/api':process.env.JTV_API_ORIGIN??'http://127.0.0.1:5174'}},build:{sourcemap:false,rollupOptions:{input:{main:fileURLToPath(new URL('./index.html',import.meta.url)),frame:fileURLToPath(new URL('./src/embed/frame.html',import.meta.url))}}}});
