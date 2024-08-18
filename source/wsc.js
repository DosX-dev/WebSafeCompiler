const
    fs = require('fs'),
    path = require('path'),
    UglifyJS = require('uglify-js'),
    JavaScriptObfuscator = require('javascript-obfuscator'),
    { fileURLToPath } = require('url');

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

const obfuscationPreset = {
        compact: true,
        controlFlowFlattening: true,
        deadCodeInjection: true,
        debugProtection: false,
        renameGlobals: false,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 1,
        identifiersPrefix: 'wsc_',
        identifierNamesGenerator: 'mangled-shuffled'
    },
    minificationPreset = {
        mangle: true,
        compress: {
            passes: 5,
            drop_console: false
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

function validateArguments(inputDir, outputDir, args) {
    const allowedFlags = ['-d', '-s', '-v', '-h', '--drm', '--smart', '--version', '--help'];

    args.forEach(arg => {
        if (!allowedFlags.includes(arg) && !path.isAbsolute(arg) && !fs.existsSync(arg)) {
            handleError(`Invalid flag detected: ${arg}`);
        }
    });
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

            const attrArray = attributes.trim().match(/\S+="[^"]*"|\S+='[^']*'|\S+/g);

            const obfuscatedAttrs = attrArray.map(attr => {
                let obfuscatedAttr = attr;

                if (/^class=['"]/.test(attr)) {
                    const
                        classNames = attr.match(/class=['"]([^'"]*)['"]/)[1].split(/\s+/),
                        obfuscatedClasses = classNames.map(className => className),
                        randomClasses = Array.from({ length: getRandomNumber(1, 3) }, () =>
                            getRandomString(getRandomNumber(6, 7))
                        );

                    obfuscatedAttr = `class="${[...obfuscatedClasses, ...randomClasses].join(' ')}"`;
                }

                const
                    randomBefore = getRandomString(getRandomNumber(5, 7)),
                    randomAfter = getRandomString(getRandomNumber(5, 7));

                return `${randomBefore} ${obfuscatedAttr} ${randomAfter}`;
            }).join(' ');

            return `<${tagName} ${obfuscatedAttrs}${closingSlash ? ' /' : ''}>`;
        });
    } catch (error) {
        handleError(`Obfuscating HTML failed: ${error.message}`);
    }
}

// Remove HTML comments
function removeHtmlComments(content) {
    return content.replace(/<!--[\s\S]*?-->/g, '');
}

// Remove HTML comments and handle script/style tags
function removeHtmlComments(content) {
    let inScript = false,
        inStyle = false;

    return content.replace(/(?:<script[\s\S]*?>[\s\S]*?<\/script>)|(?:<style[\s\S]*?>[\s\S]*?<\/style>)|<!--[\s\S]*?-->/g, (match, offset, string) => {
        if (match.startsWith('<script') || inScript) {
            inScript = !inScript; // Toggle inScript flag
            return match;
        }
        if (match.startsWith('<style') || inStyle) {
            inStyle = !inStyle; // Toggle inStyle flag
            return match;
        }
        return ''; // Remove HTML comments
    });
}

// Minify HTML content
function minifyHtml(content) {
    try {
        const tagsToPreserve = ['pre', 'textarea', 'code']; // Tags to preserve formatting

        let isInPreservedTag = false,
            isInSingleQuote = false,
            isInDoubleQuote = false;

        content = removeHtmlComments(content); // Remove comments first

        return content.replace(/<[^>]+>|[^<]+|(['"])(?:(?=(\\?))\2.)*?\1/g, (match, quote, escapeChar) => {
            if (quote) {
                if (escapeChar) return match; // Preserve quoted strings with escape characters
                isInSingleQuote = !isInSingleQuote && quote === "'";
                isInDoubleQuote = !isInDoubleQuote && quote === '"';
                return match;
            }

            if (match.startsWith('<')) {
                const tagName = match.replace(/[<\/>]/g, '').split(' ')[0];
                if (tagsToPreserve.includes(tagName)) {
                    isInPreservedTag = match.startsWith('</') ? false : true; // Toggle preserved tag flag
                    return match;
                }
                if (!isInPreservedTag) {
                    return match.replace(/\s+/g, ' ').trim(); // Minify non-preserved tags
                }
            }

            if (!isInPreservedTag) {
                return match
                    .replace(/(\r\n|\n|\r)/g, '') // Remove all types of newlines
                    .replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space
            }

            return match;
        }).replace(/\n/g, String());
    } catch (error) {
        handleError(`Minifying HTML failed: ${error.message}`);
    }
}

// Remove CSS comments
function removeCssComments(content) {
    try {
        return content.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\//g, (match, quotedString) => {
            if (quotedString) {
                return quotedString; // Preserve quoted strings
            }

            return String(); // Remove CSS comments
        });
    } catch (error) {
        handleError(`Removing CSS comments failed: ${error.message}`);
    }
}

