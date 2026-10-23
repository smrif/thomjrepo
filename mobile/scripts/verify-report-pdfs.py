"""Read-only content/orientation checks for synthetic native report QA output."""
from pathlib import Path
import csv
import json
import re
import sys
import unicodedata
from pypdf import PdfReader

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / '.build/reports/native'
def normalize(text):
    # CoreText can map compatibility CJK glyphs to their radical code points.
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text))
def without_footer(text):
    return re.sub(r'Whose\s+Day\s*-\s*Page\s*\d+', '', text)

results = []
for kind in ['honest', 'dadactual', 'momsweek', 'full', 'notes']:
    reader = PdfReader(root / (kind + '.pdf'))
    pages = []
    for number, page in enumerate(reader.pages, 1):
        reflected = []
        def inspect(text, cm, tm, font, size):
            if not text.strip():
                return
            a = tm[0] * cm[0] + tm[1] * cm[2]
            d = tm[2] * cm[1] + tm[3] * cm[3]
            if a <= 0 or d <= 0:
                reflected.append(text[:50])
        text = page.extract_text(visitor_text=inspect) or ''
        assert not reflected, f'{kind} page {number} has reflected/rotated text: {reflected[:1]}'
        assert f'Page {number}' in text, f'{kind} page footer missing'
        assert normalize(without_footer(text)), f'{kind} page {number} has no report content'
        pages.append(without_footer(text))
    expected = (root / (kind + '.txt')).read_text()
    actual = '\n'.join(pages)
    assert normalize(actual) == normalize(expected), f'{kind} PDF text differs from its report document'
    assert '日本語' in unicodedata.normalize('NFKC', actual), f'{kind} Unicode note missing'
    assert pages[-1].strip().startswith('ATTESTATION'), f'{kind} attestation is not on its own page'
    assert all('ATTESTATION' not in text for text in pages[:-1]), f'{kind} attestation split'
    assert 'Signature:' in pages[-1] and 'Printed name:' in pages[-1], f'{kind} signature section missing'
    results.append({'type': kind, 'pages': len(pages), 'normalizedTextMatch': True, 'uprightText': True, 'attestationTogether': True})

with (root / 'records.csv').open(newline='') as file:
    rows = list(csv.DictReader(file))
assert len(rows) == 8
assert any('END-LONG-NOTE' in row['diary_note'] for row in rows)
assert any(row['attachment_data_url'].startswith('data:image/png;base64,') for row in rows)
result = {'normalization': 'Unicode NFKC and whitespace, native page footers removed', 'pdfs': results, 'csvRows': len(rows)}
(root / 'validation.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
