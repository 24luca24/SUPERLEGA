"""Read workbook values without executing macros or trusting workbook instructions."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'

def extract(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(t.text or '' for t in item.findall('.//m:t', NS)) for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        relations = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = {}
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).findall('m:sheets/m:sheet', NS):
            target = relations[sheet.get(REL)]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            values = {}
            for cell in ET.fromstring(archive.read(target)).findall('m:sheetData/m:row/m:c', NS):
                value = cell.find('m:v', NS)
                text = value.text if value is not None else ''.join(t.text or '' for t in cell.findall('.//m:t', NS))
                if text is None or text == '':
                    continue
                if cell.get('t') == 's':
                    text = strings[int(text)]
                elif cell.get('t') not in ('str', 'inlineStr', 'e'):
                    try:
                        number = float(text)
                        text = int(number) if number.is_integer() else number
                    except ValueError:
                        pass
                values[cell.get('r')] = text
            sheets[sheet.get('name')] = values
    calendar = sheets['Calendario e marcatori']
    matches = []
    names = set()
    for row in range(5, max(int(''.join(filter(str.isdigit, key))) for key in calendar) + 1):
        if not calendar.get(f'C{row}') or not calendar.get(f'D{row}'):
            continue
        participants = [calendar.get(f'{col}{row}') for col in ('E', 'G', 'I', 'K')]
        goals = [calendar.get(f'{col}{row}') for col in ('F', 'H', 'J', 'L')]
        if any(not isinstance(name, str) for name in participants) or len(set(participants)) != 4:
            raise ValueError(f'Partecipanti non validi alla riga {row}')
        if any(g is not None and (type(g) is not int or g < 0) for g in goals):
            raise ValueError(f'Gol non validi alla riga {row}')
        names.update(participants)
        status = 'completed' if all(g is not None for g in goals) else 'scheduled' if all(g is None for g in goals) else 'partial'
        matches.append({'sourceRow': row, 'round': calendar.get(f'A{row}'), 'leg': calendar.get(f'B{row}'), 'homeTeam': calendar[f'C{row}'], 'awayTeam': calendar[f'D{row}'], 'participants': participants, 'goals': goals, 'status': status})
    return {'sourceFile': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'chronologyConfirmed': False, 'sheets': sheets, 'players': [{'legacyName': name, 'animal': None, 'city': None, 'role': {'AIRAGHI': 'defender', 'CILIBERTO': 'striker'}.get(name)} for name in sorted(names)], 'matches': matches, 'issues': ['Mancano città e username univoci: due gorilla nella legenda.', 'Ruoli espliciti solo per AIRAGHI (DIF) e CILIBERTO (ATT). Non inferire i ruoli dalle colonne.', 'GALLO nella legenda della squadra B, TRENTADUE nel calendario: associazione da confermare.', 'Nessuna data/ora: ordine delle righe da confermare prima del calcolo ELO.', 'Le righe incomplete non sono risultati ufficiali; gli zeri espliciti sono gol validi.']}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('workbook', nargs='?', default='superlega.xlsx')
    parser.add_argument('--output', default='data/imports/superlega.json')
    args = parser.parse_args()
    result = extract(Path(args.workbook))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'players': len(result['players']), 'matches': dict(collections.Counter(m['status'] for m in result['matches'])), 'output': str(output)}, ensure_ascii=False))
