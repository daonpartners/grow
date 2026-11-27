#!/usr/bin/env python3
"""다온 채용 칼럼 정적 페이지 + RSS 생성기.

입력: _tools/recruit_posts.json  (게시 승인된 채용 칼럼만 넣는다)
출력: recruit/index.html, recruit/p/<id>.html, recruit-sitemap.xml, rss.xml
rss.xml 에는 채용 칼럼과 column/p/*.html(설계사 칼럼, n8n이 발행)을 함께 최신순으로 넣는다.
실행: python3 _tools/build_recruit.py   (저장소 루트에서)
'_' 로 시작하는 폴더는 GitHub Pages(Jekyll)가 공개하지 않는다.
"""
import html, json, os, re, sys
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://grow.ai.kr/daon'
KST = timezone(timedelta(hours=9))
AUTHOR = {
    'name': '김화진', 'job': '다온지사 지사장', 'photo': SITE + '/assets/profile-hwajin-expert.jpg',
    'regNo': '20150978060015', 'profile': SITE + '/expert/?a=hwajin',
}
ORG = '미래에셋금융서비스 그로우사업부 다온지사'
NOTE = ('(이 글은 보험설계사 위촉 안내를 위한 글입니다. 위촉 요건·교육·시험 일정은 관련 규정과 회사 기준에 따르며, '
        '소득은 개인의 활동에 따라 달라집니다)')

esc = lambda s: html.escape(str(s or ''), quote=True)


def lines(t):
    return [x.strip() for x in re.split(r'\n+', str(t or '')) if x.strip()]


CSS = (':root{--ink:#14161A;--ink2:#3A4048;--steel:#6B7480;--line:#E4E7EA;--navy:#0B1E42;--pink:#E39BA5;--deep:#A85F6C;--tint:#F9E9EC}'
       '*{box-sizing:border-box;margin:0;padding:0}body{font-family:Pretendard,-apple-system,sans-serif;color:var(--ink);line-height:1.75;word-break:keep-all}a{color:inherit}'
       '.top{border-bottom:1px solid var(--line)}.top div{max-width:760px;margin:0 auto;padding:14px 20px;display:flex;justify-content:space-between;align-items:center}.top img{height:24px;display:block}'
       '.top nav a{font-size:13px;font-weight:700;text-decoration:none;margin-left:12px;color:var(--navy)}main{max-width:720px;margin:0 auto;padding:26px 20px 50px}'
       '.crumb{font-size:13px;color:var(--steel)}.crumb a{text-decoration:none}.badge{display:inline-block;font-size:12px;font-weight:800;color:var(--deep);background:var(--tint);padding:3px 9px;border-radius:6px;margin:14px 6px 0 0}'
       'h1{font-family:"Noto Serif KR",serif;font-weight:900;font-size:clamp(25px,6vw,34px);line-height:1.35;color:var(--navy);margin-top:10px;letter-spacing:-.015em}'
       '.by{display:flex;gap:10px;align-items:center;margin:14px 0 22px;font-size:13.5px;color:var(--steel)}.by img{width:38px;height:38px;border-radius:50%;object-fit:cover;object-position:top}.by b{color:var(--ink)}'
       '.ans{background:#F4F6FA;border-left:4px solid var(--navy);border-radius:8px;padding:16px 18px;font-size:16px}.ans strong{display:block;font-size:13px;color:var(--navy);margin-bottom:4px}'
       '.body{margin-top:24px;font-size:17px;line-height:1.95}.body p+p{margin-top:14px}.body h2{font-family:"Noto Serif KR",serif;font-size:21px;color:var(--navy);margin:30px 0 10px}'
       '.mid{margin:26px 0;background:var(--tint);border-radius:14px;padding:18px;display:grid;gap:8px}.mid b{font-size:17px;color:var(--navy)}.mid span{font-size:14.5px;color:var(--ink2)}'
       '.btn{display:block;text-align:center;text-decoration:none;font-weight:800;padding:14px;border-radius:10px;background:var(--navy);color:#fff}.btn.s{background:#fff;color:var(--deep);border:1.5px solid var(--deep)}'
       '.faq{margin-top:36px}.faq h2{font-family:"Noto Serif KR",serif;font-size:21px;color:var(--navy);margin-bottom:8px}.faq h3{font-size:16.5px;margin-top:16px;color:var(--navy)}.faq p{font-size:15.5px;color:var(--ink2)}'
       '.notes{margin-top:26px;font-size:12.5px;color:var(--steel);line-height:1.65}.author{margin-top:34px;border:1px solid var(--line);border-radius:16px;padding:20px;display:grid;gap:14px}'
       '.author .r{display:flex;gap:14px;align-items:center}.author img{width:66px;height:66px;border-radius:50%;object-fit:cover;object-position:top}.author .n{font-family:"Noto Serif KR",serif;font-size:20px;font-weight:900;color:var(--navy)}'
       '.author small{display:block;color:var(--steel);font-size:13px}.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}'
       '.hd{background:var(--navy);color:#fff}.hd>div{max-width:760px;margin:0 auto;padding:38px 20px 32px}.hd p{color:var(--pink);font-weight:700;font-size:14px}.hd h1{color:#fff;margin-top:6px}.hd .sub{color:#C9D3E1;margin-top:10px;font-size:15px}'
       '.list{display:grid;gap:14px}.card{display:block;text-decoration:none;border:1px solid var(--line);border-radius:16px;padding:20px}.card:hover{border-color:var(--deep)}'
       '.card h2{font-family:"Noto Serif KR",serif;font-size:19px;line-height:1.45;color:var(--navy)}.card p{margin-top:8px;font-size:14px;color:var(--ink2)}.card small{display:block;margin-top:12px;color:var(--steel);font-size:13px}'
       '.state{color:var(--steel);padding:20px 0}footer{background:#16305C;color:#8FA0B3;font-size:11.5px;text-align:center;padding:24px 20px 32px;line-height:1.8}')
