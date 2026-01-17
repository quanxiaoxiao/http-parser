import isValidPort from './isValidPort.js';
import {
  parseInteger,
} from './number.js';

const LIMITS = {
  PORT_MAX: 65535,
  PORT_MIN: 1,
  HOST_MAX_LENGTH: 255,
  LABEL_MAX_LENGTH: 63,
  IPV6_MAX_LENGTH: 45,
  IPV4_MAX_OCTET: 255,
} as const;

const IPV4_PART = '(?:\\d{1,3})';
const IPV4_REGEX = `(?:${IPV4_PART}\\.){3}${IPV4_PART}`;

const IPV6_SEGMENT = '[0-9A-Fa-f]{1,4}';
const PCT_ENCODED = '%[0-9A-Fa-f]{2}';
const REG_NAME_CHAR = `(?:[A-Za-z0-9\\-._~!$&'()*+,;=]|${PCT_ENCODED})`;
const REG_NAME_REGEX = `${REG_NAME_CHAR}+`;

const IPV6_PATTERNS = [
  `(?:${IPV6_SEGMENT}:){7}${IPV6_SEGMENT}`,
  `(?:${IPV6_SEGMENT}:){1,7}:`,
  `(?:${IPV6_SEGMENT}:){1,6}:${IPV6_SEGMENT}`,
  `(?:${IPV6_SEGMENT}:){1,5}(?::${IPV6_SEGMENT}){1,2}`,
  `(?:${IPV6_SEGMENT}:){1,4}(?::${IPV6_SEGMENT}){1,3}`,
  `(?:${IPV6_SEGMENT}:){1,3}(?::${IPV6_SEGMENT}){1,4}`,
  `(?:${IPV6_SEGMENT}:){1,2}(?::${IPV6_SEGMENT}){1,5}`,
  `${IPV6_SEGMENT}:(?:(?::${IPV6_SEGMENT}){1,6})`,
  `:(?:(?::${IPV6_SEGMENT}){1,7}|:)`,
  `fe80:(?::${IPV6_SEGMENT}){0,4}%[0-9A-Za-z]{1,}`,
  `::(?:ffff:(?:${IPV4_PART}\\.){3}${IPV4_PART})`,
  `(?:${IPV6_SEGMENT}:){1,4}:(?:${IPV4_PART}\\.){3}${IPV4_PART}`,
];

const HOST_REGEX = new RegExp(
  '^(?:' +
    `\\[(${IPV6_PATTERNS.join('|')})\\]` +
    `|(${IPV4_REGEX})` +
    `|(${REG_NAME_REGEX})` +
  ')(?::(\\d{1,5}))?$',
);

type HostType = 'ipv4' | 'ipv6' | 'reg-name';

interface ValidationResult {
  valid: boolean;
  host?: string;
  reason?: string;
  type?: HostType;
  port?: number | undefined;
}

interface ValidationError {
  valid: false;
  reason: string;
}

interface ValidationSuccess {
  valid: true;
  type: HostType;
  host: string;
  port?: number | undefined;
}

function createError(reason: string): ValidationError {
  return { valid: false, reason };
}

function createSuccess(type: HostType, host: string, port?: number): ValidationSuccess {
  return { valid: true, type, host, port };
}

function validateIPv4(ipv4: string, port?: number): ValidationResult {
  const octets = ipv4.split('.');
  for (const octet of octets) {
    if (Number(octet) > LIMITS.IPV4_MAX_OCTET) {
      return createError('ipv4 octet > 255');
    }
  }
  return createSuccess('ipv4', ipv4, port);
}

function validateIPv6(ipv6: string, port?: number): ValidationResult {
  if (ipv6.length > LIMITS.IPV6_MAX_LENGTH) {
    return createError('ipv6 literal too long');
  }
  return createSuccess('ipv6', ipv6, port);
}

function validateRegName(regname: string, port?: number): ValidationResult {
  if (regname.length > LIMITS.HOST_MAX_LENGTH) {
    return createError('host name too long (>255)');
  }
  const labels = regname.split('.');
  if (labels.every((label) => new RegExp(`^${IPV4_PART}$`).test(label))) {
    return createError('invalid domain: numeric labels without a top-level domain are not valid hostnames');
  }
  for (const label of labels) {
    if (label.length === 0) {
      return createError('empty label / trailing dot not allowed');
    }
    if (label.length > LIMITS.LABEL_MAX_LENGTH) {
      return createError('label too long (>63)');
    }
    if (/^-|-$/.test(label)) {
      return createError('label starts/ends with hyphen');
    }
    if (!/^(?!-)[A-Za-z0-9-_]{1,63}(?<!-)$/.test(label)) {
      return createError('invalid domain label: only letters, digits, and hyphens are allowed');
    }
  }
  return createSuccess('reg-name', regname, port);
}

export default function validateHost(value: string): ValidationResult {
  if (/[\r\n\u0000]/.test(value)) { // eslint-disable-line
    return createError('contains CR/LF or NUL');
  }
  if (value !== value.trim()) {
    return createError('leading/trailing whitespace not allowed');
  }
  const matches = HOST_REGEX.exec(value);
  if (!matches) {
    return createError('syntax mismatch (not IPv6/IPv4/reg-name with optional port)');
  }
  const [, ipv6, ipv4, regname, portStr] = matches;
  let port: number | undefined;
  if (portStr) {
    if (!isValidPort(portStr)) {
      return createError('port out of range (1-65535)');
    }
    port = parseInteger(portStr)!;
  }
  if (ipv4) {
    return validateIPv4(ipv4, port);
  }
  if (ipv6) {
    return validateIPv6(ipv6, port);
  }
  if (regname) {
    return validateRegName(regname, port);
  }
  return createError('unknown parsing failure');
}
