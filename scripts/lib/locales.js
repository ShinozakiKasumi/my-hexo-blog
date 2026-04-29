'use strict';

const localeMap = require('../../source/_data/locales.json');

const LOCALES = Object.values(localeMap);
const DEFAULT_LOCALE = localeMap.en;
const LOCALE_PREFERENCE_KEY = 'akari_locale_preference';
const LOCALE_PATHS = new Set(LOCALES.map(locale => locale.lang_path));

function stripIndexHtml(routePath) {
  return String(routePath || '').replace(/index\.html$/i, '');
}

function normalizeRoutePath(routePath) {
  let normalized = stripIndexHtml(routePath).trim();
  if (!normalized) {
    return '/';
  }

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/{2,}/g, '/');

  if (normalized !== '/' && !normalized.endsWith('/')) {
    normalized += '/';
  }

  return normalized;
}

function toAbsoluteUrl(siteUrl, routePath) {
  return new URL(normalizeRoutePath(routePath), siteUrl).toString();
}

function getLocaleByLang(lang) {
  if (!lang) return null;

  const direct = localeMap[lang];
  if (direct) return direct;

  const lowered = String(lang).toLowerCase();

  return LOCALES.find(locale => locale.lang.toLowerCase() === lowered) || null;
}

function getLocaleByPath(langPath) {
  if (!langPath) return null;

  const lowered = String(langPath).toLowerCase();

  return LOCALES.find(locale => locale.lang_path === lowered) || null;
}

function getLocaleFromRoutePath(routePath) {
  const firstSegment = String(routePath || '')
    .replace(/^\/+/, '')
    .split('/')[0]
    .toLowerCase();

  return getLocaleByPath(firstSegment);
}

function normalizeLanguageTag(languageTag) {
  return String(languageTag || '')
    .trim()
    .replace(/_/g, '-')
    .toLowerCase();
}

function matchesBrowserLanguagePattern(pattern, normalizedLanguageTag) {
  const normalizedPattern = normalizeLanguageTag(pattern);
  if (!normalizedPattern || !normalizedLanguageTag) return false;

  if (normalizedPattern.endsWith('*')) {
    const prefix = normalizedPattern.slice(0, -1);
    return prefix ? normalizedLanguageTag.startsWith(prefix) : false;
  }

  return normalizedPattern === normalizedLanguageTag;
}

function resolveLocalePreference(preference) {
  if (!preference) return null;

  const normalizedPreference = String(preference).trim().toLowerCase();
  if (!LOCALE_PATHS.has(normalizedPreference)) {
    return null;
  }

  return getLocaleByPath(normalizedPreference);
}

function resolveLocaleFromBrowserLanguages(languages) {
  const candidates = Array.isArray(languages) ? languages : [languages];

  for (const candidate of candidates) {
    const normalizedLanguageTag = normalizeLanguageTag(candidate);
    if (!normalizedLanguageTag) continue;

    const locale = LOCALES.find(entry =>
      (entry.browser_lang_patterns || []).some(pattern =>
        matchesBrowserLanguagePattern(pattern, normalizedLanguageTag)
      )
    );

    if (locale) {
      return locale;
    }
  }

  return DEFAULT_LOCALE;
}

function resolveLocaleFromPage(page) {
  if (!page) return DEFAULT_LOCALE;

  return getLocaleByLang(page.lang)
    || getLocaleByPath(page.lang_path)
    || getLocaleFromRoutePath(page.current_url || page.canonical_path || page.path)
    || DEFAULT_LOCALE;
}

function homePath(locale) {
  return normalizeRoutePath(locale.lang_path);
}

function archivePath(locale) {
  return normalizeRoutePath(`${locale.lang_path}/archives`);
}

function aboutPath(locale) {
  return normalizeRoutePath(`${locale.lang_path}/about`);
}

function buildLocaleRoutingData(baseUrlResolver) {
  const resolveUrl = typeof baseUrlResolver === 'function'
    ? baseUrlResolver
    : value => normalizeRoutePath(value);

  return {
    preferenceKey: LOCALE_PREFERENCE_KEY,
    defaultLocaleKey: DEFAULT_LOCALE.lang_path,
    defaultLocaleHomePath: resolveUrl(homePath(DEFAULT_LOCALE)),
    locales: LOCALES.map(locale => ({
      key: locale.lang_path,
      homePath: resolveUrl(homePath(locale)),
      browserLangPatterns: locale.browser_lang_patterns || []
    }))
  };
}

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_PREFERENCE_KEY,
  getLocaleByLang,
  getLocaleByPath,
  getLocaleFromRoutePath,
  resolveLocalePreference,
  resolveLocaleFromBrowserLanguages,
  resolveLocaleFromPage,
  normalizeLanguageTag,
  normalizeRoutePath,
  stripIndexHtml,
  toAbsoluteUrl,
  homePath,
  archivePath,
  aboutPath,
  buildLocaleRoutingData
};
