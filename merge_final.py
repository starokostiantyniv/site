import json, pandas as pd

all_records = json.load(open('data/all-records-v2.json', encoding='utf-8'))
reviewed = pd.read_excel('/mnt/user-data/uploads/starokostiantyniv_na_perevirku_v2-2_OCHISHCHENO.xlsx').fillna('')

def norm(s):
    return str(s).strip()

# індекс переглянутих рядків за (розпізнана назва, категорія, розпізнана адреса, розпізнаний телефон)
reviewed_index = {}
for _, row in reviewed.iterrows():
    key = (norm(row['Назва (розпізнано)']), norm(row['Категорія']), norm(row['Адреса (розпізнано)']), norm(row['Телефон (розпізнано)']))
    reviewed_index[key] = row

matched = 0
deleted = 0
final = []

for rec in all_records:
    if not rec['flags']:
        # не був позначений — лишаємо як є
        final.append(rec)
        continue
    key = (norm(rec['name']), norm(rec['category']), norm(rec['address']), norm(rec['phone']))
    if key not in reviewed_index:
        deleted += 1
        continue  # видалено користувачем (артефакт)
    row = reviewed_index[key]
    matched += 1
    new_name = norm(row['Назва (виправлено)']) or rec['name']
    new_address = norm(row['Адреса (виправлено)']) or rec['address']
    new_phone = norm(row['Телефон (виправлено)']) or rec['phone']
    final.append({
        **rec,
        'name': new_name,
        'address': new_address,
        'phone': new_phone,
    })

print('Не позначені (лишились як є):', len(all_records) - sum(1 for r in all_records if r['flags']))
print('Знайдено відповідність і застосовано виправлення:', matched)
print('Видалено (не знайдено в поверненому файлі = видалив користувач):', deleted)
print('ФІНАЛЬНА КІЛЬКІСТЬ ЗАКЛАДІВ:', len(final))

# у формат для build.js
out = []
for r in final:
    out.append({
        'name': r['name'],
        'category': r['category'],
        'address': r['address'],
        'phone': r['phone'],
        'hours': '',
        'website': '',
        'instagram': '',
        'telegram': '',
        'description': r['description'],
        'photo': '',
        'rating': r.get('rating',''),
        'reviews': r.get('reviews','')
    })

json.dump(out, open('data/listings-final.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('Записано data/listings-final.json')
