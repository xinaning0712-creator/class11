"""每次更新網站前執行：幫所有 CSS／JS 加上新的版本號，瀏覽器就不會一直用舊檔案。

用法：python3 tools/bump_version.py
"""
import pathlib
import re
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = time.strftime('%Y%m%d%H%M')

HTML_REF = re.compile(r'((?:href|src)="(?:css|js)/[^"?]+\.(?:css|js))(?:\?v=[^"]*)?"')
JS_IMPORT = re.compile(r"""(from\s+'\./[^'?]+\.js)(?:\?v=[^']*)?'""")

changed = []
for path in ROOT.glob('*.html'):
    text = path.read_text(encoding='utf-8')
    new = HTML_REF.sub(rf'\1?v={VERSION}"', text)
    if new != text:
        path.write_text(new, encoding='utf-8')
        changed.append(path.name)
for path in (ROOT / 'js').glob('*.js'):
    text = path.read_text(encoding='utf-8')
    new = JS_IMPORT.sub(rf"\1?v={VERSION}'", text)
    if new != text:
        path.write_text(new, encoding='utf-8')
        changed.append(f'js/{path.name}')

print(f'版本 {VERSION}：更新了 {len(changed)} 個檔案')
