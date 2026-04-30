/**
 * IP allowlist middleware — optional hardening for /api/* routes.
 *
 * Reads a comma-separated list of CIDR blocks from config.allowedIps.
 * If the list is empty/unset, the middleware is a passthrough (backward
 * compat). If set, every request is checked against the list — IPs not in
 * the list get 403 Forbidden.
 *
 * Typical use: restrict the API to the lab LAN subnet (e.g. 10.0.0.0/8)
 * or to the machine itself (127.0.0.1/32). Blocks external probers,
 * crypto-miner scans, and random port crawls that reach the machine
 * despite firewall misconfig.
 *
 * Uses Node's built-in `net.BlockList` — no extra dependencies.
 *
 * Example:
 *   ALLOWED_IPS=127.0.0.1,10.0.0.0/8,192.168.1.0/24
 */
'use strict';

const { BlockList } = require('net');
const config = require('../config');

function buildBlockList(cidrs) {
  if (!cidrs || typeof cidrs !== 'string' || !cidrs.trim()) return null;
  const list = new BlockList();
  for (const raw of cidrs.split(',').map(s => s.trim()).filter(Boolean)) {
    const [addr, prefixStr] = raw.split('/');
    const type = addr.includes(':') ? 'ipv6' : 'ipv4';
    if (prefixStr !== undefined) {
      const prefix = parseInt(prefixStr, 10);
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > (type === 'ipv6' ? 128 : 32)) {
        console.error(`[ipAllowlist] invalid CIDR prefix: "${raw}" — skipped`);
        continue;
      }
      try {
        list.addSubnet(addr, prefix, type);
      } catch (err) {
        console.error(`[ipAllowlist] failed to add subnet "${raw}": ${err.message}`);
      }
    } else {
      try {
        list.addAddress(addr, type);
      } catch (err) {
        console.error(`[ipAllowlist] failed to add address "${raw}": ${err.message}`);
      }
    }
  }
  return list;
}

const allowlist = buildBlockList(config.allowedIps);
if (allowlist && config.allowedIps) {
  console.log(`[ipAllowlist] restricted to: ${config.allowedIps}`);
}

function ipAllowlist(req, res, next) {
  if (!allowlist) return next();

  // req.ip with trust-proxy disabled gives the direct socket address.
  // Node's IPv4-mapped IPv6 form is "::ffff:a.b.c.d" — unwrap for v4 check.
  let ip = req.ip || req.socket?.remoteAddress || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  const type = ip.includes(':') ? 'ipv6' : 'ipv4';

  if (allowlist.check(ip, type)) return next();

  // Minimal logging — don't blow up the error log on a flood of probes,
  // but do leave breadcrumbs so we notice real scans.
  console.warn(`[ipAllowlist] denied: ${ip} ${req.method} ${req.originalUrl}`);
  return res.status(403).json({ error: 'Access denied from this IP address' });
}

module.exports = ipAllowlist;
