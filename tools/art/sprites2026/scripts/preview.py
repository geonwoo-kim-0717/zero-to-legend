import sys
from PIL import Image
files=sys.argv[2:]; ims=[Image.open(f) for f in files]; k=10; pad=20
W=sum(i.width*k for i in ims)+pad*(len(ims)+1); H=max(i.height*k for i in ims)+pad*2
for bgc,name in (((7,6,15),'dark'),):
    c=Image.new('RGBA',(W,H),bgc+(255,)); x=pad
    for i in ims:
        b=i.resize((i.width*k,i.height*k),Image.NEAREST); c.alpha_composite(b,(x,H-pad-b.height)); x+=b.width+pad
    c.save(sys.argv[1])
