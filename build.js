const fs = require('fs');
const path = require('path');

const SITE_URL = process.env.SITE_URL || 'https://starokostiantyniv.com';
const SHEET_CSV_URL = process.env.SHEET_CSV_URL || '';

// українські заголовки в таблиці -> внутрішні поля англійською
const COLUMN_MAP = {
    'назва': 'name',
    'категорія': 'category',
    'адреса': 'address',
    'телефон': 'phone',
    'години роботи': 'hours',
    'години': 'hours',
    'сайт': 'website',
    'instagram': 'instagram',
    'telegram': 'telegram',
    'опис': 'description',
    'фото (посилання)': 'photo',
    'фото': 'photo',
    'рейтинг': 'rating',
    'відгуки': 'reviews',
    'рекомендовано': 'featured',
    'реком': 'featured',
    'теги': 'tags',
    'активний': 'active',
    'акт': 'active',
    'верифіковано': 'verified',
    'верифікація': 'verified'
};

// мінімальний RFC4180-парсер CSV (лапки, коми та переноси рядків усередині полів)
function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i], next = text[i + 1];
        if (inQuotes) {
            if (c === '"' && next === '"') { field += '"'; i++; }
            else if (c === '"') { inQuotes = false; }
            else { field += c; }
        } else {
            if (c === '"') inQuotes = true;
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\r') { /* skip */ }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else field += c;
        }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows[0];
    return rows.slice(1)
        .filter(r => r.some(v => v.trim() !== ''))
        .map(r => {
            const obj = {};
            headers.forEach((h, idx) => {
                const key = COLUMN_MAP[h.trim().toLowerCase()];
                if (key) obj[key] = (r[idx] ?? '').trim();
            });
            return obj;
        });
}

async function fetchFromSheet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Не вдалось завантажити таблицю: HTTP ${res.status}`);
    const text = await res.text();
    return parseCSV(text);
}
const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const TPL = path.join(ROOT, 'templates');
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'listings.json');

// ---------- утиліти ----------

function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// пряме "..." -> українські «ялинки»; не займає лапки всередині вже екранованого HTML
function smartQuotes(s) {
    let str = String(s ?? '');
    let open = true;
    return str.replace(/"/g, () => { const q = open ? '«' : '»'; open = !open; return q; });
}

function formatRating(rating, reviews) {
    if (!rating || rating === '—') return '—';
    const r = String(rating).trim();
    if (!reviews) return r;
    return `${r} · ${reviews} відгук${reviewSuffix(reviews)}`;
}

function reviewSuffix(n) {
    const num = parseInt(n, 10);
    if (isNaN(num)) return 'ів';
    const mod10 = num % 10, mod100 = num % 100;
    if (mod10 === 1 && mod100 !== 11) return '';
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'и';
    return 'ів';
}

function telLink(phone) {
    if (!phone || phone === '—') return '<span class="row-value">—</span>';
    const first = phone.split(',')[0].trim();
    const digits = first.replace(/[^\d+]/g, '');
    return `<a class="row-value row-link" href="tel:${digits}">${escHtml(phone)}</a>`;
}

function mapsLink(address) {
    if (!address) return '#';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', Старокостянтинів')}`;
}

// транслітерація укр -> латиниця для чистих URL
const translitMap = {
    а:'a', б:'b', в:'v', г:'h', ґ:'g', д:'d', е:'e', є:'ie', ж:'zh', з:'z',
    и:'y', і:'i', ї:'i', й:'i', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p',
    р:'r', с:'s', т:'t', у:'u', ф:'f', х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'shch',
    ь:'', ю:'iu', я:'ia', "'":'', 'ʼ':''
};

function slugify(name) {
    const translit = String(name).toLowerCase().split('').map(ch => translitMap[ch] ?? ch).join('');
    return translit
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'zaklad';
}