HEAD = ('<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/png" href="/daon/assets/favicon-daon.png">'
        '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">'
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700;900&display=swap" rel="stylesheet">'
        '<link rel="alternate" type="application/rss+xml" title="다온파트너스 칼럼" href="https://grow.ai.kr/daon/rss.xml">')
TOP = ('<header class="top"><div><a href="/daon/"><img src="/daon/assets/logo-daon-wordmark.png" alt="다온파트너스"></a>'
       '<nav><a href="/daon/recruit/">채용 칼럼</a><a href="/daon/column/">보험 칼럼</a><a href="/daon/join1/">모집 안내</a></nav></div></header>')
FOOT = ('<footer>보험대리점 등록번호 2014048012 · 미래에셋금융서비스 보험대리점<br>전화 041-534-1124 · 개인정보 보호책임자 다온파트너스 041-534-1124<br>'
        '다온파트너스(884-14-02999) · 충남 아산시 탕정면 용머리길 22 브라운스톤갤럭시 C동 301호</footer>'
        '<script src="/daon/assets/home-btn.js" defer></script>')


def ld(o):
    return '<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False).replace('<', '\\u003c') + '</script>'


def post_page(p):
    url = f"{SITE}/recruit/p/{p['id']}.html"
    body_lines = lines(p['body'])
    notes = [l for l in body_lines if l.startswith('(')]
    main = [l for l in body_lines if not l.startswith('(')]
    if not any('위촉' in n for n in notes):
        notes.append(NOTE)
    summary = p.get('summary') or ' '.join(main[:2])
    desc = re.sub(r'\s+', ' ', summary)[:155]
    mid = ('<aside class="mid"><b>설계사 일, 직접 물어보고 정하세요</b><span>교육 과정, 위촉 절차, 실제 업무 방식을 상담으로 안내합니다.</span>'
           '<a class="btn" href="/daon/join1/">다온지사 모집 안내 보기</a></aside>')
    out, n, done = '', 0, False
    for l in main:
        if re.match(r'^#{2,3}\s*', l):
            out += '<h2>' + esc(re.sub(r'^#{2,3}\s*', '', l)) + '</h2>'
        else:
            out += '<p>' + esc(l) + '</p>'
            n += 1
            if n == 2 and len(main) > 3:
                out += mid
                done = True
    if not done:
        out += mid
    faq = p.get('faq') or []
    data = [{'@context': 'https://schema.org', '@type': 'Article', 'headline': p['title'], 'description': desc,
             'datePublished': p['date'], 'dateModified': p.get('mod') or p['date'], 'inLanguage': 'ko-KR',
             'keywords': p.get('kw', ''), 'mainEntityOfPage': url, 'articleSection': '채용',
             'author': {'@type': 'Person', 'name': AUTHOR['name'], 'jobTitle': AUTHOR['job'], 'url': AUTHOR['profile'],
                        'worksFor': {'@type': 'Organization', 'name': '다온파트너스'}},
             'publisher': {'@type': 'Organization', 'name': '다온파트너스', 'url': SITE + '/',
                           'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/logo-daon-wordmark.png'}}},
            {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': '홈', 'item': SITE + '/'},
                {'@type': 'ListItem', 'position': 2, 'name': '채용 칼럼', 'item': SITE + '/recruit/'},
                {'@type': 'ListItem', 'position': 3, 'name': p['title'], 'item': url}]}]
    if faq:
        data.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': f['q'], 'acceptedAnswer': {'@type': 'Answer', 'text': f['a']}} for f in faq]})
    mod = p.get('mod') or p['date']
    return ('<!DOCTYPE html><html lang="ko"><head>' + HEAD
            + f'<title>{esc(p["title"])} | 다온지사 채용 칼럼 · 다온파트너스</title>'
            + f'<meta name="description" content="{esc(desc)}"><meta name="keywords" content="{esc(p.get("kw", ""))}">'
            + f'<meta name="author" content="{AUTHOR["name"]}"><meta name="robots" content="index, follow"><link rel="canonical" href="{url}">'
            + f'<meta property="og:type" content="article"><meta property="og:site_name" content="다온파트너스"><meta property="og:title" content="{esc(p["title"])}">'
            + f'<meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{url}"><meta property="article:published_time" content="{esc(p["date"])}">'
            + ld(data) + '<style>' + CSS + '</style></head><body>' + TOP
            + '<main><article><div class="crumb"><a href="/daon/">홈</a> › <a href="/daon/recruit/">채용 칼럼</a></div>'
            + '<span class="badge">채용</span>' + (f'<span class="badge">{esc(p["type"])}</span>' if p.get('type') else '')
            + f'<h1>{esc(p["title"])}</h1><div class="by"><img src="/daon/assets/profile-hwajin-expert.jpg" alt=""><span><b>{AUTHOR["name"]}</b> · {AUTHOR["job"]}<br>'
            + esc(p['date']) + (f' · 수정 {esc(mod)}' if mod != p['date'] else '') + '</span></div>'
            + f'<section class="ans"><strong>핵심 요약</strong>{esc(summary)}</section><div class="body">{out}</div>'
            + ('<section class="faq"><h2>자주 묻는 질문</h2>' + ''.join(f'<h3>Q. {esc(f["q"])}</h3><p>{esc(f["a"])}</p>' for f in faq) + '</section>' if faq else '')
            + '<p class="notes">' + '<br>'.join(esc(x) for x in notes) + '</p>'
            + f'<section class="author"><div class="r"><img src="/daon/assets/profile-hwajin-expert.jpg" alt="{AUTHOR["name"]} 지사장"><div><span class="n">{AUTHOR["name"]}</span>'
            + f'<small>{AUTHOR["job"]} · 보험설계사 등록번호 {AUTHOR["regNo"]}</small><small>{ORG}</small></div></div>'
            + '<div class="two"><a class="btn" href="/daon/join1/">모집 안내·지원</a><a class="btn s" href="/daon/recruit/">채용 칼럼 더 보기</a></div></section>'
            + '</article></main>' + FOOT + '</body></html>')


