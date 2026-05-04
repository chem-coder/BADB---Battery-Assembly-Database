#!/usr/bin/env node

/**
 * Verifies that the vanilla public UI fetch() surface is represented in
 * contracts/vanilla_api_endpoints.json and that the contracted endpoints still
 * have matching Express routes.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTRACT_FILE = path.join(ROOT, 'contracts', 'vanilla_api_endpoints.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PUBLIC_JS_DIR = path.join(ROOT, 'public', 'js');
const ROUTES_INDEX = path.join(ROOT, 'routes', 'index.js');

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function usage() {
  console.log(`
BADB vanilla API contract checker

Usage:
  node scripts/check_vanilla_api_contract.js
  node scripts/check_vanilla_api_contract.js --print-current

Options:
  --print-current  Print a contract skeleton from current public/js fetch calls
`);
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function walkJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

function walkHtmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtmlFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out.sort();
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function skipString(text, index, quote) {
  let i = index + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return i;
}

function skipTemplate(text, index) {
  let i = index + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') return i + 1;
    i += 1;
  }
  return i;
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = skipString(text, i, ch) - 1;
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(text, i) - 1;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelArgs(text) {
  const args = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = skipString(text, i, ch) - 1;
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(text, i) - 1;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth -= 1;
    else if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth -= 1;
    else if (ch === '[') bracketDepth += 1;
    else if (ch === ']') bracketDepth -= 1;
    else if (
      ch === ',' &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = text.slice(start).trim();
  if (tail) args.push(tail);
  return args;
}

function splitConcatParts(text) {
  const parts = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = skipString(text, i, ch) - 1;
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(text, i) - 1;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth -= 1;
    else if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth -= 1;
    else if (ch === '[') bracketDepth += 1;
    else if (ch === ']') bracketDepth -= 1;
    else if (
      ch === '+' &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }

  parts.push(text.slice(start).trim());
  return parts;
}

function parseQuotedLiteral(text) {
  const trimmed = text.trim();
  const quote = trimmed[0];
  if (quote !== "'" && quote !== '"') {
    return null;
  }

  const end = skipString(trimmed, 0, quote);
  if (end !== trimmed.length) return null;

  try {
    if (quote === '"') return JSON.parse(trimmed);
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  } catch {
    return trimmed.slice(1, -1);
  }
}

function replaceTemplateExpressions(content) {
  let out = '';

  for (let i = 0; i < content.length; i += 1) {
    if (content[i] !== '$' || content[i + 1] !== '{') {
      out += content[i];
      continue;
    }

    let depth = 1;
    let j = i + 2;
    while (j < content.length && depth > 0) {
      const ch = content[j];
      if (ch === '"' || ch === "'") {
        j = skipString(content, j, ch);
        continue;
      }
      if (ch === '`') {
        j = skipTemplate(content, j);
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      j += 1;
    }

    const before = out[out.length - 1] || '';
    const after = content[j] || '';
    const isQueryPlaceholder = before === '?' || (before && before !== '/' && after !== '/');
    out += isQueryPlaceholder ? ':query' : ':param';
    i = j - 1;
  }

  return normalizeEndpointPath(out);
}

function normalizeEndpointPath(raw) {
  let endpoint = raw.trim();
  endpoint = endpoint.replace(/\/+/g, '/');
  endpoint = endpoint.replace(/\?:param\b/g, '?:query');
  endpoint = endpoint.replace(/([^?]):query\b/g, '$1?:query');
  endpoint = endpoint.replace(/\?:query\b.*/, '?:query');
  endpoint = endpoint.replace(/:query\b.*/, ':query');
  endpoint = endpoint.replace(/:param(?=$|\?)/g, ':param');
  endpoint = endpoint.replace(/\/$/, endpoint === '/' ? '/' : '');
  return endpoint;
}

function placeholderForConcat(previousLiteral, nextLiteral) {
  const prev = previousLiteral || '';
  const next = nextLiteral || '';
  if (prev.endsWith('?') || (prev && !prev.endsWith('/') && !next.startsWith('/'))) {
    return ':query';
  }
  return ':param';
}

