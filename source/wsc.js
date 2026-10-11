"use strict";

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const parse5 = require('parse5');
const CleanCSS = require('clean-css');
const UglifyJS = require('uglify-js');
const Obfuscator = require('javascript-obfuscator');

function hash(code, algorithm) {
    // HTML parsing normalizes CRLF before CSP hashes are checked.
    return algorithm + '-' + crypto.createHash(algorithm).update(code.replace(/\r\n?/g, '\n')).digest('base64');
}

function routeMatches(pattern, url) {
    // Unsupported route expressions are deliberately not treated as proof that
    // a policy belongs to a page. Only literal paths and * wildcards are handled.
    if (typeof pattern !== 'string' || !pattern.startsWith('/') || /[():{}\\]/.test(pattern)) return false;
    const expression = pattern.split('*').map(part => part.replace(/[.+?^$|[\]]/g, '\\$&')).join('.*');
    return new RegExp('^' + expression + '$').test(url);
}

function load(inputDir) {
    const configs = [], records = [];
    const headersPath = path.join(inputDir, '_headers');
    if (fs.existsSync(headersPath)) {
        const text = fs.readFileSync(headersPath, 'utf8');
        const config = { file: headersPath, text, records: [] };
        let route, offset = 0;
        for (const line of text.split(/(?<=\n)/)) {
            if (/^\//.test(line)) route = line.trim();
            const match = line.match(/^(\s+Content-Security-Policy(?:-Report-Only)?\s*:\s*)([^\r\n]*)/i);
            if (route && match) {
                const record = { route, policy: match[2], additions: new Map(), start: offset + match[1].length, end: offset + match[0].length };
                config.records.push(record); records.push(record);
            }
            offset += line.length;
        }
        configs.push(config);
    }
    const vercelPath = path.join(inputDir, 'vercel.json');
    if (fs.existsSync(vercelPath)) {
        const json = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
        const config = { file: vercelPath, json, records: [] };
        for (const rule of json.headers || []) for (const header of rule.headers || []) {
            if (/^Content-Security-Policy(?:-Report-Only)?$/i.test(header.key) && typeof header.value === 'string') {
                const record = { route: rule.source, policy: header.value, additions: new Map(), header };
                config.records.push(record); records.push(record);
            }
        }
        configs.push(config);
    }
    function forPage(relative) {
        const url = '/' + relative.split(path.sep).map(encodeURIComponent).join('/');
        const aliases = [url];
        if (/\/index\.html?$/i.test(url)) aliases.push(url.replace(/index\.html?$/i, ''));
        return records.filter(record => typeof record.route !== 'string' || /[():{}\\]/.test(record.route) || aliases.some(alias => routeMatches(record.route, alias)));
    }
    function save(outputDir) {
        for (const config of configs) {
            if (!config.records.some(record => record.additions.size || record.externalized)) continue;
            let result;
            if (config.json) {
                for (const record of config.records) record.header.value = updatedPolicy(record);
                result = JSON.stringify(config.json, null, 2) + '\n';
            } else {
                result = config.text;
                for (const record of [...config.records].sort((a, b) => b.start - a.start)) {
                    result = result.slice(0, record.start) + updatedPolicy(record) + result.slice(record.end);
                }
            }
            fs.writeFileSync(path.join(outputDir, path.relative(inputDir, config.file)), result);
        }
    }
    return { forPage, save };
}

function updatedPolicy(record) {
    return record.policy.split(',').map(policy => {
        let result = policy.split(';').map(directive => {
            if (!/^\s*(script-src(?:-elem)?|default-src)(?:\s|$)/i.test(directive)) return directive;
            return directive.replace(/'sha(?:256|384|512)-[^']+'/g, token => {
                const additions = record.additions.get(token);
                // Shared rules may still authorize original source on another page.
                return additions ? token + ' ' + [...additions].join(' ') : token;
            });
        }).join(';');
        if (record.externalized) {
            const directives = result.split(';');
            const index = directives.findIndex(value => /^\s*script-src-elem(?:\s|$)/i.test(value));
            if (index >= 0) {
                directives[index] = directives[index].replace(/\s+'none'(?=\s|$)/g, '');
                if (!directives[index].trim().split(/\s+/).includes("'self'")) directives[index] += " 'self'";
                result = directives.join(';');
            } else {
                const inherited = directives.find(value => /^\s*script-src(?:\s|$)/i.test(value)) || directives.find(value => /^\s*default-src(?:\s|$)/i.test(value));
                // Preserve script-src for handlers and default-src for styles.
                if (inherited) {
                    const sources = inherited.trim().split(/\s+/).slice(1).filter(value => value !== "'none'");
                    if (!sources.includes("'self'")) sources.push("'self'");
                    result += '; script-src-elem ' + sources.join(' ');
                }
                // No script/default directive already permits same-origin JS.
            }
        }
        return result;
    }).join(',');
}

function externalizationProblem(policies) {
    if (!policies.length) return 'no editable CSP configuration applies (headers may be supplied externally)';
    for (const record of policies) {
        if (record.route && /[():{}\\]/.test(record.route)) return 'unsupported CSP route expression';
        for (const policy of record.policy.split(',')) {
            const directives = policy.split(';').map(value => value.trim().split(/\s+/));
            const effective = directives.find(value => value[0].toLowerCase() === 'script-src-elem') || directives.find(value => value[0].toLowerCase() === 'script-src') || directives.find(value => value[0].toLowerCase() === 'default-src');
            if (effective && effective.includes("'strict-dynamic'")) return "strict-dynamic would ignore 'self'; changing it could break dynamically loaded scripts";
        }
    }
    return null;
}

