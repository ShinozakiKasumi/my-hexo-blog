/* global hexo */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const pagination = require('hexo-pagination');

const {
  LOCALES,
  DEFAULT_LOCALE,
  resolveLocaleFromPage,
  normalizeRoutePath,
  stripIndexHtml,
  toAbsoluteUrl,
  homePath,
  archivePath,
  aboutPath,
  buildLocaleRoutingData
} = require('./lib/locales');

const DEFAULT_GENERATORS = ['index', 'archive', 'category', 'tag', 'xml', '_hexo_generator_search'];
const FONT_BUILD_SCRIPT = path.join(hexo.base_dir, 'tools/build-fonts.mjs');
const PAGINATION_DIR = () => hexo.config.pagination_dir || 'page';

let fontsEnsured = false;

function ensureFontsBuilt() {
  if (fontsEnsured) return;
  fontsEnsured = true;

  const result = spawnSync(process.execPath, [FONT_BUILD_SCRIPT], {
    cwd: hexo.base_dir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error('Font build failed');
  }
}

function buildTranslationMap(site) {
  const map = new Map();
  const items = []
    .concat(site.posts ? site.posts.toArray() : [])
    .concat(site.pages ? site.pages.toArray() : []);

  items.forEach(item => {
    if (!item.translation_key || !item.lang) {
      return;
    }

    if (!map.has(item.translation_key)) {
      map.set(item.translation_key, []);
    }

    map.get(item.translation_key).push(item);
  });

  return map;
}

function resolveSection(page) {
  if (!page) return '';
  if (page.is_locale_selector) return 'selector';
  if (page.__index) return 'home';
  if (page.archive) return 'archive';
  if (page.translation_key === 'site-about' || /\/about\/index\.html$/i.test(page.path || '')) {
    return 'about';
  }
  return '';
}

function localizedPaginationPath(basePath, currentPage) {
  if (!currentPage || currentPage <= 1) {
    return normalizeRoutePath(basePath);
  }

  return normalizeRoutePath(`${stripIndexHtml(basePath)}/${PAGINATION_DIR()}/${currentPage}`);
}

function getAlternateTargets(page, site) {
  if (page && page.is_locale_selector) {
    return LOCALES.map(locale => ({
      locale,
      path: homePath(locale)
    }));
  }

  if (page && page.__index) {
    return LOCALES.map(locale => ({
      locale,
      path: localizedPaginationPath(homePath(locale), page.current)
    }));
  }

  if (page && page.archive) {
    return LOCALES.map(locale => ({
      locale,
      path: localizedPaginationPath(archivePath(locale), page.current)
    }));
  }

  if (page && page.translation_key) {
    const translationMap = buildTranslationMap(site);
    const siblings = translationMap.get(page.translation_key) || [];

    return LOCALES.map(locale => {
      const sibling = siblings.find(entry => entry.lang === locale.lang);
      if (!sibling) return null;

      return {
        locale,
        path: normalizeRoutePath(sibling.path)
      };
    }).filter(Boolean);
  }

  return LOCALES.map(locale => ({
    locale,
    path: homePath(locale)
  }));
}

function getCanonicalPath(page, locale) {
  if (page && page.current_url) {
    return normalizeRoutePath(page.current_url);
  }

  if (page && page.canonical_path) {
    return normalizeRoutePath(page.canonical_path);
  }

  if (page && page.path) {
    return normalizeRoutePath(page.path);
  }

  return homePath(locale);
}

function shouldAutoRedirectRoot(page, locale) {
  if (!page || !page.is_locale_selector) {
    return false;
  }

  return normalizeRoutePath(getCanonicalPath(page, locale)) === '/';
}

function buildPageViewModel(ctx, page) {
  const locale = resolveLocaleFromPage(page);
  const alternates = getAlternateTargets(page, ctx.site);
  const section = resolveSection(page);

  return {
    canonical: toAbsoluteUrl(ctx.config.url, getCanonicalPath(page, locale)),
    currentLocale: locale,
    currentSection: section,
    homePath: ctx.url_for(homePath(locale)),
    archivePath: ctx.url_for(archivePath(locale)),
    aboutPath: ctx.url_for(aboutPath(locale)),
    searchPath: ctx.url_for(`${locale.lang_path}/local-search.xml`),
    xDefaultUrl: toAbsoluteUrl(ctx.config.url, '/'),
    languageOptions: alternates.map(target => ({
      ...target.locale,
      absoluteUrl: toAbsoluteUrl(ctx.config.url, target.path),
      relativeUrl: ctx.url_for(target.path),
      isCurrent: target.locale.lang === locale.lang
    })),
    ogAlternateLocales: alternates
      .filter(target => target.locale.lang !== locale.lang)
      .map(target => target.locale.og_locale)
  };
}

function adjacentSameLanguage(post, direction) {
  if (!post) return null;

  let cursor = post[direction];

  while (cursor) {
    if (!cursor.hide && cursor.lang === post.lang) {
      return cursor;
    }
    cursor = cursor[direction];
  }

  return null;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapCdata(value) {
  return String(value || '').replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function postQueryFromArray(ctx, posts) {
  const { Query } = ctx.model('Post');
  return new Query(posts);
}

function paginationShell(base, posts, options, extraData) {
  if (posts.length === 0) {
    const basePath = normalizeRoutePath(base);
    return [{
      path: basePath.slice(1),
      layout: options.layout,
      data: Object.assign({
        base: base.endsWith('/') ? base : `${base}/`,
        total: 1,
        current: 1,
        current_url: basePath,
        posts,
        prev: 0,
        prev_link: '',
        next: 0,
        next_link: ''
      }, extraData)
    }];
  }

  return pagination(base, posts, Object.assign({}, options, { data: extraData }));
}

hexo.extend.filter.register('before_generate', function() {
  DEFAULT_GENERATORS.forEach(name => {
    delete hexo.extend.generator.store[name];
  });

  hexo.extend.helper.store.prev_post = function prevPost(post) {
    return adjacentSameLanguage(post, 'prev');
  };

  hexo.extend.helper.store.next_post = function nextPost(post) {
    return adjacentSameLanguage(post, 'next');
  };

  ensureFontsBuilt();
});

hexo.extend.filter.register('after_generate', function() {
  ['local-search.xml', 'xml/local-search.xml'].forEach(routePath => {
    this.route.remove(routePath);
  });
});

hexo.extend.filter.register('after_render:html', function(html, data) {
  if (!data || !data.page) {
    return html;
  }

  const locale = resolveLocaleFromPage(data.page);

  return html.replace(/<html\s+lang="[^"]*"/i, `<html lang="${locale.html_lang}"`);
});

hexo.extend.filter.register('theme_inject', function(injects) {
  injects.header.file('default', path.join(hexo.base_dir, 'theme-inject/header.ejs'));
  injects.head.file('locale-seo', path.join(hexo.base_dir, 'theme-inject/head.ejs'));
  injects.style.push(path.join(hexo.base_dir, 'theme-inject/locale-fonts.styl'));
});

hexo.extend.helper.register('page_view_model', function(page) {
  return buildPageViewModel(this, page);
});

hexo.extend.helper.register('locale_routing_config', function(page) {
  const locale = resolveLocaleFromPage(page);

  return Object.assign(
    buildLocaleRoutingData(routePath => this.url_for(routePath)),
    {
      rootAutoRedirect: shouldAutoRedirectRoot(page, locale)
    }
  );
});

hexo.extend.generator.register('localized_home', function(locals) {
  const orderBy = this.config.index_generator && this.config.index_generator.order_by
    ? this.config.index_generator.order_by
    : '-date';
  const perPage = this.config.index_generator && typeof this.config.index_generator.per_page === 'number'
    ? this.config.index_generator.per_page
    : this.config.per_page;
  const format = `${PAGINATION_DIR()}/%d/`;

  return LOCALES.flatMap(locale => {
    const posts = locals.posts.sort(orderBy).toArray().filter(post => post.lang === locale.lang);
    posts.sort((a, b) => (b.sticky || 0) - (a.sticky || 0));

    const query = postQueryFromArray(this, posts);

    return paginationShell(locale.lang_path, query, {
      perPage,
      layout: ['index'],
      format
    }, {
      __index: true,
      lang: locale.lang,
      lang_path: locale.lang_path,
      subtitle: locale.home_subtitle,
      description: locale.home_description,
      translation_key: 'site-home'
    });
  });
});

hexo.extend.generator.register('localized_archive', function(locals) {
  const orderBy = this.config.archive_generator && this.config.archive_generator.order_by
    ? this.config.archive_generator.order_by
    : '-date';
  const perPage = this.config.archive_generator && typeof this.config.archive_generator.per_page === 'number'
    ? this.config.archive_generator.per_page
    : this.config.per_page;
  const format = `${PAGINATION_DIR()}/%d/`;

  return LOCALES.flatMap(locale => {
    const posts = locals.posts.sort(orderBy).toArray().filter(post => post.lang === locale.lang);
    const query = postQueryFromArray(this, posts);

    return paginationShell(`${locale.lang_path}/archives`, query, {
      perPage,
      layout: ['archive', 'index'],
      format
    }, {
      archive: true,
      archive_total: posts.length,
      lang: locale.lang,
      lang_path: locale.lang_path,
      description: locale.archive_description,
      translation_key: 'site-archives'
    });
  });
});

hexo.extend.generator.register('localized_search', function(locals) {
  const orderedPosts = locals.posts.sort('-date').toArray();

  return LOCALES.map(locale => {
    const entries = orderedPosts
      .filter(post => post.lang === locale.lang)
      .filter(post => post.indexing === undefined || post.indexing)
      .map(post => {
        const relativeUrl = normalizeRoutePath(post.path);

        return [
          '  <entry>',
          `    <title>${escapeXml(post.title)}</title>`,
          `    <link href="${escapeXml(encodeURI(relativeUrl))}"/>`,
          `    <url>${escapeXml(encodeURI(relativeUrl))}</url>`,
          `    <content type="html"><![CDATA[${wrapCdata(post.content)}]]></content>`,
          '  </entry>'
        ].join('\n');
      })
      .join('\n');

    return {
      path: `${locale.lang_path}/local-search.xml`,
      data: [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<search>',
        entries,
        '</search>'
      ].join('\n')
    };
  });
});

hexo.extend.generator.register('localized_sitemap', function(locals) {
  const pageEntries = (locals.pages ? locals.pages.toArray() : []).filter(page => page.path !== '404.html');
  const postEntries = locals.posts ? locals.posts.toArray() : [];
  const generatedEntries = LOCALES.flatMap(locale => {
    const localePosts = postEntries.filter(post => post.lang === locale.lang);
    const latest = localePosts[0] || null;

    return [
      {
        path: homePath(locale),
        updated: latest ? latest.updated || latest.date : null
      },
      {
        path: archivePath(locale),
        updated: latest ? latest.updated || latest.date : null
      }
    ];
  });

  const urls = []
    .concat(pageEntries.map(page => ({
      path: normalizeRoutePath(page.path),
      updated: page.updated || page.date || null
    })))
    .concat(postEntries.map(post => ({
      path: normalizeRoutePath(post.path),
      updated: post.updated || post.date || null
    })))
    .concat(generatedEntries)
    .sort((a, b) => a.path.localeCompare(b.path, 'en'));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ]
    .concat(urls.map(entry => {
      const lines = [
        '  <url>',
        `    <loc>${escapeXml(toAbsoluteUrl(this.config.url, entry.path))}</loc>`
      ];

      if (entry.updated && typeof entry.updated.toISOString === 'function') {
        lines.push(`    <lastmod>${entry.updated.toISOString()}</lastmod>`);
      }

      lines.push('  </url>');

      return lines.join('\n');
    }))
    .concat('</urlset>')
    .join('\n');

  return {
    path: 'sitemap.xml',
    data: xml
  };
});
