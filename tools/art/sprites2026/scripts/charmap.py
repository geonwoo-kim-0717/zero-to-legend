import sys
import numpy as np
from PIL import Image
PAL=["07060F","1A1030","2A1747","3D1F66","8A7AA8","E8F7FF","00F0FF","0A7A8A","FF2BD6","8A1A70","FFF23A","FF8A1F","8A3A10","FF2A3A","39FF88","B6FF3A"]
CH="o123WwCcMmYOBRGL"   # o=outline 1..3 purples W=grey w=white C=cyan c=dkcyan M=magenta m=dkmag Y=yellow O=orange B=brown R=red G=green L=lime
a=np.asarray(Image.open(sys.argv[1]).convert("RGBA"))
h,w=a.shape[:2]
print("   "+"".join(str(x%10) for x in range(w)))
for y in range(h):
    row=""
    for x in range(w):
        p=a[y,x]
        if p[3]==0: row+="."; continue
        hx="%02X%02X%02X"%tuple(p[:3]); row+=CH[PAL.index(hx)] if hx in PAL else "?"
    print("%2d "%y+row)
