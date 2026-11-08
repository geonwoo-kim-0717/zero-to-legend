"""Exaggerate the identifying parts on the working references so they survive at 26px:
insulator grounding rod + ceramic discs, thorn spikes, brighter mirror shield."""
from PIL import Image, ImageDraw
import numpy as np
def ins():
    im=Image.open("work_c_insulator.png").convert("RGBA"); d=ImageDraw.Draw(im)
    d.rectangle([56,4,62,118],fill=(150,150,165,255)); d.polygon([(55,116),(63,116),(59,138)],fill=(230,120,40,255))
    for y in (22,32,42,52): d.rectangle([0,y,15,y+5],fill=(240,240,245,255)); d.rectangle([12,y+5,16,y+9],fill=(60,60,70,255))
    im.save("work_c_insulator.png")
def thorn():
    im=Image.open("work_c_thorn.png").convert("RGBA"); d=ImageDraw.Draw(im); c=(205,205,220,255)
    S=[((26,8),(32,6),(24,-6)),((34,6),(40,8),(44,-4)),((14,24),(20,30),(0,14)),((10,38),(14,46),(-6,36)),((8,52),(12,60),(-6,56)),
       ((10,66),(12,74),(-4,76)),((40,24),(46,30),(54,16)),((46,56),(48,64),(56,58)),((14,100),(18,106),(2,104)),((38,100),(40,108),(54,102))]
    for a,b,t in S: d.polygon([a,b,t],fill=c)
    im.save("work_c_thorn.png")
def mirror():
    a=np.array(Image.open("work_c_mirror.png").convert("RGBA")).astype(float)
    sh=a[:,36:,:3]; a[:,36:,:3]=np.clip((sh-60)*1.35+60,0,255)
    a[:,36:38,:3]=[230,250,255]                     # bright rim on the shield face
    Image.fromarray(a.astype(np.uint8),"RGBA").save("work_c_mirror.png")
ins(); thorn(); mirror()
