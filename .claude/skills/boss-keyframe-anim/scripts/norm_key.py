"""norm_key.py <chatgpt.png> <out_frame.png> [--lift=0.12]
ChatGPT keypose (any size, flat magenta) -> 960x960 magenta frame at the boss's FIXED source scale,
feet on y=0.82*960, body centred. Every keypose of one boss must use the same K (edit K below per boss:
K = 0.58*960 / <figure height in px of that boss's base image>)."""
import sys, numpy as np
from PIL import Image
K=float([a.split("=")[1] for a in sys.argv if a.startswith("--k=")][0]) if any(a.startswith("--k=") for a in sys.argv) else 0.58*960/858
lift=float([a.split("=")[1] for a in sys.argv if a.startswith("--lift=")][0]) if any(a.startswith("--lift=") for a in sys.argv) else 0.0
src,out=[a for a in sys.argv[1:] if not a.startswith("--")][:2]
def isbg(a):
    r,g,b=a[...,0],a[...,1],a[...,2]; return (r>140)&(b>110)&(g<120)&(r-g>70)&(b-g>50)
im=Image.open(src).convert("RGB"); a=np.asarray(im).astype(int); ys,xs=np.where(~isbg(a))
s=im.resize((round(im.width*K),round(im.height*K)),Image.LANCZOS)
c=Image.new("RGB",(960,960),(255,0,255))
c.paste(s,(480-int((xs.min()+xs.max())/2*K), int(0.82*960)-int(ys.max()*K)-int(lift*960))); c.save(out)
print("figure px at 960:",int((ys.max()-ys.min())*K))
