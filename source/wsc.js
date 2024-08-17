const
    fs = require('fs'),
    path = require('path'),
    UglifyJS = require('uglify-js'),
    JavaScriptObfuscator = require('javascript-obfuscator'),
    { fileURLToPath } = require('url');

const version = {
    current: "v1.0.0"
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

const scriptPath = path.basename(process.argv[1]);

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
  node ${scriptPath} <input_dir> <output_dir> [--drm] [--smart]

${colors.fg.brightYellow}Options:${colors.reset}
  <input_dir>        Directory containing the source files.
  <output_dir>       Directory where processed files will be saved.
  -d, --drm          Enable code obfuscation (DRM protection).
  -s, --smart        Skip minified JS/CSS files.
  -h, --help         Show this help message.
  -v, --version      Get the current version of WSC.
 
${colors.fg.brightGreen}Dependencies used:${colors.reset}
 * ${colors.fg.cyan}uglify-js:${colors.reset} JavaScript preprocessing and minification.
 * ${colors.fg.cyan}javascript-obfuscator:${colors.reset} JavaScript code protection.
 
${colors.fg.brightYellow}Example:${colors.reset}
  node ${scriptPath} "/path/to/source" "/path/to/output" --drm --smart

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
        obfuscate = args.includes('-d') || args.includes('--drm'),
        smart = args.includes('-s') || args.includes('--smart');

    if (!inputDir || !outputDir) {
        console.log(
            `${colors.fg.brightCyan}Usage: node ${scriptPath} <input_dir> <output_dir> [--drm] [--smart]${colors.fg.brightBlack}
Use --help for more detailed usage instructions.${colors.reset}`);
        process.exit(0);
    }

    return { inputDir, outputDir, obfuscate, smart };
}

function getAllFiles(dir) {
    try {
        let results = [];
        const list = fs.readdirSync(dir);

        list.forEach(file => {
            file = path.join(dir, file);
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                results = results.concat(getAllFiles(file));
            } else {
                results.push(file);
            }
        });

        return results;
    } catch (error) {
        handleError(`Reading directory failed: ${error.message}`);
    }
}

function minifyHtml(content) {
    try {
        const tagsToPreserve = ['pre', 'textarea', 'code'];

        let isInPreservedTag = false;

        return content.replace(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g, (match) => {
            if (match.startsWith('<!--')) {
                return '';
            }

            if (match.startsWith('<')) {
                const tagName = match.replace(/[<\/>]/g, '').split(' ')[0];

                if (tagsToPreserve.includes(tagName)) {
                    isInPreservedTag = match.startsWith('</') ? false : true;
                    return match;
                }
                if (!isInPreservedTag) {
                    return match.replace(/\s+/g, ' ').trim();
                }
            }

            if (!isInPreservedTag) {
                return match.replace(/\n+/g, '').replace(/\s{2,}/g, ' ');
            }

            return match;
        }).replace(/\n/g, '');
    } catch (error) {
        handleError(`Minifying HTML failed: ${error.message}`);
    }
}

function getRandomString(length) {
    if (length <= 0) {
        handleError(`Invalid string length: ${length}`);
    }

    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function obfuscateHtml(html) {
    try {
        return html.replace(/<(\w+)(\s[^>]*?)?(\s*\/)?>/g, (match, tagName, attributes, closingSlash) => {
            if (!attributes || ['meta', 'noscript'].includes(tagName)) return `<${tagName}${attributes || ''}>`;

            const
                attrArray = attributes.trim().match(/\S+="[^"]*"|\S+='[^']*'|\S+/g),
                obfuscatedAttrs = attrArray.map(attr => {

                    const
                        randomBefore = getRandomString(getRandomNumber(5, 7)),
                        randomAfter = getRandomString(getRandomNumber(5, 7));

                    return `${randomBefore} ${attr} ${randomAfter}`;
                }).join(' ');

            return `<${tagName} ${obfuscatedAttrs}>`;
        });
    } catch (error) {
        handleError(`Obfuscating HTML failed: ${error.message}`);
    }
}

function removeCssComments(content) {
    try {
        return content.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\//g, (match, quotedString) => {
            if (quotedString) {
                return quotedString;
            }

            return String();
        });
    } catch (error) {
        handleError(`Removing CSS comments failed: ${error.message}`);
    }
}

function minifyCss(content) {
    try {
        const patterns = [
            [/\s*([{}:;,\n])\s*/g, '$1'],
            [/\s+/g, ' '],
            [/;}/g, '}']
        ];

        content = removeCssComments(content);
        for (const [pattern, replacement] of patterns) {
            content = content.replace(pattern, replacement);
        }

        return content.trim();
    } catch (error) {
        handleError(`Minifying CSS failed: ${error.message}`);
    }
}

const obfuscationPreset = {
    compact: true,
    controlFlowFlattening: true,
    deadCodeInjection: true,
    debugProtection: false,
    renameGlobals: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 1
};

