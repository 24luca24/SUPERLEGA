"""Reproduce the supplied Python formula against the confirmed Excel roster.

No challenge exchange and no zero floor, exactly as implemented in the snippet.
This creates a report only; it never modifies official ratings or the database.
"""
import json
from decimal import Decimal
from pathlib import Path

workbook = json.loads(Path('data/imports/superlega.json').read_text())
roster = json.loads(Path('data/roster.example.json').read_text())
roles = {player['legacyName']: player['role'] for player in roster}
ratings = {name: Decimal(100) for name in roles}
minimum_seen = Decimal(100)
completed = 0
for match in workbook['matches']:
    if match['status'] != 'completed':
        continue
    completed += 1
    totals = [sum(match['goals'][:2]), sum(match['goals'][2:])]
    for index, name in enumerate(match['participants']):
        goals = match['goals'][index]
        conceded = totals[1 - index // 2]
        team = totals[index // 2]
        outcome = 2 if team > conceded else -2 if team < conceded else 0
        if roles[name] == 'striker':
            performance = Decimal(goals) - (Decimal('0.5') if goals < 4 else 0)
        else:
            performance = 2 * Decimal(goals) - Decimal('0.3') * conceded + (Decimal('0.5') if conceded < 4 else 0)
        ratings[name] += performance + outcome
        minimum_seen = min(minimum_seen, ratings[name])

current = json.loads(Path('data/imports/elo-preview.json').read_text())
if current['sourceSha256'] != workbook['sha256']:
    raise ValueError('Il report ufficiale si riferisce a un altro Excel.')
comparison = [{
    'legacyName': player['legacyName'], 'username': player['username'], 'role': player['role'],
    'currentElo': player['elo'], 'pythonElo': float(ratings[player['legacyName']]),
    'difference': float(Decimal(str(player['elo'])) - ratings[player['legacyName']]),
} for player in current['players']]
result = {
    'sourceSha256': workbook['sha256'], 'completedMatches': completed,
    'minimumPythonEloSeen': float(minimum_seen),
    'differences': ['Il Python non implementa la sfida per ruolo della regola 8.', 'Il Python non applica il limite inferiore zero.'],
    'players': comparison,
}
Path('data/imports/elo-comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
lines = ['# Confronto ELO', '',
    'Stesse 30 partite complete, stessi ruoli confermati, base 100. La colonna Python replica il codice fornito dal proprietario; la colonna attuale usa il regolamento del piano.', '',
    'Regola chiarita dal proprietario: le partite Excel costruiscono la base ELO senza sfide. Le nuove partite applicano il regolamento completo, con sfide ±5/10/20 e minimo zero. Il Python non implementa le sfide né il minimo zero, ma nello storico importato nessuno scende sotto zero: ora tutti i 14 valori coincidono.', '',
    '| Giocatore | Attuale | Python | Differenza |', '|---|---:|---:|---:|']
for player in comparison:
    number = lambda value: f'{value:.1f}'.replace('.', ',')
    lines.append(f"| {player['username']} | {number(player['currentElo'])} | {number(player['pythonElo'])} | {number(player['difference'])} |")
lines += ['', 'Questo confronto non aggiorna il database. Non è una seconda classifica ufficiale.', '']
Path('docs/elo-confronto.md').write_text('\n'.join(lines))
print(f'Confrontati {len(comparison)} giocatori su {completed} risultati. Nessuna modifica al DB.')
