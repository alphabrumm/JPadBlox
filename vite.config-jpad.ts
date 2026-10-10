import type { UserConfig } from 'vite'
import commonConfig from './vite.config-common'
import prefixer from 'postcss-prefix-selector'

/**
 * Build-Konfiguration für JPad, die touchfreundliche Oberfläche.
 * Ergebnis: Ordner dist-jpad/ mit statischen Dateien, die auf jedem
 * Webspace (HTTPS) laufen. Kein Server-Backend nötig.
 */
export default {
    ...commonConfig,
    base: './',
    build: {
        ...commonConfig.build,
        sourcemap: false,
        rollupOptions: {
            input: {
                jpad: './jpad.html',
            },
            output: {
                manualChunks: (id: string) => {
                    if (id.includes('node_modules')) {
                        const name = id.split('node_modules/')[1].split('/')[0].replace('@', '');
                        if (id.endsWith('.css')) return name + '_css';
                        if (name === 'codemirror' || name === 'lezer') return 'codemirror';
                        return name;
                    }
                    return undefined;
                },
            }
        },
        outDir: './dist-jpad',
    },
    css: {
        postcss: {
            plugins: [
                // Wie in der Embedded-IDE: CSS aus node_modules (v. a. Monaco) wird
                // auf den Container .joeCssFence begrenzt, damit es die JPad-Oberfläche
                // nicht beeinflusst. Schriftarten sind davon ausgenommen.
                prefixer({
                    includeFiles: [/node_modules\/(?!@fontsource)/],
                    prefix: '.joeCssFence'
                })
            ]
        }
    },
} satisfies UserConfig
