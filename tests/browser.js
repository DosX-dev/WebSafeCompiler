'use strict';
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { createRequire } = require('module');
const sourceRequire = createRequire(path.join(__dirname, '../source/package.json'));
const { chromium } = sourceRequire('playwright');
const { transforms, csp } = require('../source/wsc');
const compiler = path.join(__dirname, '../source/wsc.js');
assert.deepEqual(fs.readdirSync(path.dirname(compiler)).filter(name => name.endsWith('.js')), ['wsc.js'], 'Compiler implementation must remain a single JS file');
const hash = (value, algorithm = 'sha256') => algorithm + '-' + require('crypto').createHash(algorithm).update(value).digest('base64');
const external = `window.results.push('external');\nwindow.sum = (a, b) => a + b;\n`;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wsc-browser-'));
const input = path.join(root, 'input');
fs.mkdirSync(input);
const fixture = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="valid.css"><title>WSC regression</title></head>
<body><h1>Broken markup &amp; complex assets</h1>
<div class="exact" title="a > b  c\nline">A
B <span>inline</span> <span>spacing</span></div>
<pre>line 1\n  line 2 <code>nested\n  code</code>\nend</pre>
<textarea>first\n  second</textarea>
<div class="preserve">first\n  second</div>
<div class="generated"></div><div class="wide">width</div>
<table><div>fostered node</div><tr><td>broken cell<td>second</table>
<p>unclosed paragraph<div>repair</div>
<template id="tpl"><div title="x > y">template\n text</div></template>
<script type="application/ld+json">{"name":"two  spaces", "markup":"<!--keep-->"}</script>
<script type="importmap">{"imports":{"fixture":"./module.mjs"}}</script>
<script nonce="test-nonce" id="inline-one" async defer>window.results = []; const shared = 'shared';
window.literal = \`first\n  second\`; // newline must survive before compression
window.results.push('<!--literal-->');
function handler() { results.push(shared); }
</script>
<script id="inline-two">window.results.push(shared); window.results.push(document.currentScript.id);</script>
<script id="source-dependent">window.scriptSource = document.currentScript.src; document.write('<span id="written">written</span>');</script>
<script src="app.js" integrity="${hash(external)}" defer data-marker="external"></script>
<script src="unprotected.js" defer></script>
<script type="module" id="module" nonce="test-nonce">import { value } from './module.mjs'; await Promise.resolve(); const mapped = await import('fixture'); window.moduleValue = value === mapped.value ? value : 'broken';</script>
<button onclick="handler()">Run</button>
<form><input name="field" value="a  b"><button>Submit</button></form>
<!-- observable comment --><svg viewBox="0 0 100 20"><text y="16">SVG text</text></svg>
</body></html>`;
fs.writeFileSync(path.join(input, 'index.html'), fixture);
fs.writeFileSync(path.join(input, 'style.css'), `body { font-family: sans-serif; padding: 20px; }
.exact[class="exact"] { color: rgb(10, 90, 170); }
.preserve { white-space: pre-wrap; }
.generated::before { content: "a  b; : { } /* literal */"; }
.wide { --size: calc(100% - 20px); width: var(--size); padding: 2px  4px; }
input { border: 1px solid black; }
@media (min-width: 500px) { h1 { font-size: 24px; } }
.broken { color: red; totally invalid; color: blue; }
`);
const validCss = `.wide { --size: calc(100% - 20px); width: var(--size); }
.generated::before { content: "a  b; : { } /* literal */"; }
textarea { padding: 3px  5px; }
/* removable comment */
/*! removable special comment */
@supports (display: grid) { .wide { display: grid; } }
`;
fs.writeFileSync(path.join(input, 'valid.css'), validCss);
assert.notEqual(transforms.css(validCss), validCss, 'CSS optimization must remain enabled');
assert(!transforms.css(validCss).includes('removable'), 'CSS comments, including special comments, must be removed');
assert(transforms.css(validCss).includes('/* literal */'), 'Comment syntax inside CSS strings must remain intact');
const imported = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(compiler)})`], { encoding: 'utf8' });
assert.equal(imported.status, 0, imported.stderr);
fs.writeFileSync(path.join(input, 'legacy.HTML'), Buffer.from([60, 112, 62, 207, 240, 232, 226, 229, 242, 60, 47, 112, 62]));
fs.writeFileSync(path.join(input, 'app.js'), external);
const unprotected = `// Still optimize external JavaScript without SRI.\nwindow.externalValue = 'external optimization works';\n`;
fs.writeFileSync(path.join(input, 'unprotected.js'), unprotected);
const hashes = [...fixture.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => `'${hash(match[1])}'`).join(' ');
fs.writeFileSync(path.join(input, 'secure.html'), fixture.replace('<meta charset="utf-8">', `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-hashes' 'nonce-test-nonce' ${hashes} '${hash('handler()')}'; style-src 'self' 'unsafe-inline'">`));
// These policies are deliberately absent from the input directory. They model
// headers supplied by an independently configured deployment server or CDN.
const headerPolicies = new Map();
const projectHeaders = [], vercelHeaders = [], projectPages = [];
for (const algorithm of ['sha256', 'sha384', 'sha512']) {
    const pageName = 'http-' + algorithm + '.html';
    const style = '.exact { outline: 2px solid rgb(120, 80, 40); }\n';
    const headerFixture = fixture.replace('<title>', `<style>${style}</style><title>`);
    const scriptHashes = [...headerFixture.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => `'${hash(match[1], algorithm)}'`).join(' ');
    const policy = `default-src 'none'; script-src 'self' 'unsafe-hashes' ${scriptHashes} '${hash('handler()', algorithm)}'; style-src 'self' '${hash(style, algorithm)}'; form-action 'self'; base-uri 'none'`;
    // Two enforced policies must both remain satisfied; neither uses nonces or unsafe-inline.
    headerPolicies.set(pageName, [policy, `script-src 'self' 'unsafe-hashes' ${scriptHashes} '${hash('handler()', algorithm)}'`]);
    fs.writeFileSync(path.join(input, pageName), headerFixture);
    for (const format of ['headers', 'vercel']) {
        const localPage = format + '-' + algorithm + '.html';
        projectPages.push(localPage);
        fs.writeFileSync(path.join(input, localPage), headerFixture);
        const policies = headerPolicies.get(pageName);
        if (format === 'headers') projectHeaders.push('/' + localPage + '\n' + policies.map(value => '  Content-Security-Policy: ' + value).join('\n') + '\n  X-Fixture: unchanged\n');
        else vercelHeaders.push({ source: '/' + localPage, headers: policies.map(value => ({ key: 'Content-Security-Policy', value })).concat({ key: 'X-Fixture', value: 'unchanged' }) });
    }
}
fs.writeFileSync(path.join(input, '_headers'), '# Shared deployment headers\n' + projectHeaders.join('\n'));
fs.writeFileSync(path.join(input, 'vercel.json'), JSON.stringify({ headers: vercelHeaders, cleanUrls: false }, null, 2));
const nonceFixture = fixture.replace(/<script\b(?![^>]*\bnonce=)/g, '<script nonce="test-nonce"');
fs.writeFileSync(path.join(input, 'headers-nonce.html'), nonceFixture);
projectPages.push('headers-nonce.html');
fs.appendFileSync(path.join(input, '_headers'), `\n/headers-nonce.html\n  Content-Security-Policy: script-src 'self' 'nonce-test-nonce' 'unsafe-hashes' '${hash('handler()')}'; style-src 'self' 'unsafe-inline'\n`);
fs.writeFileSync(path.join(input, 'headers-strict.html'), nonceFixture);
projectPages.push('headers-strict.html');
fs.appendFileSync(path.join(input, '_headers'), `\n/headers-strict.html\n  Content-Security-Policy: script-src 'nonce-test-nonce' 'strict-dynamic' 'unsafe-hashes' '${hash('handler()')}'; style-src 'self' 'unsafe-inline'\n`);
for (const [pageName, pageHtml] of [
    ['headers-base.html', nonceFixture.replace('<head>', '<head><base href="./">')],
    ['headers-async.html', nonceFixture.replace('src="unprotected.js" defer', 'src="unprotected.js" async')]
]) {
    fs.writeFileSync(path.join(input, pageName), pageHtml);
    projectPages.push(pageName);
    fs.appendFileSync(path.join(input, '_headers'), `\n/${pageName}\n  Content-Security-Policy: script-src 'self' 'nonce-test-nonce' 'unsafe-hashes' '${hash('handler()')}'; style-src 'self' 'unsafe-inline'\n`);
}
const keptInlinePages = new Set(['headers-strict.html', 'headers-base.html', 'headers-async.html']);
const dashboard = fixture.replace('<h1>', `<style>
body { background: #eef2fa; color: #142034; }
.dashboard { display: grid; grid-template-columns: 1fr 2fr; gap: 14px; }
.card { background: white; padding: 16px; border-radius: 12px; box-shadow: 0 3px 12px #14203420; }
.card strong { display: block; font-size: 26px; }
@media(max-width:600px) { .dashboard { grid-template-columns: 1fr; } }
</style><div class="dashboard"><aside class="card"><h2>Navigation</h2><ul><li>Overview<li>Assets<li>Reports</ul></aside>
<section class="card"><h2>Deployment dashboard</h2><strong>42 sites</strong><p>Multiline\n content with <b>broken nesting<i>and tags</b></i>
<details open><summary>Build settings</summary><label>Target <select><option>Production<option>Preview</select></label></details>
<progress value="72" max="100"></progress><table><tr><th>Asset<th>Status<tr><td>JavaScript<td>Ready<tr><td>CSS<td>Ready</table></section></div><h1>`);
fs.writeFileSync(path.join(input, 'dashboard.html'), dashboard);
fs.writeFileSync(path.join(input, 'module.mjs'), 'export const value = "module works";');
fs.writeFileSync(path.join(input, 'bad.js'), 'function intentionallyBroken( {');
fs.writeFileSync(path.join(input, 'asset.bin'), Buffer.from([0, 255, 128, 13, 10]));
fs.writeFileSync(path.join(input, 'myindex.html'), '<p>not an index</p>');
fs.writeFileSync(path.join(input, 'a&b.html'), '<p>xml escaping</p>');
fs.writeFileSync(path.join(input, 'UPPER.HTML'), fixture);
const smartJs = 'window.smartAsset = "already minified";';
const smartCss = '.smart-marker{color:blue}';
const compactJs = 'window.compactAsset = "' + 'x'.repeat(300) + '";';
fs.writeFileSync(path.join(input, 'vendor.min.js'), smartJs);
fs.writeFileSync(path.join(input, 'vendor.min.css'), smartCss);
fs.writeFileSync(path.join(input, 'compact.js'), compactJs);
fs.writeFileSync(path.join(input, 'legacy.php'), '<?php echo "unchanged"; ?>');
const linkedSource = path.join(root, 'shared-source');
fs.mkdirSync(linkedSource);
fs.writeFileSync(path.join(linkedSource, 'index.html'), '<!doctype html><meta charset="utf-8"><div id="linked" class="linked">Linked source</div><script>window.linkValue = "works";</script>');
fs.symlinkSync(linkedSource, path.join(input, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
fs.symlinkSync(input, path.join(input, 'cycle'), process.platform === 'win32' ? 'junction' : 'dir');

function compile(output, flags = []) {
    const result = spawnSync(process.execPath, [compiler, input, output, ...flags], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert(result.stderr.includes('skipping cyclic directory link'));
    assert(fs.existsSync(path.join(output, 'linked', 'index.html')), 'Linked input directories must be compiled');
    if (flags.includes('--drm')) {
        assert(result.stderr.includes('no editable CSP configuration applies'), 'Unavailable CSP must produce a warning');
        assert(result.stderr.includes('script depends on its source'), 'Source-dependent scripts must produce a warning');
        assert(result.stderr.includes('DRM skipped for app.js'), 'Unavailable CSP on SRI references must explain why shared JS is preserved');
    }
    assert.deepEqual(fs.readFileSync(path.join(output, 'asset.bin')), fs.readFileSync(path.join(input, 'asset.bin')));
    assert.equal(fs.readFileSync(path.join(output, 'bad.js'), 'utf8'), 'function intentionallyBroken( {');
    assert.equal(fs.readFileSync(path.join(output, 'app.js'), 'utf8'), external);
    assert.deepEqual(fs.readFileSync(path.join(output, 'legacy.HTML')), fs.readFileSync(path.join(input, 'legacy.HTML')));
    assert.notEqual(fs.readFileSync(path.join(output, 'unprotected.js'), 'utf8'), unprotected);
    assert.equal(fs.readFileSync(path.join(output, 'legacy.php'), 'utf8'), '<?php echo "unchanged"; ?>');
    if (flags.includes('--smart')) {
        assert.equal(fs.readFileSync(path.join(output, 'vendor.min.js'), 'utf8'), smartJs);
        assert.equal(fs.readFileSync(path.join(output, 'vendor.min.css'), 'utf8'), smartCss);
        assert.equal(fs.readFileSync(path.join(output, 'compact.js'), 'utf8'), compactJs);
    }
    const compiledMain = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    assert(!compiledMain.includes('<!-- observable comment -->'), 'Ordinary HTML comments must be removed');
    assert(compiledMain.includes('<!--literal-->'), 'HTML-like strings inside scripts must be preserved');
    if (flags.includes('--drm')) {
        assert(/\s[a-z]{14}="[a-z]{14}"/.test(compiledMain), 'Random junk attributes must be generated');
        const doc = sourceRequire('parse5').parse(compiledMain);
        let extraClasses = false;
        function check(node) {
            const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
            if (attrs.class?.startsWith('preserve ')) extraClasses = true;
            if (attrs.title === 'a > b  c\nline') assert.equal(attrs.class, 'exact', 'Exact class selector must remain intact');
            for (const child of node.childNodes || []) check(child);
        }
        check(doc);
        assert(extraClasses, 'Random classes must be generated');
        assert(result.stderr.includes('affected class values are preserved'));
    } else assert(!/\s[a-z]{14}="[a-z]{14}"/.test(compiledMain));
    for (const pageName of headerPolicies.keys()) {
        const original = fs.readFileSync(path.join(input, pageName), 'utf8');
        const compiled = fs.readFileSync(path.join(output, pageName), 'utf8');
        const bodies = html => [...html.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => match[2]);
        assert.deepEqual(bodies(compiled), bodies(original), 'HTTP CSP hash inputs must remain exact');
    }
    for (const pageName of [...projectPages, 'secure.html']) {
        const original = fs.readFileSync(path.join(input, pageName), 'utf8');
        const compiled = fs.readFileSync(path.join(output, pageName), 'utf8');
        // Use parser offsets because DRM encodes existing IDs.
        const extract = html => {
            const values = [];
            const doc = sourceRequire('parse5').parse(html, { sourceCodeLocationInfo: true });
            function visit(node) {
                if (node.tagName === 'script' && node.attrs.some(attr => attr.name === 'id' && attr.value === 'inline-one')) {
                    const loc = node.sourceCodeLocation;
                    const src = node.attrs.find(attr => attr.name === 'src');
                    values.push(src ? fs.readFileSync(path.join(output, src.value), 'utf8') : html.slice(loc.startTag.endOffset, loc.endTag.startOffset));
                }
                for (const child of node.childNodes || []) visit(child);
            }
            visit(doc); return values[0];
        };
        if (flags.includes('--drm')) assert.notEqual(extract(compiled), extract(original), 'Local CSP must allow inline DRM');
        else assert.notEqual(extract(compiled), extract(original), 'Inline minification must work without DRM when CSP is editable');
        if (flags.includes('--drm') && !keptInlinePages.has(pageName)) {
            assert(compiled.includes('src="./wsc-inline-'), 'Authorized inline scripts must be extracted');
        }
        if (keptInlinePages.has(pageName)) assert(!compiled.includes('src="./wsc-inline-'), 'Unsafe extraction must fall back to inline execution');
    }
    if (flags.includes('--drm')) {
        assert.notEqual(fs.readFileSync(path.join(output, '_headers'), 'utf8'), fs.readFileSync(path.join(input, '_headers'), 'utf8'));
        assert.notEqual(fs.readFileSync(path.join(output, 'vercel.json'), 'utf8'), fs.readFileSync(path.join(input, 'vercel.json'), 'utf8'));
    }
}

async function main() {
    const server = http.createServer((req, res) => {
        const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
        const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript' };
        if (headerPolicies.has(path.basename(file))) res.setHeader('Content-Security-Policy', headerPolicies.get(path.basename(file)));
        if (projectPages.includes(path.basename(file)) || (path.basename(path.dirname(file)).startsWith('features-') && file.endsWith('.html'))) {
            // Read the actual configuration emitted alongside this HTML, so
            // browser success depends on compiler-generated hashes.
            const site = path.dirname(file), config = csp.load(site);
            const policies = config.forPage(path.basename(file)).map(record => record.policy);
            assert(policies.length >= 1);
            res.setHeader('Content-Security-Policy', policies);
        }
        try { res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
        catch { res.statusCode = 404; res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ args: ['--disable-gpu'], ...(process.env.WSC_BROWSER_CHANNEL ? { channel: process.env.WSC_BROWSER_CHANNEL } : {}) });
        const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
        await page.addInitScript(() => {
            window.cspViolations = [];
            document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective));
        });
        async function inspect(folder, file = 'index.html') {
            const errors = [];
            const onError = error => errors.push(error.message);
            page.on('pageerror', onError);
            const response = await page.goto(`http://127.0.0.1:${server.address().port}/${folder}/${file}`);
            if (headerPolicies.has(file) || projectPages.includes(file)) assert((await response.allHeaders())['content-security-policy'].includes('sha'));
            await page.waitForFunction(() => window.moduleValue);
            await page.getByRole('button', { name: 'Run', exact: true }).click();
            await page.evaluate(() => {
                document.querySelector('form').addEventListener('submit', event => {
                    event.preventDefault();
                    window.formValue = new FormData(event.target).get('field');
                });
                document.body.append(document.querySelector('#tpl').content.cloneNode(true));
            });
            await page.locator('input[name="field"]').fill('edited  value');
            await page.getByRole('button', { name: 'Submit', exact: true }).click();
            if (file === 'dashboard.html') await page.getByText('Build settings', { exact: true }).click();
            const state = await page.evaluate(() => ({
                results: window.results, literal: window.literal, module: window.moduleValue, sum: window.sum(2, 3), form: window.formValue, external: window.externalValue, scriptSource: window.scriptSource,
                elements: [...document.querySelectorAll('body *')].filter(e => e.tagName !== 'SCRIPT').map(e => ({
                    tag: e.tagName, attrs: [...e.attributes].map(a => [a.name, a.value]),
                    text: e.tagName === 'TEMPLATE' ? e.content.textContent : e.textContent,
                    rect: [e.getBoundingClientRect().x, e.getBoundingClientRect().y, e.getBoundingClientRect().width, e.getBoundingClientRect().height],
                    style: [getComputedStyle(e).color, getComputedStyle(e).whiteSpace, getComputedStyle(e, '::before').content]
                })),
                scripts: [...document.scripts].map(e => [...e.attributes].filter(a => {
                    const generated = e.getAttribute('src')?.startsWith('./wsc-inline-');
                    if (generated && ['src', 'integrity'].includes(a.name)) return false;
                    if ((!e.hasAttribute('src') || generated) && e.type !== 'module' && ['async', 'defer'].includes(a.name)) return false;
                    return true;
                }).map(a => [a.name, a.value]))
            }));
            const screenshot = await page.screenshot({ path: path.join(root, folder + '-' + page.viewportSize().width + '-' + file + '.png'), fullPage: true });
            page.off('pageerror', onError);
            assert.deepEqual(errors, []);
            assert.deepEqual(await page.evaluate(() => window.cspViolations), [], 'CSP violations must not be hidden');
            return { state, screenshot };
        }
        const pages = ['index.html', 'dashboard.html', 'secure.html', ...headerPolicies.keys(), ...projectPages];
        const widths = [1100, 390];
        const baselines = new Map();
        for (const width of widths) {
            await page.setViewportSize({ width, height: 900 });
            for (const file of pages) baselines.set(width + file, await inspect('input', file));
        }
        for (const [folder, flags] of [['plain', []], ['drm', ['--drm']], ['smart', ['--smart']], ['all', ['--drm', '--smart', '--map']]]) {
            compile(path.join(root, folder), flags);
            for (const width of widths) {
                await page.setViewportSize({ width, height: 900 });
                for (const file of pages) {
                    const actual = await inspect(folder, file), baseline = baselines.get(width + file);
                    for (let i = 0; i < actual.state.elements.length; i++) {
                        const expected = new Map(baseline.state.elements[i].attrs);
                        actual.state.elements[i].attrs = actual.state.elements[i].attrs.filter(([name, value]) => {
                            if (expected.has(name)) return true;
                            assert(/^[a-z]{14}$/.test(name) && /^[a-z]{14}$/.test(value), 'Only validated random junk attributes may be extra');
                            return false;
                        }).map(([name, value]) => {
                            if (name === 'class' && value !== expected.get(name)) {
                                assert(value.startsWith(expected.get(name) + ' '), 'Original class names and order must remain intact');
                                assert(value.slice(expected.get(name).length + 1).split(' ').every(token => /^[a-z]{14}$/.test(token)));
                                value = expected.get(name);
                            }
                            return [name, value];
                        });
                    }
                    assert.deepEqual(actual.state, baseline.state, `${folder}/${file}: browser behavior differs`);
                    assert.deepEqual(actual.screenshot, baseline.screenshot, `${folder}/${file}: rendered pixels differ`);
                    console.log(`PASS ${folder}/${file} at ${width}px: browser behavior and rendered pixels match`);
                }
            }
        }
        const featureInput = path.join(root, 'features-input');
        fs.mkdirSync(featureInput);
        const sriScript = '// CRLF and multiple SRI algorithms\r\nwindow.sriValue = "SRI works";\r\nfunction publicSum(first, second) { return first + second; }\r\n';
        const sriCss = '/* remove me */\n.safe { color: rgb(10, 90, 170); padding: 2px  4px; }\n';
        const templateCode = 'window.templateValue = "template works";';
        const writeCode = `const protectedElement = document.getElementById('protected');
window.reflected = { classes: protectedElement.className, attributes: protectedElement.getAttributeNames().sort() };
document.write('<span id="written">Written at original position</span>');
window.inlineSource = document.currentScript.src;
const watched = document.getElementById('observed');
const observer = new MutationObserver(function () { window.observedMutation = true; });
observer.observe(watched, { attributes: true, subtree: true });
window.observerAttributes = watched.getAttributeNames().sort();`;
        const loaderCode = `const injected = document.createElement('script');
injected.textContent = document.getElementById('template').content.querySelector('script').textContent;
document.body.appendChild(injected);`;
        const sourceReader = 'window.originalSource = document.currentScript.textContent;';
        const moduleCode = 'window.moduleLocation = new URL(import.meta.url).pathname.split("/").pop();';
        const sriValue = hash(sriScript, 'sha256') + ' ' + hash(sriScript, 'sha384') + ' ' + hash(sriScript, 'sha512').replace(/=+$/, '') + ' sha999-ignored';
        const featureHtml = `<!doctype html><meta charset="utf-8"><base href="./">
<title>Scoped guards and SRI</title><link rel="preload" as="script" href="app.js?preload=1" integrity="${sriValue}">
<link rel="stylesheet" href="app.css" integrity="${hash(sriCss, 'sha512')}">
<div id="protected" class="guard" title="stable">Sensitive element</div>
<div id="safe" class="safe" title="a > b">Still gets noise<table><tr><td>broken<td>cell</table></div>
<div id="observed" class="observed"><span class="child">Scoped observer subtree</span></div>
<template id="template"><script>${templateCode}</script></template>
<script id="writer">${writeCode}</script><script id="loader">${loaderCode}</script>
<script id="reader">${sourceReader}</script><script id="location-module" type="module">${moduleCode}</script><script src="app.js" integrity="${sriValue}"></script>
<button onclick="window.clicked = publicSum(2, 3)">Run SRI</button><pre>one\n  two</pre>`;
        fs.writeFileSync(path.join(featureInput, 'index.html'), featureHtml);
        fs.writeFileSync(path.join(featureInput, 'app.js'), sriScript);
        fs.writeFileSync(path.join(featureInput, 'app.css'), sriCss);
        fs.writeFileSync(path.join(featureInput, 'vendor.min.js'), 'window.vendorValue="smart preserved";');
        fs.writeFileSync(path.join(featureInput, 'bad.js'), 'function deliberatelyBroken( {');
        fs.writeFileSync(path.join(featureInput, 'latin.js'), Buffer.from([47, 47, 255, 254]));
        const scriptPolicy = [writeCode, loaderCode, templateCode, sourceReader, moduleCode, sriScript].map(code => "'" + hash(code) + "'").join(' ');
        // No 'self' and a base URL: success requires updating external hash
        // authorization as well as the SRI attributes, without extracting JS.
        const featurePolicy = `script-src ${scriptPolicy} '${hash(sriScript, 'sha384')}' '${hash(sriScript, 'sha512')}' 'unsafe-hashes' '${hash('window.clicked = publicSum(2, 3)')}'; style-src 'self'`;
        const dynamicCode = `window.targetId = 'protected'; const target = document.getElementById(window.targetId);
window.reflected = { classes: target.className, attributes: target.getAttributeNames().sort() };`;
        const dynamicHtml = `<!doctype html><meta charset="utf-8"><div id="protected" class="guard">Dynamic guard</div><div id="safe" class="safe">Safe</div><script>${dynamicCode}</script>`;
        fs.writeFileSync(path.join(featureInput, 'dynamic.html'), dynamicHtml);
        const metaPolicy = `script-src ${scriptPolicy} '${hash(sriScript, 'sha384')}' '${hash(sriScript, 'sha512')}' 'unsafe-hashes' '${hash('window.clicked = publicSum(2, 3)')}'; style-src 'self'`;
        fs.writeFileSync(path.join(featureInput, 'meta.html'), featureHtml.replace('<base href="./">', `<base href="./"><meta http-equiv="Content-Security-Policy" content="${metaPolicy}">`));
        const mismatch = hash('not the requested asset', 'sha512');
        fs.writeFileSync(path.join(featureInput, 'blocked.html'), `<!doctype html><meta charset="utf-8"><p>Blocked SRI</p><script src="app.js" integrity="${hash(sriScript)} ${mismatch}"></script>`);
        fs.writeFileSync(path.join(featureInput, '_headers'), `/index.html\n  Content-Security-Policy: ${featurePolicy}\n/meta.html\n  Content-Security-Policy: ${featurePolicy}\n/dynamic.html\n  Content-Security-Policy: script-src '${hash(dynamicCode)}'\n/blocked.html\n  Content-Security-Policy: script-src 'self'\n`);
        async function inspectFeatures(folder, file) {
            const errors = [];
            const onError = error => errors.push(error.message);
            page.on('pageerror', onError);
            await page.goto(`http://127.0.0.1:${server.address().port}/${folder}/${file}`);
            if (['index.html', 'meta.html'].includes(file)) await page.getByRole('button', { name: 'Run SRI' }).click();
            const state = await page.evaluate(() => ({ reflected: window.reflected, sri: window.sriValue, template: window.templateValue, source: window.inlineSource, original: window.originalSource, clicked: window.clicked, observer: window.observerAttributes, mutation: window.observedMutation, moduleLocation: window.moduleLocation, written: document.getElementById('written')?.textContent }));
            const image = await page.screenshot({ path: path.join(root, folder + '-' + file + '.png'), fullPage: true });
            page.off('pageerror', onError);
            assert.deepEqual(errors, []);
            assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
            return { state, image };
        }
        const featureBaselines = new Map();
        for (const name of ['index.html', 'meta.html', 'dynamic.html', 'blocked.html']) featureBaselines.set(name, await inspectFeatures('features-input', name));
        for (const flags of [[], ['--drm'], ['--drm', '--smart']]) {
            const folder = flags.length ? flags.length === 1 ? 'features-drm' : 'features-smart' : 'features-plain';
            const output = path.join(root, folder);
            const result = spawnSync(process.execPath, [compiler, featureInput, output, ...flags], { encoding: 'utf8' });
            assert.equal(result.status, 0, result.stderr);
            const compiled = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
            const bytes = fs.readFileSync(path.join(output, 'app.js'));
            assert.notEqual(bytes.toString(), sriScript, 'SRI must no longer disable JavaScript optimization');
            for (const algorithm of ['sha256', 'sha384', 'sha512']) assert(compiled.includes(hash(bytes, algorithm)), 'Every SRI algorithm must describe final bytes');
            assert(compiled.includes(hash(fs.readFileSync(path.join(output, 'app.css')), 'sha512')), 'CSS SRI must be updated too');
            assert(fs.readFileSync(path.join(output, 'blocked.html'), 'utf8').includes(mismatch), 'Invalid strongest SRI must remain blocked');
            if (flags.includes('--drm')) {
                assert(result.stderr.includes('DRM skipped for event handler'));
                assert(result.stderr.includes('reads or exposes its original source'));
                assert(result.stderr.includes('DRM skipped; keeping original JavaScript'));
                assert(result.stderr.includes('DRM skipped; keeping non-UTF-8'));
                assert(result.stderr.includes('SRI metadata kept unchanged'));
                if (flags.includes('--smart')) assert(result.stderr.includes('DRM skipped because --smart'));
                const doc = sourceRequire('parse5').parse(compiled);
                const nodes = new Map();
                function collect(node) {
                    const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
                    if (attrs.id) nodes.set(attrs.id, { node, attrs });
                    for (const child of node.childNodes || []) collect(child);
                    if (node.content) collect(node.content);
                }
                collect(doc);
                assert.equal(nodes.get('protected').attrs.class, 'guard');
                assert.deepEqual(Object.keys(nodes.get('protected').attrs).sort(), ['class', 'id', 'title']);
                assert(nodes.get('safe').attrs.class.startsWith('safe '), 'Unrelated element must still get random classes');
                assert(Object.keys(nodes.get('safe').attrs).some(name => /^[a-z]{14}$/.test(name)), 'Unrelated element must still get junk attributes');
                assert.equal(nodes.get('observed').attrs.class, 'observed');
                assert.deepEqual(Object.keys(nodes.get('observed').attrs).sort(), ['class', 'id']);
                for (const [id, original] of [['writer', writeCode], ['loader', loaderCode], ['location-module', moduleCode]]) {
                    const script = nodes.get(id);
                    assert(!script.attrs.src, 'Location-dependent scripts must remain inline');
                    assert.notEqual(script.node.childNodes[0].value, original, 'Location-dependent code must still be obfuscated');
                }
                assert.equal(nodes.get('reader').node.childNodes[0].value, sourceReader);
                const templateScript = nodes.get('template').node.content.childNodes[0];
                assert.notEqual(templateScript.childNodes[0].value, templateCode, 'Template scripts must be obfuscated inline');
            }
            for (const name of featureBaselines.keys()) assert.deepEqual(await inspectFeatures(folder, name), featureBaselines.get(name), `${folder}/${name}: SRI, CSP or scoped guards changed behavior/pixels`);
            console.log(`PASS ${folder}: SRI SHA256/384/512, preload, CSS, meta/header CSP, inline document.write/import.meta, template insertion, scoped observer and dynamic guards, blocked integrity`);
        }
        for (const legacy of [false, true]) {
            const prefix = legacy ? 'legacy-sri' : 'unknown-sri';
            const source = path.join(root, prefix + '-input'), output = path.join(root, prefix + '-output');
            fs.mkdirSync(source);
            const markup = `<meta charset="${legacy ? 'windows-1251' : 'utf-8'}">${legacy ? '<meta http-equiv="Content-Security-Policy" content="script-src \'self\'">' : ''}<p>SRI fallback</p><script src="app.js" integrity="${hash(sriScript)}"></script>`;
            fs.writeFileSync(path.join(source, 'index.html'), legacy ? Buffer.concat([Buffer.from(markup), Buffer.from([60, 112, 62, 207, 240, 232, 226, 229, 242, 60, 47, 112, 62])]) : markup);
            fs.writeFileSync(path.join(source, 'app.js'), sriScript);
            const result = spawnSync(process.execPath, [compiler, source, output, '--drm'], { encoding: 'utf8' });
            assert.equal(result.status, 0, result.stderr);
            assert(result.stderr.includes(legacy ? 'its SRI cannot be safely rewritten' : 'external hash authorization cannot be updated'));
            assert.equal(fs.readFileSync(path.join(output, 'app.js'), 'utf8'), sriScript);
            const inspected = [];
            for (const folder of [prefix + '-input', prefix + '-output']) {
                await page.goto(`http://127.0.0.1:${server.address().port}/${folder}/index.html`);
                inspected.push({ value: await page.evaluate(() => window.sriValue), image: await page.screenshot({ path: path.join(root, folder + '.png') }) });
                assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
            }
            assert.equal(inspected[0].value, 'SRI works');
            assert.deepEqual(inspected[1], inspected[0]);
            console.log(`PASS ${prefix}: explicit DRM warning, original SRI bytes, browser behavior and pixels match`);
        }
        const guardInput = path.join(root, 'guard-input'), guardOutput = path.join(root, 'guard-output');
        fs.mkdirSync(guardInput);
        fs.writeFileSync(path.join(guardInput, 'index.html'), `<!doctype html><meta charset="utf-8"><div id="guard" class="probe" title="stable">Reflection-sensitive element</div>
<script>const element = document.getElementById('guard'); window.observed = { classes: element.className, attributes: element.getAttributeNames().sort() };</script>`);
        const guarded = spawnSync(process.execPath, [compiler, guardInput, guardOutput, '--drm'], { encoding: 'utf8' });
        assert.equal(guarded.status, 0, guarded.stderr);
        assert(guarded.stderr.includes('random attributes are skipped'));
        assert(guarded.stderr.includes('affected class values are preserved'));
        const guardedResults = [];
        for (const folder of ['guard-input', 'guard-output']) {
            await page.goto(`http://127.0.0.1:${server.address().port}/${folder}/index.html`);
            guardedResults.push({ state: await page.evaluate(() => window.observed), image: await page.screenshot({ path: path.join(root, folder + '.png') }) });
        }
        assert.deepEqual(guardedResults[1], guardedResults[0], 'DOM attribute/class inspection must survive guarded HTML obfuscation');
        console.log('PASS HTML noise guards: DOM attribute/class inspection and pixels match');
        const linkedResults = [];
        for (const folder of ['input', 'all']) {
            await page.goto(`http://127.0.0.1:${server.address().port}/${folder}/linked/index.html`);
            linkedResults.push({ state: await page.evaluate(() => ({ value: window.linkValue, text: document.getElementById('linked').textContent })), image: await page.screenshot({ path: path.join(root, folder + '-linked.png') }) });
        }
        assert.deepEqual(linkedResults[1], linkedResults[0], 'Symbolically linked sites must retain browser behavior and pixels');
        console.log('PASS linked input directory: browser behavior and pixels match; cycles are skipped');
        const map = fs.readFileSync(path.join(root, 'all', 'sitemap.xml'), 'utf8');
        assert(map.includes('/myindex.html'));
        assert(map.includes('/a%26b.html'));
        assert(map.includes('/legacy.php'));
        assert(map.includes('/linked/'));
        for (const flag of ['--help', '-h', '--version', '-v']) {
            const result = spawnSync(process.execPath, [compiler, flag], { encoding: 'utf8' });
            assert.equal(result.status, 0, result.stderr);
            assert(result.stdout.includes('WebSafeCompiler'));
        }
        const aliases = path.join(root, 'aliases');
        const standalone = path.join(root, 'standalone-compiler');
        fs.mkdirSync(standalone);
        for (const name of ['wsc.js', 'package.json']) fs.copyFileSync(path.join(path.dirname(compiler), name), path.join(standalone, name));
        const aliasResult = spawnSync(process.execPath, [path.join(standalone, 'wsc.js'), input, aliases, '-d', '-s', '-m'], { encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(path.dirname(compiler), 'node_modules') } });
        assert.equal(aliasResult.status, 0, aliasResult.stderr);
        assert(fs.existsSync(path.join(aliases, 'sitemap.xml')));
        assert.equal(fs.readFileSync(path.join(aliases, 'vendor.min.js'), 'utf8'), smartJs);
        const aliasBrowser = await inspect('aliases', 'headers-sha256.html');
        const aliasBaseline = baselines.get('390headers-sha256.html');
        assert.deepEqual(aliasBrowser.screenshot, aliasBaseline.screenshot, 'Short CLI flags must retain the rendered site');
        for (const field of ['results', 'module', 'sum', 'form', 'external', 'scriptSource']) assert.deepEqual(aliasBrowser.state[field], aliasBaseline.state[field]);
        console.log('PASS standalone monolith and short CLI flags: DRM, smart copying, sitemap, browser behavior and pixels match');
        const compressed = transforms.javascript('function sum(firstVeryLongArgument, secondVeryLongArgument) { if (false) throw new Error("dead"); return firstVeryLongArgument + secondVeryLongArgument; } window.sum = sum;', false);
        assert(!compressed.includes('firstVeryLongArgument'), 'Local identifier mangling must be enabled');
        assert(!compressed.includes('dead'), 'JavaScript compression must be enabled');
        const markup = transforms.html('<div   title = "a  > b"  >A\nB</div><!-- ordinary comment -->', false);
        assert(markup.length < '<div   title = "a  > b"  >A\nB</div><!-- ordinary comment -->'.length);
        assert(markup.includes('title="a  > b"') && markup.includes('A\nB'), 'Markup optimization must preserve attribute and text whitespace');
        for (const out of [input, path.join(input, 'nested'), root]) {
            assert.notEqual(spawnSync(process.execPath, [compiler, input, out]).status, 0);
        }
        for (const raw of ['<SCRIPT TYPE="application/json">{"a":"x  y"}</SCRIPT>', '<textarea>\n a\n  b</textarea>', '<script>const broken = ;\n</script>']) {
            assert.equal(transforms.html(raw, true), raw);
        }
        const allowed = "'" + csp.hash('window.ok = true;', 'sha256') + "'";
        assert.equal(csp.plan('window.blocked = true;', [{ policy: 'script-src ' + allowed, additions: new Map() }]), null);
        assert.equal(csp.plan('window.ok = true;', [{ policy: 'script-src ' + allowed, additions: new Map() }, { policy: "script-src 'none'", additions: new Map() }]), null);
        assert.equal(csp.plan('window.ok = true;', [{ policy: 'script-src ' + allowed + ", script-src 'none'", additions: new Map() }]), null);
        assert(csp.routeMatches('/docs/*', '/docs/page.html'));
        assert(!csp.routeMatches('/docs/*', '/unrelated.html'));
        console.log(`PASS fallback, overlapping directories, sitemap, binary assets. Artifacts: ${root}`);
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