function normalizeUrlExpression(expr) {
  const trimmed = expr.trim();
  const literal = parseQuotedLiteral(trimmed);
  if (literal !== null) {
    return { path: normalizeEndpointPath(literal), variable: null };
  }

  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    return { path: replaceTemplateExpressions(trimmed.slice(1, -1)), variable: null };
  }

  const parts = splitConcatParts(trimmed);
  if (parts.length > 1) {
    let out = '';
    for (let i = 0; i < parts.length; i += 1) {
      const partLiteral = parseQuotedLiteral(parts[i]);
      if (partLiteral !== null) {
        out += partLiteral;
        continue;
      }

      const nextLiteral = i + 1 < parts.length ? parseQuotedLiteral(parts[i + 1]) : '';
      out += placeholderForConcat(out, nextLiteral || '');
    }
    return { path: normalizeEndpointPath(out), variable: null };
  }

  const variableMatch = trimmed.match(/^[A-Za-z_$][\w$]*$/);
  return { path: null, variable: variableMatch ? trimmed : '<dynamic-expression>' };
}

function inferMethod(optionsArg) {
  if (!optionsArg) return 'GET';
  const match = optionsArg.match(/\bmethod\s*:\s*(['"`])([A-Za-z]+)\1/);
  return match ? match[2].toUpperCase() : 'GET';
}

function findEnclosingFunction(text, index) {
  const prefix = text.slice(0, index);
  const patterns = [
    /\basync\s+function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*async\s*\([^)]*\)\s*=>\s*\{/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>\s*\{/g
  ];

  let best = null;
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(prefix)) !== null) {
      if (!best || match.index > best.index) {
        best = { index: match.index, name: match[1] };
      }
    }
  }
  return best?.name || '<top-level>';
}

function findFetchCalls() {
  const calls = [];

  for (const file of walkJsFiles(PUBLIC_JS_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = relative(file);
    const fetchPattern = /\bfetch\s*\(/g;
    let match;

    while ((match = fetchPattern.exec(text)) !== null) {
      const openIndex = text.indexOf('(', match.index);
      const closeIndex = findMatchingParen(text, openIndex);
      if (closeIndex === -1) {
        throw new Error(`Could not parse fetch() call at ${rel}:${lineNumberAt(text, match.index)}`);
      }

      const args = splitTopLevelArgs(text.slice(openIndex + 1, closeIndex));
      const url = normalizeUrlExpression(args[0] || '');
      calls.push({
        source: rel,
        line: lineNumberAt(text, match.index),
        function: findEnclosingFunction(text, match.index),
        method: inferMethod(args[1]),
        path: url.path,
        variable: url.variable
      });
      fetchPattern.lastIndex = closeIndex + 1;
    }
  }

  return calls;
}

function findHtmlScriptReferences() {
  const refs = [];

  for (const file of walkHtmlFiles(PUBLIC_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = relative(file);
    const scriptPattern = /<script\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1[^>]*>/gi;
    let match;

    while ((match = scriptPattern.exec(text)) !== null) {
      const src = match[2];
      if (/^(?:https?:)?\/\//i.test(src)) continue;

      const cleanSrc = src.split(/[?#]/)[0];
      const filePath = cleanSrc.startsWith('/')
        ? path.join(PUBLIC_DIR, cleanSrc.slice(1))
        : path.join(path.dirname(file), cleanSrc);

      refs.push({
        source: rel,
        line: lineNumberAt(text, match.index),
        src,
        filePath
      });
    }
  }

  return refs;
}

function findHtmlLinkReferences() {
  const refs = [];

  for (const file of walkHtmlFiles(PUBLIC_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = relative(file);
    const linkPattern = /<a\b[^>]*\bhref\s*=\s*(['"])([^'"]+)\1[^>]*>/gi;
    let match;

    while ((match = linkPattern.exec(text)) !== null) {
      const href = match[2];
      if (/^(?:https?:)?\/\//i.test(href)) continue;
      if (/^(?:mailto|tel|javascript):/i.test(href)) continue;

      const cleanHref = href.split(/[?#]/)[0];
      if (!cleanHref || cleanHref.startsWith('#')) continue;

      const filePath = cleanHref.startsWith('/')
        ? path.join(PUBLIC_DIR, cleanHref.slice(1))
        : path.join(path.dirname(file), cleanHref);

      refs.push({
        source: rel,
        line: lineNumberAt(text, match.index),
        href,
        filePath
      });
    }
  }

  return refs;
}

function endpointKey(method, endpointPath) {
  return `${method.toUpperCase()} ${endpointPath}`;
}

function groupDiscoveredContract(calls) {
  const endpoints = new Map();
  const dynamicFetches = new Map();

  for (const call of calls) {
    if (call.path) {
      const key = call.path;
      if (!endpoints.has(key)) {
        endpoints.set(key, {
          path: key,
          methods: [],
          auth: 'see route middleware',
          request: 'see route implementation',
          response: 'JSON unless route returns 204 or a report view',
          sources: []
        });
      }
      const endpoint = endpoints.get(key);
      if (!endpoint.methods.includes(call.method)) endpoint.methods.push(call.method);
      if (!endpoint.sources.includes(call.source)) endpoint.sources.push(call.source);
      continue;
    }

    const key = `${call.source}|${call.function}|${call.variable}|${call.method}`;
    if (!dynamicFetches.has(key)) {
      dynamicFetches.set(key, {
        source: call.source,
        function: call.function,
        variable: call.variable,
        methods: [call.method],
        possibleEndpoints: [],
        notes: 'Fill manually: this fetch uses a variable URL.'
      });
    }
  }

  return {
    version: 1,
    scope: 'public/js/**/*.js',
    generatedAt: new Date().toISOString(),
    normalization: {
      pathParams: ':param',
      query: '?:query'
    },
    endpoints: Array.from(endpoints.values()).sort((a, b) => a.path.localeCompare(b.path)),
    dynamicFetches: Array.from(dynamicFetches.values()).sort((a, b) => a.source.localeCompare(b.source))
  };
}

function loadContract() {
  if (!fs.existsSync(CONTRACT_FILE)) {
    throw new Error(`Contract file not found: ${relative(CONTRACT_FILE)}`);
  }
  return JSON.parse(fs.readFileSync(CONTRACT_FILE, 'utf8'));
}

function stripQueryMarker(endpointPath) {
  return endpointPath.replace(/\?:query$/, '');
}

function normalizeRoutePath(endpointPath) {
  return endpointPath
    .replace(/\/+/g, '/')
    .replace(/\/$/, endpointPath === '/' ? '/' : '');
}

function combineRoutePath(prefix, routePath) {
  if (routePath === '/') return normalizeRoutePath(prefix);
  return normalizeRoutePath(`${prefix}/${routePath.replace(/^\//, '')}`);
}

function parseRouteMounts() {
  const text = fs.readFileSync(ROUTES_INDEX, 'utf8');
  const requires = new Map();
  const requirePattern = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*require\(['"]\.\/([^'"]+)['"]\)/g;
  let requireMatch;
  while ((requireMatch = requirePattern.exec(text)) !== null) {
    requires.set(requireMatch[1], requireMatch[2]);
  }

  const mounts = [];
  const mountPattern = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  let mountMatch;
  while ((mountMatch = mountPattern.exec(text)) !== null) {
    const routeName = requires.get(mountMatch[2]);
    if (!routeName) continue;
    mounts.push({
      prefix: mountMatch[1],
      file: path.join(ROOT, 'routes', `${routeName}.js`)
    });
  }

  return mounts;
}

function parseExpressRoutes() {
  const routes = [];
  for (const mount of parseRouteMounts()) {
    if (!fs.existsSync(mount.file)) continue;
    const text = fs.readFileSync(mount.file, 'utf8');
    const routePattern = /router\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;
    let match;
    while ((match = routePattern.exec(text)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: combineRoutePath(mount.prefix, match[3]),
        source: `${relative(mount.file)}:${lineNumberAt(text, match.index)}`
      });
    }
  }
  return routes;
}

function splitSegments(endpointPath) {
  return stripQueryMarker(endpointPath).split('/').filter(Boolean);
}

function routeSegmentsCompatible(contractPath, routePath) {
  const contractSegments = splitSegments(contractPath);
  const routeSegments = splitSegments(routePath);
  if (contractSegments.length !== routeSegments.length) return false;

  for (let i = 0; i < contractSegments.length; i += 1) {
    const contractSegment = contractSegments[i];
    const routeSegment = routeSegments[i];
    if (contractSegment === routeSegment) continue;
    if (contractSegment.startsWith(':') || routeSegment.startsWith(':')) continue;
    return false;
  }
  return true;
}

function validateContract(contract, calls, routes) {
  const failures = [];
  const endpointMap = new Map();
  const dynamicMap = new Map();

  for (const endpoint of contract.endpoints || []) {
    if (!endpoint.path || !endpoint.path.startsWith('/api/')) {
      failures.push(`Invalid endpoint path in contract: ${endpoint.path || '<missing>'}`);
      continue;
    }
    if (!Array.isArray(endpoint.methods) || endpoint.methods.length === 0) {
      failures.push(`Endpoint ${endpoint.path} has no methods`);
      continue;
    }
    if (!Array.isArray(endpoint.sources) || endpoint.sources.length === 0) {
      failures.push(`Endpoint ${endpoint.path} has no sources`);
    }

    for (const method of endpoint.methods) {
      const upper = String(method).toUpperCase();
      if (!HTTP_METHODS.has(upper)) {
        failures.push(`Endpoint ${endpoint.path} has invalid method ${method}`);
        continue;
      }
      const key = endpointKey(upper, endpoint.path);
      if (endpointMap.has(key)) failures.push(`Duplicate endpoint contract: ${key}`);
      endpointMap.set(key, endpoint);
    }

    for (const source of endpoint.sources || []) {
      if (!fs.existsSync(path.join(ROOT, source))) {
        failures.push(`Endpoint ${endpoint.path} references missing source ${source}`);
      }
    }
  }

  for (const dynamic of contract.dynamicFetches || []) {
    const methods = dynamic.methods || [];
    for (const method of methods) {
      dynamicMap.set(
        `${dynamic.source}|${dynamic.function}|${dynamic.variable}|${String(method).toUpperCase()}`,
        dynamic
      );
    }
  }

  for (const call of calls) {
    if (call.path) {
      const key = endpointKey(call.method, call.path);
      const endpoint = endpointMap.get(key);
      if (!endpoint) {
        failures.push(`Uncontracted fetch: ${key} at ${call.source}:${call.line}`);
        continue;
      }
      if (!endpoint.sources.includes(call.source)) {
        failures.push(`Fetch source missing from contract: ${key} at ${call.source}:${call.line}`);
      }
      continue;
    }

    const key = `${call.source}|${call.function}|${call.variable}|${call.method}`;
    const dynamic = dynamicMap.get(key);
    if (!dynamic) {
      failures.push(
        `Uncontracted dynamic fetch(${call.variable}) in ${call.function} at ${call.source}:${call.line}`
      );
      continue;
    }

    if (!Array.isArray(dynamic.possibleEndpoints) || dynamic.possibleEndpoints.length === 0) {
      failures.push(`Dynamic fetch ${key} has no possibleEndpoints`);
      continue;
    }

    for (const possibleEndpoint of dynamic.possibleEndpoints) {
      const possibleKey = endpointKey(call.method, possibleEndpoint);
      const endpoint = endpointMap.get(possibleKey);
      if (!endpoint) {
        failures.push(`Dynamic fetch ${key} references uncontracted endpoint ${possibleKey}`);
      } else if (!endpoint.sources.includes(call.source)) {
        failures.push(`Dynamic endpoint source missing from contract: ${possibleKey} via ${key}`);
      }
    }
  }

  for (const [key, endpoint] of endpointMap.entries()) {
    const [method, endpointPath] = key.split(' ');
    const matchesRoute = routes.some((route) => (
      route.method === method &&
      routeSegmentsCompatible(endpointPath, route.path)
    ));
    if (!matchesRoute) {
      const allowMissingRoute = Array.isArray(endpoint.contractOnlyReasons) &&
        endpoint.contractOnlyReasons.includes('dynamic-route-family');
      if (!allowMissingRoute) failures.push(`No matching Express route for contracted endpoint: ${key}`);
    }
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  const calls = findFetchCalls();
  if (args.includes('--print-current')) {
    console.log(JSON.stringify(groupDiscoveredContract(calls), null, 2));
    return;
  }

  const contract = loadContract();
  const routes = parseExpressRoutes();
  const failures = validateContract(contract, calls, routes);
  const scriptRefs = findHtmlScriptReferences();
  const linkRefs = findHtmlLinkReferences();

  for (const ref of scriptRefs) {
    if (!fs.existsSync(ref.filePath)) {
      failures.push(`Missing script source ${ref.src} referenced at ${ref.source}:${ref.line}`);
    }
  }

  for (const ref of linkRefs) {
    if (!fs.existsSync(ref.filePath)) {
      failures.push(`Missing link target ${ref.href} referenced at ${ref.source}:${ref.line}`);
    }
  }

  if (failures.length > 0) {
    console.error('[contract] FAIL');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  const endpointCount = (contract.endpoints || []).reduce(
    (sum, endpoint) => sum + (endpoint.methods || []).length,
    0
  );
  const dynamicCount = (contract.dynamicFetches || []).length;
  console.log(
    `[contract] PASS: ${calls.length} fetch call(s), ${endpointCount} endpoint method contract(s), ` +
    `${dynamicCount} dynamic fetch contract(s), ${routes.length} Express route(s), ` +
    `${scriptRefs.length} HTML script reference(s), ${linkRefs.length} HTML link reference(s)`
  );
}

main();