// нормалізує назву для порівняння (без регістру, зайвих пробілів, розділових знаків типу лапок)
function normName(s) {
    return String(s ?? '').toLowerCase().trim().replace(/["'«»]/g, '').replace(/\s+/g, ' ');
}

// перший телефон із поля (можуть бути кілька через кому), лише цифри
function firstPhoneDigits(phone) {
    const first = String(phone ?? '').split(',')[0];
    return first.replace(/\D/g, '');
}

// об'єднує рядки, що описують той самий заклад (та сама назва+телефон,
// або та сама назва+адреса коли телефону нема) — типово через кілька категорій в таблиці
function dedupeItems(items) {
    const merged = new Map();
    const order = [];
    for (const item of items) {
        const phoneKey = firstPhoneDigits(item.phone);
        const key = phoneKey
            ? `${normName(item.name)}|${phoneKey}`
            : `${normName(item.name)}|${normName(item.address)}`;
        if (!merged.has(key)) {
            merged.set(key, { ...item });
            order.push(key);
            continue;
        }
        const base = merged.get(key);
        // категорії та теги — об'єднуємо, без повторів
        for (const field of ['category', 'tags']) {
            const existing = (base[field] || '').split(',').map(s => s.trim()).filter(Boolean);
            const incoming = (item[field] || '').split(',').map(s => s.trim()).filter(Boolean);
            for (const v of incoming) if (!existing.includes(v)) existing.push(v);
            base[field] = existing.join(', ');
        }
        // решта полів — лишаємо перше непорожнє значення
        for (const field of ['address', 'hours', 'website', 'instagram', 'telegram', 'description', 'photo', 'rating', 'reviews']) {
            if (!base[field] && item[field]) base[field] = item[field];
        }
        // featured/verified — досить, щоб хоч один рядок мав "так"
        if (isFeatured(item)) base.featured = item.featured;
        if (isVerified(item)) base.verified = item.verified;
    }
    return order.map(k => merged.get(k));
}

function makeUniqueSlugs(items) {
    const seen = new Map();
    return items.map(item => {
        let base = slugify(item.name);
        let slug = base;
        let n = seen.get(base) || 0;
        if (n > 0) slug = `${base}-${n + 1}`;
        seen.set(base, n + 1);
        return { ...item, slug };
    });
}

function readTpl(name) {
    return fs.readFileSync(path.join(TPL, name), 'utf8');
}

function fill(tpl, vars) {
    return tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in vars ? vars[key] : ''));
}

function rimraf(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

// копіює все з public/ (картинки фону тощо) у корінь dist/ — рекурсивно
function copyPublicAssets() {
    const PUBLIC_DIR = path.join(ROOT, 'public');
    if (!fs.existsSync(PUBLIC_DIR)) return 0;
    let count = 0;
    function walk(src, dest) {
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            const s = path.join(src, entry.name);
            const d = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                ensureDir(d);
                walk(s, d);
            } else {
                fs.copyFileSync(s, d);
                count++;
            }
        }
    }
    walk(PUBLIC_DIR, DIST);
    return count;
}

function isFeatured(item) {
    const v = String(item.featured ?? '').trim().toLowerCase();
    return ['так', 'yes', 'true', '1', 'y', 'да'].includes(v);
}

function isActive(item) {
    const v = String(item.active ?? '').trim().toLowerCase();
    // порожнє поле = активний за замовчуванням; виключаємо тільки явне "ні"
    return !['ні', 'no', 'false', '0', 'n', 'нет'].includes(v);
}

function isVerified(item) {
    const v = String(item.verified ?? '').trim().toLowerCase();
    return ['так', 'yes', 'true', '1', 'y', 'да'].includes(v);
}

// ---------- джерело даних ----------

async function loadListings() {
    if (SHEET_CSV_URL) {
        console.log('Завантажую дані з Google Таблиці...');
        const rows = await fetchFromSheet(SHEET_CSV_URL);
        if (!rows.length) throw new Error('Таблиця порожня або не вдалось розпарсити CSV');
        const deduped = dedupeItems(rows);
        if (deduped.length < rows.length) {
            console.log(`Об'єднано дублікатів: ${rows.length - deduped.length} (${rows.length} рядків → ${deduped.length} унікальних закладів)`);
        }
        return makeUniqueSlugs(deduped);
    }
    if (!fs.existsSync(DATA_FILE)) {
        throw new Error(`Не знайдено файл даних: ${DATA_FILE}. Вкажи DATA_FILE=... або SHEET_CSV_URL=... (посилання на опубліковану таблицю)`);
    }
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(raw)) throw new Error('listings.json має бути масивом об\'єктів');
    return makeUniqueSlugs(dedupeItems(raw));
}

// ---------- рендер сторінки закладу ----------

