import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const repoRoot = process.cwd();
const postsDir = path.join(repoRoot, "source", "_posts");
const sourceDir = path.join(repoRoot, "source");
const reportPath = path.join(repoRoot, ".migration", "repair-report.json");

const report = {
  postCount: 0,
  pageCount: 0,
  formatIssueCount: 0,
  changedFiles: [],
  internalLinks: [],
  missingImages: [],
  issues: []
};

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
    .map((name) => path.join(dir, name));
}

function parseFrontMatter(raw, filePath) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u);

  if (!match) {
    throw new Error(`Missing or malformed front matter in ${filePath}`);
  }

  const data = yaml.load(match[1], { schema: yaml.FAILSAFE_SCHEMA }) ?? {};
  return { data, body: match[2] ?? "" };
}

function dumpFrontMatter(data) {
  return yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    quotingType: "'",
    forceQuotes: false
  }).trimEnd();
}

function normalizeTags(tags) {
  if (tags == null) {
    return [];
  }

  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag));
  }

  return [String(tags)];
}

function inferSlug(data, filePath) {
  const aliases = Array.isArray(data.alias) ? data.alias : [data.alias].filter(Boolean);

  for (const alias of aliases) {
    const pathname = String(alias).replace(/^https?:\/\/[^/]+/u, "");
    const segments = pathname.split("/").filter(Boolean);
    const lastSegment = segments.at(-1);

    if (!lastSegment) {
      continue;
    }

    return decodeURIComponent(lastSegment.replace(/\.html$/u, ""));
  }

  return path.basename(filePath, ".md");
}

function validateCategories(categories) {
  if (categories == null) {
    return { valid: true, value: [] };
  }

  if (!Array.isArray(categories)) {
    return { valid: false, value: categories };
  }

  const isValid = categories.every((entry) => {
    if (typeof entry === "string") {
      return true;
    }

    return Array.isArray(entry) && entry.every((item) => typeof item === "string");
  });

  return { valid: isValid, value: categories };
}

function removeTrailingBlankParagraphs(body) {
  const withoutBlankParagraphs = body.replace(
    /(?:\n(?:<!--\s*wp:paragraph\s*-->\s*\n)?<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*(?:\n<!--\s*\/wp:paragraph\s*-->)?\s*)+$/giu,
    "\n"
  );

  return withoutBlankParagraphs.replace(/^\n+/u, "").replace(/\s*$/u, "").concat("\n");
}

function collectInternalLinks(body, filePath) {
  const matches = body.match(/https?:\/\/blog\.rikka\.moe[^\s<)"']+/giu) ?? [];

  for (const url of matches) {
    report.internalLinks.push({
      file: path.relative(repoRoot, filePath),
      url
    });
  }
}

function resolveLocalImageTarget(src) {
  if (/^https?:\/\/blog\.rikka\.moe\//iu.test(src)) {
    const pathname = src.replace(/^https?:\/\/blog\.rikka\.moe/iu, "");
    return path.join(sourceDir, pathname.replace(/^\/+/u, ""));
  }

  if (src.startsWith("/")) {
    return path.join(sourceDir, src.replace(/^\/+/u, ""));
  }

  return null;
}

function collectMissingImages(body, filePath) {
  const imageRefs = [];
  const markdownImageRe = /!\[[^\]]*\]\(([^)\s]+(?:\s+["'][^"']*["'])?)\)/gu;
  const htmlImageRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/giu;

  for (const match of body.matchAll(markdownImageRe)) {
    imageRefs.push(match[1].replace(/\s+["'][^"']*["']$/u, ""));
  }

  for (const match of body.matchAll(htmlImageRe)) {
    imageRefs.push(match[1]);
  }

  for (const src of imageRefs) {
    const localTarget = resolveLocalImageTarget(src);

    if (localTarget && !fs.existsSync(localTarget)) {
      report.missingImages.push({
        file: path.relative(repoRoot, filePath),
        src
      });
    }
  }
}

for (const filePath of listMarkdownFiles(postsDir)) {
  report.postCount += 1;

  const raw = fs.readFileSync(filePath, "utf8");

  if (raw.includes("\uFFFD")) {
    report.formatIssueCount += 1;
    report.issues.push({
      file: path.relative(repoRoot, filePath),
      issue: "Detected replacement character, possible UTF-8 corruption"
    });
  }

  let parsed;
  try {
    parsed = parseFrontMatter(raw, filePath);
  } catch (error) {
    report.formatIssueCount += 1;
    report.issues.push({
      file: path.relative(repoRoot, filePath),
      issue: error.message
    });
    continue;
  }

  const { data } = parsed;
  let body = removeTrailingBlankParagraphs(parsed.body);
  let changed = body !== parsed.body;

  if (typeof data.title !== "string" || !data.title.trim()) {
    report.formatIssueCount += 1;
    report.issues.push({
      file: path.relative(repoRoot, filePath),
      issue: "Missing title"
    });
  }

  if (typeof data.date !== "string" || Number.isNaN(Date.parse(data.date))) {
    report.formatIssueCount += 1;
    report.issues.push({
      file: path.relative(repoRoot, filePath),
      issue: "Missing or invalid date"
    });
  }

  const nextSlug = typeof data.slug === "string" && data.slug.trim()
    ? data.slug.trim()
    : inferSlug(data, filePath);

  if (data.slug !== nextSlug) {
    data.slug = nextSlug;
    changed = true;
  }

  const normalizedTags = normalizeTags(data.tags);
  if (JSON.stringify(data.tags ?? []) !== JSON.stringify(normalizedTags)) {
    data.tags = normalizedTags;
    changed = true;
  }

  const categoryValidation = validateCategories(data.categories);
  if (!categoryValidation.valid) {
    report.formatIssueCount += 1;
    report.issues.push({
      file: path.relative(repoRoot, filePath),
      issue: "Invalid categories structure"
    });
  }

  if (data.categories == null) {
    data.categories = [];
    changed = true;
  }

  collectInternalLinks(body, filePath);
  collectMissingImages(body, filePath);

  if (changed) {
    const orderedData = {};
    for (const key of ["title", "slug", "date", "tags", "categories", "alias", "id"]) {
      if (data[key] !== undefined) {
        orderedData[key] = data[key];
      }
    }

    for (const [key, value] of Object.entries(data)) {
      if (orderedData[key] === undefined) {
        orderedData[key] = value;
      }
    }

    const nextRaw = `---\n${dumpFrontMatter(orderedData)}\n---\n\n${body}`;
    fs.writeFileSync(filePath, nextRaw, "utf8");
    report.changedFiles.push(path.relative(repoRoot, filePath));
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2).concat("\n"), "utf8");

console.log(JSON.stringify(report, null, 2));
