"""Build the Excel pilot workbook (Budget_Tracker_Pilot.xlsx).

Input: a JSON file at INPUT with {"tx": [...], "cats": [...], "rules": [...]}, where
  tx    = [{"d": "YYYY-MM-DD", "desc": str, "amt": float, "acct": str, "cat": category id}, ...]
  cats  = the app's DEF_CATS ({"id", "name", "type"}), rules = the app's DEF_RULES ({"k", "s", "cat"}).
Optional: overrides.json mapping a transaction's index to a category name, written into
"My category" for rows the Excel rules would categorise differently from the app.
Run: python3 build_excel_pilot.py [use-overrides]   (needs openpyxl)
"""
import json, sys, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, DataBarRule, FormulaRule
from openpyxl.chart import BarChart, Reference
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.utils import get_column_letter as L

INPUT='transactions.json'
D=json.load(open(INPUT)); overrides=json.load(open('overrides.json')) if len(sys.argv)>1 else {}
cats=D['cats']; name={c['id']:c['name'] for c in cats}
TYPE={'exp':'Spending','inc':'Income','xfer':'Not counted'}
order=[c for c in cats if c['type']=='exp']+[c for c in cats if c['type']=='inc']+[c for c in cats if c['type']=='xfer']
NEXP=sum(1 for c in cats if c['type']=='exp')
MAXR=2500; RR=300; BR=45   # last rows: Transactions, Rules, Budget
F=lambda **k: Font(name='Arial',size=k.pop('size',10),**k)
BLUE=F(color='0000FF'); BOLD=F(bold=True); HEAD=F(bold=True,color='FFFFFF'); MUTED=F(color='666666',size=9)
HFILL=PatternFill('solid',fgColor='1F4E79'); INFILL=PatternFill('solid',fgColor='FFF9DB'); SOFT=PatternFill('solid',fgColor='F2F2F2')
thin=Side(style='thin',color='D9D9D9'); BOX=Border(bottom=thin)
RAND='"R"#,##0.00;[Red]-"R"#,##0.00;"R"0.00'; RAND0='"R"#,##0;[Red]-"R"#,##0;"-"'; DATE='dd mmm yyyy'
wb=Workbook()
def head(ws,row,labels,widths=None):
    for i,t in enumerate(labels,1):
        c=ws.cell(row,i,t); c.font=HEAD; c.fill=HFILL; c.alignment=Alignment(vertical='center',wrap_text=True)
    if widths:
        for i,w in enumerate(widths,1): ws.column_dimensions[L(i)].width=w
def allfont(ws):
    for row in ws.iter_rows():
        for c in row:
            if c.font is None or c.font.name!='Arial': c.font=F()

# ---------- Start ----------
st=wb.active; st.title='Start'
st['A1']='Budget Tracker — Excel pilot'; st['A1'].font=F(bold=True,size=16)
st['A2']='Two-month pilot of the Budget Tracker app in Excel: same categories, rules, pay-cycle periods and budget view.'; st['A2'].font=MUTED
st['A4']='Setting'; st['A4'].font=BOLD
st['A5']='Budget period starts on day'; st['B5']=25; st['B5'].font=BLUE; st['B5'].fill=INFILL
st['C5']='Assumption: 25, because the salary lands on the 25th in the uploaded Nedbank statement. Use 1 for calendar months. Keep it between 1 and 28.'; st['C5'].font=MUTED
wb.defined_names['StartDay']=DefinedName('StartDay',attr_text="Start!$B$5")
dv=DataValidation(type='whole',operator='between',formula1='1',formula2='28',allow_blank=False); st.add_data_validation(dv); dv.add('B5')
st['A7']='Colour key'; st['A7'].font=BOLD
st['A8']='Blue text on yellow'; st['A8'].font=BLUE; st['A8'].fill=INFILL; st['B8']='Cells you type in'
st['A9']='Black text'; st['B9']='Formulas — leave these alone'
st['A11']='How to use it'; st['A11'].font=BOLD
steps=['1. Transactions: add one row per transaction in columns A–D (Date, Description, Amount, Account). Money in is positive, money out is negative. Type cash spending by hand.',
 '2. Faster route for statements: upload the PDF in the Budget Tracker app, then Settings > Download transactions (.csv), open the file and paste its six columns into Transactions A–F below the last row.',
 '3. Category (column G) fills in by itself from the Rules sheet. To change one transaction, pick a category in "My category" (column E).',
 '4. To change many at once, add a row at the bottom of Rules: text the description contains, direction, category. Rules lower in the list win.',
 '5. Budget: type a limit per category in column C. Add your own categories in the spare rows at the bottom.',
 '6. Dashboard: pick a period in cell C4 to see income, spending and budget progress for that pay cycle.',
 '7. Pilot review: one line per period — income, spending, variance against budget and how much is still uncategorised. Use the notes column for what you learn.',
 '8. Transfers between your own accounts belong in "Own-account transfers" so they are not counted as income or spending.']