def list_page(posts):
    cards = ''.join(f'<a class="card" href="/daon/recruit/p/{p["id"]}.html"><h2>{esc(p["title"])}</h2><p>{esc(p.get("summary", ""))}</p><small>{esc(p["date"])} · {AUTHOR["name"]} {AUTHOR["job"]}</small></a>' for p in posts)
    robots = 'index, follow' if posts else 'noindex, follow'
    data = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': '다온지사 채용 칼럼', 'url': SITE + '/recruit/',
            'hasPart': [{'@type': 'Article', 'headline': p['title'], 'url': f"{SITE}/recruit/p/{p['id']}.html"} for p in posts[:30]]}
    return ('<!DOCTYPE html><html lang="ko"><head>' + HEAD
            + '<title>보험설계사 채용 칼럼 | 미래에셋금융서비스 다온지사 · 다온파트너스</title>'
            + '<meta name="description" content="보험설계사 일이 궁금한 분을 위한 다온지사 채용 칼럼. 교육 과정, 위촉 절차, 소상공인 보험 전문 영업 방식을 지사장이 직접 정리했습니다.">'
            + f'<meta name="robots" content="{robots}"><link rel="canonical" href="{SITE}/recruit/">'
            + '<meta property="og:type" content="website"><meta property="og:site_name" content="다온파트너스"><meta property="og:title" content="보험설계사 채용 칼럼 | 다온지사">'
            + ld(data) + '<style>' + CSS + '</style></head><body>' + TOP
            + '<section class="hd"><div><p>미래에셋금융서비스 다온지사</p><h1>채용 칼럼</h1><div class="sub">보험설계사 일이 궁금한 분께, 교육·위촉 절차·업무 방식을 있는 그대로 안내합니다.</div></div></section>'
            + '<main>' + (f'<div class="list">{cards}</div>' if posts else '<p class="state">첫 채용 칼럼을 준비하고 있습니다. <a href="/daon/join1/">모집 안내 보기</a></p>')
            + '</main>' + FOOT + '</body></html>')


