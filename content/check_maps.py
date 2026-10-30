# Checks the project maps in content/: structure, step-to-concept links, no language names or code,
# and that every resource link opens. Run from the repo root:
#   uv run --with pyyaml python content/check_maps.py content [--no-links]
import sys, re, glob, yaml, urllib.request, concurrent.futures as cf

LANG = re.compile(r'\b(java|python|javascript|typescript|node(\.js)?|rust|golang|c\+\+|c#|kotlin|ruby|php|swift)\b', re.I)
CODE = re.compile(r'`|\{\s*"|=>|\(\)')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
check_links = '--no-links' not in sys.argv
ok = True
links = []

for path in sorted(glob.glob(sys.argv[1] + '/*.yaml')):
    m = yaml.safe_load(open(path, encoding='utf-8'))
    errs = []
    p = m.get('project', {})
    for f in ['slug', 'title', 'source_url', 'level', 'summary']:
        if not p.get(f): errs.append(f'project.{f} missing')
    if p.get('level') not in ('beginner', 'intermediate', 'advanced'): errs.append('bad level')
    cids = [c['id'] for c in m['concepts']]
    if len(cids) != len(set(cids)): errs.append('duplicate concept id')
    for c in m['concepts']:
        for f in ['id', 'name', 'explanation', 'why_here', 'origin']:
            if not c.get(f): errs.append(f'concept {c.get("id")}: {f} missing')
        if c.get('origin') not in ('step', 'beyond'): errs.append(f'concept {c["id"]}: bad origin')
        if not isinstance(c.get('covers', []), list): errs.append(f'concept {c["id"]}: covers must be a list')
        rs = c.get('resources') or []
        if not 1 <= len(rs) <= 3: errs.append(f'concept {c["id"]}: needs 1 to 3 resources')
        for r in rs:
            if not r.get('title') or not str(r.get('url', '')).startswith('http'):
                errs.append(f'concept {c["id"]}: bad resource {r}')
            links.append(r['url'])
    used, last = set(), {}
    for s in m['steps']:
        for f in ['id', 'title', 'objective', 'check']:
            if not s.get(f): errs.append(f'step {s.get("id")}: {f} missing')
        for c in s.get('concepts', []):
            if c not in cids: errs.append(f'step {s["id"]}: unknown concept {c}')
            used.add(c)
            if not s.get('optional'):
                last[c] = s['id']
    for c in cids:
        if c not in used: errs.append(f'concept {c} used by no step')
    # language names and code are checked in our own text only, not in resource titles
    own = {'project': p, 'steps': m['steps'],
           'concepts': [{k: v for k, v in c.items() if k != 'resources'} for c in m['concepts']]}
    text = yaml.safe_dump(own, allow_unicode=True)
    for mt in LANG.finditer(text): errs.append(f'language name: {mt.group(0)}')
    for line in text.splitlines():
        if CODE.search(line): errs.append(f'code-like: {line.strip()[:70]}')
    beyond = sum(1 for c in m['concepts'] if c['origin'] == 'beyond')
    per_step = [len(s.get('concepts', [])) for s in m['steps']]
    print(f"{p['slug']:<14} {p['level']:<12} concepts={len(cids)} beyond={beyond} steps={len(m['steps'])} "
          f"optional={sum(1 for s in m['steps'] if s.get('optional'))} per-step={per_step}")
    print('   explain after: ' + ', '.join(f'{c}->{last.get(c, "optional only")}' for c in cids))
    for e in errs:
        print('   ERROR', e); ok = False


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,*/*'})
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read(400000).decode('utf-8', 'replace')
            t = re.search(r'<title[^>]*>(.*?)</title>', body, re.S | re.I)
            title = ' '.join(t.group(1).split())[:80] if t else '-'
            return r.status, url, r.geturl(), title
    except Exception as e:
        return getattr(e, 'code', 'ERR'), url, '', str(e)[:80]


if check_links:
    with cf.ThreadPoolExecutor(8) as ex:
        for st, url, final, title in ex.map(fetch, sorted(set(links))):
            moved = '' if not final or final.rstrip('/') == url.split('#')[0].rstrip('/') else f'  -> {final}'
            print(f'{st}  {url}{moved}\n      {title}' + ('' if st == 200 else '   <-- CHECK'))
            if st != 200: ok = False
    print(f'{len(set(links))} distinct links')
print('ALL OK' if ok else 'PROBLEMS FOUND')
