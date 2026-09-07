import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # Header
        self.drawString(36, 762, "HabariPay Ltd (Squad) — Virtual Accounts UAT Sign Off")
        self.drawRightString(576, 762, "MID: SBL4ECW7UW | Clarion A.I")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(36, 756, 576, 756)
        
        # Footer
        self.line(36, 40, 576, 40)
        self.drawString(36, 28, "Confidential — Prepared for Squad Integration Team")
        self.drawRightString(576, 28, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()

def build_pdf():
    pdf_path = r"C:\Users\m\Downloads\SQUAD_B2C_B2B_Static_VA_UAT_Sign_Off_Completed_Clarion_AI.pdf"
    
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0F172A'),
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#475569'),
        spaceAfter=12
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=10,
        spaceAfter=4
    )

    meta_label = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#334155')
    )

    meta_val = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0F172A')
    )

    code_title = ParagraphStyle(
        'CodeTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#0284C7'),
        spaceAfter=2
    )

    code_style = ParagraphStyle(
        'CodeStyle',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7,
        leading=8.5,
        textColor=colors.HexColor('#0F172A')
    )

    story = []

    # Title Block
    story.append(Paragraph("Virtual Accounts Integration Sign Off (UAT)", title_style))
    story.append(Paragraph("Squad B2C-B2B Static Virtual Accounts Verification Document", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceAfter=10))

    # Merchant Metadata Box
    meta_data = [
        [Paragraph("Organization Name:", meta_label), Paragraph("Clarion A.I (Clarion Digital Hub)", meta_val),
         Paragraph("Merchant ID (MID):", meta_label), Paragraph("SBL4ECW7UW", meta_val)],
        [Paragraph("Authorized Contact:", meta_label), Paragraph("Mustapha Lawal", meta_val),
         Paragraph("Integration Date:", meta_label), Paragraph("August 17, 2026", meta_val)],
        [Paragraph("Environment:", meta_label), Paragraph("Squad Sandbox API", meta_val),
         Paragraph("Base URL:", meta_val), Paragraph("https://sandbox-api-d.squadco.com", meta_val)]
    ]
    
    t_meta = Table(meta_data, colWidths=[110, 160, 110, 160])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 12))

    def make_box(title, text_content):
        safe_text = text_content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>").replace(" ", "&nbsp;")
        p_title = Paragraph(title, code_title)
        p_code = Paragraph(safe_text, code_style)
        
        t = Table([[p_title], [p_code]], colWidths=[260])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F5F9')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        return t

    def add_test_section(num_str, title_str, endpoint_str, req_text, res_text):
        elems = []
        elems.append(Paragraph(f"{num_str}. {title_str}", section_heading))
        elems.append(Paragraph(f"<b>Endpoint:</b> <font color='#475569'>{endpoint_str}</font>", ParagraphStyle('Ep', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, leading=11, spaceAfter=4)))
        
        box_req = make_box("Merchant's Request Payload Sent", req_text)
        box_res = make_box("Merchant's Response Received", res_text)
        
        grid = Table([[box_req, box_res]], colWidths=[265, 265])
        grid.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ]))
        elems.append(grid)
        elems.append(Spacer(1, 8))
        return KeepTogether(elems)

    def make_box_3col(title, text_content):
        safe_text = text_content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>").replace(" ", "&nbsp;")
        p_title = Paragraph(title, code_title)
        p_code = Paragraph(safe_text, code_style)
        
        t = Table([[p_title], [p_code]], colWidths=[170])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F5F9')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        return t

    def add_test_section_3_col(num_str, title_str, endpoint_str, req_text, res_text, webhook_text):
        elems = []
        elems.append(Paragraph(f"{num_str}. {title_str}", section_heading))
        elems.append(Paragraph(f"<b>Endpoint:</b> <font color='#475569'>{endpoint_str}</font>", ParagraphStyle('Ep', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, leading=11, spaceAfter=4)))
        
        box_req = make_box_3col("Sample Payload", req_text)
        box_res = make_box_3col("Expected Response payment for simulation", res_text)
        box_web = make_box_3col("Webhook notification", webhook_text)
        
        grid = Table([[box_req, box_res, box_web]], colWidths=[176, 176, 176])
        grid.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ]))
        elems.append(grid)
        elems.append(Spacer(1, 8))
        return KeepTogether(elems)

    # Test 1
    req1 = '''{\n  "customer_identifier": "161856060690464",\n  "first_name": "MG",\n  "last_name": "Clarion",\n  "mobile_num": "08000000000",\n  "bvn": "22308000843",\n  "dob": "03/11/2002",\n  "gender": "1",\n  "address": "11 Bukole str, Aja, Lagos",\n  "email": "161856060690464@nyscbot.com",\n  "beneficiary_account": "0000000000"\n}'''
    res1 = '''{\n  "status": 200,\n  "success": true,\n  "message": "Success",\n  "data": {\n    "first_name": "MG",\n    "last_name": "Clarion",\n    "mobile_num": "08000000000",\n    "email": "161856060690464@nyscbot.com",\n    "customer_identifier": "161856060690464",\n    "virtual_account_number": "9298876974",\n    "beneficiary_account": "0000000000"\n  }\n}'''
    story.append(add_test_section("1", "Create Virtual Account (Individual)", "POST https://sandbox-api-d.squadco.com/virtual-account", req1, res1))

    # Test 2
    req2 = '''{\n  "customer_identifier": "161856060690464_BUS",\n  "business_name": "Clarion A.I",\n  "mobile_num": "08033455084",\n  "bvn": "22308000843",\n  "email": "business@clarion.com",\n  "beneficiary_account": "0000000000"\n}'''
    res2 = '''{\n  "status": 422,\n  "success": false,\n  "message": "Merchant has reached account opening limit, please contact habaripay support",\n  "data": {}\n}'''
    story.append(add_test_section("2", "Create Virtual Account (Business)", "POST https://sandbox-api-d.squadco.com/virtual-account/business", req2, res2))

    # Test 3 (3 Columns: Sample Payload, Response for Simulation, Webhook Notification)
    req3 = '''{\n  "virtual_account_number": "9298876974",\n  "amount": "59000"\n}'''
    res3 = '''{\n  "status": 200,\n  "success": true,\n  "message": "Success",\n  "data": "Payment successful"\n}'''
    web3 = '''{\n  "transaction_reference": "REF4YRYV6TYD1786986259648",\n  "virtual_account_number": "9298876974",\n  "principal_amount": "59000.00",\n  "settled_amount": "58852.50",\n  "fee_charged": "147.50",\n  "transaction_date": "2026-08-17T17:04:19+01:00",\n  "customer_identifier": "161856060690464",\n  "transaction_indicator": "C",\n  "remarks": "Transfer from MG Clarion to sandbox | [161856060690464]",\n  "currency": "NGN",\n  "channel": "virtual-account",\n  "sender_name": "MG Clarion",\n  "meta": {\n    "freeze_transaction_ref": null,\n    "reason_for_frozen_transaction": null\n  }\n}'''
    story.append(add_test_section_3_col("3", "Simulate Payment", "POST https://sandbox-api-d.squadco.com/virtual-account/simulate/payment", req3, res3, web3))

    # Test 4
    req4 = '''GET Parameter: customer_identifier = 161856060690464'''
    res4 = '''{\n  "status": 200,\n  "success": true,\n  "message": "Success",\n  "data": [\n    {\n      "transaction_reference": "REF4YRYV6TYD1786986259648",\n      "virtual_account_number": "9298876974",\n      "principal_amount": "59000.00",\n      "settled_amount": "58852.50",\n      "fee_charged": "147.50",\n      "transaction_date": "2026-08-17T17:04:19.648Z",\n      "transaction_indicator": "C",\n      "remarks": "Transfer from MG Clarion to sandbox | [161856060690464]",\n      "currency": "NGN",\n      "customer": { "customer_identifier": "161856060690464" }\n    }\n  ]\n}'''
    story.append(add_test_section("4", "Query Customers Transaction", "GET https://sandbox-api-d.squadco.com/virtual-account/customer/transactions/161856060690464", req4, res4))

    # Test 5
    req5 = '''GET Request (Merchant level)'''
    res5 = '''{\n  "status": 200,\n  "success": true,\n  "message": "Success",\n  "data": [\n    {\n      "transaction_reference": "REF4YRYV6TYD1786986259648",\n      "virtual_account_number": "9298876974",\n      "principal_amount": "59000.00",\n      "settled_amount": "58852.50",\n      "fee_charged": "147.50",\n      "transaction_date": "2026-08-17T17:04:19.648Z",\n      "transaction_indicator": "C",\n      "currency": "NGN"\n    }\n  ]\n}'''
    story.append(add_test_section("5", "Query Merchants Transaction", "GET https://sandbox-api-d.squadco.com/virtual-account/merchant/transactions", req5, res5))

    # Test 6
    req6 = '''GET Parameter: virtual_account_number = 9298876974'''
    res6 = '''{\n  "status": 200,\n  "success": true,\n  "message": "Success",\n  "data": {\n    "first_name": "MG",\n    "last_name": "Clarion",\n    "mobile_num": "08000000000",\n    "email": "161856060690464@nyscbot.com",\n    "customer_identifier": "161856060690464",\n    "virtual_account_number": "9298876974",\n    "beneficiary_account": "0000000000"\n  }\n}'''
    story.append(add_test_section("6", "Retrieve VA Details", "GET https://sandbox-api-d.squadco.com/virtual-account/customer/9298876974", req6, res6))

    # Test 7
    req7 = '''GET Parameter: customer_identifier = 161856060690464'''
    res7 = '''{\n  "status": 200,\n  "success": true,\n  "message": "Success",\n  "data": {\n    "first_name": "MG",\n    "last_name": "Clarion",\n    "bank_code": "058",\n    "virtual_account_number": "9298876974",\n    "customer_identifier": "161856060690464",\n    "created_at": "2026-08-11T14:27:05.928Z"\n  }\n}'''
    story.append(add_test_section("7", "Retrieve VA Details Using Customer Identifier", "GET https://sandbox-api-d.squadco.com/virtual-account/161856060690464", req7, res7))

    # Formal Sign Off Section
    sign_elems = []
    sign_elems.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=10, spaceAfter=8))
    sign_elems.append(Paragraph("CONCLUSION & FORMAL SIGN OFF", section_heading))
    
    decl_text = "I, <b>Mustapha Lawal</b>, on behalf of my organization <b>Clarion A.I (Clarion Digital Hub)</b> with MID <b>SBL4ECW7UW</b>, have completed all these tests on the sandbox environment, implemented a duplicate transaction checker, and have confirmed the system is working as expected and have made necessary integrations with this in view."
    sign_elems.append(Paragraph(decl_text, ParagraphStyle('Decl', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=colors.HexColor('#334155'), spaceAfter=12)))

    sig_table_data = [
        [Paragraph("<b>Authorized Signature:</b>", meta_label), Paragraph("<font fontName='Times-BoldItalic' size=14 color='#0F172A'>Mustapha Lawal</font>", meta_val)],
        [Paragraph("<b>Full Name:</b>", meta_label), Paragraph("Mustapha Lawal", meta_val)],
        [Paragraph("<b>Title / Role:</b>", meta_label), Paragraph("Founder / Lead Architect, Clarion A.I", meta_val)],
        [Paragraph("<b>Date:</b>", meta_label), Paragraph("August 17, 2026", meta_val)]
    ]
    t_sig = Table(sig_table_data, colWidths=[130, 410])
    t_sig.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
    ]))
    sign_elems.append(t_sig)
    
    story.append(KeepTogether(sign_elems))

    doc.build(story, canvasmaker=NumberedCanvas)
    print("PDF generated successfully at: " + pdf_path)

if __name__ == '__main__':
    build_pdf()
