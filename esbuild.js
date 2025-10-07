const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'watch-plugin',
        setup(build) {
          build.onStart(() => {
            console.log('[watch] build started');
          });
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error('[watch] build finished with errors');
            } else {
              console.log('[watch] build finished');
            }
          });
        },
      },
    ],
  });

  if (watch) {
    await ctx.watch();
    console.log('[watch] watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