function obfuscateAndMinifyInlineScripts(html, obfuscate) {
    try {
        return html.replace(/<script\b(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi, (match, code) => {
            try {
                let processedCode = code;
                if (obfuscate) {
                    processedCode = JavaScriptObfuscator.obfuscate(code, obfuscationPreset).getObfuscatedCode();
                }

                const minified = UglifyJS.minify(processedCode, {
                    mangle: true,
                    compress: {
                        passes: 5,
                        drop_console: true
                    }
                }).code;

                if (minified) {
                    return `<script>${minified}</script>`;
                }
                throw new Error('Minification failed.');
            } catch (error) {
                console.error(`${colors.fg.red}Error processing inline script: ${error.message}${colors.reset}`);
                return match;
            }
        });
    } catch (error) {
        handleError(`Obfuscating and minifying inline scripts failed: ${error.message}`);
    }
}

function obfuscateAndMinifyJs(content, obfuscate) {
    try {
        let processedContent = content;
        if (obfuscate) {
            processedContent = JavaScriptObfuscator.obfuscate(content, obfuscationPreset).getObfuscatedCode();
        }

        const minifiedContent = UglifyJS.minify(processedContent, {
            mangle: true,
            compress: {
                passes: 3,
                drop_console: true
            }
        }).code;

        if (minifiedContent === undefined) throw new Error("Minification failed.");
        return minifiedContent;
    } catch (error) {
        handleError(`Obfuscating and minifying JS failed: ${error.message}`);
    }
}

function minifyFile(file, outputDir, obfuscate = false, smart = false) {
    try {
        const
            ext = path.extname(file),
            outputFilePath = path.join(outputDir, path.relative(process.argv[2], file));

        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });

        let content = fs.readFileSync(file, 'utf8'),
            minifiedContent;

        if (smart && (ext === '.js' || ext === '.css')) {
            if (path.basename(file).endsWith('min' + ext) ||
                (content.length > 250 && !content.includes('\n'))) {
                console.log(`${colors.fg.brightBlack}Copied:${colors.reset} ${file} -> ${outputFilePath} ${colors.fg.brightBlack}(skipped)${colors.reset}`);
                fs.copyFileSync(file, outputFilePath);
                return;
            }
        }

        switch (ext) {
            case '.js':
                minifiedContent = obfuscateAndMinifyJs(content, obfuscate);
                break;
            case '.css':
                content = removeCssComments(content);
                minifiedContent = minifyCss(content);
                break;
            case '.html':
            case '.htm':
                if (obfuscate) {
                    content = obfuscateHtml(content);
                }
                content = obfuscateAndMinifyInlineScripts(content, obfuscate);
                minifiedContent = minifyHtml(content);
                break;
            default:
                fs.copyFileSync(file, outputFilePath);
                console.log(`${colors.fg.brightBlue}Copied:${colors.reset} ${file} -> ${outputFilePath}`);
                return;
        }
        fs.writeFileSync(outputFilePath, minifiedContent, 'utf8');
        console.log(`${colors.fg.green}Compiled:${colors.reset} ${file} -> ${outputFilePath}`);
    } catch (error) {
        console.error(`${colors.fg.red}Error processing ${file}: ${error.message}${colors.reset}`);
        fs.copyFileSync(file, path.join(outputDir, path.relative(process.argv[2], file)));
        console.log(`${colors.fg.yellow}Copied without minification due to error:${colors.reset} ${file} -> ${path.join(outputDir, path.relative(process.argv[2], file))}`);
        process.exit(1);
    }
}

function printFileStats(files, obfuscate) {
    try {
        const
            totalFiles = files.length,
            skippedFiles = files.filter(file => !['.js', '.css', '.html', '.htm'].includes(path.extname(file))).length,
            processedFiles = totalFiles - skippedFiles;

        console.log(`Source files detected: ${colors.fg.brightCyan}${processedFiles}${colors.reset}\n` +
            `Resource files detected: ${colors.fg.brightYellow}${skippedFiles}${colors.reset}\n`);

        console.log("Compilation mode: " + (obfuscate ? `${colors.bg.brightMagenta}${colors.fg.white}DRM protection${colors.reset}` : `${colors.bg.yellow}${colors.fg.black}Preprocess only${colors.reset}`) + "\n");
    } catch (error) {
        handleError(`Printing file stats failed: ${error.message}`);
    }
}

function validateDirectories(inputDir, outputDir) {
    if (!fs.existsSync(inputDir)) {
        handleError(`Input directory does not exist: ${inputDir}`);
    }

    if (!fs.existsSync(outputDir)) {
        try {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`${colors.fg.green}Output directory created:${colors.reset} ${outputDir}`);
        } catch (error) {
            handleError(`Failed to create output directory: ${error.message}`);
        }
    }
}

function checkDependencies() {
    try {
        require.resolve('uglify-js');
        require.resolve('javascript-obfuscator');
    } catch (error) {
        handleError(`Missing dependency: ${error.message}`);
    }
}

function checkFilePermissions(file) {
    try {
        fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
        handleError(`Insufficient permissions for file: ${file}`);
    }
}

function checkEmptyDirectory(files, inputDir) {
    if (files.length === 0) {
        handleError(`Input directory is empty: ${inputDir}`);
    }
}

function validateArguments(inputDir, outputDir, args) {
    const allowedFlags = ['-d', '-s', '-v', '-h', '--drm', '--smart', '--version', '--help'];

    args.forEach(arg => {
        if (!allowedFlags.includes(arg) && !path.isAbsolute(arg) && !fs.existsSync(arg)) {
            handleError(`Invalid flag detected: ${arg}`);
        }
    });
}


function main() {
    try {
        const { inputDir, outputDir, obfuscate, smart } = parseArguments();

        validateDirectories(inputDir, outputDir);
        checkDependencies();
        validateArguments(inputDir, outputDir, process.argv.slice(2));

        const files = getAllFiles(inputDir);
        checkEmptyDirectory(files, inputDir);
        printFileStats(files, obfuscate);

        files.forEach(file => {
            checkFilePermissions(file);
            minifyFile(file, outputDir, obfuscate, smart);
        });

        console.log(`\n${colors.bg.brightGreen}${colors.fg.black}[Done!]${colors.reset} The web application files are compiled${obfuscate ? " and protected" : ""}.`);
    } catch (error) {
        handleError(`Fatal error: ${error.message}`);
    }
}

main();