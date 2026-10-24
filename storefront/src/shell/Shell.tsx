import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, UserRound, Heart, ShoppingBag, ChevronDown, ChevronRight, Menu, X, Tv, Facebook, Instagram, Youtube, Twitter } from 'lucide-react';

const outside = (name: string) => `/outside?section=${encodeURIComponent(name)}`;
const category = (slug: string) => `/category/${slug}`;
const preset = (key: string, name: string) => `/search?${key}=${encodeURIComponent(name)}`;
const departments = [
 ['Brands & Collections','brands'],['Rings','rings'],['Earrings','earrings'],['Necklaces & Pendants','necklaces'],['Bracelets','bracelets'],['Gemstones & Pearls','stones'],['Diamonds & Diamond Alternatives','diamonds'],['Watches','watches'],['Accessories','accessories'],['Beauty & Fragrances','beauty'],['Jewelry Making','making'],['Loose Gemstones & Tools','loose-gemstones'],['Storage & Care','storage'],['Collectibles & Gifts','gifts'],['Deals','deals'],['Jewelry Trends','trends']
];
/* Brands verified against the Catalog_BrandNavigationName filter, 2026-10-23 refresh.
 * Southwest Style was the only dead entry in the old list and is gone; Prazana and
 * Judith Ripka are the live site's headline brands and now present in the catalog. */
const brands=['Bella Luce','Artisan Collection','Gems En Vogue','Moissanite Fire','Prazana Lab-Grown Diamonds','Judith Ripka','Stefano Oro','1928 Jewelry','Charles Hubert','Barse Jewelry','EFFY','Cameo Italiano','Bellissima Gold'];
/* Live jtv.com trend categories, 2026-10-23 refresh. */
const trends=['2026 Jewelry Trends','Bow Jewelry','Modern Clover','Color of the Year','Stackable Earrings','Tennis Jewelry','Cross Jewelry','Initial Jewelry'];
const brandSearch=(b:string)=>`/search?brand=${encodeURIComponent(b)}`;
const stoneSearch=(s:string)=>preset('stone',s);
const trendSearch=(t:string)=>`/search?q=${encodeURIComponent(t)}`;

const stones=['Amethyst','Aquamarine','Diamond','Emerald','Garnet','Moissanite','Opal','Pearl','Ruby','Sapphire','Tanzanite','Turquoise'];
const core=['rings','earrings','necklaces','bracelets','watches','loose-gemstones'];
const watchLinks=['Airing Now','Watch Us Live','Weekly Product Recap','Program Guide','Channel Finder','JTV Series','JTV Extra Livestreaming','JTV Español','Jewel School','On Demand','Meet The Hosts'];

function DepartmentContents({ section }: {section:string}) {
 if(section==='brands')return <div className="mega-links"><h3>Brands & Collections</h3>{brands.map(b=><Link key={b} to={brandSearch(b)}>{b}</Link>)}</div>;
 if(section==='trends')return <div className="mega-links"><h3>Jewelry trends</h3>{trends.map(t=><Link key={t} to={trendSearch(t)}>{t}</Link>)}</div>;
 if(section==='stones'||section==='diamonds')return <div className="mega-links"><h3>Shop by gemstone</h3>{stones.filter(s=>section!=='diamonds'||['Diamond','Moissanite'].includes(s)).map(s=><Link key={s} to={stoneSearch(s)}>{s}</Link>)}</div>;
 if(section==='deals')return <div className="mega-links"><h3>Find your next favorite</h3><Link to="/search?clearance=1">Shop All Clearance</Link><Link to="/search">Browse All Jewelry</Link></div>;
 if(!core.includes(section))return <div className="mega-links"><h3>{departments.find(d=>d[1]===section)?.[0]}</h3><Link to={outside(departments.find(d=>d[1]===section)?.[0]||section)}>Explore this department <ChevronRight size={15}/></Link><p className="subtle">This department is outside the local shopping demo.</p></div>;
 const title=departments.find(d=>d[1]===section)?.[0];
 return <><div className="mega-links"><h3>{title}</h3><Link className="shop-all" to={category(section)}>Shop All {title}</Link><h4>Explore jewelry</h4>{core.filter(c=>c!==section).map(c=><Link key={c} to={category(c)}>{departments.find(d=>d[1]===c)?.[0]}</Link>)}</div><div className="mega-links"><h3>Shop by gemstone</h3>{stones.slice(0,8).map(s=><Link key={s} to={stoneSearch(s)}>{s}</Link>)}</div><div className="mega-links"><h3>Popular collections</h3>{brands.slice(0,5).map(b=><Link key={b} to={brandSearch(b)}>{b}</Link>)}</div></>;
}

