"""Version anglaise des visuels de cartes : efface le texte français (masque + retouche
OpenCV) puis réécrit le texte anglais avec la même mise en forme (rendu HTML/Chromium).
Originaux : ressources/visuels-originaux-fr/.  Sortie : public/img/cartes/ (+ textures 3d/*.webp).
Usage : python3 ressources/traduire_visuels.py [nom ...]"""
import sys, os, cv2, numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

RAC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(RAC, 'ressources/visuels-originaux-fr')
SORTIE = os.path.join(RAC, 'public/img/cartes')
TMP = os.path.join(RAC, 'ressources/.tmp-visuels')
FONTS = {
    'Poppins': [('/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf', 700, 'normal'), ('/usr/share/fonts/truetype/google-fonts/Poppins-BoldItalic.ttf', 700, 'italic'),
                ('/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf', 500, 'normal'), ('/usr/share/fonts/truetype/google-fonts/Poppins-MediumItalic.ttf', 500, 'italic'),
                ('/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf', 400, 'normal')],
    'Inter': [('/usr/share/fonts/opentype/inter/Inter-Regular.otf', 400, 'normal'), ('/usr/share/fonts/opentype/inter/Inter-Medium.otf', 500, 'normal'),
              ('/usr/share/fonts/opentype/inter/Inter-Black.otf', 900, 'normal'), ('/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf', 900, 'italic'),
              ('/usr/share/fonts/opentype/inter/Inter-ExtraBoldItalic.otf', 800, 'italic')],
    'Chorus': [('/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyrechorus-mediumitalic.otf', 400, 'normal')],
}
OR = 'linear-gradient(180deg,#FFF1B8 0%,#F7CF6A 38%,#E3A72F 62%,#B97A16 100%)'
ARGENT = 'linear-gradient(180deg,#FFFFFF 0%,#F2F2F2 45%,#BDBDBD 58%,#EDEDED 100%)'