def rfc822(d):
    return datetime.strptime(d[:10], '%Y-%m-%d').replace(hour=9, tzinfo=KST).strftime('%a, %d %b %Y %H:%M:%S +0900')


def column_items():
    items = []
    sm = os.path.join(ROOT, 'column-sitemap.xml')
    if not os.path.exists(sm):
        return items
    for loc, mod in re.findall(r'<loc>(https://daon\.io\.kr/column/p/[^<]+)</loc>(?:<lastmod>([^<]+)</lastmod>)?', open(sm, encoding='utf-8').read()):
        f = os.path.join(ROOT, loc.replace(SITE + '/', ''))
        if not os.path.exists(f):
            continue
        s = open(f, encoding='utf-8').read()
        if 'noindex' in s[:600]:
            continue
        t = re.search(r'<meta property="og:title" content="([^"]*)"', s)
        d = re.search(r'<meta name="description" content="([^"]*)"', s)
        pub = re.search(r'article:published_time" content="([^"]*)"', s)
        b = re.search(r'<div class="body">(.*?)</div>', s, re.S)
        full = ''
        if b:
            full = b.group(1)
            full = re.sub(r'<aside class="mid">.*?</aside>', '', full, flags=re.S)
            full = re.sub(r'<(?!/?(p|h2)\b)[^>]+>', '', full)
        items.append({'title': html.unescape(t.group(1)) if t else loc, 'link': loc, 'html': full,
                      'desc': html.unescape(d.group(1)) if d else '', 'date': (pub.group(1) if pub else mod or '')[:10], 'cat': '보험 칼럼'})
    return items