/* Live jtv.com announcement bars, 2026-10-24 refresh: the free-shipping bar is gone
 * from live and the rotation is down to these three (em dash on live adapted to a colon). */
const ANNOUNCEMENTS=[
 'New customers get $25 off your first order of $50+ with code NEWJTV25',
 'Sign up for email & text: deals, news and a special offer await!',
 'Up to 70% off sitewide with thousands of items up to 7x StretchPay!',
];

export function Shell({children,onAsk}:{children:ReactNode;onAsk?:(text:string)=>void}) {
 const navigate=useNavigate(); const location=useLocation();
 const [query,setQuery]=useState(new URLSearchParams(location.search).get('q')||'');
 const [menu,setMenu]=useState<'shop'|'watch'|null>(null); const [section,setSection]=useState('rings');
 const [announceIndex,setAnnounceIndex]=useState(0);
 useEffect(()=>{const t=setInterval(()=>setAnnounceIndex(i=>(i+1)%ANNOUNCEMENTS.length),6000);return()=>clearInterval(t)},[]);
 const header=useRef<HTMLElement>(null);const shopButton=useRef<HTMLButtonElement>(null);const watchButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'instant'})},[location.pathname]);
 useEffect(()=>{setMenu(null);setQuery(new URLSearchParams(location.search).get('q')||'')},[location.pathname,location.search]);
 useEffect(()=>{if(!menu)return; const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMenu(null);(menu==='shop'?shopButton:watchButton).current?.focus()}};const pointer=(e:PointerEvent)=>{if(!header.current?.contains(e.target as Node))setMenu(null)};document.addEventListener('keydown',key);document.addEventListener('pointerdown',pointer);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',pointer)}},[menu]);
 return <><a className="skip-link" href="#main-content">Skip to content</a><header className="site-header" ref={header}>
 <div className="announcement">{ANNOUNCEMENTS[announceIndex]} <span>Local demo</span></div>
 <div className="header-main"><Link to="/" className="logo"><img src="/assets/logo-black.png" alt="JTV home" width="105" height="78"/></Link>
 <form className="header-search" role="search" onSubmit={e=>{e.preventDefault();navigate(`/search?q=${encodeURIComponent(query.trim())}`)}}><label className="sr-only" htmlFor="site-search">Search jewelry</label><input id="site-search" type="search" placeholder="Search products, gemstones & more ..." value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" className="ask-chip" onClick={()=>onAsk?.(query)}>Ask JTV</button><button aria-label="Search" type="submit"><Search size={23}/></button></form>
 <nav className="utility-nav" aria-label="Utility"><Link to={outside('My Account')} className="account-link"><UserRound/><span>Hello, Guest<br/><b>My Account</b></span></Link><Link to={outside('Lists')}><Heart/><span>Lists</span></Link><Link to={outside('Bag')}><ShoppingBag/><span>Bag</span></Link></nav></div>
 <div className="nav-band"><nav className="main-nav" aria-label="Main navigation"><button ref={shopButton} onClick={()=>setMenu(menu==='shop'?null:'shop')} aria-expanded={menu==='shop'} aria-controls="shop-menu"><Menu className="mobile-menu-icon" size={19}/>Shop<ChevronDown size={16}/></button><button ref={watchButton} onClick={()=>setMenu(menu==='watch'?null:'watch')} aria-expanded={menu==='watch'} aria-controls="watch-menu"><Tv size={19}/>Watch<ChevronDown size={16}/></button><Link to="/search?sort=prod_catalog_newest">New</Link><Link to="/search">Best Sellers</Link><Link to={outside('Exclusively Online')}>Exclusively Online</Link><Link to="/search?q=holiday%20gift">Holiday Gift Guide</Link><Link className="clearance-link" to="/search?clearance=1">Big Holiday Deals</Link><Link to={outside("Looks You'll Love")}>Looks You'll Love</Link><Link className="clearance-link" to="/search?clearance=1">Clearance</Link><Link to={outside('Auctions')}>Auctions</Link></nav></div>
 {menu&&<div id={`${menu}-menu`} className={`mega-menu ${menu==='watch'?'watch-menu':''}`}><button className="menu-close" aria-label="Close navigation" onClick={()=>{setMenu(null);(menu==='shop'?shopButton:watchButton).current?.focus()}}><X size={20}/></button>{menu==='shop'?<><nav className="department-list" aria-label="Shop departments">{departments.map(([label,id])=><button key={id} className={section===id?'active':''} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}<ChevronRight size={15}/></button>)}</nav><div className="department-content"><DepartmentContents section={section}/></div></>:<div className="mega-links"><h3>Watch JTV</h3>{watchLinks.map(l=><Link key={l} to={outside(l)}>{l}</Link>)}</div>}</div>}
 <div className="shopping-strip">Find your next favorite. Explore the collection or ask your jewelry concierge.</div>
 </header><div id="main-content" tabIndex={-1}>{children}</div><footer className="site-footer"><div className="footer-top"><div className="footer-brand-col"><img src="/assets/jtv-logo.png" width="95" alt="JTV"/><p>Jewelry you'll love.</p><div className="footer-social">{[['Facebook',Facebook],['Instagram',Instagram],['YouTube',Youtube],['X',Twitter]].map(([name,Icon])=>{const I=Icon as typeof Facebook;return <Link key={name as string} to={outside(name as string)} aria-label={name as string}><I size={18}/></Link>})}</div><p className="footer-phone">1-800-581-3002</p></div>{FOOTER_COLS.map(col=><div key={col.h}><h3>{col.h}</h3>{col.links.map(([t,to])=><Link key={t} to={to??outside(t)}>{t}</Link>)}</div>)}</div><div className="footer-legal"><Link to={outside('Privacy Policy')}>Privacy Policy</Link><Link to={outside('Returns Policy')}>Returns Policy</Link><Link to={outside('Terms & Conditions')}>Terms &amp; Conditions</Link><Link to={outside('Your Privacy Choices')}>Your Privacy Choices</Link></div><div className="footer-disclosure">JTV storefront demonstration · Purchases and accounts are not enabled · Product information supplied by the connected catalogue</div></footer></>;
}