function renderListingPage(item, baseCss, siteTitleJs, themeWeatherJs) {
    const url = `${SITE_URL}/zaklad/${item.slug}/`;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: item.name,
        url,
        ...(item.address ? { address: { '@type': 'PostalAddress', streetAddress: item.address, addressLocality: 'Старокостянтинів', addressCountry: 'UA' } } : {}),
        ...(item.phone ? { telephone: item.phone } : {}),
        ...(item.hours ? { openingHours: item.hours } : {}),
        ...(item.photo ? { image: item.photo } : {}),
        ...(item.tags ? { keywords: item.tags } : {}),
        ...(item.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: String(item.rating), reviewCount: String(item.reviews || 1) } } : {})
    };

    const metaDesc = item.description
        ? item.description.slice(0, 155)
        : `${smartQuotes(item.name)} — ${item.category} у Старокостянтинові. Адреса, телефон, години роботи.`;

    const photoBlock = item.photo
        ? `<img class="listing-photo" src="${escHtml(item.photo)}" alt="${escHtml(item.name)}" loading="lazy">`
        : '';

    const featuredBadge = isFeatured(item)
        ? `<div class="featured-badge">★ Рекомендовано</div>`
        : '';

    const verifiedMark = isVerified(item)
        ? ` <svg class="verified-mark" viewBox="0 0 24 24" fill="currentColor" title="Верифікований заклад"><path d="M12 2l2.4 1.9 3-.5 1.1 2.8 2.8 1.1-.5 3L22.7 12l-1.9 2.4.5 3-2.8 1.1-1.1 2.8-3-.5L12 22.7l-2.4-1.9-3 .5-1.1-2.8-2.8-1.1.5-3L1.3 12l1.9-2.4-.5-3 2.8-1.1L6.6 2.7l3 .5L12 2z"/><path d="M8.5 12.5l2.3 2.3 4.7-4.7" fill="none" stroke="#0a0a0e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : '';

    const descriptionRow = item.description
        ? `<div class="detail-row" style="border-bottom:none;"><strong>Опис</strong> <span>${escHtml(item.description)}</span></div>`
        : '';

    const linkBtn = (href, label) => href
        ? `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : '';

    return fill(readTpl('listing.html'), {
        NAME: escHtml(smartQuotes(item.name)),
        VERIFIED_MARK: verifiedMark,
        CATEGORY: escHtml(item.category),
        ADDRESS: escHtml(item.address || '—'),
        PHONE_LINK: telLink(item.phone),
        MAPS_LINK: mapsLink(item.address),
        HOURS: escHtml(item.hours || '—'),
        RATING_TEXT: escHtml(formatRating(item.rating, item.reviews)),
        META_DESC: escHtml(metaDesc),
        URL: url,
        SITE_URL,
        BASE_CSS: baseCss,
        SITE_TITLE_JS: siteTitleJs,
        THEME_WEATHER_JS: themeWeatherJs,
        JSONLD: JSON.stringify(jsonLd),
        BG_IMAGE: 'img.jpg',
        PHOTO_BLOCK: photoBlock,
        FEATURED_BADGE: featuredBadge,
        DESCRIPTION_ROW: descriptionRow,
        WEBSITE_LINK: linkBtn(item.website, 'Сайт'),
        INSTAGRAM_LINK: linkBtn(item.instagram, 'Instagram'),
        TELEGRAM_LINK: linkBtn(item.telegram, 'Telegram')
    });
}

// ---------- sitemap ----------

function buildSitemap(items) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [`${SITE_URL}/`, ...items.map(i => `${SITE_URL}/zaklad/${i.slug}/`)];
    const body = urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ---------- main ----------

async function build() {
    const rawItems = await loadListings();
    const skipped = rawItems.filter(i => !isActive(i));
    const items = rawItems.filter(isActive);
    if (skipped.length) {
        console.log(`Пропущено неактивних (Активний = ні): ${skipped.length}`);
    }
    const baseCss = fs.readFileSync(path.join(TPL, 'base.css'), 'utf8');
    const siteTitleJs = fs.readFileSync(path.join(TPL, 'site-title.js'), 'utf8');
    const themeWeatherJs = fs.readFileSync(path.join(TPL, 'theme-weather.js'), 'utf8');

    rimraf(DIST);
    ensureDir(DIST);
    const copiedAssets = copyPublicAssets();
    if (copiedAssets) console.log(`Скопійовано статичних файлів (картинки тощо): ${copiedAssets}`);

    // головна — рекомендовані (featured) підіймаємо на початок масиву
    const forHome = [...items].sort((a, b) => (isFeatured(b) ? 1 : 0) - (isFeatured(a) ? 1 : 0));
    const homeHtml = fill(readTpl('home.html'), {
        SITE_URL,
        BASE_CSS: baseCss,
        SITE_TITLE_JS: siteTitleJs,
        THEME_WEATHER_JS: themeWeatherJs,
        LISTINGS_JSON: JSON.stringify(forHome.map(({ name, category, address, phone, hours, rating, reviews, slug, featured, tags, verified }) =>
            ({ name, category, address, phone, hours, rating, reviews, slug, featured: isFeatured({ featured }), tags: tags || '', verified: isVerified({ verified }) })))
    });
    fs.writeFileSync(path.join(DIST, 'index.html'), homeHtml);

    // сторінки закладів
    for (const item of items) {
        const dir = path.join(DIST, 'zaklad', item.slug);
        ensureDir(dir);
        fs.writeFileSync(path.join(dir, 'index.html'), renderListingPage(item, baseCss, siteTitleJs, themeWeatherJs));
    }

    // sitemap
    fs.writeFileSync(path.join(DIST, 'sitemap.xml'), buildSitemap(items));

    // CNAME для GitHub Pages — щоб публікувалось саме під кастомним доменом
    const domainOnly = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
    fs.writeFileSync(path.join(DIST, 'CNAME'), domainOnly + '\n');

    console.log(`Готово: ${items.length} закладів → ${path.relative(ROOT, DIST)}/`);
    console.log(`index.html + ${items.length} сторінок у /zaklad/*/ + sitemap.xml`);
}

build().catch(err => {
    console.error('Помилка генерації:', err.message);
    process.exit(1);
});