for i,s in enumerate(steps): st.cell(12+i,1,s)
st['A21']='What is loaded'; st['A21'].font=BOLD
st['A22']='396 transactions from two statements: Capitec main account 1 Aug – 17 Nov 2026 (295) and Nedbank current account 23 Sep – 23 Oct 2026 (101). Both reconcile to the statement closing balance.'
st['A23']='Only 25 Sep – 24 Oct 2026 has both accounts. Other periods show Capitec only until the matching Nedbank statements are added.'
st['A24']='Formulas cover Transactions rows 2–2500, Rules rows 2–300 and Budget rows 2–45.'; st['A24'].font=MUTED
st.column_dimensions['A'].width=30; st.column_dimensions['B'].width=28; st.column_dimensions['C'].width=90
st.sheet_view.showGridLines=False

# ---------- Dashboard (created now for tab order) ----------
db=wb.create_sheet('Dashboard')

# ---------- Transactions ----------
tx=wb.create_sheet('Transactions')
head(tx,1,['Date','Description','Amount (R)\n+ in / − out','Account','My category\n(optional override)','Note','Category','Type','Period start'],[13,52,15,12,26,24,26,13,14])
tx.row_dimensions[1].height=32
for i,t in enumerate(D['tx']):
    r=i+2; y,m,d=map(int,t['d'].split('-'))
    tx.cell(r,1,dt.date(y,m,d)); tx.cell(r,2,t['desc']); tx.cell(r,3,t['amt']); tx.cell(r,4,t['acct'])
    if str(i) in overrides: tx.cell(r,5,overrides[str(i)])
rule=f"LOOKUP(2,1/(ISNUMBER(SEARCH(Rules!$A$2:$A${RR},$B{{r}}))*(Rules!$A$2:$A${RR}<>\"\")*(((Rules!$B$2:$B${RR}=\"\")+(Rules!$B$2:$B${RR}=\"in\")*($C{{r}}>0)+(Rules!$B$2:$B${RR}=\"out\")*($C{{r}}<0))>0)),Rules!$C$2:$C${RR})"
for r in range(2,MAXR+1):
    tx.cell(r,7,'=IF($B{r}="","",IF($E{r}<>"",$E{r},IFERROR({rule},IF($C{r}>0,"Other income","Uncategorised"))))'.replace('{rule}',rule).replace('{r}',str(r)))
    tx.cell(r,8,f'=IF($G{r}="","",IFERROR(VLOOKUP($G{r},Budget!$A$2:$B${BR},2,FALSE),"Spending"))')
    tx.cell(r,9,f'=IF($A{r}="","",DATE(YEAR($A{r}),MONTH($A{r})-IF(DAY($A{r})<StartDay,1,0),StartDay))')
    tx.cell(r,1).number_format=DATE; tx.cell(r,3).number_format=RAND; tx.cell(r,9).number_format=DATE
    for c in (1,2,3,4,5,6): tx.cell(r,c).font=BLUE
    for c in (7,8,9): tx.cell(r,c).fill=SOFT