# Effacements : (x0, y0, x1, y1, mode)  mode = clair | sombre | tout
# Textes : dict(x, y, w, h, t, css, align)
V = {
 'fnac-darty': dict(eff=[(55, 528, 885, 632, 'clair')], txt=[
   dict(x=60, y=528, w=820, h=104, t='E-Gift Cards', css="font:700 92px Poppins;color:#fff;letter-spacing:-1px;text-shadow:0 4px 14px rgba(0,0,0,.55)")]),
 'microsoft-365-personnel': dict(eff=[(115, 138, 640, 205, 'clair'), (110, 805, 820, 872, 'clair')], txt=[
   dict(x=126, y=140, w=600, h=62, t='GIFT CARD', css="font:400 46px Inter;color:#fff;letter-spacing:.32em", align='left'),
   dict(x=122, y=806, w=760, h=64, t='Digital code · Instant delivery', css="font:400 38px Inter;color:#fff;opacity:.95", align='left')]),
 'pack-gamer-bf': dict(eff=[(305, 118, 825, 192, 'clair'), (365, 695, 1000, 775, 'clair')], txt=[
   dict(x=312, y=120, w=520, h=70, t='GAMER PACK', css="font:400 50px Inter;color:#fff;letter-spacing:.38em", align='left'),
   dict(x=378, y=696, w=640, h=78, t='<span style="font-weight:400">PC + </span>PlayStation<span style="font-weight:400"> gamers</span>', css="font:700 50px Poppins;color:#fff;letter-spacing:-.5px", align='left')]),
 'pack-productivite-bf': dict(eff=[(55, 305, 700, 535, 'clair'), (340, 592, 735, 668, 'clair'), (590, 742, 868, 842, 'tout'), (1040, 392, 1228, 446, 'clair')], txt=[
   dict(x=60, y=300, w=800, h=110, t='Productivity', css=f"font:italic 700 96px Poppins;color:#fff;letter-spacing:-3px;text-shadow:0 6px 18px rgba(0,0,0,.6)"),
   dict(x=60, y=420, w=618, h=112, t='Pack', css="font:italic 700 108px Poppins;color:#fff;letter-spacing:-3px;text-shadow:0 6px 18px rgba(0,0,0,.6)", align='right'),
   dict(x=352, y=596, w=420, h=70, t='Students &amp; pros', css="font:400 46px Poppins;color:#fff", align='left'),
   dict(x=598, y=744, w=320, h=46, t='Boost your', css="font:500 36px Poppins;color:#fff", align='left'),
   dict(x=598, y=786, w=320, h=54, t='productivity', css="font:700 40px Poppins;color:#F6B21B", align='left'),
   dict(x=1046, y=394, w=176, h=50, t='Personal', css="font:500 34px Poppins;color:#fff;transform:rotate(-4deg)")]),
 'pack-shopping-bf': dict(eff=[(110, 300, 840, 560, 'clair'), (245, 612, 885, 680, 'clair')], txt=[
   dict(x=150, y=292, w=690, h=118, t='Shopping', css="font:italic 700 110px Poppins;color:#fff;letter-spacing:-4px;text-shadow:0 6px 18px rgba(0,0,0,.6)", align='right'),
   dict(x=120, y=418, w=672, h=140, t='Pack', css="font:italic 700 150px Poppins;color:#fff;letter-spacing:-4px;text-shadow:0 6px 18px rgba(0,0,0,.6)", align='right'),
   dict(x=252, y=614, w=640, h=64, t='Shopping: home, culture, fashion', css="font:500 36px Poppins;color:#fff", align='left')]),
 'pack-cocooning': dict(eff=[(570, 108, 642, 150, 'clair'), (105, 328, 910, 572, 'clair'), (360, 628, 915, 692, 'clair')], txt=[
   dict(x=110, y=330, w=800, h=118, t='Cosy Nights', css=f"font:italic 700 112px Poppins;color:#fff;letter-spacing:-3px;text-shadow:0 6px 18px rgba(0,0,0,.65)"),
   dict(x=110, y=430, w=800, h=150, t='Pack', css=f"font:italic 700 150px Poppins;background:{OR};-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-3px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.7))"),
   dict(x=372, y=630, w=560, h=60, t='Movie, TV &amp; music nights', css="font:400 42px Poppins;color:#fff", align='left')]),
 'pack-gamer-noel': dict(eff=[(536, 104, 608, 146, 'clair'), (90, 318, 935, 545, 'clair'), (385, 602, 775, 652, 'clair')], txt=[
   dict(x=95, y=318, w=840, h=118, t='Gamer', css=f"font:italic 700 118px Poppins;background:{ARGENT};-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-3px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.7))"),
   dict(x=95, y=420, w=840, h=130, t='Pack', css=f"font:italic 700 132px Poppins;background:{OR};-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-3px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.7))"),
   dict(x=380, y=600, w=400, h=56, t='Console gamers', css="font:500 42px Poppins;color:#fff")]),
 'pack-elle-lui': dict(eff=[(564, 122, 630, 160, 'sombre'), (110, 440, 492, 600, 'sombre'), (612, 440, 910, 600, 'sombre'), (195, 612, 822, 725, 'sombre'),
                            (150, 832, 245, 878, 'sombre'), (610, 832, 800, 885, 'sombre'), (1055, 432, 1235, 532, 'sombre'), (1355, 438, 1535, 538, 'clair')], txt=[
   dict(x=90, y=444, w=392, h=152, t='Him', css="font:italic 900 158px Inter;color:#0B0B0B;letter-spacing:-6px", align='right'),
   dict(x=612, y=444, w=330, h=152, t='Her', css="font:italic 900 158px Inter;color:#0B0B0B;letter-spacing:-6px", align='left'),
   dict(x=180, y=614, w=660, h=56, t='A fashion &amp; culture gift,', css="font:500 46px Poppins;color:#111"),
   dict(x=180, y=664, w=660, h=58, t='for him or for her', css="font:500 46px Poppins;color:#111"),
   dict(x=120, y=834, w=160, h=44, t='Fashion', css="font:500 30px Poppins;color:#111"),
   dict(x=596, y=834, w=220, h=48, t='And more…', css="font:500 30px Poppins;color:#111"),
   dict(x=1050, y=430, w=190, h=104, t='€50', css="font:700 84px Poppins;color:#0B0B0B;transform:rotate(-7deg);letter-spacing:-2px"),
   dict(x=1350, y=438, w=190, h=104, t='€50', css="font:700 84px Poppins;color:#fff;transform:rotate(5deg);letter-spacing:-2px")]),
 'pack-famille': dict(eff=[(1176, 120, 1282, 176, 'clair'), (740, 410, 1430, 512, 'clair'), (830, 540, 1360, 662, 'clair')], txt=[
   dict(x=740, y=408, w=690, h=104, t='Family Pack', css="font:600 96px Poppins;font-weight:700;color:#fff;letter-spacing:-1px"),
   dict(x=820, y=540, w=560, h=110, t='For the whole family', css="font:400 86px Chorus;color:#fff;-webkit-text-stroke:1.6px #fff;text-shadow:0 3px 8px rgba(0,0,0,.35);transform:rotate(-4deg)")]),
}

