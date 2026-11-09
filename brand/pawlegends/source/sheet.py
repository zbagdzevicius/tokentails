import sys
from PIL import Image, ImageDraw
D=sys.argv[1]
O=lambda n: Image.open(f"{D}/{n}").convert("RGBA")
W,H=1800,1500
sh=Image.new("RGBA",(W,H),"#ffffff"); d=ImageDraw.Draw(sh)
dark=Image.new("RGBA",(W//2,560),"#14101c"); sh.paste(dark,(0,0))
def put(im,x,y,w=None,label=None):
    if w: im=im.resize((w,round(im.height*w/im.width)),Image.LANCZOS)
    sh.alpha_composite(im,(x,y))
    if label: d.text((x,y+im.height+4),label,fill="#888")
    return im
logo=O("logo.png"); put(logo,30,20,840,"logo.png on dark")
put(logo,930,20,840,"logo.png on white")
cmp_=O("logo-compact.png"); put(cmp_,30,620,420,"compact 420"); put(cmp_,30,780,200,"compact 200"); put(cmp_,260,780,120,"120")
put(logo,480,620,240,"logo 240"); put(logo,740,620,120,"120")
em=O("emblem-square-1024.png"); put(em,930,600,260,"emblem"); put(em,1210,600,64,"64"); put(em,1290,600,32,"32")
ios=O("app-icon-ios-1024.png"); x=30
for s in (300,120,60,40,29):
    put(ios,x,920,s,f"iOS {s}"); x+=s+20
mac=O("app-icon-macos-1024.png"); x=640
for s in (300,128,64,32,16):
    put(mac,x,920,s,f"mac {s}"); x+=s+20
x=1340
for n,s in (("favicon-48.png",48),("favicon-32.png",32),("favicon-16.png",16)):
    put(O(n),x,920,None,n); x+=110
mk=O("pwa-maskable-512.png").resize((200,200)); m=Image.new("L",(200,200)); ImageDraw.Draw(m).ellipse((20,20,180,180),fill=255)
c=Image.new("RGBA",(200,200),"#ffffff"); c.paste(mk,(0,0),m); put(c,1250,1010,None,"maskable, 80% safe circle")
put(O("og-1200x630.png"),30,1250,400,None); d.text((440,1260),"og-1200x630",fill="#888")
put(O("pwa-icon-192.png"),1500,1010,None,"pwa 192")
sh.convert("RGB").save(f"{D}/contact-sheet.png", optimize=True)