// Minify CSS content
function minifyCss(content) {
    try {
        const patterns = [
            [/\s*([{}:;,\n])\s*/g, '$1'], // Remove space around special characters
            [/\s+/g, ' '], // Reduce multiple spaces to single space
            [/;}/g, '}'] // Remove redundant semicolons before closing brace
        ];

        content = removeCssComments(content); // Remove comments first
        for (const [pattern, replacement] of patterns) {
            content = content.replace(pattern, replacement); // Apply patterns
        }

        return content.trim(); // Trim leading and trailing spaces
    } catch (error) {
        handleError(`Minifying CSS failed: ${error.message}`);
    }
}

// Obfuscate and minify inline <script> tags in HTML
function obfuscateAndMinifyInlineScripts(html, obfuscate) {
    try {
        return html.replace(/<script\b(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi, (match, code) => {
            try {
                let processedCode = code;
                if (obfuscate) {
                    // Obfuscate the JavaScript code if needed
                    processedCode = JavaScriptObfuscator.obfuscate(code, obfuscationPreset).getObfuscatedCode();
                }

                // Minify the (possibly obfuscated) JavaScript code
                const minified = UglifyJS.minify(processedCode, minificationPreset).code;

                if (minified) {
                    return `<script>${minified}</script>`; // Replace the script with minified code
                }
                throw new Error('Minification failed.');
            } catch (error) {
                console.error(`${colors.fg.red}Error processing inline script: ${error.message}${colors.reset}`);
                return match; // Return original script if an error occurs
            }
        });
    } catch (error) {
        handleError(`Obfuscating and minifying inline scripts failed: ${error.message}`);
    }
}

// Obfuscate and minify JavaScript content
function obfuscateAndMinifyJs(content, obfuscate) {
    try {
        let processedContent = content;
        if (obfuscate) {
            // Obfuscate the JavaScript content if needed
            processedContent = JavaScriptObfuscator.obfuscate(content, obfuscationPreset).getObfuscatedCode();
        }

        // Minify the (possibly obfuscated) JavaScript content
        const minifiedContent = UglifyJS.minify(processedContent, minificationPreset).code;

        if (minifiedContent === undefined) throw new Error("Minification failed.");
        return minifiedContent;
    } catch (error) {
        handleError(`Obfuscating and minifying JS failed: ${error.message}`);
    }
}

// Minify a file based on its extension and options
function minifyFile(file, outputDir, obfuscate = false, smart = false) {
    try {
        const
            ext = path.extname(file),
            outputFilePath = path.join(outputDir, path.relative(process.argv[2], file));

        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });

        let content = fs.readFileSync(file, 'utf8'),
            minifiedContent;

        if (smart && (ext === '.js' || ext === '.css')) {
            // Skip minification for already minified files or very compact files
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
                content = removeCssComments(content); // Remove CSS comments before minifying
                minifiedContent = minifyCss(content);
                break;
            case '.html':
            case '.htm':
                if (obfuscate) {
                    content = obfuscateHtml(content); // Obfuscate HTML content if needed
                }
                content = obfuscateAndMinifyInlineScripts(content, obfuscate); // Minify inline scripts
                minifiedContent = minifyHtml(content);
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
        fs.copyFileSync(file, path.join(outputDir, path.relative(process.argv[2], file))); // Copy file in case of an error
        console.log(`${colors.fg.yellow}Copied without minification due to error:${colors.reset} ${file} -> ${path.join(outputDir, path.relative(process.argv[2], file))}`);
        process.exit(1);
    }
}

// Print statistics about the files processed
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