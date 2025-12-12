const LIMITS = {
  TYPE_MAX_LENGTH: 127,
  SUBTYPE_MAX_LENGTH: 127,
  PARAMETER_NAME_MAX_LENGTH: 127,
  PARAMETER_VALUE_MAX_LENGTH: 1024,
  MAX_PARAMETERS: 10,
} as const;

const TOKEN_CHAR = '[!#$%&\'*+\\-.0-9A-Z^_`a-z|~]';
const TOKEN = `${TOKEN_CHAR}+`;
const QUOTED_PAIR = '\\\\[\\t !-~]';
const QDTEXT = '[\\t !#-\\[\\]-~]';
const QUOTED_STRING = `"(?:${QDTEXT}|${QUOTED_PAIR})*"`;
const PARAMETER_VALUE = `(?:${TOKEN}|${QUOTED_STRING})`;

const PARAMETER_REGEX = new RegExp(
  `\\s*;\\s*(${TOKEN})=(${PARAMETER_VALUE})`,
  'gi',
);
const TOKEN_REGEX = new RegExp(`^${TOKEN}$`);
const BASIC_FORMAT_REGEX = /^([^/\s]+)\/([^;\s]+)(.*)$/;
const INVALID_CHARS_REGEX = /[\r\n\u0000]/; // eslint-disable-line

interface ContentTypeInfo {
  type: string;
  subtype: string;
  parameters: Record<string, string>;
  charset?: string;
  boundary?: string;
}

type ValidationResult = ValidationError | ValidationSuccess;

interface ValidationError {
  valid: false;
  reason: string;
}

interface ValidationSuccess {
  valid: true;
  contentType: ContentTypeInfo;
}

function createError(reason: string): ValidationError {
  return { valid: false, reason };
}

function createSuccess(contentType: ContentTypeInfo): ValidationSuccess {
  return { valid: true, contentType };
}

function unquoteString(value: string): string {
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    return value.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return value;
}

function normalizeToken(token: string): string {
  return token.toLowerCase();
}

function validateTypeSubtype(type: string, subtype: string): string | null {
  if (type.length > LIMITS.TYPE_MAX_LENGTH) {
    return 'type too long (>127)';
  }
  if (subtype.length > LIMITS.SUBTYPE_MAX_LENGTH) {
    return 'subtype too long (>127)';
  }
  if (!TOKEN_REGEX.test(type)) {
    return 'invalid type format';
  }
  if (!TOKEN_REGEX.test(subtype)) {
    return 'invalid subtype format';
  }
  return null;
}

interface ParseParametersResult {
  parameters: Record<string, string>;
  error?: string;
}

function parseParameters(value: string): ParseParametersResult {
  const parameters: Record<string, string> = {};

  if (!value || value.trim().length === 0) {
    return { parameters };
  }

  const matches = Array.from(value.matchAll(PARAMETER_REGEX));

  if (matches.length > LIMITS.MAX_PARAMETERS) {
    return { parameters, error: 'too many parameters (>10)' };
  }

  for (const match of matches) {
    const name = normalizeToken(match[1]!);
    const rawValue = match[2];

    if (name.length > LIMITS.PARAMETER_NAME_MAX_LENGTH) {
      return { parameters, error: 'parameter name too long (>127)' };
    }

    const paramValue = unquoteString(rawValue!);

    if (paramValue.length > LIMITS.PARAMETER_VALUE_MAX_LENGTH) {
      return { parameters, error: 'parameter value too long (>1024)' };
    }

    if (parameters[name]) {
      return { parameters, error: `duplicate parameter: ${name}` };
    }

    parameters[name] = paramValue;
  }

  return { parameters };
}

export default function validateContentType(value: string): ValidationResult {
  if (!value || value.trim().length === 0) {
    return createError('empty content-type');
  }

  if (INVALID_CHARS_REGEX.test(value)) {
    return createError('contains CR/LF or NUL');
  }

  const basicMatch = BASIC_FORMAT_REGEX.exec(value.trim());
  if (!basicMatch) {
    return createError('invalid format (expected type/subtype)');
  }

  const [, rawType, rawSubtype, parametersPart] = basicMatch;
  const type = normalizeToken(rawType!);
  const subtype = normalizeToken(rawSubtype!);

  const typeError = validateTypeSubtype(type, subtype);
  if (typeError) {
    return createError(typeError);
  }

  const { parameters, error } = parseParameters(parametersPart ?? '');
  if (error) {
    return createError(error);
  }

  const contentTypeInfo: ContentTypeInfo = {
    type,
    subtype,
    parameters,
  };

  const charset = parameters.charset;
  if (charset !== undefined) {
    contentTypeInfo.charset = charset;
  }

  const boundary = parameters.boundary;
  if (boundary !== undefined) {
    contentTypeInfo.boundary = boundary;
  }

  return createSuccess(contentTypeInfo);
}
