"""Build a large-type fictional payment slip for the phone-photo demo."""
import json
from pathlib import Path
from shutil import copyfile
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
invoice = json.loads((ROOT / 'fixtures/greenpoint-invoice.json').read_text())
payment = json.loads((ROOT / 'fixtures/greenpoint-payment.json').read_text())
assert payment['invoiceReference'] == invoice['invoiceId']
assert payment['contract'] == invoice['contract']
assert payment['amountSent'] - invoice['amountDue'] == 230000
OUTPUT = ROOT / 'output/pdf/greenpoint-payment-PAY882.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

ink = colors.HexColor('#183B34')
muted = colors.HexColor('#60716A')
pale = colors.HexColor('#EDF4EF')
line = colors.HexColor('#D9E3DD')
pdf = canvas.Canvas(str(OUTPUT), pagesize=(612, 792), invariant=1)
pdf.setTitle('Payment confirmation PAY-882 - Fictional Greenpoint demo')
pdf.setAuthor('Poast Demo')
pdf.setSubject('Fictional USD 350,000 payment linked to invoice INV204')

def text(x, y, value, size=14, bold=False, color=ink):
    pdf.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    pdf.setFillColor(color)
    pdf.drawString(x, y, value)

def paragraph(value, x, top, width, size=12, leading=17, color=ink):
    p = Paragraph(escape(value), ParagraphStyle('payment', fontName='Helvetica',
                  fontSize=size, leading=leading, textColor=color))
    _, height = p.wrap(width, 1000)
    p.drawOn(pdf, x, top - height)
    return top - height

text(48, 739, 'PAYMENT CONFIRMATION', 24, True)
text(48, 711, payment['paymentId'], 19, True)
text(48, 686, payment['recordType'], 11, color=muted)
pdf.setStrokeColor(ink)
pdf.setLineWidth(1.4)
pdf.line(48, 668, 564, 668)

text(48, 639, 'Payer', 10, True, muted)
paragraph(invoice['client'], 48, 625, 516, size=16, leading=21)
text(48, 584, f"Beneficiary: {invoice['supplier']}", 17, True)

pdf.setFillColor(pale)
pdf.roundRect(48, 484, 516, 68, 5, fill=1, stroke=0)
text(63, 509, f"Amount sent: {payment['currency']} {payment['amountSent']:,.2f}", 24, True)

y = 448
for label, value in [
    ('Invoice reference', payment['invoiceReference']),
    ('Contract', payment['contract']),
    ('Date sent', payment['dateSent']),
    ('Status', payment['status']),
]:
    text(48, y, f'{label}: {value}', 18, True)
    pdf.setStrokeColor(line)
    pdf.setLineWidth(.5)
    pdf.line(48, y - 14, 564, y - 14)
    y -= 49

text(48, 231, 'Project', 10, True, muted)
paragraph(invoice['project'], 48, 216, 516, size=14, leading=19)
text(48, 174, 'Location', 10, True, muted)
paragraph(invoice['location'], 48, 159, 516, size=13, leading=18)

pdf.setStrokeColor(line)
pdf.line(48, 77, 564, 77)
paragraph(payment['disclaimer'], 48, 63, 516, size=9, leading=12, color=muted)
text(542, 23, '1 / 1', 8, color=muted)
pdf.save()
copyfile(OUTPUT, ROOT / 'public/demo-payment.pdf')
print(f'Created {OUTPUT}')