/* Live jtv.com homepage, mirrored section by section (2026-10-24 fetch, order verified
 * against the rendered live page). Routes map to local demo equivalents; the concierge
 * shelf is one section among them. */


/* Footer columns follow the live jtv.com footer link inventory (2026-10-24). */
const FOOTER_COLS:{h:string;links:[string,string|null][]}[]=[
 {h:'Shop',links:[['Rings','/category/rings'],['Earrings','/category/earrings'],['Necklaces','/category/necklaces'],['Bracelets','/category/bracelets'],['Watches','/category/watches'],['Loose Gemstones','/category/loose-gemstones'],['Jewelry Making','/category/making'],['Gifts',null],['Clearance','/search?clearance=1']]},
 {h:'Collections',links:[['Bella Luce','/search?brand=Bella%20Luce'],['Judith Ripka','/search?brand=Judith%20Ripka'],['Moissanite Fire','/search?brand=Moissanite%20Fire'],['Artisan of Bali',null],['Moda al Massimo',null],['Off Park Collection',null],['Park Avenue Collection',null],['Southwest Style',null],['Timna Collection',null]]},
 {h:'Watch',links:[['Currently On Air',null],['JTV Live Stream',null],['JTV Extra',null],['JTV Español',null],['Jewel School TV',null],['All Series',null],['Channel Finder',null],['Program Guide',null],['Meet Our Hosts',null]]},
 {h:'About',links:[['About Us',null],['Careers',null],['Catalog',null],['Coupons',null],['Executives',null],['Blog',null],['Personal Shopper',null],['Sweepstakes',null],['Social Media',null],['Sitemap',null]]},
 {h:'Customer Support',links:[['My Account',null],['Contact Us',null],['Accessibility',null],['Order Status',null],['Preferred Account',null],['Manage Email Preferences',null]]},
];


/* Homepage rebuilt from scratch, 2026-10-24: section by section against the
 * rendered live jtv.com page. Lean page: the live top sections plus the
 * concierge shelf. Each section verified against the live capture before the
 * next was added. */
export function Home({children}:{children?:ReactNode}) {
 const reduce=typeof window<'u'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const autoPlay=reduce?{}:{autoPlay:true};
 return <main className="home-page">
 <section className="gg-split"><div className="gg-split-media"><video src="/assets/gg-intro.mp4" muted loop playsInline aria-hidden="true" {...autoPlay}/></div><div className="gg-split-copy"><h2>Holiday Gift Guide</h2><p>Packed with sparkly finds for everyone on your list!</p><Link to="/search?q=holiday%20gift" className="primary-button">SHOP NOW</Link></div></section>
 <section className="video-strip"><video src="/assets/freeshipping-banner.mp4" muted loop playsInline aria-hidden="true" {...autoPlay}/></section>
 <Link to="/search?clearance=1" className="video-feature"><video src="/assets/just-reduced.mp4" muted loop playsInline aria-hidden="true" {...autoPlay}/><div className="video-feature-copy"><p className="eyebrow">SHOP OUR BEST DEALS</p><h2>EXTRA 10% OFF</h2><p>styles already marked up to 80% off! Price as marked.</p><span className="outline-button">SHOP NOW</span></div></Link>
 <section className="home-shelf">{children}</section>
 </main>;
}
