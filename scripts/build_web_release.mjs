import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const tap = args[0] === '--taptap' && args.length === 3;
if (args.length && !tap) throw new Error('Usage: build_web_release.mjs [--taptap STAGED_SOURCE NEW_OUTPUT]');
const ROOT = tap ? path.resolve(args[1]) : repo;
const OUT_DIR = tap ? path.resolve(args[2]) : path.join(repo, 'dist', 'web');
// These originals generate the WebP thumbnails used by the challenge and achievement lists.
const challengeOriginals = new Set([
  'assets/challenges/challenge-veil-abyss-illustrated.png',
  'assets/challenges/challenge-veil-cramped-illustrated.png',
  'assets/challenges/challenge-veil-nofaith-illustrated.png',
  'assets/challenges/challenge-veil-sprint-illustrated.png',
  'assets/challenges/challenge-veil-starve-illustrated.png',
  'assets/challenges/challenge-veil-turmoil-illustrated.png'
]);

function versioned(rel) {
  const hash = createHash('sha256').update(fs.readFileSync(path.join(OUT_DIR, rel))).digest('hex').slice(0, 12);
  return rel + '?v=' + hash;
}

function copyAssets(srcDir, dstDir) {
  let count = 0;
  let bytes = 0;
  function walk(curSrc, curDst) {
    fs.mkdirSync(curDst, { recursive: true });
    for (const ent of fs.readdirSync(curSrc, { withFileTypes: true })) {
      const rel = path.relative(ROOT, path.join(curSrc, ent.name)).replace(/\\/g, '/');
      if (rel === 'assets/store' || rel.startsWith('assets/store/')) continue;
      if (rel.startsWith('assets/backgrounds/breakthrough/engraved-')) continue;
      if (challengeOriginals.has(rel)) continue;
      if (ent.name === '.DS_Store' || ent.name === 'Thumbs.db') continue;
      const sp = path.join(curSrc, ent.name);
      const dp = path.join(curDst, ent.name);
      if (ent.isDirectory()) {
        walk(sp, dp);
      } else if (ent.isFile()) {
        fs.copyFileSync(sp, dp);
        count++;
        bytes += fs.statSync(dp).size;
      }
    }
  }
  walk(srcDir, dstDir);
  return { count, bytes };
}

function countFiles(dir) {
  let count = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) count += countFiles(p);
    else if (ent.isFile()) count++;
  }
  return count;
}

function fmtKB(n) {
  return (n / 1024).toFixed(1) + ' KB';
}

