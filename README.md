# STAROKOSTIANTYNIV.COM — генератор сайту

## Структура
- `data/listings.json` — джерело даних (тестові приклади зараз; заміниш на експорт з Google Sheet)
- `templates/home.html` — головна сторінка (пошук)
- `templates/listing.html` — шаблон сторінки одного закладу
- `templates/base.css` — спільні стилі
- `build.js` — генерує все у `dist/`

## Джерело даних: локальний файл або жива Google Таблиця
За замовчуванням генератор бере дані з `data/listings.json`. Щоб підключити живу
Google Таблицю замість файлу:

1. У таблиці: Файл → Поділитися → Опублікувати в мережі → обрати аркуш "Заклади" → формат CSV
2. Скопіювати видане посилання
3. Запускати білд зі змінною середовища `SHEET_CSV_URL`:
```
SHEET_CSV_URL="https://docs.google.com/spreadsheets/d/.../pub?output=csv" node build.js
```
На Netlify — додати `SHEET_CSV_URL` в Site settings → Environment variables. Заголовки
колонок мають лишатись українською, як у шаблоні таблиці (`Назва`, `Категорія`, `Адреса` тощо) —
build.js сам мапить їх на внутрішні поля.

## Запуск (з локального файлу)
```
node build.js
```
Результат — папка `dist/`: `index.html`, `sitemap.xml`, `zaklad/<slug>/index.html` для кожного закладу.

Домен береться зі змінної середовища `SITE_URL` (за замовчуванням `https://starokostiantyniv.com`):
```
SITE_URL=https://starokostiantyniv.com DATA_FILE=data/listings.json node build.js
```

## Формат listings.json
Масив об'єктів з полями:
`name, category, address, phone, hours, website, instagram, telegram, description, photo, rating, reviews`
Порожні поля — просто `""`, не видаляти ключ.

## Netlify
- Build command: `node build.js`
- Publish directory: `dist`
- Build hook — обов'язково налаштувати окремо, щоб перегенерація йшла й тоді, коли міняються лише дані в Sheet (детальніше — обговорено в чаті).
