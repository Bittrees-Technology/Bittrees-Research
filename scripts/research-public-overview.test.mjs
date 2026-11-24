import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

const root=new URL('../public/',import.meta.url);
const canonical='https://research.bittrees.org/about';
const html=await readFile(new URL('about.html',root),'utf8');
const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)[1];
const attribute=(tag,name)=>tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`,'i'))?.[1];
const metas=[...head.matchAll(/<meta\b[^>]*>/gi)].map(([tag])=>({name:attribute(tag,'name')||attribute(tag,'property'),content:attribute(tag,'content')}));
const meta=name=>metas.find(item=>item.name===name)?.content;

test('the overview is standalone public HTML with one coherent search identity and approved links',async()=>{
  assert.match(html,/<html lang="en">/);
  const title=head.match(/<title>([^<]+)<\/title>/)[1];
  assert.equal(title,'About Bittrees Research | Publications and Membership');
  const canonicals=[...head.matchAll(/<link\b[^>]*>/gi)].filter(([tag])=>attribute(tag,'rel')==='canonical').map(([tag])=>attribute(tag,'href'));
  assert.deepEqual(canonicals,[canonical]);
  assert.equal(meta('og:url'),canonical);
  for(const name of ['og:title','twitter:title'])assert.equal(meta(name),title);
  for(const name of ['og:description','twitter:description'])assert.equal(meta(name),meta('description'));
  assert.ok(meta('description').includes('member workspace'));
  assert.match(meta('robots'),/^index, follow/);
  const consent='<script defer src="https://insights.bittrees.org/consent.js" data-insights-site="bittrees-research-about" data-google-analytics-only="true"></script>';
  assert.equal(html.split(consent).length,2,'The overview loads one optional analytics consent control');
  assert.doesNotMatch(html.replace(consent,''),/<script\b|<iframe\b|\bon\w+\s*=|id="root"|data-insights|\/api\//i,
    'The public page must not mount the member app or load another tracker');
  assert.equal([...html.matchAll(/<h1\b/g)].length,1);
  assert.match(html,/<h1 id="page-title">Bittrees Research<\/h1>/);
  assert.ok(html.includes('href="#main-content"')&&html.includes('id="main-content"'));
  assert.ok(html.includes('How member research works'));
  const expected=new Set(['/about','#main-content','/','/membership','https://bittrees.org/','https://gov.bittrees.org/','https://capital.bittrees.org/','https://index.bittrees.org/','https://paragraph.com/@bresearch']);
  const links=[...html.matchAll(/<a\b[^>]*>/gi)].map(([tag])=>attribute(tag,'href'));
  assert.deepEqual(new Set(links),expected);
  for(const [tag] of html.matchAll(/<(?:img|link)\b[^>]*>/gi)){
    const local=attribute(tag,'src')||attribute(tag,'href');
    if(local?.startsWith('/'))await access(new URL(local.slice(1),root));
  }
});

test('the sitemap lists only the approved overview and robots keeps existing noindex crawl-observable',async()=>{
  const sitemap=await readFile(new URL('sitemap.xml',root),'utf8');
  assert.match(sitemap,/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap,/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]),[canonical]);
  const robots=await readFile(new URL('robots.txt',root),'utf8');
  assert.match(robots,/^Disallow:\s*$/m);
  assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots));
  assert.equal([...robots.matchAll(/^Sitemap:\s*(\S+)/gm)].length,1);
  assert.ok(robots.includes('Sitemap: https://research.bittrees.org/sitemap.xml'));
});
