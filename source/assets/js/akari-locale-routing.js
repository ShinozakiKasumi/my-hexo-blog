(function(window, document) {
  'use strict';

  var config = window.__AKARI_LOCALE_ROUTING__;

  if (!config || !Array.isArray(config.locales) || !config.preferenceKey) {
    return;
  }

  var localeMap = {};

  config.locales.forEach(function(locale) {
    localeMap[locale.key] = locale;
  });

  function normalizeLanguageTag(languageTag) {
    return String(languageTag || '')
      .trim()
      .replace(/_/g, '-')
      .toLowerCase();
  }

  function normalizeLocaleKey(localeKey) {
    var normalized = normalizeLanguageTag(localeKey);
    return localeMap[normalized] ? normalized : null;
  }

  function matchesBrowserLanguagePattern(pattern, normalizedLanguageTag) {
    var normalizedPattern = normalizeLanguageTag(pattern);

    if (!normalizedPattern || !normalizedLanguageTag) {
      return false;
    }

    if (normalizedPattern.charAt(normalizedPattern.length - 1) === '*') {
      var prefix = normalizedPattern.slice(0, -1);
      return prefix ? normalizedLanguageTag.indexOf(prefix) === 0 : false;
    }

    return normalizedPattern === normalizedLanguageTag;
  }

  function readStoredLocalePreference() {
    try {
      return normalizeLocaleKey(window.localStorage.getItem(config.preferenceKey));
    } catch (error) {
      return null;
    }
  }

  function writeStoredLocalePreference(localeKey) {
    var normalized = normalizeLocaleKey(localeKey);

    if (!normalized) {
      return;
    }

    try {
      window.localStorage.setItem(config.preferenceKey, normalized);
    } catch (error) {
      return;
    }
  }

  function resolveLocaleFromBrowserLanguages() {
    var languages = [];

    if (window.navigator && Array.isArray(window.navigator.languages) && window.navigator.languages.length) {
      languages = window.navigator.languages;
    } else if (window.navigator && window.navigator.language) {
      languages = [window.navigator.language];
    }

    for (var languageIndex = 0; languageIndex < languages.length; languageIndex += 1) {
      var normalizedLanguageTag = normalizeLanguageTag(languages[languageIndex]);

      for (var localeIndex = 0; localeIndex < config.locales.length; localeIndex += 1) {
        var locale = config.locales[localeIndex];
        var patterns = Array.isArray(locale.browserLangPatterns) ? locale.browserLangPatterns : [];

        for (var patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
          if (matchesBrowserLanguagePattern(patterns[patternIndex], normalizedLanguageTag)) {
            return locale.key;
          }
        }
      }
    }

    return normalizeLocaleKey(config.defaultLocaleKey);
  }

  function resolvePreferredLocaleKey() {
    return readStoredLocalePreference() || resolveLocaleFromBrowserLanguages();
  }

  function applyFontLocalePreference() {
    if (!document || !document.documentElement) {
      return;
    }

    var preferredLocale = resolvePreferredLocaleKey();

    if (!preferredLocale) {
      document.documentElement.removeAttribute('data-font-locale');
      return;
    }

    document.documentElement.setAttribute('data-font-locale', preferredLocale);
  }

  function resolveTargetHomePath() {
    var preferredLocale = resolvePreferredLocaleKey();
    var locale = localeMap[preferredLocale] || localeMap[normalizeLocaleKey(config.defaultLocaleKey)];

    return locale ? locale.homePath : config.defaultLocaleHomePath;
  }

  function preserveLocalePreference(eventTarget) {
    var cursor = eventTarget;

    while (cursor && cursor !== document) {
      if (cursor.getAttribute) {
        var localeKey = cursor.getAttribute('data-locale-preference');

        if (localeKey) {
          writeStoredLocalePreference(localeKey);
          return;
        }
      }

      cursor = cursor.parentNode;
    }
  }

  document.addEventListener('click', function(event) {
    preserveLocalePreference(event.target);
  }, true);

  applyFontLocalePreference();

  if (!config.rootAutoRedirect) {
    return;
  }

  var targetHomePath = resolveTargetHomePath();

  if (!targetHomePath) {
    return;
  }

  window.location.replace(targetHomePath + window.location.search + window.location.hash);
})(window, document);