function plan(code, policies, nonce) {
    if (!policies.length) return null;
    const matches = [];
    for (const record of policies.flatMap(record => record.policy.split(',').map(policy => ({ ...record, policy })))) {
        const directives = new Map();
        for (const directive of record.policy.split(';')) {
            const parts = directive.trim().split(/\s+/), name = parts.shift().toLowerCase();
            if (!directives.has(name)) directives.set(name, parts);
        }
        const sources = directives.get('script-src-elem') || directives.get('script-src') || directives.get('default-src');
        const tokens = (sources || []).filter(token => {
            const match = token.match(/^'(sha256|sha384|sha512)-[^']+'$/);
            return match && token === "'" + hash(code, match[1]) + "'";
        });
        const nonceAllowed = nonce && (sources || []).includes("'nonce-" + nonce + "'");
        const hasHashOrNonce = (sources || []).some(token => /^'(?:sha(?:256|384|512)-|nonce-)/.test(token));
        const unrestricted = !sources || (sources.includes("'unsafe-inline'") && !hasHashOrNonce);
        if (!tokens.length && !nonceAllowed && !unrestricted) return null;
        matches.push({ record, tokens });
    }
    return transformed => {
        for (const { record, tokens } of matches) for (const token of tokens) {
            const algorithm = token.slice(1).split('-')[0];
            const replacement = "'" + hash(transformed, algorithm) + "'";
            if (replacement === token) continue;
            if (!record.additions.has(token)) record.additions.set(token, new Set());
            record.additions.get(token).add(replacement);
        }
    };
}

const csp = { load, plan, hash, routeMatches, updatedPolicy, externalizationProblem };

function analyze(source, inputs) {
    const exactClasses = new Set();
    for (const match of source.matchAll(/\[\s*class\s*([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/gi)) {
        if (match[1] === '~=') continue; // Token selectors survive extra classes.
        for (const token of (match[2] ?? match[3] ?? match[4] ?? '').split(/\s+/)) exactClasses.add(token.toLowerCase());
    }
    const result = {
        source, exactClasses,
        inspectClasses: /\bclassName\b|\bclassList\b|\bgetAttribute\s*\(\s*['"]class['"]|\bsetAttribute\s*\(\s*['"]class['"]|\[[^\]\n]*\\/.test(source),
        inspectAttributes: /\b(?:attributes|getAttributeNames|outerHTML|innerHTML|MutationObserver|observedAttributes)\b|\b(?:get|set|has)Attribute\s*\(\s*[^'"\s]/.test(source)
    };
    if (!inputs) return result;
    result.classTargets = [];
    result.attributeTargets = [];
    result.inspectClasses = false;
    result.inspectAttributes = false;
    const scripts = [];
    for (const input of inputs) {
        if (/\.m?js$/i.test(input.file)) scripts.push(input.content);
        else if (/\.html?$/i.test(input.file)) {
            function collect(node) {
                if (node.tagName === 'script' && !(node.attrs || []).some(a => a.name === 'src')) {
                    const type = (node.attrs.find(a => a.name === 'type') || {}).value || '';
                    if (!type || /^(?:module|(?:text|application)\/(?:java|ecma)script)$/i.test(type)) scripts.push((node.childNodes || []).map(n => n.value || '').join(''));
                }
                for (const attr of node.attrs || []) if (/^on/i.test(attr.name)) scripts.push('function eventHandler(event){' + attr.value + '}');
                for (const child of node.childNodes || []) collect(child);
                if (node.content) collect(node.content);
            }
            collect(parse5.parse(input.content));
        }
    }
    for (const script of scripts) {
        try {
            const ast = UglifyJS.parse(script);
            ast.figure_out_scope();
            const constants = new Map();
            ast.walk(new UglifyJS.TreeWalker(function (node) {
                if (node instanceof UglifyJS.AST_Const) for (const definition of node.definitions) {
                    if (definition.name instanceof UglifyJS.AST_Symbol) constants.set(definition.name.definition(), definition.value);
                }
            }));
            function property(node) {
                return node instanceof UglifyJS.AST_Dot ? node.property : node instanceof UglifyJS.AST_Sub && node.property instanceof UglifyJS.AST_String ? node.property.value : null;
            }
            function target(node, visited = new Set()) {
                if (node instanceof UglifyJS.AST_SymbolRef) {
                    const definition = node.definition();
                    if (visited.has(definition) || !constants.has(definition)) return null;
                    visited.add(definition);
                    return target(constants.get(definition), visited);
                }
                if (!(node instanceof UglifyJS.AST_Call) || node.args.length !== 1 || !(node.args[0] instanceof UglifyJS.AST_String)) return null;
                const receiver = node.expression.expression;
                if (!(receiver instanceof UglifyJS.AST_SymbolRef) || receiver.name !== 'document' || !receiver.definition().undeclared) return null;
                const method = property(node.expression), value = node.args[0].value;
                if (method === 'getElementById') return { id: value };
                if (['querySelector', 'querySelectorAll'].includes(method) && /^(?:#[\w-]+|\.[\w-]+|[a-z][\w-]*)$/i.test(value)) return { selector: value };
                return null;
            }
            const observers = new Set(), observed = new Set();
            function observer(node) {
                if (node instanceof UglifyJS.AST_SymbolRef && constants.has(node.definition())) node = constants.get(node.definition());
                return node instanceof UglifyJS.AST_New && node.expression instanceof UglifyJS.AST_SymbolRef && node.expression.name === 'MutationObserver' ? node : null;
            }
            ast.walk(new UglifyJS.TreeWalker(function (node) {
                const name = property(node);
                const classes = ['className', 'classList'].includes(name);
                const attributes = ['attributes', 'getAttributeNames', 'outerHTML', 'innerHTML', 'observedAttributes'].includes(name);
                const getClass = ['getAttribute', 'setAttribute', 'hasAttribute'].includes(name) && this.parent() instanceof UglifyJS.AST_Call && this.parent().args[0] instanceof UglifyJS.AST_String && this.parent().args[0].value === 'class';
                const dynamicAttribute = ['getAttribute', 'setAttribute', 'hasAttribute'].includes(name) && this.parent() instanceof UglifyJS.AST_Call && !(this.parent().args[0] instanceof UglifyJS.AST_String);
                if (classes || attributes || getClass || dynamicAttribute) {
                    const resolved = target(node.expression);
                    const kind = attributes || dynamicAttribute ? 'attribute' : 'class';
                    if (resolved) result[kind + 'Targets'].push({ ...resolved, subtree: ['outerHTML', 'innerHTML'].includes(name) });
                    else result[kind === 'attribute' ? 'inspectAttributes' : 'inspectClasses'] = true;
                }
                if (observer(node) === node) observers.add(node);
                if (node instanceof UglifyJS.AST_Call && property(node.expression) === 'observe') {
                    const instance = observer(node.expression.expression);
                    if (instance) {
                        const resolved = target(node.args[0]);
                        if (resolved) {
                            result.attributeTargets.push({ ...resolved, subtree: true });
                            observed.add(instance);
                        } else result.inspectAttributes = true;
                    }
                }
                // Unknown computed DOM reflection requires a broad fallback.
                if (node instanceof UglifyJS.AST_Sub && !(node.property instanceof UglifyJS.AST_String)) {
                    const resolved = target(node.expression);
                    if (resolved) result.attributeTargets.push({ ...resolved, subtree: true });
                    else if (/document|element|node/i.test(script.slice(node.expression.start.pos, node.expression.end.endpos))) result.inspectAttributes = true;
                }
                if (node instanceof UglifyJS.AST_DestructuredKeyVal) {
                    if (['className', 'classList'].includes(node.key)) result.inspectClasses = true;
                    if (['attributes', 'getAttributeNames', 'innerHTML', 'outerHTML'].includes(node.key)) result.inspectAttributes = true;
                }
            }));
            if ([...observers].some(instance => !observed.has(instance))) result.inspectAttributes = true;
        } catch {
            const fallback = analyze(script);
            result.inspectClasses = result.inspectClasses || fallback.inspectClasses;
            result.inspectAttributes = result.inspectAttributes || fallback.inspectAttributes;
        }
    }
    return result;
}

function noiseMatches(node, targets = []) {
    function matches(element, target) {
        const attrs = Object.fromEntries((element.attrs || []).map(a => [a.name, a.value]));
        if (target.id !== undefined) return attrs.id === target.id;
        if (target.selector[0] === '#') return attrs.id === target.selector.slice(1);
        if (target.selector[0] === '.') return (attrs.class || '').split(/\s+/).includes(target.selector.slice(1));
        return element.tagName === target.selector.toLowerCase();
    }
    return targets.some(target => {
        for (let current = node; current; current = target.subtree ? current.parentNode : null) if (matches(current, target)) return true;
        return false;
    });
}

function generator(analysis) {
    const used = new Set();
    const lowerSource = analysis.source.toLowerCase();
    return () => {
        let name;
        do {
            name = Array.from(crypto.randomBytes(14), byte => String.fromCharCode(97 + byte % 26)).join('');
        } while (used.has(name) || lowerSource.includes(name));
        used.add(name);
        return name;
    };
}

const htmlNoise = { analyze, generator };

function pageNoise(page, inputs, inputDir, allSource) {
    const input = inputs.find(item => item.file === page);
    const document = parse5.parse(input.content);
    const url = 'https://wsc.invalid/' + path.relative(inputDir, page).split(path.sep).map(encodeURIComponent).join('/');
    let base = url;
    function findBase(node) {
        if (node.tagName === 'base' && base === url) {
            const href = (node.attrs || []).find(attr => attr.name === 'href');
            if (href) try { base = new URL(href.value, url).href; } catch { }
        }
        for (const child of node.childNodes || []) findBase(child);
    }
    findBase(document);
    const selected = new Map([[page, input]]);
    function add(reference, parentUrl) {
        try {
            const target = new URL(reference, parentUrl);
            if (target.origin !== 'https://wsc.invalid') return;
            const file = path.resolve(inputDir, '.' + decodeURIComponent(target.pathname));
            const asset = inputs.find(item => item.file === file);
            if (!asset || selected.has(file)) return;
            selected.set(file, asset);
            for (const match of asset.content.matchAll(/(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?|\bimport\s*\()\s*['"]([^'"]+)['"]/g)) add(match[1], target.href);
            if (/\.css$/i.test(file)) for (const match of asset.content.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gi)) add(match[1], target.href);
        } catch { }
    }
    function visit(node) {
        const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
        if (node.tagName === 'script' && attrs.src) add(attrs.src, base);
        if (node.tagName === 'link' && attrs.href && /stylesheet/i.test(attrs.rel || '')) add(attrs.href, base);
        if (node.tagName === 'script') {
            const body = (node.childNodes || []).map(child => child.value || '').join('');
            if (attrs.type === 'importmap') {
                try {
                    const map = JSON.parse(body);
                    for (const value of Object.values(map.imports || {})) if (typeof value === 'string') add(value, base);
                    for (const scope of Object.values(map.scopes || {})) for (const value of Object.values(scope)) if (typeof value === 'string') add(value, base);
                } catch { }
            } else for (const match of body.matchAll(/(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?|\bimport\s*\()\s*['"]([^'"]+)['"]/g)) add(match[1], base);
        }
        for (const child of node.childNodes || []) visit(child);
        if (node.content) {
            node.content.parentNode = node;
            visit(node.content);
        }
    }
    visit(document);
    // Unknown runtime imports may reach any bundled script; retain the fallback.
    if ([...selected.values()].some(item => /\bimport\s*\(\s*[^'"\s]/.test(item.content))) for (const item of inputs.filter(item => /\.m?js$/i.test(item.file))) selected.set(item.file, item);
    const relevant = [...selected.values()];
    const analysis = analyze(relevant.map(item => item.content).join('\n'), relevant);
    analysis.source = allSource; // Random names must avoid every source asset.
    return analysis;
}

function minifyMarkup(content, source = content) {
    // Source/DOM inspection makes comments and exact markup observable.
    if (/\b(?:innerHTML|outerHTML|childNodes|COMMENT_NODE|TreeWalker|NodeIterator|nodeType)\b/.test(source)) {
        console.warn('Warning: HTML minification limited: source/comment inspection detected.');
        return content;
    }
    const document = parse5.parse(content, { sourceCodeLocationInfo: true });
    const edits = [];
    function visit(node) {
        const loc = node.sourceCodeLocation;
        if (node.nodeName === '#comment' && loc) {
            // Keep conditional comments, SSI, hydration and template markers.
            if (node.data.trim() && !/^\s*(?:\[|<!|#|\/?ko\b|react|svelte|vue|ng|\/?\$|\])/i.test(node.data)) {
                edits.push({ start: loc.startOffset, end: loc.endOffset, code: '' });
            }
        }
        if (loc && loc.startTag && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
            const tag = loc.startTag;
            const attrs = Object.values(loc.attrs || {}).sort((a, b) => a.startOffset - b.startOffset);
            // Duplicate attributes have ambiguous source locations; keep them.
            if (attrs.length === (node.attrs || []).length && attrs.length) {
                let result = content.slice(tag.startOffset, attrs[0].startOffset).replace(/\s+$/g, ' ');
                for (let i = 0; i < attrs.length; i++) {
                    if (i) result += ' ';
                    result += content.slice(attrs[i].startOffset, attrs[i].endOffset).replace(/^([^\s=]+)\s*=\s*/, '$1=');
                }
                const tail = content.slice(attrs[attrs.length - 1].endOffset, tag.endOffset);
                // Keep separation before a slash following an unquoted value.
                result += tail.includes('/') ? tail.replace(/\s+/g, ' ') : tail.replace(/\s+/g, '');
                edits.push({ start: tag.startOffset, end: tag.endOffset, code: result });
            }
        }
        for (const child of node.childNodes || []) visit(child);
        if (node.content) visit(node.content);
    }
    visit(document);
    for (const edit of edits.sort((a, b) => b.start - a.start)) content = content.slice(0, edit.start) + edit.code + content.slice(edit.end);
    // Text whitespace and raw script/style bodies stay intact: CSS white-space,
    // inline spacing and CSP hashes make collapsing them unsafe.
    return content;
};

const cryptoRandomInt = max => require('crypto').randomBytes(1)[0] % max;

function javascript(content, drm, module = false, label = 'JavaScript') {
    try {
        let code = content;
        if (drm) code = Obfuscator.obfuscate(code, {
            compact: true, controlFlowFlattening: true, deadCodeInjection: true,
            renameGlobals: false, stringArray: true, stringArrayEncoding: ['base64'],
            stringArrayThreshold: 1,
            identifierNamesGenerator: 'mangled-shuffled',
            // Separate scripts share the global lexical scope.
            identifiersPrefix: 'wsc_' + require('crypto').randomBytes(8).toString('hex') + '_'
        }).getObfuscatedCode();
        const result = UglifyJS.minify(code, {
            module, mangle: true, keep_fnames: true, toplevel: false,
            compress: { passes: 5, drop_console: false, toplevel: false },
            output: { inline_script: true }
        });
        if (result.error) throw result.error;
        return result.code;
    } catch (error) {
        console.warn(`Warning: ${label}: ${drm ? 'DRM skipped; ' : ''}keeping original JavaScript: ${error.message}`);
        return content;
    }
}

function css(content) {
    const result = new CleanCSS({ level: 0, rebase: false }).minify(content.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\//g, (match, quoted) => quoted || ''));
    if (result.errors.length || result.warnings.length) {
        console.warn(`Warning: CSS kept unchanged: ${[...result.errors, ...result.warnings].join('; ')}`);
        return content;
    }
    return result.styles;
}

function html(content, drm, policies = [], context = {}) {
    // Source offsets allow malformed markup, quoted attributes, raw text and
    // whitespace to remain exactly as the browser received them.
    const document = parse5.parse(content, { sourceCodeLocationInfo: true });
    const edits = [];
    const noise = context.noise || htmlNoise.analyze(content);
    const randomName = htmlNoise.generator(noise);
    const noiseWarnings = new Set();
    function warnNoise(reason) {
        if (noiseWarnings.has(reason)) return;
        noiseWarnings.add(reason);
        console.warn(`Warning: ${context.label || 'HTML'}: HTML noise limited: ${reason}.`);
    }
    const metaPolicies = [];
    let hasBase = false;
    let hasAsyncExecution = false;
    const scriptCandidates = [];
    function checkMeta(node) {
        const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
        if (node.tagName === 'base' && 'href' in attrs) hasBase = true;
        if (node.tagName === 'script' && 'async' in attrs && ('src' in attrs || attrs.type === 'module')) hasAsyncExecution = true;
        if (node.tagName === 'meta' && /^content-security-policy$/i.test(attrs['http-equiv'] || '') && attrs.content && node.sourceCodeLocation && node.sourceCodeLocation.attrs.content) {
            const existing = context.integrity && context.integrity.metaPolicies.find(record => record.range.startOffset === node.sourceCodeLocation.attrs.content.startOffset);
            metaPolicies.push(existing || { policy: attrs.content, additions: new Map(), range: node.sourceCodeLocation.attrs.content });
        }
        for (const child of node.childNodes || []) checkMeta(child);
    }
    checkMeta(document);
    function visit(node) {
        const loc = node.sourceCodeLocation;
        if (loc && context.integrity && loc.attrs && loc.attrs.integrity) {
            const reference = context.integrity.find(ref => ref.range.startOffset === loc.attrs.integrity.startOffset);
            if (reference && !reference.preserve) {
                const outputAsset = path.join(context.outputDir, path.relative(context.inputDir, reference.file));
                const bytes = fs.readFileSync(outputAsset);
                const value = reference.tokens.map(token => token.raw || token.algorithm + '-' + crypto.createHash(token.algorithm).update(bytes).digest('base64') + token.options).join(' ');
                edits.push({ start: reference.range.startOffset, end: reference.range.endOffset, code: 'integrity="' + value.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' });
                for (const record of reference.policies) for (const token of reference.tokens) {
                    if (token.raw) continue;
                    const newHash = "'" + token.algorithm + '-' + crypto.createHash(token.algorithm).update(bytes).digest('base64') + "'";
                    // Equivalent base64 spellings (padding/base64url) may differ
                    // between SRI metadata and the HTTP/meta policy.
                    for (const match of record.policy.matchAll(/'(sha256|sha384|sha512)-([^']+)'/g)) {
                        if (match[1] !== token.algorithm || !Buffer.from(match[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64').equals(Buffer.from(token.digest.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))) continue;
                        const originalHash = match[0];
                        if (originalHash !== newHash) {
                            if (!record.additions.has(originalHash)) record.additions.set(originalHash, new Set());
                            record.additions.get(originalHash).add(newHash);
                        }
                    }
                }
            }
        }
        if (drm && loc && (node.attrs || []).some(attr => /^on/i.test(attr.name))) {
            warnNoise(`DRM skipped for event handler attributes on <${node.tagName}> at line ${loc.startLine}; handler scope is preserved`);
        }
        if (drm && loc && (node.attrs || []).length && (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.tagName.includes('-'))) {
            warnNoise(`DRM HTML noise skipped on <${node.tagName}> at line ${loc.startLine}; foreign/custom element semantics are preserved`);
        }
        if (drm && loc && loc.attrs && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
            const eligible = loc.startTag && !['script', 'style', 'meta', 'noscript'].includes(node.tagName) && !node.tagName.includes('-');
            const sensitiveAttributes = noise.inspectAttributes || noiseMatches(node, noise.attributeTargets);
            const sensitiveClasses = noise.inspectClasses || noiseMatches(node, noise.classTargets);
            const addNoise = eligible && !sensitiveAttributes;
            if (eligible && node.attrs.length && sensitiveAttributes) warnNoise(`attribute/source enumeration detected; random attributes are skipped on <${node.tagName}> at line ${loc.startLine}`);
            for (const attr of node.attrs || []) {
                const range = loc.attrs[attr.name];
                if (!range) continue;
                // SRI replacement and junk wrapping share this attribute range.
                // Compose them instead of applying overlapping source edits.
                const existingEdit = edits.findIndex(edit => edit.start === range.startOffset && edit.end === range.endOffset);
                const raw = existingEdit < 0 ? content.slice(range.startOffset, range.endOffset) : edits[existingEdit].code;
                if (addNoise && existingEdit >= 0) edits.splice(existingEdit, 1);
                if (!['class', 'id', 'title'].includes(attr.name)) {
                    if (addNoise) edits.push({
                        start: range.startOffset, end: range.endOffset,
                        code: `${randomName()}="${randomName()}" ${raw} ${randomName()}="${randomName()}"`
                    });
                    continue;
                }
                const match = raw.match(/^([^\s=]+)(\s*=\s*)(["'])([\s\S]*)\3$/);
                if (!match && attr.name !== 'class') {
                    warnNoise(`DRM value encoding skipped for unquoted ${attr.name} on <${node.tagName}> at line ${loc.startLine}; original token boundaries are preserved`);
                    if (addNoise) edits.push({
                        start: range.startOffset, end: range.endOffset,
                        code: `${randomName()}="${randomName()}" ${raw} ${randomName()}="${randomName()}"`
                    });
                    continue;
                }
                let value = attr.value;
                if (eligible && attr.name === 'class') {
                    if (sensitiveClasses || sensitiveAttributes || [...noise.exactClasses].some(token => token ? value.toLowerCase().includes(token) : !value)) {
                        warnNoise(`class equality/inspection detected; affected class values are preserved on <${node.tagName}> at line ${loc.startLine}`);
                    } else {
                        value += ' ' + Array.from({ length: 1 + cryptoRandomInt(3) }, randomName).join(' ');
                    }
                }
                const encoded = Array.from(value, char => Math.random() < 0.5
                    ? `&#${char.codePointAt(0)};` : `&#x${char.codePointAt(0).toString(16)};`).join('');
                let code = match ? match[1] + match[2] + match[3] + encoded + match[3] : `class="${encoded}"`;
                if (addNoise) code = `${randomName()}="${randomName()}" ${code} ${randomName()}="${randomName()}"`;
                edits.push({
                    start: range.startOffset, end: range.endOffset,
                    code
                });
            }
        }
        if (node.tagName === 'script' && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && loc && loc.startTag && loc.endTag) {
            const attrs = Object.fromEntries(node.attrs.map(attr => [attr.name, attr.value]));
            const type = (attrs.type || '').trim().toLowerCase();
            const executable = !type || type === 'module' || /^(text|application)\/(javascript|ecmascript)(?:\s*;.*)?$/.test(type);
            if (drm && 'src' in attrs) {
                try {
                    if (new URL(attrs.src, 'https://wsc.invalid/').origin !== 'https://wsc.invalid') warnNoise(`DRM skipped for externally hosted script ${attrs.src} at line ${loc.startLine}; source is outside this build`);
                } catch { warnNoise(`DRM skipped for invalid script URL at line ${loc.startLine}`); }
            }
            if (!('src' in attrs) && executable) {
                const start = loc.startTag.endOffset, end = loc.endTag.startOffset;
                scriptCandidates.push({ node, loc, attrs, type, start, end });
            }
        }
        for (const child of node.childNodes || []) visit(child);
        if (node.content) {
            node.content.parentNode = node;
            visit(node.content);
        }
    }
    visit(document);
    const allPolicies = [...policies, ...metaPolicies];
    for (const { node, loc, attrs, type, start, end } of scriptCandidates) {
        const original = content.slice(start, end);
        if (!original.trim()) continue;
        const update = csp.plan(original, allPolicies, attrs.nonce);
        const inspectable = original.replace(/document\s*\.\s*currentScript\s*\.\s*(?:id|src)\b/g, '');
        const sourceDependent = /currentScript|document\s*(?:\.\s*scripts|\[)|sourceURL|sourceMappingURL/.test(inspectable);
        const locationDependent = /document\s*\.\s*(?:currentScript\s*\.\s*src|write|writeln)\b|import\s*\.\s*meta/.test(original);
        let inTemplate = false;
        for (let parent = node.parentNode; parent; parent = parent.parentNode) if (parent.nodeName === '#document-fragment') inTemplate = true;
        if (!drm) {
            if (update && !sourceDependent) {
                const code = javascript(original, false, type === 'module', `${context.label || 'HTML'} line ${loc.startLine}`);
                edits.push({ start, end, code }); update(code);
            } else {
                console.warn(`Warning: ${context.label || 'HTML'} inline script at line ${loc.startLine} kept unchanged: ${sourceDependent ? 'source/URL dependency' : 'no accessible CSP authorizes minification'}.`);
            }
            continue;
        }
        let problem = csp.externalizationProblem(allPolicies);
        if (!problem && !context.emit) problem = 'no output asset writer';
        if (!problem && hasBase) problem = 'base href changes generated script and module URL resolution';
        if (!problem && hasAsyncExecution) problem = 'asynchronous scripts may change their execution order during an extra fetch';
        if (!problem && (sourceDependent || locationDependent)) problem = 'script depends on its source or execution location';
        if (!problem && !update) problem = 'inline script is not authorized by every applicable CSP';
        // Moving inert template scripts can affect their future insertion order.
        if (!problem && inTemplate) problem = 'script belongs to inert template content';
        const code = update && !sourceDependent ? javascript(original, true, type === 'module', `${context.label || 'HTML'} line ${loc.startLine}`) : original;
        if (!problem && code === original) problem = 'JavaScript could not be safely obfuscated';
        if (!problem) {
            const asset = context.emit(code);
            // Keep the original tag position. Classic inline scripts ignore async
            // and defer, so remove those attributes when giving them a src.
            for (const name of type === 'module' ? [] : ['async', 'defer']) {
                const range = loc.attrs && loc.attrs[name];
                if (range) edits.push({ start: range.startOffset, end: range.endOffset, code: '' });
            }
            if (loc.attrs && loc.attrs.integrity) edits.push({ start: loc.attrs.integrity.startOffset, end: loc.attrs.integrity.endOffset, code: '' });
            const offset = loc.startTag.endOffset - 1;
            edits.push({ start: offset, end: offset, code: ` src="${asset}" integrity="${csp.hash(code, 'sha256')}"` });
            edits.push({ start, end, code: '' });
            for (const record of allPolicies) record.externalized = true;
        } else {
            console.warn(`Warning: ${context.label || 'HTML'} inline script at line ${loc.startLine} kept inline: ${problem}.`);
            // Preserve source-dependent code; otherwise retain inline DRM and
            // update its hashes if configuration is available.
            if (update && !sourceDependent && code !== original) {
                edits.push({ start, end, code }); update(code);
            } else {
                console.warn(`Warning: ${context.label || 'HTML'} line ${loc.startLine}: DRM skipped: ${sourceDependent ? 'script reads or exposes its original source' : !update ? 'no accessible CSP authorizes the transformation' : 'JavaScript was not transformed'}.`);
            }
        }
    }
    for (const record of metaPolicies) if (record.additions.size || record.externalized) {
        edits.push({
            start: record.range.startOffset, end: record.range.endOffset,
            code: 'content="' + csp.updatedPolicy(record).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"'
        });
    }
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        content = content.slice(0, edit.start) + edit.code + content.slice(edit.end);
    }
    return minifyMarkup(content, noise.source);
}



function integrityAssets(content, documentUrl) {
    const document = parse5.parse(content);
    let base = documentUrl;
    const resources = [];
    function visit(node) {
        const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
        if (node.tagName === 'base' && attrs.href && base === documentUrl) {
            try { base = new URL(attrs.href, documentUrl).href; } catch { }
        }
        if ('integrity' in attrs && (attrs.src || attrs.href)) resources.push(attrs.src || attrs.href);
        for (const child of node.childNodes || []) visit(child);
    }
    visit(document);
    return resources.flatMap(resource => {
        try {
            const url = new URL(resource, base);
            return url.origin === new URL(documentUrl).origin ? [decodeURIComponent(url.pathname)] : [];
        } catch { return []; }
    });
};

const transforms = { javascript, css, html, integrityAssets };

function prepareIntegrity(files, inputDir, config, drm) {
    const protectedFiles = new Set(), pages = new Map(), references = new Map();
    for (const page of files.filter(file => /\.html?$/i.test(file))) {
        const pageBytes = fs.readFileSync(page), content = pageBytes.toString('utf8'), document = parse5.parse(content, { sourceCodeLocationInfo: true });
        const editable = Buffer.from(content, 'utf8').equals(pageBytes);
        const relative = path.relative(inputDir, page);
        const url = 'https://wsc.invalid/' + relative.split(path.sep).map(encodeURIComponent).join('/');
        let base = url;
        const policies = [...config.forPage(relative)];
        function metadata(node, inert = false) {
            const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
            if (!inert && node.tagName === 'base' && attrs.href && base === url) {
                try { base = new URL(attrs.href, url).href; } catch { }
            }
            if (!inert && node.tagName === 'meta' && /^content-security-policy$/i.test(attrs['http-equiv'] || '') && attrs.content && node.sourceCodeLocation && node.sourceCodeLocation.attrs.content) policies.push({ policy: attrs.content, additions: new Map(), meta: true, range: node.sourceCodeLocation.attrs.content });
            for (const child of node.childNodes || []) metadata(child, inert);
            if (node.content) metadata(node.content, true);
        }
        metadata(document);
        const pageReferences = [];
        function visit(node) {
            const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
            if (drm && node.tagName === 'script' && attrs.src && !attrs.integrity) {
                let target;
                try { target = new URL(attrs.src, base); } catch { }
                const local = target && target.origin === 'https://wsc.invalid' ? path.resolve(inputDir, '.' + decodeURIComponent(target.pathname)) : null;
                if (!local || !files.includes(local)) console.warn(`Warning: ${relative}: DRM skipped for script ${attrs.src}: source is external or unavailable in the project.`);
            }
            if (attrs.integrity && (attrs.src || attrs.href) && node.sourceCodeLocation && node.sourceCodeLocation.attrs.integrity) {
                const label = relative + ' line ' + node.sourceCodeLocation.startLine;
                let asset;
                try { asset = new URL(attrs.src || attrs.href, base); } catch { }
                const file = asset && asset.origin === 'https://wsc.invalid' ? path.resolve(inputDir, '.' + decodeURIComponent(asset.pathname)) : null;
                if (!file || !files.includes(file)) {
                    if (drm) console.warn(`Warning: ${label}: DRM/SRI update skipped for ${attrs.src || attrs.href}: asset is external or unavailable in the project.`);
                } else {
                    const tokens = attrs.integrity.trim().split(/\s+/).map(value => {
                        const match = value.match(/^(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+={0,2})(\?\S*)?$/);
                        return match ? { algorithm: match[1], digest: match[2], options: match[3] || '' } : { raw: value };
                    });
                    const bytes = fs.readFileSync(file);
                    const strongest = tokens.filter(token => !token.raw).map(token => token.algorithm).sort().pop();
                    const authorized = tokens.some(token => token.algorithm === strongest && !token.raw && crypto.createHash(token.algorithm).update(bytes).digest().equals(Buffer.from(token.digest.replace(/-/g, '+').replace(/_/g, '/'), 'base64')));
                    const reference = { file, tokens, policies, label, editable, range: node.sourceCodeLocation.attrs.integrity, preserve: !authorized || !editable };
                    pageReferences.push(reference);
                    if (!references.has(file)) references.set(file, []);
                    references.get(file).push(reference);
                    if (!authorized && drm) console.warn(`Warning: ${label}: SRI metadata kept unchanged: invalid or mismatching integrity must not newly authorize blocked code.`);
                    if (!policies.length || !editable) protectedFiles.add(file);
                }
            }
            for (const child of node.childNodes || []) visit(child);
            if (node.content) visit(node.content);
        }
        visit(document);
        pageReferences.metaPolicies = policies.filter(record => record.meta);
        pages.set(page, pageReferences);
    }
    for (const [file, refs] of references) {
        if (protectedFiles.has(file)) for (const ref of refs) {
            ref.preserve = true;
            if (drm) console.warn(`Warning: ${ref.label}: DRM skipped for ${path.relative(inputDir, file)}: ${refs.some(item => !item.editable) ? 'a referring page is not UTF-8; its SRI cannot be safely rewritten' : 'a referring page has no accessible CSP; external hash authorization cannot be updated'}.`);
        }
    }
    return { protectedFiles, pages };
}

const version = {
    current: "v" + require('./package.json').version
}

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        crimson: "\x1b[38m",

        brightBlack: "\x1b[90m",
        brightRed: "\x1b[91m",
        brightGreen: "\x1b[92m",
        brightYellow: "\x1b[93m",
        brightBlue: "\x1b[94m",
        brightMagenta: "\x1b[95m",
        brightCyan: "\x1b[96m",
        brightWhite: "\x1b[97m",

        color256: (code) => `\x1b[38;5;${code}m`
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        crimson: "\x1b[48m",

        brightBlack: "\x1b[100m",
        brightRed: "\x1b[101m",
        brightGreen: "\x1b[102m",
        brightYellow: "\x1b[103m",
        brightBlue: "\x1b[104m",
        brightMagenta: "\x1b[105m",
        brightCyan: "\x1b[106m",
        brightWhite: "\x1b[107m",

        color256: (code) => `\x1b[48;5;${code}m`
    }
};

const scriptPath = path.basename(process.argv[1] || __filename);

function handleError(message) {
    console.error(`${colors.fg.red}Error: ${message}${colors.reset}`);
    process.exit(1);
}

function printArt() {
    console.log(
        `${colors.fg.brightBlue}
            ██╗    ██╗    ██╗ ███████╗  ██████╗    ██╗  
           ██╔╝    ██║    ██║ ██╔════╝ ██╔════╝    ╚██╗ 
          ██╔╝     ██║ █╗ ██║ ███████╗ ██║          ╚██╗
          ╚██╗     ██║███╗██║ ╚════██║ ██║          ██╔╝
           ╚██╗    ╚███╔███╔╝ ███████║ ╚██████╗    ██╔╝ 
            ╚═╝     ╚══╝╚══╝  ╚══════╝  ╚═════╝    ╚═╝${colors.fg.brightBlack}
                  WebSafeCompiler, (C) DosX [2024]${colors.fg.brightMagenta}
  A utility designed to optimize web applications and websites,
            and obfuscate their code if necessary.${colors.reset}`);
}

function printHelp() {

    printArt();

    console.log(`
${colors.fg.brightYellow}Usage:${colors.reset}
  node ${scriptPath} <input_dir> <output_dir> [--map] [--smart] [--drm]

${colors.fg.brightYellow}Options:${colors.reset}
  <input_dir>        Directory containing the source files.
  <output_dir>       Directory where processed files will be saved.
  -m, --map          Generate sitemap.xml in the root of the site
  -s, --smart        Skip minified JS/CSS files.
${colors.fg.red + '*' + colors.reset} -d, --drm          Enable code obfuscation (DRM protection).
  -h, --help         Show this help message.
  -v, --version      Get the current version of WSC.
 
${colors.fg.brightGreen}Dependencies used:${colors.reset}
 * ${colors.fg.cyan}uglify-js:${colors.reset} JavaScript preprocessing and minification.
 * ${colors.fg.cyan}javascript-obfuscator:${colors.reset} JavaScript code protection.
 
${colors.fg.brightYellow}Example:${colors.reset}
  node ${scriptPath} "/path/to/source" "/path/to/output" --map --smart --drm

 ${colors.fg.brightBlack}WebSafeCompiler will process all files in the specified source directory,
 perform optimization, and if the obfuscation option is set, protect the
 code from analysis. The result will be optimized and protected files
 ready for deployment on your website. Current version is ${version.current}.
 GitHub: ${colors.bg.brightBlack + colors.fg.blue} https://github.com/DosX-dev/WebSafeCompiler ${colors.reset}`);
    process.exit(0);
}

function printVersion() {
    console.log("WebSafeCompiler, " + version.current);
    process.exit(0);
}

function parseArguments() {
    const args = process.argv.slice(2);

    // Check for help flags first
    if (args.includes('-h') || args.includes('--help')) {
        printHelp();
    } else if (args.includes('-v') || args.includes('--version')) {
        printVersion();
    }

    // Extract main arguments
    const
        inputDir = args.shift(),
        outputDir = args.shift(),
        map = args.includes('-m') || args.includes("--map"),
        smart = args.includes('-s') || args.includes('--smart'),
        obfuscate = args.includes('-d') || args.includes('--drm');

    if (!inputDir || !outputDir) {
        console.log(
            `${colors.fg.brightCyan}Usage: node ${scriptPath} <input_dir> <output_dir> [--map] [--smart] [--drm]${colors.fg.brightBlack}
Use --help for more detailed usage instructions.${colors.reset}`);
        process.exit(0);
    }

    return { inputDir, outputDir, map, smart, obfuscate };
}

function validateDirectories(inputDir, outputDir) {
    if (!fs.existsSync(inputDir)) {
        handleError(`Input directory does not exist: ${inputDir}`);
    }

    if (!fs.statSync(inputDir).isDirectory()) handleError('Input path must be a directory.');
    function canonical(target) {
        if (fs.existsSync(target)) return fs.realpathSync(target);
        return path.join(canonical(path.dirname(target)), path.basename(target));
    }
    const input = fs.realpathSync(inputDir), output = canonical(path.resolve(outputDir));
    function contains(parent, child) {
        const relative = path.relative(parent, child);
        return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
    }
    if (contains(input, output) || contains(output, input)) handleError('Input and output directories must not overlap.');
    if (fs.existsSync(outputDir) && !fs.statSync(outputDir).isDirectory()) handleError('Output path must be a directory.');
    if (!fs.existsSync(outputDir)) {
        try {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`${colors.fg.green}Output directory created:${colors.reset} ${outputDir}`);
        } catch (error) {
            handleError(`Failed to create output directory: ${error.message}`);
        }
    }
}

function validateArguments(inputDir, outputDir, args) {
    const allowedFlags = ['-m', '-s', '-d', '-v', '-h', '--map', '--smart', '--drm', '--version', '--help'];

    args.forEach(arg => {
        if (!allowedFlags.includes(arg)) {
            handleError(`Invalid flag detected: ${arg}`);
        }
    });
}

function getAllFiles(dir, options = {}, ancestors = new Set()) {
    try {
        const realDirectory = fs.realpathSync(dir);
        if (ancestors.has(realDirectory)) {
            console.warn(`Warning: skipping cyclic directory link: ${dir}`);
            return [];
        }
        const visited = new Set(ancestors);
        visited.add(realDirectory);
        let results = [];
        const list = fs.readdirSync(dir);

        list.forEach(file => {
            file = path.join(dir, file);
            const link = fs.lstatSync(file);
            if (link.isSymbolicLink() && options.rejectLinks) throw new Error(`Output symbolic links are not supported: ${file}`);
            if (options.outputDir) {
                const relative = path.relative(options.outputDir, fs.realpathSync(file));
                if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
                    console.warn(`Warning: skipping input link into output directory: ${file}`);
                    return;
                }
            }
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                results = results.concat(getAllFiles(file, options, visited));
            } else {
                results.push(file);
            }
        });

        return results;
    } catch (error) {
        handleError(`Reading directory failed: ${error.message}`);
    }
}

function checkFilePermissions(file) {
    try {
        fs.accessSync(file, fs.constants.R_OK);
    } catch (error) {
        handleError(`Insufficient permissions for file: ${file}`);
    }
}

function checkEmptyDirectory(files, inputDir) {
    if (files.length === 0) {
        handleError(`Input directory is empty: ${inputDir}`);
    }
}

// Minify a file based on its extension and options
function processFile(file, inputDir, outputDir, obfuscate = false, smart = false, protectedFiles = new Set(), policies = [], noise, integrity) {
    try {
        const
            ext = path.extname(file).toLowerCase(),
            outputFilePath = path.join(outputDir, path.relative(inputDir, file));

        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });

        if (protectedFiles.has(path.resolve(file)) || !['.js', '.mjs', '.css', '.html', '.htm'].includes(ext)) {
            fs.copyFileSync(file, outputFilePath);
            console.log(`${colors.fg.brightBlue}Copied:${colors.reset} ${file} -> ${outputFilePath}`);
            return;
        }
        const bytes = fs.readFileSync(file);
        let content = bytes.toString('utf8'),
            minifiedContent;
        if (!Buffer.from(content, 'utf8').equals(bytes)) {
            console.warn(`Warning: ${file}: ${obfuscate ? 'DRM skipped; ' : ''}keeping non-UTF-8 asset.`);
            fs.copyFileSync(file, outputFilePath);
            return;
        }

        if (smart && (ext === '.js' || ext === '.mjs' || ext === '.css')) {
            // Skip minification for already minified files or very compact files
            if (path.basename(file).endsWith('min' + ext) ||
                (content.length > 250 && !content.includes('\n'))) {
                console.log(`${colors.fg.brightBlack}Copied:${colors.reset} ${file} -> ${outputFilePath} ${colors.fg.brightBlack}(skipped)${colors.reset}`);
                fs.copyFileSync(file, outputFilePath);
                if (obfuscate && ext !== '.css') console.warn(`Warning: ${file}: DRM skipped because --smart preserves minified or compact JavaScript.`);
                return;
            }
        }

        switch (ext) {
            case '.js':
            case '.mjs':
                minifiedContent = transforms.javascript(content, obfuscate, ext === '.mjs', file);
                break;
            case '.css':
                minifiedContent = transforms.css(content);
                break;
            case '.html':
            case '.htm':
                let assetIndex = 0;
                const documentKey = require('crypto').createHash('sha256').update(path.relative(inputDir, file)).digest('hex').slice(0, 16);
                minifiedContent = transforms.html(content, obfuscate, policies, {
                    label: path.relative(inputDir, file),
                    noise,
                    integrity, inputDir, outputDir,
                    emit(code) {
                        let name, destination;
                        do {
                            name = `wsc-inline-${documentKey}-${++assetIndex}.js`;
                            destination = path.join(path.dirname(outputFilePath), name);
                        } while (fs.existsSync(destination) || fs.existsSync(path.join(path.dirname(file), name)));
                        fs.writeFileSync(destination, code, 'utf8');
                        return './' + name;
                    }
                });
                break;
            default:
                fs.copyFileSync(file, outputFilePath); // Copy non-processable files
                console.log(`${colors.fg.brightBlue}Copied:${colors.reset} ${file} -> ${outputFilePath}`);
                return;
        }
        fs.writeFileSync(outputFilePath, minifiedContent, 'utf8');
        console.log(`${colors.fg.green}Compiled:${colors.reset} ${file} -> ${outputFilePath}`);
    } catch (error) {
        console.error(`${colors.fg.red}Error processing ${file}: ${error.message}${colors.reset}`);
        fs.copyFileSync(file, path.join(outputDir, path.relative(inputDir, file))); // Copy file in case of an error
        console.log(`${colors.fg.yellow}Copied without minification due to error:${colors.reset} ${file}`);
        process.exit(1);
    }
}

function removeIndex(relativePath) {
    const endings = ['index.html', 'index.htm', 'index.php'];
    for (const ending of endings) {
        if (path.posix.basename(relativePath) === ending) {
            return relativePath.slice(0, -ending.length);
        }
    }
    return relativePath;
}

function generateSiteMap(contentPath) {
    const urls = [];

    function walkDir(currentPath) {
        fs.readdirSync(currentPath).forEach(file => {
            const
                fullPath = path.join(currentPath, file),
                stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                walkDir(fullPath);
            } else if (stats.isFile() && ['.html', '.htm', '.php'].includes(path.extname(fullPath).toLowerCase())) {
                let relativePath = path.relative(contentPath, fullPath).replace(/\\/g, '/');

                relativePath = '/' + removeIndex(relativePath);

                if (relativePath) {
                    urls.push(`${relativePath}`);
                }
            }
        });
    }

    walkDir(contentPath);

    const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map(url => `  <url>\n    <loc>${url.split('/').map(encodeURIComponent).join('/')}</loc>\n  </url>`).join('\n') +
        `\n</urlset>`;

    const siteMapPath = path.join(contentPath, 'sitemap.xml');

    fs.writeFileSync(siteMapPath, xml);

    console.log(`${colors.fg.brightCyan}Generated:${colors.reset} ${siteMapPath}`);
}

// Print statistics about the files processed
function printFileStats(files, obfuscate) {
    try {
        const
            totalFiles = files.length,
            skippedFiles = files.filter(file => !['.js', '.mjs', '.css', '.html', '.htm'].includes(path.extname(file).toLowerCase())).length,
            processedFiles = totalFiles - skippedFiles;

        console.log(`Source files detected: ${colors.fg.brightCyan}${processedFiles}${colors.reset}\n` +
            `Resource files detected: ${colors.fg.brightYellow}${skippedFiles}${colors.reset}\n`);

        console.log("Compilation mode: " + (obfuscate ? `${colors.bg.brightMagenta}${colors.fg.white}DRM protection${colors.reset}` : `${colors.bg.yellow}${colors.fg.black}Preprocess only${colors.reset}`) + "\n");
    } catch (error) {
        handleError(`Printing file stats failed: ${error.message}`);
    }
}

// Check if required dependencies are installed
function checkDependencies() {
    try {
        require.resolve('uglify-js'); // Ensure UglifyJS is available
        require.resolve('javascript-obfuscator'); // Ensure JavaScriptObfuscator is available
    } catch (error) {
        handleError(`Missing dependency: ${error.message}`);
    }
}

function main() {
    try {
        const { inputDir, outputDir, map, smart, obfuscate } = parseArguments();

        validateArguments(inputDir, outputDir, process.argv.slice(4));
        validateDirectories(inputDir, outputDir);
        checkDependencies();
        // Reject pre-existing output links before any asset can be overwritten.
        getAllFiles(outputDir, { rejectLinks: true });

        const files = getAllFiles(inputDir, { outputDir: fs.realpathSync(outputDir) });
        checkEmptyDirectory(files, inputDir);
        printFileStats(files, obfuscate);
        const noiseInputs = files.filter(file => /\.(?:html?|css|m?js)$/i.test(file)).map(file => ({ file, content: fs.readFileSync(file, 'utf8') }));
        const allSource = noiseInputs.map(input => input.content).join('\n');
        const noiseByPage = new Map(files.filter(file => /\.html?$/i.test(file)).map(file => [file, pageNoise(file, noiseInputs, inputDir, allSource)]));
        const cspConfig = csp.load(inputDir);
        const integrity = prepareIntegrity(files, inputDir, cspConfig, obfuscate);

        // SRI must describe the final asset bytes, including smart/error fallbacks.
        const orderedFiles = [...files.filter(file => !/\.html?$/i.test(file)), ...files.filter(file => /\.html?$/i.test(file))];
        orderedFiles.forEach(file => {
            checkFilePermissions(file);
            processFile(file, inputDir, outputDir, obfuscate, smart, integrity.protectedFiles, cspConfig.forPage(path.relative(inputDir, file)), noiseByPage.get(file), integrity.pages.get(file));
        });
        cspConfig.save(outputDir);

        if (map) {
            generateSiteMap(outputDir);
        }

        console.log(`\n${colors.bg.brightGreen}${colors.fg.black}[Done!]${colors.reset} The web application files are compiled${obfuscate ? " and protected" : ""}.`);
    } catch (error) {
        handleError(`Fatal error: ${error.message}`);
    }
}

if (require.main === module) main();

module.exports = { transforms, csp };
