import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.js'),
            name: 'Threebox',
            formats: ['es', 'cjs', 'iife'],
            fileName: (format) => {
                if (format === 'es') return 'threebox.js';
                if (format === 'cjs') return 'threebox.cjs';
                if (format === 'iife') return 'threebox.iife.js';
                return `threebox.${format}.js`;
            }
        },
        rollupOptions: {
            // Make sure to externalize deps that shouldn't be bundled
            external: ['three', /^three\//],
            output: {
                // Provide global variables to use in the IIFE build
                globals: (id) => {
                    if (id === 'three') return 'THREE';
                    // Map three.js addon imports to THREE namespace
                    if (id.startsWith('three/')) {
                        return 'THREE';
                    }
                    return id;
                },
                // Ensure proper handling of three.js imports in IIFE
                inlineDynamicImports: false
            }
        },
        sourcemap: true,
        minify: 'terser',
        outDir: 'dist'
    },
    resolve: {
        alias: {
            'three/addons': 'three/examples/jsm'
        }
    }
});