tx.freeze_panes='A2'; tx.auto_filter.ref=f'A1:I{MAXR}'
dvc=DataValidation(type='list',formula1=f'=Budget!$A$2:$A${BR}',allow_blank=True); dvc.error='Pick a category from the Budget sheet list.'; tx.add_data_validation(dvc); dvc.add(f'E2:E{MAXR}')
tx.conditional_formatting.add(f'G2:G{MAXR}',FormulaRule(formula=['$G2="Uncategorised"'],fill=PatternFill('solid',bgColor='FFE7B3')))

# ---------- Budget ----------
bu=wb.create_sheet('Budget')
head(bu,1,['Category','Type','Budget per period (R)'],[32,15,22])
for i,c in enumerate(order):
    r=i+2; bu.cell(r,1,c['name']).font=BLUE; bu.cell(r,2,TYPE[c['type']]).font=BLUE
    if c['type']=='exp': x=bu.cell(r,3,0); x.font=BLUE; x.fill=INFILL; x.number_format=RAND0
for r in range(len(order)+2,BR+1):
    for c in (1,2,3): bu.cell(r,c).font=BLUE; bu.cell(r,c).fill=INFILL
    bu.cell(r,3).number_format=RAND0
dvt=DataValidation(type='list',formula1='"Spending,Income,Not counted"',allow_blank=True); bu.add_data_validation(dvt); dvt.add(f'B2:B{BR}')
bu['E1']='Total budget (spending)'; bu['E1'].font=BOLD; bu['F1']=f'=SUMIFS($C$2:$C${BR},$B$2:$B${BR},"Spending")'; bu['F1'].number_format=RAND0; bu['F1'].font=BOLD
bu['E3']='Budgets start at 0 (no limit set). Type your own limits in column C.'; bu['E3'].font=MUTED
bu['E4']=f'Rows {len(order)+2}–{BR} are spare: add a category name and a type there.'; bu['E4'].font=MUTED
bu['E5']='Renaming a category here? Rename it in the Rules sheet too.'; bu['E5'].font=MUTED
bu.column_dimensions['E'].width=26; bu.column_dimensions['F'].width=16; bu.freeze_panes='A2'

# ---------- Rules ----------
ru=wb.create_sheet('Rules')
head(ru,1,['Description contains','Direction\n(in / out / blank = any)','Category'],[30,22,32]); ru.row_dimensions[1].height=32
rules=[('banking app immediate payment','out','Payments to people'),('payshap payment','out','Payments to people'),('banking app transfer','','Own-account transfers')]+[(r['k'],r['s'],name[r['cat']]) for r in reversed(D['rules'])]
rules+=[('fee','out','Bank fees'),('m/c in','out','Bank fees'),('disputed debit order','out','Bank fees')]
for i,(k,s,c) in enumerate(rules):
    for j,v in enumerate((k,s,c),1): ru.cell(i+2,j,v).font=BLUE
for r in range(len(rules)+2,RR+1):
    for c in (1,2,3): ru.cell(r,c).font=BLUE; ru.cell(r,c).fill=INFILL
dvd=DataValidation(type='list',formula1='"in,out"',allow_blank=True); ru.add_data_validation(dvd); dvd.add(f'B2:B{RR}')
dvr=DataValidation(type='list',formula1=f'=Budget!$A$2:$A${BR}',allow_blank=True); ru.add_data_validation(dvr); dvr.add(f'C2:C{RR}')
ru['E1']='Add your own rules in the yellow rows at the bottom. When several rules match, the one lowest in the list wins.'; ru['E1'].font=MUTED
ru['E2']='A rule matches when its text appears anywhere in the description (not case-sensitive).'; ru['E2'].font=MUTED
ru.freeze_panes='A2'

