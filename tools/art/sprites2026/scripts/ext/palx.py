"""Extended palette shared by the unit re-pixelation: the game's 16 colours (same indices) + muted mid-tones + skin."""
import numpy as np
PALH=["07060F","1A1030","2A1747","3D1F66","8A7AA8","E8F7FF","00F0FF","0A7A8A","FF2BD6","8A1A70","FFF23A","FF8A1F","8A3A10","FF2A3A","39FF88","B6FF3A"]
EXT=["1E2233","3A4058","5C6680","A8B0C4","0F4A55","2E9AA8","8FD8DE","5A1650","B8459E","E8A0D8",
     "5A1018","B8333A","4A220E","C2671E","B89A2A","15502E","2E9E5A","6B5A8A","C9C2D9",
     "4A2C2A","8A5A4A","C08A70","E6BFA0"]
PALX=np.array([[int(h[i:i+2],16) for i in (0,2,4)] for h in PALH+EXT],float)
SKIN=set(range(len(PALX)-4,len(PALX)))
BRIGHT={5,6,8,10,11,13,14,15}            # neon identity colours: kept as the 16-colour mapping chose them
def nearx(m, skip_outline=True, skin=False):
    rm=(PALX[:,0]+m[0])/2; d=PALX-m
    e=(2+rm/256)*d[:,0]**2+4*d[:,1]**2+(2+(255-rm)/256)*d[:,2]**2
    if skip_outline: e[0]=1e18          # the outline colour stays reserved for the outline
    if not skin:
        for i in SKIN: e[i]=1e18
    return int(np.argmin(e))
def hybrid(m, idx16, skin=False):
    """extended detail for darks, metals and shadows; the bright neon the sprite is recognised by stays"""
    return idx16 if idx16 in BRIGHT else nearx(m, skin=skin)
