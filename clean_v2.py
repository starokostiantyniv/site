import pandas as pd, re, json

xls = pd.ExcelFile('/mnt/user-data/uploads/Електронна_таблиця_без_назви.xlsx')
df1 = pd.read_excel(xls, sheet_name='Аркуш1')
df2 = pd.read_excel(xls, sheet_name='Аркуш2')

ND_FIXES = {
    "Автомобільні ко иціонери": "Автомобільні кондиціонери",
    "Благодійні фо и": "Благодійні фонди",
    "Кав'ярні, ко итерські кафе": "Кав'ярні, кондитерські кафе",
    "Ко итерські вироби": "Кондитерські вироби",
    "Ко иціювання, вентиляція": "Кондиціювання, вентиляція",
    "Ла шафтні роботи, дизайн": "Ландшафтні роботи, дизайн",
    "Пенсійні фо и": "Пенсійні фонди",
}
def fix_category(c):
    c = str(c).strip()
    return ND_FIXES.get(c, c)

PHONE_RE = re.compile(r'\+?3?8?\s*\(?0\d{2}\)?\)?[\s\-]?\d{2,3}[\s\-]?\d{2}[\s\-]?\d{2}')

def extract_phones(text):
    found = []
    for m in PHONE_RE.finditer(text):
        digits = re.sub(r'\D', '', m.group(0))
        if digits.startswith('38'):
            digits = digits[2:]
        if len(digits) == 10 and digits.startswith('0'):
            formatted = f"+38 ({digits[0:3]}) {digits[3:6]} {digits[6:8]} {digits[8:10]}"
            if formatted not in found:
                found.append(formatted)
    return found

def parse_blob(name, blob):
    if not blob or blob == 'nan':
        return '', [], ''
    text = blob
    if text.startswith(name):
        text = text[len(name):]
    phones = extract_phones(text)
    desc = ''
    idx = text.find('Інформація')
    if idx != -1:
        desc = text[idx + len('Інформація'):].strip(' .;,')
        head = text[:idx]
    else:
        head = text
    addr = head
    if phones:
        m = re.search(PHONE_RE, head)
        if m:
            addr = head[:m.start()]
    addr = re.sub(r'\bвул\.\s*;?\s*$', '', addr).strip(' ,;')
    addr = re.sub(r'\s{2,}', ' ', addr)
    desc = re.sub(r'^\S{0,3}\s*' + re.escape(name.split('.')[0].split(',')[0][:12]) + r'\s*', '', desc).strip()
    desc = re.sub(r'\s{2,}', ' ', desc)
    return addr, phones, desc

REVIEW_ARTIFACT_RE = re.compile(r'^\d+\s*Відгук', re.IGNORECASE)
LATIN_ONLY_RE = re.compile(r'^[a-z0-9_.\s]+$', re.IGNORECASE)
TRUNCATED_RE = re.compile(r'^(ський|ська|ське|ських|ським)\b')

records = []

for _, r in df1.iterrows():
    name = str(r['Назва']).strip()
    phone = str(r['Телефон']).strip() if pd.notna(r['Телефон']) else ''
    records.append({
        'name': name,
        'categories': [str(r['Категорія']).strip()],
        'address': str(r['Адреса']).strip() if pd.notna(r['Адреса']) and str(r['Адреса']).strip() not in ('—','-') else '',
        'phones': [phone] if phone else [],
        'rating': str(r['Рейтинг']) if pd.notna(r['Рейтинг']) else '',
        'reviews': str(r['Відгуки']) if pd.notna(r['Відгуки']) else '',
        'description': '',
        'flags': set(),
        'source': 'Аркуш1'
    })

for _, r in df2.iterrows():
    name = str(r['name']).strip() if pd.notna(r['name']) else ''
    if not name:
        continue
    flags = set()
    if REVIEW_ARTIFACT_RE.match(name):
        flags.add('артефакт (не заклад)')
    elif LATIN_ONLY_RE.match(name):
        flags.add('можливо це нік, а не назва')
    if TRUNCATED_RE.match(name):
        flags.add('обрізана назва')

    cat = fix_category(r['category']) if pd.notna(r['category']) else ''
    blob = str(r['Unnamed: 4']).strip() if pd.notna(r['Unnamed: 4']) else ''
    phone_col = str(r['phone']).strip() if pd.notna(r['phone']) else ''
    addr, phones_from_blob, desc = parse_blob(name, blob)
    phones = []
    if phone_col:
        digits = re.sub(r'\D', '', phone_col)
        if len(digits) == 9:
            phones.append(f"+38 (0{digits[0:2]}) {digits[2:5]} {digits[5:7]} {digits[7:9]}")
        elif len(digits) == 10:
            phones.append(f"+38 ({digits[0:3]}) {digits[3:6]} {digits[6:8]} {digits[8:10]}")
    for p in phones_from_blob:
        if p not in phones:
            phones.append(p)

    records.append({
        'name': name,
        'categories': [cat] if cat else [],
        'address': addr,
        'phones': phones,
        'rating': '', 'reviews': '',
        'description': desc,
        'flags': flags,
        'raw_blob': blob,
        'source': 'Аркуш2'
    })

print('Всього сирих записів до дедупу:', len(records))

def key_for(rec):
    n = rec['name'].lower().strip()
    p = rec['phones'][0] if rec['phones'] else ''
    p_digits = re.sub(r'\D', '', p)
    return (n, p_digits) if p_digits else (n, '')

merged = {}
order = []
for rec in records:
    k = key_for(rec)
    if k not in merged:
        rec['raw_blob'] = rec.get('raw_blob', '')
        merged[k] = rec
        order.append(k)
    else:
        base = merged[k]
        for c in rec['categories']:
            if c and c not in base['categories']:
                base['categories'].append(c)
        for p in rec['phones']:
            if p not in base['phones']:
                base['phones'].append(p)
        if not base['address'] and rec['address']:
            base['address'] = rec['address']
        if not base['description'] and rec['description']:
            base['description'] = rec['description']
        if not base['rating'] and rec['rating']:
            base['rating'] = rec['rating']
        base['flags'] |= rec['flags']

final = [merged[k] for k in order]
print('Унікальних записів після дедупу:', len(final))
print('З них артефактів (не заклад):', sum(1 for r in final if 'артефакт (не заклад)' in r['flags']))
print('З них справжніх закладів (оцінка):', len(final) - sum(1 for r in final if 'артефакт (не заклад)' in r['flags']))

def is_messy_address(a):
    if not a: return False
    if len(a) > 55: return True
    if a.count('вул.') > 1: return True
    if re.search(r'\d{2,}\s*\d{2,}', a): return True
    if '"' in a or 'Інформація' in a: return True
    return False

def is_messy_phone(p):
    if not p or p == '—': return False
    for part in p.split(','):
        part = part.strip()
        if not re.fullmatch(r'\+38 \(\d{3}\) \d{3} \d{2} \d{2}', part):
            return True
    return False

json.dump([{
    'name': r['name'],
    'category': ', '.join(r['categories'][:3]),
    'address': r['address'],
    'phone': ', '.join(r['phones']),
    'description': r['description'],
    'flags': sorted(r['flags'] | ({'адреса'} if is_messy_address(r['address']) else set()) | ({'телефон'} if is_messy_phone(', '.join(r['phones'])) else set())),
    'raw_blob': r.get('raw_blob',''),
    'rating': r['rating'], 'reviews': r['reviews']
} for r in final], open('data/all-records-v2.json','w',encoding='utf-8'), ensure_ascii=False, indent=2)
print('Записано data/all-records-v2.json')