async function main() {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // A caller-supplied TapTap output must be new; only dist/web is ours to replace.
  if (tap) fs.mkdirSync(OUT_DIR);
  else fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT_DIR, 'css'), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'locales'), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'src', 'ui'), { recursive: true });

  // 1. Collect classic scripts in exact index.html load order (exclude ai-player.js)
  const scriptMatches = [...indexHtml.matchAll(/<script\s+src="([^"]+)"><\/script>/g)];
  const scriptPaths = scriptMatches
    .map(m => m[1].split('?')[0])
    .filter(rel => rel !== 'src/ai-player.js');

  const concatParts = [];
  for (const rel of scriptPaths) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) throw new Error('Missing script referenced in index.html: ' + rel);
    concatParts.push('/* === ' + rel + ' === */\n' + fs.readFileSync(full, 'utf8') + '\n;');
  }
  const combinedJs = concatParts.join('\n');
  const thumbnails = new Set(combinedJs.match(/assets\/(?:achievements|challenges)\/thumbs\/[\w.-]+\.webp/g));
  for (const ref of thumbnails) {
    if (!fs.existsSync(path.join(ROOT, ref))) throw new Error('Missing list thumbnail: ' + ref + ' (run assets:thumbs)');
  }
  const jsMin = await esbuild.transform(combinedJs, {
    loader: 'js',
    minify: true,
    target: ['es2020'],
    charset: 'utf8'
  });
  const appJsOut = path.join(OUT_DIR, 'app.min.js');
  fs.writeFileSync(appJsOut, jsMin.code, 'utf8');

  // 2. Bundle and minify css/main.css -> dist/web/css/app.min.css (preserving ../assets/* paths)
  const cssOut = path.join(OUT_DIR, 'css', 'app.min.css');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'css', 'main.css')],
    bundle: true,
    minify: true,
    outfile: cssOut,
    charset: 'utf8',
    external: ['../assets/*', 'assets/*', './assets/*']
  });

  // 3. Minify locale scripts & head i18n helper
  const localeMap = [
    ['src/locales/zh-CN.js', 'locales/zh-CN.min.js'],
    ['electron/locales/en-US.js', 'locales/en-US.min.js'],
    ['electron/locales/zh-TW.js', 'locales/zh-TW.min.js'],
    ['src/i18n.js', 'locales/i18n.min.js']
  ];
  for (const [srcRel, dstRel] of localeMap) {
    const srcFull = path.join(ROOT, srcRel);
    if (tap && srcRel.startsWith('electron/')) continue;
    const min = await esbuild.transform(fs.readFileSync(srcFull, 'utf8'), {
      loader: 'js',
      minify: true,
      target: ['es2020'],
      charset: 'utf8'
    });
    fs.writeFileSync(path.join(OUT_DIR, dstRel), min.code, 'utf8');
  }

  // 4. Copy star-map-frame.html & runtime assets (excluding assets/store/ and engraved drafts)
  fs.copyFileSync(
    path.join(ROOT, 'src', 'ui', 'star-map-frame.html'),
    path.join(OUT_DIR, 'src', 'ui', 'star-map-frame.html')
  );
  const assetStats = copyAssets(path.join(ROOT, 'assets'), path.join(OUT_DIR, 'assets'));

  // 5. Rewrite index.html cleanly for production bundle
  let outHtml = indexHtml;
  outHtml = outHtml.replace(/href="css\/main\.css(?:\?v=[^"]*)?"/, () => 'href="' + versioned('css/app.min.css') + '"');
  if (tap) {
    // This package ships the Chinese dictionary and helper as ordinary head scripts.
    const loader = /\/\*HEAD_LOCALE_LOADER_START\*\/[\s\S]*?\/\*HEAD_LOCALE_LOADER_END\*\/\s*<\/script>/;
    if (!loader.test(outHtml)) throw new Error('Missing head locale loader');
    outHtml = outHtml.replace(loader, '</script>\n<!--TAPTAP_LOCALES-->');
  } else {
    for (const [src, dst] of localeMap) {
      const reference = new RegExp(src.replaceAll('.', '\\.') + '(?:\\?v=\\d+)?', 'g');
      if (!reference.test(outHtml)) throw new Error('Missing locale reference: ' + src);
      outHtml = outHtml.replace(reference, versioned(dst));
    }
  }

  const firstTag = scriptMatches[0]?.[0];
  if (!firstTag) throw new Error('Could not find bottom <script src="..."> list in index.html');
  let replaced = false;
  outHtml = outHtml.replace(/<script\s+src="[^"]+"><\/script>\s*/g, () => {
    if (!replaced) {
      replaced = true;
      return '<script src="' + versioned('app.min.js') + '"></script>\n';
    }
    return '';
  });
  if (tap) {
    const headScripts = ['locales/zh-CN.min.js', 'locales/i18n.min.js']
      .map(rel => '<script src="' + versioned(rel) + '"></script>').join('\n');
    outHtml = outHtml.replace('<!--TAPTAP_LOCALES-->', headScripts);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), outHtml, 'utf8');

  // 6. Report bundle metrics
  const coreFiles = [
    ['index.html', path.join(OUT_DIR, 'index.html')],
    ['css/app.min.css', cssOut],
    ['locales/zh-CN.min.js', path.join(OUT_DIR, 'locales', 'zh-CN.min.js')],
    ['locales/i18n.min.js', path.join(OUT_DIR, 'locales', 'i18n.min.js')],
    ['app.min.js', appJsOut]
  ];
  let totalRaw = 0, totalGz = 0;
  console.log('=== Shellbreak ' + (tap ? 'TapTap' : 'Web') + ' Release Build ===');
  console.log(`Bundled ${scriptPaths.length} scripts -> app.min.js`);
  console.log(`Core boot HTTP requests: ${coreFiles.length} (<= 6 target)`);
  for (const [label, fp] of coreFiles) {
    const buf = fs.readFileSync(fp);
    const gz = zlib.gzipSync(buf, { level: 9 });
    totalRaw += buf.length;
    totalGz += gz.length;
    console.log(`  - ${label.padEnd(24)} raw=${fmtKB(buf.length).padStart(9)}  gzip=${fmtKB(gz.length).padStart(9)}`);
  }
  console.log(`Core bundle total:         raw=${fmtKB(totalRaw).padStart(9)}  gzip=${fmtKB(totalGz).padStart(9)}`);
  console.log(`Runtime assets copied:     files=${assetStats.count}  size=${(assetStats.bytes / (1024 * 1024)).toFixed(2)} MB (excluded assets/store)`);
  console.log(`Total release files:      ${countFiles(OUT_DIR)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