def rss(posts):
    def body_html(p):
        return ''.join('<h2>' + esc(re.sub(r'^#{2,3}\s*', '', l)) + '</h2>' if re.match(r'^#{2,3}\s*', l) else '<p>' + esc(l) + '</p>' for l in lines(p['body']))
    items = [{'title': p['title'], 'link': f"{SITE}/recruit/p/{p['id']}.html", 'desc': p.get('summary', ''), 'html': body_html(p), 'date': p['date'], 'cat': '채용 칼럼'} for p in posts]
    items += column_items()
    items = [i for i in items if i['date']]
    items.sort(key=lambda i: i['date'], reverse=True)
    items = items[:40]
    now = datetime.now(KST).strftime('%a, %d %b %Y %H:%M:%S +0900')
    x = ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0">', '<channel>',
         '<title>다온파트너스 칼럼</title>', f'<link>{SITE}/</link>',
         '<description>미래에셋금융서비스 다온지사 보험설계사의 보험 칼럼과 채용 칼럼</description>',
         '<language>ko</language>', f'<lastBuildDate>{now}</lastBuildDate>']
    for i in items:
        x += ['<item>', f'<title>{esc(i["title"])}</title>', f'<link>{i["link"]}</link>', f'<guid isPermaLink="true">{i["link"]}</guid>',
              '<description><![CDATA[' + ('<p><strong>' + esc(i['desc']) + '</strong></p>' if i['desc'] else '') + (i.get('html') or '').replace(']]>', ']]&gt;') + ']]></description>', f'<category>{i["cat"]}</category>', f'<pubDate>{rfc822(i["date"])}</pubDate>', '</item>']
    x += ['</channel>', '</rss>', '']
    return '\n'.join(x)


def main():
    src = os.path.join(ROOT, '_tools', 'recruit_posts.json')
    posts = json.load(open(src, encoding='utf-8')) if os.path.exists(src) else []
    for p in posts:
        assert re.fullmatch(r'[0-9a-z-]{6,80}', p['id']), p['id']
        assert p.get('title') and p.get('body') and re.fullmatch(r'\d{4}-\d{2}-\d{2}', p['date']), p['id']
    posts.sort(key=lambda p: p['date'], reverse=True)
    os.makedirs(os.path.join(ROOT, 'recruit', 'p'), exist_ok=True)
    keep = set()
    for p in posts:
        fn = os.path.join(ROOT, 'recruit', 'p', p['id'] + '.html')
        open(fn, 'w', encoding='utf-8').write(post_page(p))
        keep.add(p['id'] + '.html')
    for f in os.listdir(os.path.join(ROOT, 'recruit', 'p')):
        if f.endswith('.html') and f not in keep:
            os.remove(os.path.join(ROOT, 'recruit', 'p', f))
    open(os.path.join(ROOT, 'recruit', 'index.html'), 'w', encoding='utf-8').write(list_page(posts))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          f'  <url><loc>{SITE}/join1/</loc></url>']  # 비어 있으면 네이버가 형식 오류로 거절하므로 모집 안내는 항상 포함
    if posts:
        sm.append(f'  <url><loc>{SITE}/recruit/</loc><lastmod>{posts[0].get("mod") or posts[0]["date"]}</lastmod></url>')
    sm += [f'  <url><loc>{SITE}/recruit/p/{p["id"]}.html</loc><lastmod>{p.get("mod") or p["date"]}</lastmod></url>' for p in posts]
    sm += ['</urlset>', '']
    open(os.path.join(ROOT, 'recruit-sitemap.xml'), 'w', encoding='utf-8').write('\n'.join(sm))
    open(os.path.join(ROOT, 'rss.xml'), 'w', encoding='utf-8').write(rss(posts))
    print(f'채용 칼럼 {len(posts)}편, rss {rss(posts).count("<item>")}건')


if __name__ == '__main__':
    sys.exit(main())
