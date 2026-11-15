"""pl_run.py <A_frame.png> <B_frame.png> <scale.txt> <outdir> <name> <frames> <action...>
Pixelate two 960 magenta keyframes on ONE shared window (same scale, same ground), then PixelLab animate-with-text-v3 first->last."""
import sys, json, base64, io, time, subprocess, numpy as np, cv2, os
from PIL import Image
A,B,scf,out,name,N=sys.argv[1:7]; action=" ".join(sys.argv[7:]); N=int(N); os.makedirs(out,exist_ok=True)
def isbg(a):
    r,g,b=a[...,0],a[...,1],a[...,2]; return (r>140)&(b>110)&(g<120)&(r-g>70)&(b-g>50)
k=float(open(scf).read().split()[0]); cs=1/k; ims=[]
for f in (A,B):
    a=np.asarray(Image.open(f).convert("RGBA")).copy(); fg=~isbg(a.astype(int))
    n,lab,st,_=cv2.connectedComponentsWithStats(fg.astype(np.uint8),8)
    big=[i for i in range(1,n) if st[i,4]>=0.02*st[1:,4].max()]; m=np.isin(lab,big); a[...,3]=np.where(m,255,0); ims.append((a,m))
ys=np.concatenate([np.where(m)[0] for _,m in ims]); xs=np.concatenate([np.where(m)[1] for _,m in ims])
x0=xs.min()-4*cs; y1=ys.max()+1
W=int(np.ceil((xs.max()-x0)/cs))+4; H=int(np.ceil((y1-(ys.min()-4*cs))/cs))+1; W+=(-W)%8; H+=(-H)%8; y0=y1-H*cs
assert W<=256 and H<=256 and W*H*N<=524288, (W,H)
px=[]
for tag,(a,m) in zip("ab",ims):
    o=np.zeros((H,W,4),np.uint8); af=a.astype(float)
    for y in range(H):
        for x in range(W):
            Y0,Y1=int(round(y0+y*cs)),int(round(y0+(y+1)*cs)); X0,X1=int(round(x0+x*cs)),int(round(x0+(x+1)*cs))
            cell=af[max(Y0,0):max(Y1,0),max(X0,0):X1].reshape(-1,4); sol=cell[cell[:,3]>128]
            if len(cell) and len(sol)>=0.4*len(cell): o[y,x,:3]=np.median(sol[:,:3],0); o[y,x,3]=255
    r,g,b=[o[...,i].astype(int) for i in range(3)]; o[(o[...,3]>0)&(r-g>40)&(b-g>30)&(b>70)]=0
    al=o[...,3]>0; nb=np.zeros_like(al); nb[1:]|=al[:-1]; nb[:-1]|=al[1:]; nb[:,1:]|=al[:,:-1]; nb[:,:-1]|=al[:,1:]; o[nb&~al]=[7,6,15,255]
    p=f"{out}/{name}_key{tag}.png"; Image.fromarray(o).save(p); px.append(p)
print("canvas",W,H)
b64=lambda f:{"type":"base64","base64":base64.b64encode(open(f,'rb').read()).decode()}
body=json.dumps({"first_frame":b64(px[0]),"last_frame":b64(px[1]),"action":action,"frame_count":N,"no_background":True,"seed":7})
H_=["-H","Authorization: Bearer proxy-injected","-H","Content-Type: application/json"]
r=json.loads(subprocess.run(["curl","-sS","-m","90","-X","POST","https://api.pixellab.ai/v2/animate-with-text-v3",*H_,"--data-binary","@-"],input=body.encode(),capture_output=True).stdout)
jid=r["background_job_id"]; print("job",jid)
while True:
    d=json.loads(subprocess.run(["curl","-sS","-m","30","https://api.pixellab.ai/v2/background-jobs/"+jid,*H_],capture_output=True).stdout)
    if d["status"]!="processing": break
    time.sleep(5)
lr=d["last_response"]; print(d["status"],lr.get("usage"),lr.get("detail"))
fr=[]
for i,im in enumerate(lr["images"]):
    I=Image.open(io.BytesIO(base64.b64decode(im.get("base64") or im))).convert("RGBA"); I.save(f"{out}/{name}_{i:02d}.png"); fr.append(I)
fr.append(Image.open(px[1]))
S=3;C=2
sh=Image.new('RGBA',(C*(W*S+10),((len(fr)+C-1)//C)*(H*S+10)),(40,40,48,255))
for i,I in enumerate(fr):
    J=I.resize((W*S,H*S),Image.NEAREST); sh.paste(J,((i%C)*(W*S+10),(i//C)*(H*S+10)),J)
    P=Image.new('RGB',(16,16)); 
sh.save(f"{out}/{name}_sheet.png")