# ---------- Pilot review ----------
pr=wb.create_sheet('Pilot review'); NP=12
pr['A1']='Pilot review — one line per budget period'; pr['A1'].font=F(bold=True,size=14)
pr['A2']='Figures update from Transactions. Yellow columns are for your own notes during the pilot.'; pr['A2'].font=MUTED
head(pr,4,['Period start','Period end','Income','Spending','Left over / (overspent)','Budget','Over / (under) budget','% of income spent','Uncategorised (count)','Uncategorised (R)','Bank fees','Transactions','All accounts loaded? (Y/N)','What I learned'],[14,14,14,14,16,14,16,12,14,14,12,13,16,50])
pr.row_dimensions[4].height=44
T='Transactions!'; A=f'{T}$C$2:$C${MAXR}'; G=f'{T}$G$2:$G${MAXR}'; H=f'{T}$H$2:$H${MAXR}'; I=f'{T}$I$2:$I${MAXR}'
for i in range(NP):
    r=5+i
    pr.cell(r,1,f'=MIN({I})' if i==0 else f'=EDATE(A{r-1},1)')
    pr.cell(r,2,f'=EDATE(A{r},1)-1')
    pr.cell(r,3,f'=SUMIFS({A},{H},"Income",{I},$A{r})')
    pr.cell(r,4,f'=-SUMIFS({A},{H},"Spending",{I},$A{r})')
    pr.cell(r,5,f'=C{r}-D{r}'); pr.cell(r,6,'=Budget!$F$1'); pr.cell(r,7,f'=IF(F{r}=0,"",D{r}-F{r})')
    pr.cell(r,8,f'=IF(C{r}>0,D{r}/C{r},"")')
    pr.cell(r,9,f'=COUNTIFS({G},"Uncategorised",{I},$A{r})'); pr.cell(r,10,f'=-SUMIFS({A},{G},"Uncategorised",{I},$A{r})')
    pr.cell(r,11,f'=-SUMIFS({A},{G},"Bank fees",{I},$A{r})'); pr.cell(r,12,f'=COUNTIFS({I},$A{r})')
    for c in (1,2): pr.cell(r,c).number_format=DATE
    for c in (3,4,5,6,7,10,11): pr.cell(r,c).number_format=RAND0
    pr.cell(r,8).number_format='0%'
    for c in (13,14): pr.cell(r,c).font=BLUE; pr.cell(r,c).fill=INFILL
pr['M5']='N'; pr['N5']='Capitec only: 25 Jul – 31 Jul not covered, no Nedbank statement'
pr['M6']='N'; pr['N6']='Capitec only: no Nedbank statement before 23 Sep'
pr['M7']='Y'; pr['N7']='Both accounts loaded'
pr['M8']='N'; pr['N8']='Capitec only so far, period still running'
pr.conditional_formatting.add(f'E5:E{4+NP}',CellIsRule(operator='lessThan',formula=['0'],font=Font(name='Arial',color='C00000')))
pr.freeze_panes='C5'
ch=BarChart(); ch.type='col'; ch.title='Income and spending by period'; ch.height=8.5; ch.width=22
ch.add_data(Reference(pr,min_col=3,max_col=4,min_row=4,max_row=4+NP),titles_from_data=True); ch.set_categories(Reference(pr,min_col=1,min_row=5,max_row=4+NP))
ch.roundedCorners=False; ch.legend.overlay=False; ch.title.overlay=False; ch.legend.position='b'; ch.x_axis.delete=False; ch.y_axis.delete=False
ch.x_axis.number_format='dd mmm'; ch.y_axis.number_format='#,##0'; ch.gapWidth=60
ch.series[0].graphicalProperties.solidFill='2A78D6'; ch.series[1].graphicalProperties.solidFill='EB6834'
pr.add_chart(ch,f'A{6+NP}')

# ---------- Dashboard ----------
db['B1']='Budget dashboard'; db['B1'].font=F(bold=True,size=16)
db['B2']='Pick a period in the yellow cell. Everything below updates.'; db['B2'].font=MUTED
db['B4']='Period starting'; db['B4'].font=BOLD
db['C4']=dt.date(2026,9,25); db['C4'].number_format=DATE; db['C4'].font=BLUE; db['C4'].fill=INFILL
db['D4']='to'; db['E4']='=EDATE(C4,1)-1'; db['E4'].number_format=DATE
dvp=DataValidation(type='list',formula1=f"='Pilot review'!$A$5:$A${4+NP}",allow_blank=False); db.add_data_validation(dvp); dvp.add('C4')
k=[('Income',f'=SUMIFS({A},{H},"Income",{I},$C$4)'),('Spending',f'=-SUMIFS({A},{H},"Spending",{I},$C$4)'),('Left over / (overspent)','=C7-C8'),('Total budget','=Budget!$F$1'),('Budget left / (over)','=IF(C10=0,"",C10-C8)'),('% of income spent','=IF(C7>0,C8/C7,"")'),('Moved between own accounts (not counted)',f'=SUMIFS({A},{H},"Not counted",{I},$C$4,{A},">0")'),('Uncategorised payments',f'=-SUMIFS({A},{G},"Uncategorised",{I},$C$4)')]
db['B6']='Summary'; db['B6'].font=HEAD; db['B6'].fill=HFILL; db['C6'].fill=HFILL
for i,(lab,f) in enumerate(k):
    r=7+i; db.cell(r,2,lab); c=db.cell(r,3,f); c.number_format='0%' if lab.startswith('%') else RAND0; c.font=BOLD
    db.cell(r,2).border=BOX; c.border=BOX
