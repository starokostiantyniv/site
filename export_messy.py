import pandas as pd, re, json
import importlib.util
spec = importlib.util.spec_from_file_location("clean", "clean.py")
clean = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clean)

merged = clean.merged
order = clean.order

xls = pd.ExcelFile('/mnt/user-data/uploads/Електронна_таблиця_без_назви.xlsx')
df2 = pd.read_excel(xls, sheet_name='Аркуш2')

raw_by_name = {}
for _, r in df2.iterrows():
    name = str(r['name']).strip() if pd.notna(r['name']) else ''
    if not name: continue
    blob = str(r['Unnamed: 4']).strip() if pd.notna(r['Unnamed: 4']) else ''
    if name not in raw_by_name:
        raw_by_name[name] = blob

# ті самі визначення "забрудненості", що й у попередньому звіті користувачу
# (порожнє поле НЕ вважається "забрудненим" — це окрема, більша категорія, її не займаємо зараз)
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

final = [merged[k] for k in order]
messy = []
for rec in final:
    addr = rec['address']
    phone = ', '.join(rec['phones'])
    a_bad = is_messy_address(addr)
    p_bad = is_messy_phone(phone)
    if a_bad or p_bad:
        messy.append({
            'name': rec['name'],
            'category': ', '.join(rec['categories'][:3]),
            'address_parsed': addr,
            'phone_parsed': phone,
            'issue': ('адреса' if a_bad else '') + (' + ' if a_bad and p_bad else '') + ('телефон' if p_bad else ''),
            'raw_blob': raw_by_name.get(rec['name'], ''),
            'description': rec['description']
        })

print('Забруднених записів (не рахуючи порожніх):', len(messy))
json.dump(messy, open('data/messy-records.json','w',encoding='utf-8'), ensure_ascii=False, indent=2)
