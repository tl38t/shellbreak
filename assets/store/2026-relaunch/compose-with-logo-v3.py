from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'source'
LOGO=Image.open(ROOT/'14-pc-logo-1280x720-v3.png').convert('RGBA')
LAND=Image.open(SOURCE/'key-visual-16x9-no-text.png').convert('RGB')
PORT=Image.open(SOURCE/'key-visual-portrait-no-text.png').convert('RGB')
def cover(im,size,anchor=(.5,.5)):
    tw,th=size; sw,sh=im.size; scale=max(tw/sw,th/sh); nw,nh=round(sw*scale),round(sh*scale)
    im=im.resize((nw,nh),Image.Resampling.LANCZOS)
    left=max(0,min(round((nw-tw)*anchor[0]),nw-tw)); top=max(0,min(round((nh-th)*anchor[1]),nh-th))
    return im.crop((left,top,left+tw,top+th)).convert('RGBA')
def comp(base,width,xy):
    l=LOGO.resize((width,round(LOGO.height*width/LOGO.width)),Image.Resampling.LANCZOS)
    base.alpha_composite(l,xy); return base.convert('RGB')
def save(name,im,q=91): im.save(ROOT/name,quality=q,optimize=True,progressive=True,subsampling=0)
save('15-promo-1920x1080-logo-v3.jpg',comp(cover(LAND,(1920,1080)),980,(38,512)))
save('16-promo-square-1440-logo-v3.jpg',comp(cover(LAND,(1440,1440),(.56,.5)),1180,(130,760)),90)
save('17-pc-cover-460x215-logo-v3.jpg',comp(cover(LAND,(460,215),(.5,.58)),364,(48,5)),92)
save('18-pc-cover-600x900-logo-v3.jpg',comp(cover(PORT,(600,900)),500,(50,600)))
for n in ('14-pc-logo-1280x720-v3.png','15-promo-1920x1080-logo-v3.jpg','16-promo-square-1440-logo-v3.jpg','17-pc-cover-460x215-logo-v3.jpg','18-pc-cover-600x900-logo-v3.jpg'):
 p=ROOT/n; im=Image.open(p); print(n,im.size,p.stat().st_size)