db.conditional_formatting.add('C9',CellIsRule(operator='lessThan',formula=['0'],font=Font(name='Arial',bold=True,color='C00000')))
db.conditional_formatting.add('C11',CellIsRule(operator='lessThan',formula=['0'],font=Font(name='Arial',bold=True,color='C00000')))
R0=17
for j,t in enumerate(['Category','Type','Budget','Actual','Left / (over)','% of budget used'],2):
    c=db.cell(R0,j,t); c.font=HEAD; c.fill=HFILL
for i in range(BR-1):
    r=R0+1+i; b=i+2
    db.cell(r,2,f'=IF(Budget!$A{b}="","",Budget!$A{b})'); db.cell(r,3,f'=IF(Budget!$A{b}="","",Budget!$B{b})')
    db.cell(r,4,f'=IF(OR($B{r}="",$C{r}<>"Spending"),"",Budget!$C{b})')
    db.cell(r,5,f'=IF($B{r}="","",SUMIFS({A},{G},$B{r},{I},$C$4)*IF($C{r}="Spending",-1,1))')
    db.cell(r,6,f'=IF(OR($D{r}="",$D{r}=0),"",$D{r}-$E{r})'); db.cell(r,7,f'=IF(OR($D{r}="",$D{r}=0),"",$E{r}/$D{r})')
    for c in (4,5,6): db.cell(r,c).number_format=RAND0
    db.cell(r,7).number_format='0%'
    for c in range(2,8): db.cell(r,c).border=BOX
last=R0+BR-1
db.conditional_formatting.add(f'G{R0+1}:G{last}',CellIsRule(operator='greaterThan',formula=['1'],fill=PatternFill('solid',bgColor='F8CBAD'),font=Font(name='Arial',color='C00000')))
db.conditional_formatting.add(f'F{R0+1}:F{last}',CellIsRule(operator='lessThan',formula=['0'],font=Font(name='Arial',color='C00000')))
db.conditional_formatting.add(f'E{R0+1}:E{R0+NEXP}',DataBarRule(start_type='num',start_value=0,end_type='max',color='2A78D6'))
for col,w in zip('ABCDEFG',[2,40,16,14,14,16,16]): db.column_dimensions[col].width=w
bc=BarChart(); bc.type='bar'; bc.title='Spending by category (selected period)'; bc.height=11; bc.width=18
bc.add_data(Reference(db,min_col=5,min_row=R0,max_row=R0+NEXP),titles_from_data=True); bc.set_categories(Reference(db,min_col=2,min_row=R0+1,max_row=R0+NEXP))
bc.roundedCorners=False; bc.legend=None; bc.title.overlay=False; bc.x_axis.delete=False; bc.y_axis.delete=False; bc.y_axis.number_format='#,##0'; bc.x_axis.scaling.orientation='maxMin'; bc.gapWidth=50
bc.series[0].graphicalProperties.solidFill='2A78D6'
db.add_chart(bc,'I4'); db.sheet_view.showGridLines=False; db.freeze_panes='A6'
db['I27']=f'Chart shows the {NEXP} built-in spending categories (table rows {R0+1}–{R0+NEXP}).'; db['I27'].font=MUTED

for ws in wb: allfont(ws)
wb.active=1
wb.save('Budget_Tracker_Pilot.xlsx'); print('saved',len(rules),'rules')
