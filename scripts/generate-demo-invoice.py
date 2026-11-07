"""Build the fictional Greenpoint invoice from the same fixture used by the desk."""
from datetime import date
import json
from pathlib import Path
from shutil import copyfile
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'fixtures/greenpoint-invoice.json').read_text())
assert sum(row['quantity'] * row['rate'] for row in data['items']) == data['amountDue'] == 120000
OUTPUT = ROOT / 'output/pdf/greenpoint-cleanup-invoice-INV204.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

ink = colors.HexColor('#193B34')
muted = colors.HexColor('#64736E')
rule = colors.HexColor('#DCE5E0')
pale = colors.HexColor('#F0F5F2')
pdf = canvas.Canvas(str(OUTPUT), pagesize=(612, 792), invariant=1)
pdf.setTitle('Invoice INV204 - Greenpoint water-pollution response - Fictional demo')
pdf.setAuthor('Poast Demo')
pdf.setSubject('Fictional $120,000 cleanup invoice; not payable')

def text(x, y, value, size=10, bold=False, color=ink, right=False):
    pdf.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    pdf.setFillColor(color)
    (pdf.drawRightString if right else pdf.drawString)(x, y, str(value))

def paragraph(value, x, top, width, size=9, leading=12, color=ink):
    style = ParagraphStyle('invoice', fontName='Helvetica', fontSize=size,
                           leading=leading, textColor=color, alignment=TA_LEFT)
    p = Paragraph(value, style)
    _, height = p.wrap(width, 1000)
    p.drawOn(pdf, x, top - height)
    return top - height

def money(value):
    return f'${value:,.2f}'

def formatted_date(value):
    return date.fromisoformat(value).strftime('%b %d, %Y').replace(' 0', ' ')

text(42, 745, data['supplier'].upper(), 23, True)
text(42, 726, data['supplierService'], 10, color=muted)
text(570, 745, 'INVOICE INV204', 23, True, right=True)
text(570, 726, 'Demonstration copy', 9, color=muted, right=True)
pdf.setStrokeColor(ink)
pdf.setLineWidth(1.4)
pdf.line(42, 706, 570, 706)

text(42, 682, 'BILL TO', 8, True, muted)
paragraph(escape(data['client']), 42, 669, 260, size=12, leading=16)
text(42, 631, 'Greenpoint, Brooklyn, New York', 10, color=muted)
for y, label, value in [
    (681, 'Invoice date', formatted_date(data['date'])),
    (664, 'Due date', formatted_date(data['dueDate'])),
    (647, 'Contract', data['contract']),
    (630, 'Terms', 'Net 14'),
]:
    text(360, y, label, 9, color=muted)
    text(570, y, value, 10, right=True)

pdf.setFillColor(pale)
pdf.roundRect(42, 547, 528, 66, 4, fill=1, stroke=0)
text(54, 594, data['project'], 12, True)
text(54, 578, data['location'], 10)
text(54, 562, f"Service period: Oct 26-30, 2026  |  Work area: {data['workArea']}", 9, color=muted)

pdf.setFillColor(ink)
pdf.rect(42, 513, 528, 24, fill=1, stroke=0)
text(52, 521, 'DESCRIPTION', 8, True, colors.white)
text(383, 521, 'QTY', 8, True, colors.white, right=True)
text(462, 521, 'RATE', 8, True, colors.white, right=True)
text(560, 521, 'AMOUNT', 8, True, colors.white, right=True)

y = 513
for row in data['items']:
    text(52, y - 17, row['description'], 10, True)
    bottom = paragraph(escape(row['detail']), 52, y - 23, 282, size=8.5, leading=10.5, color=muted)
    assert bottom >= y - 42, 'Item detail overflows its row.'
    text(383, y - 18, f"{row['quantity']} {row['unit']}", 9, right=True)
    text(462, y - 18, money(row['rate']), 9, right=True)
    text(560, y - 18, money(row['quantity'] * row['rate']), 10, True, right=True)
    y -= 46
    pdf.setLineWidth(.5)
    pdf.setStrokeColor(rule)
    pdf.line(42, y, 570, y)

pdf.setFillColor(pale)
pdf.roundRect(42, 182, 528, 43, 4, fill=1, stroke=0)
text(54, 198, 'AMOUNT DUE (USD)', 10, True)
text(558, 196, money(data['amountDue']), 25, True, right=True)

y = 168
for label, value in [
    ('Scope', data['scope']),
    ('Contract terms', data['terms']),
    ('Closeout', data['closeout']),
    ('Remittance reference', f"{data['invoiceId']} / {data['contract']}"),
]:
    y = paragraph(f'<b>{label}:</b> {escape(value)}', 42, y, 528, size=8.7, leading=11.5) - 6
assert y >= 49, f'Footer overlap: remaining y={y}'

pdf.setStrokeColor(rule)
pdf.line(42, 43, 570, 43)
text(42, 30, data['disclaimer'], 7.8, color=muted)
text(570, 16, '1 / 1', 7.5, color=muted, right=True)
pdf.save()
copyfile(OUTPUT, ROOT / 'public/demo-invoice.pdf')
print(f'Created {OUTPUT}')
