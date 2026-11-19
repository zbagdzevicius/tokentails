import sys
from PIL import Image
out, h, cols, *fs = sys.argv[1:]
h=int(h); cols=int(cols)
ims=[Image.open(f).convert('RGB') for f in fs]
ims=[i.resize((int(i.width*h/i.height),h)) for i in ims]
w=max(i.width for i in ims); rows=(len(ims)+cols-1)//cols
M=Image.new('RGB',(w*cols,h*rows),(0,0,0))
for k,i in enumerate(ims): M.paste(i,((k%cols)*w,(k//cols)*h))
M.save(out,quality=88)
