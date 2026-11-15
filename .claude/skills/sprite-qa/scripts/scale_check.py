"""scale_check.py <out.gif> <glob1> [<glob2> ...]
All motions of one character side by side, feet on one ground line (cyan), 3x, looping.
Use it after every new motion: body/head size must match across motions; only airborne frames may leave the line."""
import sys, glob
from PIL import Image, ImageDraw
out=sys.argv[1]; seqs=[[Image.open(f).convert("RGBA") for f in sorted(glob.glob(g))] for g in sys.argv[2:]]
S=3;pad=10;W=sum(s[0].width+pad for s in seqs);H=max(s[0].height for s in seqs)+4;N=max(len(s) for s in seqs)*2;fr=[]
for t in range(N):
    c=Image.new("RGBA",(W*S,H*S),(40,40,48,255));x=0
    for s in seqs:
        I=s[t%len(s)];J=I.resize((I.width*S,I.height*S),0);c.paste(J,(x*S,(H-2-I.height)*S),J);x+=I.width+pad
    ImageDraw.Draw(c).line([(0,(H-2)*S),(W*S,(H-2)*S)],fill=(90,200,255));fr.append(c.convert("RGB"))
fr[0].save(out,save_all=True,append_images=fr[1:],duration=110,loop=0); fr[N//3].save(out.replace(".gif","_still.png"))