def masque(img, x0, y0, x1, y1, mode):
    z = img[y0:y1, x0:x1].astype(np.int16)
    b, g, r = z[..., 0], z[..., 1], z[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    if mode == 'clair':
        m = (lum > 150) | ((r > 150) & (g > 95) & (r - b > 70))
    elif mode == 'sombre':
        m = lum < 120
    else:
        m = (lum > 120) | ((r > 140) & (r - b > 60))
    out = np.zeros(img.shape[:2], np.uint8)
    out[y0:y1, x0:x1] = m.astype(np.uint8) * 255
    return out

def effacer(nom, ops):
    img = cv2.imread(os.path.join(ORIG, nom + '.png'), cv2.IMREAD_COLOR)
    for (x0, y0, x1, y1, mode) in ops:
        m = masque(img, x0, y0, x1, y1, mode)
        m = cv2.dilate(m, np.ones((7, 7), np.uint8), iterations=2)
        img = cv2.inpaint(img, m, 9, cv2.INPAINT_TELEA)
        # adoucit les traces de retouche à l'intérieur de la zone
        flou = cv2.GaussianBlur(img, (0, 0), 7)
        f = cv2.GaussianBlur(cv2.dilate(m, np.ones((9, 9), np.uint8)).astype(np.float32) / 255, (0, 0), 5)[..., None]
        img = (img * (1 - f) + flou * f).astype(np.uint8)
    return img

def html(nom, base, w, h, textes):
    ff = ''.join(f"@font-face{{font-family:'{fam}';src:url('file://{p}');font-weight:{wt};font-style:{st}}}" for fam, l in FONTS.items() for (p, wt, st) in l)
    spans = ''
    for t in textes:
        al = {'left': 'flex-start', 'right': 'flex-end'}.get(t.get('align'), 'center')
        spans += f"<div style='position:absolute;left:{t['x']}px;top:{t['y']}px;width:{t['w']}px;height:{t['h']}px;display:flex;align-items:center;justify-content:{al};white-space:nowrap'><span style=\"display:inline-block;line-height:1;{t['css']}\">{t['t']}</span></div>"
    return f"<!doctype html><meta charset=utf-8><style>{ff}*{{margin:0}}body{{width:{w}px;height:{h}px;position:relative;overflow:hidden;background:url('file://{base}') 0 0/100% 100%}}</style><body>{spans}"

def main(noms):
    os.makedirs(TMP, exist_ok=True)
    with sync_playwright() as p:
        nav = p.chromium.launch()
        for nom in noms:
            c = V[nom]
            img = effacer(nom, c['eff'])
            h, w = img.shape[:2]
            base = os.path.join(TMP, nom + '-base.png'); cv2.imwrite(base, img)
            src = os.path.join(TMP, nom + '.html'); open(src, 'w').write(html(nom, base, w, h, c['txt']))
            pg = nav.new_page(viewport={'width': w, 'height': h})
            pg.goto('file://' + src); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(150)
            final = os.path.join(SORTIE, nom + '.png'); pg.screenshot(path=final, omit_background=False); pg.close()
            # conserve la transparence éventuelle des coins arrondis de l'original
            o = Image.open(os.path.join(ORIG, nom + '.png'))
            f = Image.open(final).convert('RGB')
            if o.mode in ('RGBA', 'LA', 'P'):
                a = o.convert('RGBA').split()[-1]; f = f.convert('RGBA'); f.putalpha(a)
            f.save(final, optimize=True)
            t = f.copy(); t.thumbnail((640, 640), Image.LANCZOS)
            t.save(os.path.join(SORTIE, '3d', nom + '.webp'), quality=88)
            print('✓', nom)
        nav.close()

if __name__ == '__main__':
    main(sys.argv[1:] or list(V))
