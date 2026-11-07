"""Patch the bundled game.js: swap in new boss/trooper PNGs and add trooper frame animation.
usage: patch_game.py game.js sprites_dir out.js"""
import base64, os, re, sys

src, sprites, out = sys.argv[1:4]
s = open(src).read()

def uri(name):
    with open(os.path.join(sprites, name + ".png"), "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()

# 1) existing textures: replace the data URI bound to each asset's variable
mapping = dict(re.findall(r'"\.\./assets/([a-z0-9_]+)\.png":([A-Za-z_$][\w$]*)', s))
have = sorted(f[:-4] for f in os.listdir(sprites) if f.endswith(".png"))
replace = [n for n in have if n in mapping]
for name in replace:
    var = mapping[name]
    pat = re.compile(r'\b' + re.escape(var) + r'="data:image/png;base64,[A-Za-z0-9+/=]+"')
    s, n = pat.subn(lambda m: f'{var}="{uri(name)}"', s, count=1)
    assert n == 1, name
    print("replaced", name, "->", var)

# 2) new trooper frames: add entries to the asset map (loader keys textures by file name)
new = [n for n in have if n not in mapping]
m = re.search(r'Object\.assign\(\{"\.\./assets/', s)
assert m
end = s.index("})", m.end())
entries = "".join(f',"../assets/{n}.png":"{uri(n)}"' for n in new)
s = s[:end] + entries + s[end:]
print("added", len(new), "frames")

# 3) trooper animation: walk alternates w1/w2, windup -> aim, lunge/dodge -> charge (falls back to base)
anchor = 'c.id!=="drone"&&c.sprite.setFlipX(A<0);'
assert s.count(anchor) == 1, s.count(anchor)
anim = ('if(this.textures.exists(c.id+"_w2")){c.atkT=Math.max(0,(c.atkT||0)-L);'
        'const _a=c.atkT>0||(c.state!=="walk"&&c.state!=="dodge"&&c.id!=="sniper_turret")'
        '||((c.id==="trooper_tank"||c.id==="thug"||c.id==="sec_bot"||c.id==="drone"||c.id==="rat_bot")&&r<26),'
        '_k=_a?c.id+"_aim":Math.floor(this.elapsed*4+c.x*.01)%2?c.id:c.id+"_w2",'
        '_t=this.textures.exists(_k)?_k:c.id;c.sprite.texture.key!==_t&&c.sprite.setTexture(_t)}')
s = s.replace(anchor, anchor + anim)
# 4) player fire frame: weapons that play the pistol shot mark the player; update shows <tex>_atk briefly
a1 = 'this.walkTex=L.textures.exists(`${X}_w1`)?[`${X}_w1`,`${X}_w2`]:null'
assert s.count(a1) == 1
s = s.replace(a1, a1 + ',this.atkTex=L.textures.exists(`${X}_atk`)?`${X}_atk`:null')
a2 = 'const A=l?this.walkTex[Math.floor(this.walkT*8)%2]:this.baseTex;'
assert s.count(a2) == 1
s = s.replace(a2, 'this.atkT=Math.max(0,(this.atkT||0)-L);const A=this.atkT>0&&this.atkTex?this.atkTex:'
                  'l?this.walkTex[Math.floor(this.walkT*8)%2]:this.baseTex;'
                  'this.atkT>0&&this.atkX!==void 0&&this.sprite.setFlipX(this.atkX<this.x);')
a3 = 'if(this.targets.length===0)return;this.timer=this.interval,this.ctx.sfx("shoot");'
assert s.count(a3) == 1
s = s.replace(a3, 'if(this.targets.length===0)return;this.timer=this.interval,this.ctx.player.atkT=.15,'
                  'this.ctx.player.atkX=this.targets[0].x,this.ctx.sfx("shoot");')
print("player fire frame patched")
# 5) runner weapon hooks: mantis blade slash, plasma grenade throw, hack drone hit tick also show the attack frame
hooks = [
    ('o=this.has("reaperHarvest");this.ctx.sfx("slash");',
     'o=this.has("reaperHarvest");X.atkT=.18,X.atkX=X.x+Math.cos(t)*10,this.ctx.sfx("slash");'),
    ('const t=ta*this.area;Q?this.grenades.push(',
     'this.ctx.player.atkT=.2,this.ctx.player.atkX=Y;const t=ta*this.area;Q?this.grenades.push('),
    ('x&&(this.timer=this.interval,this.hitThisTick.clear())',
     'x&&(this.timer=this.interval,this.hitThisTick.clear(),this.ctx.phaser.time.now-(X.atkAt||0)>900&&this.ctx.grid.query(X.x,X.y,R+8,this.spreadBuf).some(l=>l.active)&&(X.atkAt=this.ctx.phaser.time.now,X.atkT=.2,X.atkX=X.x+Math.cos(this.angle)*R))'),
]
for old, new in hooks:
    assert s.count(old) == 1, old
    s = s.replace(old, new)
print("runner weapon hooks patched")
# 6) enemy attack hooks: gunner/cop shot, glitch ghost teleport
for old, new in [
    ('c.cd=i.interval*at.Math.FloatBetween(.8,1.2);const h=i.shots??1;', 'c.cd=i.interval*at.Math.FloatBetween(.8,1.2),c.atkT=.25;const h=i.shots??1;'),
    ('x.bulletLife,1.3),nt.play("enemyshot"),L.state="walk"', 'x.bulletLife,1.3),L.atkT=.25,nt.play("enemyshot"),L.state="walk"'),
    ('this.burst(L.x,L.y,it.cyan,6),this.onScreen(L.x,L.y)&&nt.play("glitch")', 'this.burst(L.x,L.y,it.cyan,6),L.atkT=.3,this.onScreen(L.x,L.y)&&nt.play("glitch")'),
]:
    assert s.count(old) == 1, old
    s = s.replace(old, new)
print("enemy attack hooks patched")
open(out, "w").write(s)
print("wrote", out, len(s))
