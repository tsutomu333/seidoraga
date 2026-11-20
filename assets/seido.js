/* せいどラガ：制度の「部品」と共通の計算エンジン
 * 制度ごとの部品（furusato / ideco / jutaku / kabe / baito）を、
 * 真ん中の共通計算（年収→所得→控除→所得税・住民税）でつなぐ。
 * どのページも <section id="calc" data-mods="furusato,ideco"> の並べ方だけを変える。
 * 前提：2026年分の所得税・2027年度の住民税のルール（2027年分も同じ数字）。社会保険料は年収の約15%。
 */
(function(root){
'use strict';

/* ===== 共通の計算 ===== */
function kyuyo(y){ // 給与所得控除（2026・2027年分：最低74万円）
  let k; if(y<=1625000) k=550000; else if(y<=1800000) k=y*0.4-100000; else if(y<=3600000) k=y*0.3+80000; else if(y<=6600000) k=y*0.2+440000; else if(y<=8500000) k=y*0.1+1100000; else k=1950000;
  return Math.min(y,Math.max(k,740000));
}
const kisoI=g=>g<=4890000?1040000:g<=6550000?670000:g<=23500000?620000:g<=24000000?480000:g<=24500000?320000:g<=25000000?160000:0; // 所得税の基礎控除（2026・2027年分）
const fl1000=v=>Math.max(0,Math.floor(v/1000)*1000);
const BR=[[1950000,.05,0],[3300000,.10,97500],[6950000,.20,427500],[9000000,.23,636000],[18000000,.33,1536000],[40000000,.40,2796000],[Infinity,.45,4796000]];
function baseTax(t){ t=fl1000(t); for(const [l,r,d] of BR){ if(t<=l) return Math.max(0,t*r-d); } }
function rate(t){ if(t<=0) return 0.05; for(const [l,r] of BR){ if(t<=l) return r; } }
function incomeTax(t){ return Math.floor(baseTax(t)*1.021/100)*100; }
function chosei(base,sa){ return base<=2000000? Math.min(sa,base)*0.05 : Math.max(sa-(base-2000000),50000)*0.05; }
function juminSimple(g,sh,ded,sa){ // 本人以外（配偶者・子）の住民税：所得割＋均等割
  if(g<=450000) return 0;
  const b=fl1000(g-sh-430000-ded);
  return Math.max(0,Math.floor((b*0.10-chosei(b,sa))/100)*100)+5000;
}
// 配偶者控除・配偶者特別控除 [本人の合計所得900万以下, 950万以下, 1000万以下]
const SPI=[[620000,[380000,260000,130000]],[950000,[380000,260000,130000]],[1000000,[360000,240000,120000]],[1050000,[310000,210000,110000]],[1100000,[260000,180000,90000]],[1150000,[210000,140000,70000]],[1200000,[160000,110000,60000]],[1250000,[110000,80000,40000]],[1300000,[60000,40000,20000]],[1330000,[30000,20000,10000]]];
const SPJ=[[620000,[330000,220000,110000]],[1000000,[330000,220000,110000]],[1050000,[310000,210000,110000]],[1100000,[260000,180000,90000]],[1150000,[210000,140000,70000]],[1200000,[160000,110000,60000]],[1250000,[110000,80000,40000]],[1300000,[60000,40000,20000]],[1330000,[30000,20000,10000]]];
function spDed(tbl,g,gw){ if(g>10000000) return 0; const t=g<=9000000?0:g<=9500000?1:2; for(const [l,v] of tbl){ if(gw<=l) return v[t]; } return 0; }
// 19〜22歳の子の合計所得ごとの親の控除 [上限, 所得税, 住民税]（62万以下は特定扶養控除、こえると特定親族特別控除）
const OYA=[[620000,630000,450000],[850000,630000,450000],[900000,610000,450000],[950000,510000,450000],[1000000,410000,410000],[1050000,310000,310000],[1100000,210000,210000],[1150000,110000,110000],[1200000,60000,60000],[1230000,30000,30000]];
function oyaDed(gs){ for(const [l,i,j] of OYA){ if(gs<=l) return [i,j]; } return [0,0]; }

/* 本人（家計の中心で働く人）の1年の税金
 * st: {inc, kou, dai, gw(配偶者の合計所得 / null=配偶者控除なし), gs(大学生の子の合計所得 / null), ideco(年額), bal, capB, fmode}
 * D: ふるさと納税の寄付額 */
function core(st,D){
  D=D||0;
  const inc=st.inc, kids=st.kou+st.dai+(st.gs!=null?1:0);
  let g=Math.max(0,inc-kyuyo(inc));
  if(inc>8500000&&kids>0) g=Math.max(0,g-(Math.min(inc,10000000)-8500000)*0.10); // 所得金額調整控除
  const sh=inc*(st.shr!=null?st.shr:0.15); // 社会保険料（ふだんは年収の約15%。扶養の内で保険料がない人は shr:0）
  let spI=0,spJ=0,sa=50000;
  if(st.gw!=null){ spI=spDed(SPI,g,st.gw); spJ=spDed(SPJ,g,st.gw); if(st.gw<=620000&&g<=10000000) sa+=g<=9000000?50000:g<=9500000?40000:20000; }
  let dI=st.kou*380000+st.dai*630000, dJ=st.kou*330000+st.dai*450000; sa+=st.kou*50000+st.dai*180000;
  if(st.gs!=null){ const [a,b]=oyaDed(st.gs); dI+=a; dJ+=b; if(st.gs<=620000) sa+=180000; }
  const ide=st.ideco||0, don=D>2000?D-2000:0;
  const TI=fl1000(g-sh-kisoI(g)-spI-dI-ide-(st.fmode==='kakutei'?don:0));
  const bt=baseTax(TI);
  const C=st.bal>0?Math.floor(Math.min(st.bal,st.capB)*0.007/100)*100:0; // 住宅ローン控除の額
  const hlI=Math.min(C,bt);
  const IT=Math.floor((bt-hlI)*1.021/100)*100;
  const hlJ=Math.min(C-hlI,Math.floor(TI*0.05),97500);
  const JB=fl1000(g-sh-430000-spJ-dJ-ide);
  const nP=1+(st.gw!=null?1:0)+kids; // 所得割がかからない基準（総所得 35万×人数＋10万＋扶養がいれば32万。1人なら45万）
  const S=g<=(nP===1?450000:350000*nP+100000+320000)?0:Math.max(0,JB*0.10-chosei(JB,sa)); // 住民税の所得割（調整控除のあと）
  const rt=JB-sa-Math.max(kisoI(g)-480000,0), r=rt<0?0:rate(rt); // 0円を下回るときは特例分の割合90%（地方税法37条の2）
  const kihon=don*0.10, tokurei=Math.min(don*(0.90-r*1.021),S*0.20);
  const shinkoku=st.fmode==='kakutei'?0:tokurei*(r*1.021)/(0.90-r*1.021);
  const JT=Math.floor(Math.max(0,Math.max(0,S-hlJ)-kihon-tokurei-shinkoku)/100)*100;
  return {IT,JT,total:IT+JT,C,g,sh,TI,JB,S,r};
}
function net(st){ const c=core(st,0); return st.inc-c.sh-c.total-5000; } // 本人の手取り（住民税の均等割5,000円をふくむ）
function burden(st,D){ return D-(core(st,0).total-core(st,D).total); }
function furuLimit(st){ // 自己負担2,000円で済む寄付の上限（1,000円未満は切り捨て。2,000円で済む寄付が3,000円に届かないときは0）
  const c=core(st,0); if(c.S<=0) return 0;
  const F=Math.floor(c.S*0.20/(0.90-c.r*1.021))+2000; // 特例分が住民税の所得割の20%に届く寄付額（総務省の計算式）
  // 確定申告で所得税から引ききれない・住宅ローン控除で住民税が足りないときに備えて、実際の負担でも確かめる（100円未満の切り捨てのぶれは200円まで見る）
  let lo=0, hi=Math.floor(F/1000);
  while(lo<hi){ const m=Math.ceil((lo+hi)/2); if(burden(st,m*1000)<=2200) lo=m; else hi=m-1; }
  const L=Math.min(F,lo*1000);
  return L<3000?0:Math.floor(L/1000)*1000;
}
function hlUsed(st){ return st.bal>0? core(Object.assign({},st,{bal:0}),0).total-core(st,0).total : 0; }
function idecoSave(st){ return st.ideco>0? core(Object.assign({},st,{ideco:0}),0).total-core(st,0).total : 0; }

/* 配偶者のパート（kabe.htmlと同じ計算） */
const GR=[[63000,58000],[73000,68000],[83000,78000],[93000,88000],[101000,98000],[107000,104000],[114000,110000],[122000,118000],[130000,126000],[138000,134000],[146000,142000],[155000,150000],[165000,160000],[175000,170000],[185000,180000],[195000,190000],[210000,200000],[230000,220000],[250000,240000],[270000,260000],[290000,280000],[310000,300000],[Infinity,320000]];
const hyojun=p=>{for(const [l,g] of GR){ if(p<l) return g; }};
function spouse(w,mode,a40){
  const g=Math.max(0,w-kyuyo(w));
  let sh=0,kind='none';
  if(w>0){
    if(mode==='yes'){ const s=hyojun(w/12); sh=12*(Math.max(s,58000)*(0.04925+(a40?0.0081:0)+0.00115)+Math.max(s,88000)*0.0915)+w*0.005; kind='emp'; }
    else if(w<(a40===2?1800000:1300000)) kind='dep';
    else { sh=Math.max(0,g-430000)*(0.0751+0.0280+0.0027+(a40?0.0243:0))+47600+17600+1873+(a40?17800:0)+(a40===2?0:17920*12); kind='kokuho'; }
  }
  const it=incomeTax(g-sh-kisoI(g)), jt=juminSimple(g,sh,0,50000);
  return {g,sh,kind,it,jt,net:w-sh-it-jt};
}
/* 大学生の子のバイト（daigakusei-oyaと同じ計算） */
function student(w){
  const g=Math.max(0,w-kyuyo(w)), kinro=g<=890000;
  const kokuho=w>=1500000?Math.max(0,g-430000)*(0.0751+0.0280+0.0027)+47600+17600+1873:0;
  const it=incomeTax(g-kokuho-kisoI(g)-(kinro?270000:0));
  const jt=kinro?0:juminSimple(g,kokuho,0,50000);
  return {g,kokuho,it,jt,kinro,net:w-kokuho-it-jt};
}
/* iDeCoの掛金の上限（月額） */
function idecoCap(year,type,other){
  other=Math.max(0,other||0);
  if(year===2027) return type==='emp'?62000:type==='gov'?54000:Math.max(0,Math.floor((62000-other)/1000)*1000);
  return type==='emp'?23000:type==='gov'?20000:Math.max(0,Math.min(20000,Math.floor((55000-other)/1000)*1000));
}
const HOUSE={nintei_new:[45000000,50000000],zeh_new:[35000000,45000000],sho_new:[20000000,30000000],nintei_old:[35000000,45000000],zeh_old:[35000000,45000000],sho_old:[20000000,30000000],other_old:[20000000,20000000]};

/* ===== 部品の一覧（トップページの表と同じ並び） ===== */
const MODS={
  furusato:{name:'ふるさと納税',short:'ふるさと納税'},
  ideco:{name:'iDeCo',short:'iDeCo'},
  jutaku:{name:'住宅ローン控除',short:'住宅ローン控除'},
  kabe:{name:'パートの年収の壁（配偶者）',short:'配偶者のパート'},
  baito:{name:'大学生の子のバイト',short:'子のバイト'}
};
const ORDER=['furusato','ideco','jutaku','kabe','baito'];

/* 1つの状態から、全部の答えを出す */
function evaluate(inp,mods){
  const has=k=>mods.includes(k);
  const sp=has('kabe')? spouse(inp.wife,inp.wmode,inp.wage) : null;
  const stu=has('baito')? student(inp.baito) : null;
  const capM=has('ideco')? idecoCap(inp.year,inp.work,inp.other) : 0;
  const st={inc:inp.inc,kou:inp.kou,dai:inp.dai,
    gw: has('kabe')? sp.g : (inp.sp?0:null),
    gs: has('baito')? stu.g : null,
    ideco: has('ideco')? Math.min(inp.ideco,capM)*12 : 0,
    bal: has('jutaku')? inp.bal : 0,
    capB: HOUSE[inp.house][inp.kosodate?1:0],
    fmode: has('jutaku')&&has('furusato')? inp.fmode : 'onestop'};
  const r={st,sp,stu,capM,c:core(st,0),net:net(st)};
  if(has('furusato')) r.lim=furuLimit(st);
  if(has('ideco')) r.save=idecoSave(st);
  if(has('jutaku')){ r.used=hlUsed(st); r.C=core(st,0).C; }
  if(has('kabe')){ const st0=Object.assign({},st,{gw:0}); r.net0=net(st0); r.hh=r.net+sp.net; }
  if(has('baito')){ const st0=Object.assign({},st,{gs:0}); r.net0b=net(st0); r.fam=r.net+stu.net+(sp?sp.net:0); }
  // 制度どうしの影響：その制度がないときとくらべる
  const without={ideco:{ideco:0},jutaku:{bal:0},kabe:{gw:0},baito:{gs:0}};
  r.links=[];
  for(const x of ['ideco','jutaku','kabe','baito']){
    if(!has(x)) continue;
    const s0=Object.assign({},st,without[x]);
    if(has('furusato')) r.links.push({from:x,to:'furusato',d:r.lim-furuLimit(s0)});
    if(has('jutaku')&&x!=='jutaku') r.links.push({from:x,to:'jutaku',d:r.used-hlUsed(s0)});
    if(has('ideco')&&(x==='kabe'||x==='baito')) r.links.push({from:x,to:'ideco',d:r.save-idecoSave(s0)});
    if(x==='baito'&&has('kabe')){ const loss=s=>net(Object.assign({},s,{gw:0}))-net(s); r.links.push({from:'baito',to:'kabe',d:loss(st)-loss(s0)}); }
  }
  return r;
}

/* ===== 投資の利益の税金（会社員・給与1か所・社会保険料は年収の約15%） ===== */
// 総合課税の部分の所得税と住民税所得割（均等割は変わらないので入れない）
function sogo(inc,extra,kisoG,ded){
  ded=ded||0;
  const g=Math.max(0,inc-kyuyo(inc)), sh=inc*0.15, G=g+extra;
  const it=incomeTax(G-sh-kisoI(kisoG)-ded);
  const jb=fl1000(G-sh-430000-ded);
  const jt=Math.max(0,Math.floor((jb*0.10-chosei(jb,50000))/100)*100);
  return {g,it,jt};
}
const sepIt=b=>Math.floor(fl1000(b)*0.15*1.021/100)*100, sepJt=b=>Math.floor(fl1000(b)*0.05/100)*100;
/* FX（先物取引に係る雑所得等）：申告分離課税。profit＝その年の損益、carry＝前の年からくり越した損失 */
function fx(inc,profit,carry){
  carry=Math.max(0,carry||0);
  const g=Math.max(0,inc-kyuyo(inc));
  const base=Math.max(0,profit-carry);                  // 繰越控除のあとの課税される利益
  const used=profit>0?Math.min(profit,carry):0;         // 今年使う繰越損失
  const left=profit>=0?carry-used:carry+(-profit);      // 来年にくり越せる損失（3年の期限は別）
  const s0=sogo(inc,0,g), s1=sogo(inc,0,g+Math.max(0,profit)); // 合計所得がふえると基礎控除が減ることがある
  const it=sepIt(base), jt=sepJt(base), kiso=(s1.it-s0.it)+(s1.jt-s0.jt);
  return {base,used,left,it,jt,kiso,total:it+jt+kiso};
}
/* 暗号資産：①今の制度（雑所得・総合課税） ②改正が当てはまった場合の仮の計算（申告分離課税20.315%） */
function crypto(inc,profit){
  const p=Math.max(0,profit), g=Math.max(0,inc-kyuyo(inc));
  const s0=sogo(inc,0,g), s1=sogo(inc,p,g+p);
  const now={it:s1.it-s0.it,jt:s1.jt-s0.jt}; now.total=now.it+now.jt;
  const s2=sogo(inc,0,g+p);
  const sep={it:sepIt(p)+(s2.it-s0.it),jt:sepJt(p)+(s2.jt-s0.jt)}; sep.total=sep.it+sep.jt;
  return {now,sep};
}

/* 医療費控除：med＝1年の医療費（保険金などで戻る分を引いたあと）、otc＝そのうちセルフメディケーション税制の対象の市販薬、side＝給与以外の所得 */
function iryo(inc,med,otc,side){
  side=Math.max(0,side||0);
  const g=Math.max(0,inc-kyuyo(inc)), G=g+side;
  const th=G<2000000?Math.floor(G*0.05):100000;
  const dA=Math.min(2000000,Math.max(0,med-th)), dB=Math.min(88000,Math.max(0,(otc||0)-12000));
  const b=sogo(inc,side,G,0), cut=d=>{const x=sogo(inc,side,G,d);return {ded:d,it:b.it-x.it,jt:b.jt-x.jt,total:(b.it-x.it)+(b.jt-x.jt)};};
  return {th,A:cut(dA),B:cut(dB)};
}
/* 副業（雑所得・事業所得）：side＝副業の所得（収入−経費）。総合課税でふえる税金 */
function fukugyo(inc,side){
  const p=Math.max(0,side), g=Math.max(0,inc-kyuyo(inc));
  const s0=sogo(inc,0,g), s1=sogo(inc,p,g+p);
  return {it:s1.it-s0.it,jt:s1.jt-s0.jt,total:(s1.it-s0.it)+(s1.jt-s0.jt)};
}

/* 年末調整：生命保険料控除（新制度）・地震保険料控除・iDeCo（小規模企業共済等掛金控除）で減る税金 */
function lifeDed(ip,kg,nk,u23){
  // 一般生命保険料：23歳未満の扶養親族がいる場合は2026・2027年分の所得税で上限6万円（合計12万円は同じ）
  const fu=x=>x<=0?0:x<=30000?x:x<=60000?Math.ceil(x/2+15000):x<=120000?Math.ceil(x/4+30000):60000;
  const fi=x=>x<=0?0:x<=20000?x:x<=40000?Math.ceil(x/2+10000):x<=80000?Math.ceil(x/4+20000):40000;
  const fj=x=>x<=0?0:x<=12000?x:x<=32000?Math.ceil(x/2+6000):x<=56000?Math.ceil(x/4+14000):28000;
  return {it:Math.min(120000,(u23?fu(ip):fi(ip))+fi(kg)+fi(nk)), jt:Math.min(70000,fj(ip)+fj(kg)+fj(nk))};
}
function nencho(inc,ip,kg,nk,ji,ide,u23){
  const L=lifeDed(ip||0,kg||0,nk||0,u23), jI=Math.min(50000,ji||0), jJ=Math.min(25000,Math.floor((ji||0)/2)), d=ide||0;
  const g=Math.max(0,inc-kyuyo(inc)), sh=inc*0.15;
  const it=x=>incomeTax(g-sh-kisoI(g)-x);
  const jt=x=>{const b=fl1000(g-sh-430000-x);return Math.max(0,Math.floor((b*0.10-chosei(b,50000))/100)*100);};
  const dI=L.it+jI+d, dJ=L.jt+jJ+d;
  return {life:L, jishin:{it:jI,jt:jJ}, dI, dJ, itCut:it(0)-it(dI), jtCut:jt(0)-jt(dJ)};
}


/* 出産・育児でもらえるお金（2026年11月時点のルール。休業開始時賃金日額の上限16,540円・下限3,203円は2027年7月31日まで） */
function shussanWd(w){ return Math.min(16540,Math.max(3203,Math.floor(w/30))); } // 休業開始時賃金日額 ≒ 月給×6か月÷180日
function shussanNetM(w){ return w>0? Math.floor(net({inc:w*12,kou:0,dai:0,gw:null,gs:0,ideco:0,bal:0,capB:0,fmode:'one'})/12):0; }
function shussan(p){ // p={mtype:'kaisha'|'koumuin'|'jiei'|'fuyou', mw, ikukyu:'1'|'1.5'|'2', ftype:'kaisha'|'koumuin'|'jiei'|'nashi', fw, fdays}
  const r={ninpu:100000, ichiji:500000, teate:0, m67:0, m50:0, mShien:0, f67:0, fShien:0, mMenjo:0, fMenjo:0, nenkin:0};
  const days={'1':309,'1.5':492,'2':674}[p.ikukyu]||309; // 産後休業（56日）のあと、子が1歳・1歳6か月・2歳になるまで
  const RATE=0.141;   // 本人が払う健康保険料＋厚生年金保険料のおよその割合（目安）
  const KOKUNEN=17920; // 国民年金保険料（2026年度・月額）
  if(p.mtype==='kaisha'){
    const d10=Math.round(p.mw/30/10)*10; r.teate=Math.round(d10*2/3)*98;           // 出産手当金：標準報酬日額の2/3×98日
    const w=shussanWd(p.mw), d1=Math.min(days,180);
    r.m67=Math.floor(w*d1*0.67); r.m50=Math.floor(w*(days-d1)*0.5);               // 育児休業給付金
    const fOK=(p.ftype==='jiei'||p.ftype==='nashi')||p.fdays>=14;                   // 配偶者が14日以上育休をとる、または雇用される人ではない
    if(fOK) r.mShien=Math.floor(w*28*0.13);                                         // 出生後休業支援給付金（最大28日）
    r.mMenjo=Math.round(p.mw*RATE)*Math.round((98+days)/30.4);                      // 産休・育休中の社会保険料の免除（本人分の目安）
  }
  if(p.mtype==='jiei') r.nenkin=KOKUNEN*13;                                         // 産前産後免除4か月＋育児期間免除9か月
  if(p.ftype==='kaisha' && p.fdays>0){
    const w=shussanWd(p.fw), d=Math.min(28,p.fdays);
    r.f67=Math.floor(w*d*0.67);                                                     // 出生時育児休業給付金（産後パパ育休）
    if(d>=14){ r.fShien=Math.floor(w*d*0.13); r.fMenjo=Math.round(p.fw*RATE); }     // 出生後休業支援給付金・1か月分の免除（目安）
  }
  if(p.ftype==='jiei') r.nenkin+=KOKUNEN*12;                                        // 配偶者の育児期間免除（最大12か月）
  r.days=days;
  r.cash=r.ninpu+r.ichiji+r.teate+r.m67+r.m50+r.mShien+r.f67+r.fShien;
  r.total=r.cash+r.mMenjo+r.fMenjo+r.nenkin;
  r.mMonth67=p.mtype==='kaisha'? Math.floor(shussanWd(p.mw)*30*0.67):0;
  r.mNetM=p.mtype==='kaisha'? shussanNetM(p.mw):0;
  return r;
}

/* 遺族年金（2026年度の額・会社員が在職中に亡くなった場合＝短期要件・300月みなし。65歳以降は計算しない） */
const IZ={KISO:847300, KA12:243800, KA3:81300, CHUKO:635500, SMAX:650000, BMAX:3000000};
function izokuKosei(p){ // 遺族厚生年金の年額（推計）：今の給与・賞与が加入期間中ずっと同じとして出す（再評価はしない）
  const sm=Math.min(IZ.SMAX,p.mw), times=Math.max(1,p.bonusTimes||2);
  const bn=Math.min(1500000,(p.bonus||0)/times)*times;                 // 標準賞与額は1回150万円まで
  const m=Math.max(1,p.months), pre=Math.min(p.preMonths||0,m), post=m-pre, sc=m<300?300/m:1;
  const hirei=(sm*7.125/1000*pre + (sm*12+bn)/12*5.481/1000*post)*sc;
  return Math.round(hirei*3/4);
}
function izokuKidEnd(by,bm){ // 18歳に達した日以後の最初の3月31日（その月をふくむ年月を 年*12+月 で返す）
  const y=by+18; const fyEndY = bm>=4? y+1 : y; return fyEndY*12+3;
}
function izoku(p){ // p={dead:'husband'|'wife', mw, bonus, bonusTimes, months, preMonths, spAge, spNetM, kids:[[生まれ年,月]], living, loanOff, loanYears, savings, insurance, retire, choi, now:[年,月]}
  const kosei=izokuKosei(p), wife=p.dead==='husband';
  const now=p.now||[2026,11], start=now[0]*12+now[1]+1;           // 亡くなった月の翌月分から
  const ends=(p.kids||[]).map(k=>izokuKidEnd(k[0],k[1])).filter(e=>e>=start);
  const had=ends.length>0, M=(65-p.spAge)*12;
  const kisoEnd=had? Math.max(...ends):null;                         // 遺族基礎年金が出る最後の月
  const m40=start+(40-p.spAge)*12, m60=start+(60-p.spAge)*12;
  const chukoOK = wife && (p.spAge>=40 || (had && kisoEnd>=m40));  // 死亡時40歳以上、または40歳になったとき遺族基礎年金を受けていた
  let koseiEnd=Infinity;                                            // 30歳未満の妻の5年
  if(wife && !had && p.spAge<30) koseiEnd=start+60-1;
  if(wife && had && start+(30-p.spAge)*12>kisoEnd) koseiEnd=kisoEnd+60;
  const rows=[];
  for(let i=0;i<M;i++){
    const ym=start+i, n=ends.filter(e=>ym<=e).length;
    const kiso=n? IZ.KISO+IZ.KA12*Math.min(2,n)+IZ.KA3*Math.max(0,n-2):0;
    let ks=0, who='';
    if(wife){ if(ym<=koseiEnd){ ks=kosei; who='妻'; } }
    else if(n){ ks=kosei; who=p.spAge>=55?'夫':'子'; }
    else if(p.spAge>=55 && ym>=m60){ ks=kosei; who='夫'; }
    const ch=(chukoOK && !n && ym>=m40)? IZ.CHUKO:0;
    const off=(i<(p.loanYears||0)*12)? (p.loanOff||0):0;
    const cost=(p.living-off)*12, inc=(p.spNetM||0)*12, pen=kiso+ks+ch;
    rows.push({ym,age:p.spAge+Math.floor(i/12),kids:n,kiso,kosei:ks,who,chuko:ch,pension:pen,cost,gap:cost-pen-inc});
  }
  const per=[];
  for(const r of rows){ const l=per[per.length-1];
    if(l && l.kiso===r.kiso && l.kosei===r.kosei && l.who===r.who && l.chuko===r.chuko && l.cost===r.cost){ l.toYm=r.ym; l.toAge=r.age; l.months++; l.gapSum+=r.gap/12; l.penSum+=r.pension/12; }
    else per.push(Object.assign({fromYm:r.ym,toYm:r.ym,fromAge:r.age,toAge:r.age,months:1,gapSum:r.gap/12,penSum:r.pension/12},r)); }
  per.forEach(x=>{x.gapSum=Math.round(x.gapSum); x.penSum=Math.round(x.penSum);});
  const gap=Math.round(rows.reduce((a,r)=>a+r.gap/12,0)), pens=Math.round(rows.reduce((a,r)=>a+r.pension/12,0));
  const assets=(p.savings||0)+(p.insurance||0)+(p.retire||0)+(p.choi||0);
  return {kosei, periods:per, gap, pensionSum:pens, assets, after:assets-gap, months:M, chukoOK, koseiEnd};
}


// 相続した家を売ったときの税金（譲渡所得・分離課税）
const SZ={RATE:{wood:0.031, mortar:0.034, rc:0.015, m3:0.036, m4:0.025, steel:0.020}};
function sozokuDepr(price,kind,years){ if(!price) return 0; const r=SZ.RATE[kind]||0.031; return Math.min(Math.round(price*0.95), Math.round(price*0.9*r*Math.max(0,years))); }
function sozokuChukai(price,low){ if(price<=0) return 0; if(low&&price<=8000000) return 330000; const b=price<=2000000?price*0.05:price<=4000000?price*0.04+20000:price*0.03+60000; return Math.round(b*1.1); }
function sozokuTax(gain,long){ const b=Math.floor(Math.max(0,gain)/1000)*1000; const ri=long?0.15:0.30, rj=long?0.05:0.09;
  const it=Math.floor(b*ri), fk=Math.floor(it*0.021), nat=Math.floor((it+fk)/100)*100, jm=Math.floor(b*rj/100)*100; return {base:b,nat,jm,total:nat+jm}; }
function sozokuUri(p){
  const price=p.price||0, saleY=p.saleYear||2026;
  const chukai=p.chukai==='none'?0:sozokuChukai(price,p.chukai==='low'), costs=chukai+(p.otherCost||0);
  let shutoku, depr=0, gaisan=false;
  const known=(p.land||0)+(p.bld||0);
  const depY=saleY-(p.buyYear||saleY);
  if(p.mode==='known'){ depr=sozokuDepr(p.bld||0,p.kind,depY); shutoku=(p.land||0)+(p.bld||0)-depr+(p.touki||0); }
  else { shutoku=Math.round(price*0.05); gaisan=true; }
  if(p.mode==='known' && shutoku<Math.round(price*0.05)){ shutoku=Math.round(price*0.05); gaisan=true; depr=0; }
  const long=(saleY-(p.buyYear||saleY))>=6;
  const gain0=Math.max(0,price-shutoku-costs);
  const none=sozokuTax(gain0,long);
  let akiya=null; if(p.akiya && price<=100000000){ const ded=Math.min(gain0,(p.heirs>=3?20000000:30000000)); akiya={ded, gain:gain0-ded, tax:sozokuTax(gain0-ded,long)}; }
  let kasan=null; if(p.souzokuTax>0 && p.kasanOK && p.taxBase>0){ const add=Math.min(gain0,Math.round(p.souzokuTax*(p.evalHouse||0)/p.taxBase)); kasan={add, gain:gain0-add, tax:sozokuTax(gain0-add,long)}; }
  let best={name:'none',tax:none};
  if(akiya && akiya.tax.total<best.tax.total) best={name:'akiya',tax:akiya.tax};
  if(kasan && kasan.tax.total<best.tax.total) best={name:'kasan',tax:kasan.tax};
  return {price,chukai,costs,shutoku,depr,gaisan,long,gain0,none,akiya,kasan,best,net:price-costs-best.tax.total};
}

// 不動産投資の損益通算（会社員・1年分）
const FD={LIFE:{rc:47, src:47, wood:22, mortar:20, m3:19, m4:27, steel:34}};
function fdRate(n){ return Math.ceil(1000/n-1e-9)/1000; }
function fdLife(kind,age){ const L=FD.LIFE[kind]||47; if(!age||age<=0) return L; const n=age>=L? Math.floor(L*0.2) : Math.floor((L-age)+age*0.2); return Math.max(2,n); }
function fudosan(p){
  const life=fdLife(p.kind,p.age||0), r=fdRate(life), mon=Math.min(12,Math.max(1,p.months||12));
  const depr=Math.min(Math.round((p.bld||0)*r*mon/12), Math.max(0,(p.bld||0)-(p.booked||0)-1));
  const cashExp=(p.kanri||0)+(p.kotei||0)+(p.hoken||0)+(p.other||0)+(p.once||0);
  const exp=cashExp+(p.interest||0)+depr;
  const income=(p.rent||0)-exp;
  const landDebt=Math.max(0,(p.loan||0)-(p.bld||0));
  const landInt=(p.loan||0)>0? Math.round((p.interest||0)*Math.min(1,landDebt/(p.loan))) : 0;
  const cut=income<0? Math.min(-income,landInt) : 0;
  const tsusan=income<0? income+cut : income;
  const inc=p.inc||0, g=Math.max(0,inc-kyuyo(inc));
  const s0=sogo(inc,0,g), s1=sogo(inc,tsusan,Math.max(0,g+tsusan));
  const taxDiff=(s1.it+s1.jt)-(s0.it+s0.jt);
  const cash=(p.rent||0)-cashExp-(p.repay||0);
  return {life,rate:r,depr,exp,income,landInt,cut,tsusan,it0:s0.it,jt0:s0.jt,it1:s1.it,jt1:s1.jt,itDiff:s1.it-s0.it,jtDiff:s1.jt-s0.jt,taxDiff,cash,cashAfter:cash-taxDiff};
}

// 転職と手取り
function kokuhoG(g,a40,n){ // 国保の年額の目安（所得から。渋谷区の2026年度の料率・子ども・子育て支援金分をふくむ）
  n=Math.max(1,n||1);
  const v=Math.max(0,g-430000)*(0.0751+0.0280+0.0027+(a40?0.0243:0))+(47600+17600+1873+(a40?17800:0))*n;
  return Math.min(Math.round(v),a40?1130000:960000); // 上限：40〜64歳は113万円、それ以外は介護分17万円を引いた96万円
}
function tenKokuho(prevInc,a40,family){ // 国保の年額の目安（1人分の均等割＋家族の人数分）
  const g=Math.max(0,prevInc-kyuyo(prevInc));
  return kokuhoG(g,a40,family);
}
function tenshoku(p){
  const base={kou:p.kou||0,dai:p.dai||0,gw:p.gw==null?null:p.gw,gs:null,ideco:0,bal:0,capB:0,fmode:'one'};
  const A=Object.assign({},base,{inc:p.incA}), B=Object.assign({},base,{inc:p.incB});
  const cA=core(A,0), cB=core(B,0);
  const netA=net(A), netB=net(B);
  const mA=Math.round((p.incA-cA.sh-cA.IT)/12-(cA.JT+5000)/12), mB=Math.round((p.incB-cB.sh-cB.IT)/12-(cB.JT+5000)/12);
  const mB1=Math.round((p.incB-cB.sh-cB.IT)/12-(cA.JT+5000)/12); // 転職後しばらくは住民税が前の年収のまま
  const gap=Math.max(0,p.gap||0);
  const gt=p.gapType||'kokuho', nk=(p.age60||gt==='fuyou')?0:gap*17920;
  const nenkin=nk, kokuho=gt==='kokuho'?Math.round(tenKokuho(p.incA,p.a40,p.family)*gap/12):0;
  return {netA,netB,diff:netB-netA,mA,mB,mB1,shA:cA.sh,shB:cB.sh,itA:cA.IT,itB:cB.IT,jtA:cA.JT,jtB:cB.JT,gap,nenkin,kokuho,gapCost:nenkin+kokuho,lostPay:Math.round(p.incA/12*gap)};
}

// 健康保険の標準報酬月額（全50等級）。32万円までは GR と同じ
const GRK=GR.slice(0,-1).concat([[330000,320000],[350000,340000],[370000,360000],[395000,380000],[425000,410000],[455000,440000],[485000,470000],[515000,500000],[545000,530000],[575000,560000],[605000,590000],[635000,620000],[665000,650000],[695000,680000],[730000,710000],[770000,750000],[810000,790000],[855000,830000],[905000,880000],[955000,930000],[1005000,980000],[1055000,1030000],[1115000,1090000],[1175000,1150000],[1235000,1210000],[1295000,1270000],[1355000,1330000],[Infinity,1390000]]);
const hyojunK=p=>{for(const [l,g] of GRK){ if(p<l) return g; }};
// 看護師・薬剤師の働き方（常勤・パート・派遣・夜勤）
function iryoWork(p){
  const kind=p.kind||'jokin', n=Math.max(0,p.n||0), na=Math.max(0,p.na||0);
  let monthly, bo=0, hrs;
  if(kind==='jokin'){ monthly=(p.m||0)+n*na; bo=Math.max(0,p.bo||0); hrs=40; }
  else { monthly=(p.w||0)*(p.h||0)*52/12+n*na; hrs=(p.h||0)+n*(p.nl||14)*12/52; }
  monthly=Math.round(monthly);
  const inc=monthly*12+bo;
  let sk; // 社会保険：emp=勤め先で入る dep=家族の扶養 kokuho=国保と国民年金
  if(kind==='jokin'||hrs>=30||(hrs>=20&&p.sz!=='small')) sk='emp';
  else if(inc<1300000&&p.fuyou) sk='dep';
  else sk='kokuho';
  const kr=0.04925+(p.a40?0.0081:0)+0.00115; // 協会けんぽ東京支部2026年度9.85%の半分＋介護＋子ども・子育て支援金（本人負担）。ほかのページとそろえる
  let sh=0, kenpo=0, kosei=0, koyo=0, kokuho=0, nenkin=0, hy=0;
  if(sk==='emp'){
    hy=hyojunK(monthly); const hn=Math.min(Math.max(hy,88000),650000);
    const b1=Math.floor(bo/2/1000)*1000; // 賞与は年2回・1回の額を千円未満切り捨て
    kenpo=Math.round(12*hy*kr+Math.min(b1*2,5730000)*kr);
    kosei=Math.round(12*hn*0.0915+Math.min(b1,1500000)*2*0.0915);
    koyo=Math.round(inc*0.005); sh=kenpo+kosei+koyo;
  } else if(sk==='kokuho'){
    kokuho=tenKokuho(inc,p.a40,1); nenkin=p.age60?0:17920*12; sh=kokuho+nenkin;
  }
  sh=Math.round(sh);
  const g=Math.max(0,inc-kyuyo(inc));
  const it=incomeTax(g-sh-kisoI(g)), jt=juminSimple(g,sh,0,50000);
  const nt=inc-sh-it-jt;
  return {kind,inc,monthly,bo,hrs:Math.round(hrs*10)/10,sk,sh,kenpo,kosei,koyo,hy,kokuho,nenkin,it,jt,net:nt,mNet:Math.round(nt/12),pension:sk==='emp'?Math.round((12*Math.min(Math.max(hy,88000),650000)+Math.min(Math.floor(bo/2/1000)*1000,1500000)*2)*5.481/1000):0};
}

// 高額療養費（70歳未満・2026年8月〜2027年7月診療分）
const KG={a:[270300,901000,140100,1680000],i:[179100,597000,93000,1110000],u:[85800,286000,44400,530000],e:[61500,0,44400,530000],o:[36900,0,24600,290000]};
function kgLimit(k,total,tasu){ const t=KG[k]; if(tasu) return t[2]; return t[1]?t[0]+Math.round(Math.max(0,total-t[1])*0.01):t[0]; }
function kogaku(p){ // p:{k, total(1か月の総医療費=10割), months(同じ医療費が続く月数), tasu(すでに多数回該当), rate}
  const k=p.k||'u', total=Math.max(0,p.total||0), n=Math.max(1,Math.min(12,p.months||1)), rate=p.rate||0.3;
  const self=Math.round(total*rate/10)*10; // 窓口負担（10円単位）
  const rows=[]; let sum=0, back=0, cnt=0;
  for(let i=1;i<=n;i++){
    const tasu=!!p.tasu||cnt>=3; const lim=kgLimit(k,total,tasu);
    const pay=Math.min(self,lim), b=self-pay; if(b>0) cnt++;
    rows.push({i,tasu,lim,pay,back:b}); sum+=pay; back+=b;
  }
  const cap=KG[k][3], yearBack=Math.max(0,sum-cap);
  return {self,lim1:rows[0].lim,back1:rows[0].back,pay1:rows[0].pay,rows,sumSelf:self*n,sum,back,cap,yearBack,final:sum-yearBack};
}

// 退職金・iDeCo一時金の税金（退職所得・2026年分以後）
const tkRaw=n=>n<=0?0:n<=20?400000*n:8000000+700000*(n-20); // 年数ぶんの控除額（80万円の下限なし）
function tkKojo(months,dis){ const y=Math.max(1,Math.ceil(months/12)); return Math.max(tkRaw(y),800000)+(dis?1000000:0); }
const tkYears=amt=>amt<=8000000?Math.floor(amt/400000):20+Math.floor((amt-8000000)/700000); // 前の収入から逆算した年数（使わなかった枠の調整）
function tkTax(inc,ko,o){ // 退職所得の税金
  o=o||{}; const rest=Math.max(0,inc-ko);
  let so; if(o.yakuin) so=rest; else if(o.tanki) so=rest<=3000000?rest/2:1500000+(rest-3000000); else so=rest/2;
  so=fl1000(so);
  const it=Math.floor(baseTax(so)*1.021), jt=Math.floor(so*0.06/100)*100+Math.floor(so*0.04/100)*100; // 所得税は1円未満切り捨て・住民税は市町村6%と道府県4%をそれぞれ100円未満切り捨て
  return {inc,ko,so,it,jt,tax:it+jt,net:inc-it-jt};
}
function taishoku(p){ // p:{inc,km(勤続月数),dis,yakuin,ideco,im(iDeCo加入月数),order:'same'|'ideco'|'tai',gap(年)}
  const inc=p.inc||0, km=Math.max(1,p.km||1), id=p.ideco||0, im=Math.max(0,Math.min(p.im||0,km));
  const tanki=Math.ceil(km/12)<=5, o={yakuin:!!p.yakuin&&tanki,tanki:tanki&&!p.yakuin};
  const kKo=tkKojo(km,p.dis), iKo=im?tkKojo(im,false):0, ov=Math.floor(im/12);
  const sc={};
  // 同じ年に受け取る（勤続期間が長いほうで1回の控除）
  sc.same=(()=>{ const r=tkTax(inc+id,kKo,o); return {tai:r,ide:null,tax:r.tax,net:r.net}; })();
  // iDeCoを先に受け取る：9年内は退職金の控除を調整
  const iAlone=id?tkTax(id,iKo,{}):null;
  const adjT=Math.max(tkKojo(km,false)-tkRaw(Math.min(ov,tkYears(id))),800000)+(p.dis?1000000:0); // 調整のあとも80万円が下限
  sc.ideco_in=(()=>{ const t=tkTax(inc,Math.max(0,adjT),o); return {tai:t,ide:iAlone,tax:t.tax+(iAlone?iAlone.tax:0),net:t.net+(iAlone?iAlone.net:0),ko:Math.max(0,adjT)}; })();
  sc.ideco_out=(()=>{ const t=tkTax(inc,kKo,o); return {tai:t,ide:iAlone,tax:t.tax+(iAlone?iAlone.tax:0),net:t.net+(iAlone?iAlone.net:0)}; })();
  // 退職金を先に受け取る：19年内はiDeCoの控除を調整
  const tAlone=tkTax(inc,kKo,o);
  const adjI=Math.max(iKo-tkRaw(Math.min(ov,tkYears(inc))),800000);
  sc.tai_in=(()=>{ const i=id?tkTax(id,Math.max(0,adjI),{}):null; return {tai:tAlone,ide:i,tax:tAlone.tax+(i?i.tax:0),net:tAlone.net+(i?i.net:0),ko:Math.max(0,adjI)}; })();
  sc.tai_out=(()=>{ const i=id?tkTax(id,iKo,{}):null; return {tai:tAlone,ide:i,tax:tAlone.tax+(i?i.tax:0),net:tAlone.net+(i?i.net:0)}; })();
  const ord=p.order||'same', g=p.gap||0;
  const key=ord==='same'?'same':ord==='ideco'?(g<=9?'ideco_in':'ideco_out'):(g<=19?'tai_in':'tai_out');
  return {kKo,iKo,tanki,sc,key,cur:sc[key]};
}

// 退職後の健康保険（任意継続・国保・家族の扶養）
function taiKenpo(p){ // p:{m(退職時の月給),inc(退職した前の年の給与収入),hiji(会社都合などで国保の軽減),a40,n(国保に入る人数)}
  const hy=hyojunK(p.m||0), hn=Math.min(hy,320000);
  const rate=0.0985+(p.a40?0.0162:0)+0.0023; // 協会けんぽ東京支部・2026年度（介護は40〜64歳・子ども・子育て支援金0.23%）
  const niniM=Math.floor(hn*rate), nini=niniM*12;
  const inc=p.inc||0, g=Math.max(0,inc-kyuyo(inc)), gk=p.hiji?Math.floor(g*0.3):g;
  const kokuho=kokuhoG(gk,p.a40,p.n||1), kokuho0=kokuhoG(g,p.a40,p.n||1);
  const zai=Math.floor(hy*rate/2)*12; // 在職中の本人負担（同じ料率・折半）
  return {hy,hn,rate,niniM,nini,kokuho,kokuhoM:Math.round(kokuho/12),kokuho0,g,gk,zai};
}

// 年金の繰り上げ・繰り下げ（老齢基礎年金と老齢厚生年金を同じ時期に受け取る場合）
function nkRate(st,old){ // st: 受け取り始める年齢（月）。65歳＝780
  if(st<780) return -(780-st)*(old?0.005:0.004);
  if(st<792) return 0; // 66歳になるまでは繰り下げできない
  return Math.min(st-780,120)*0.007;
}
function nenkin(p){ // p:{kiso,kosei(65歳からの年額),st(開始・月),old(1962年4月1日以前生まれ),wage(総報酬月額相当額),wEnd(働く終わりの年齢・月)}
  const kiso=p.kiso||0, kosei=p.kosei||0, st=p.st||780, wage=p.wage||0, wEnd=p.wEnd||0;
  const r=nkRate(st,p.old);
  const stopB=(m,base)=>(wage>0&&m<wEnd)?Math.min(base,Math.max(0,(base+wage-650000)/2)):0; // 在職老齢年金の月の停止額（基本月額＋総報酬月額相当額が65万円をこえた分の半分・2026年度）
  const stop=m=>stopB(m,kosei/12);
  let avg=1;
  if(st>780&&kosei>0){ let s=0,n=0; for(let m=780;m<st;m++){ s+=(kosei/12-stop(m))/(kosei/12); n++; } avg=n?s/n:1; }
  const kisoY=Math.round(kiso*(1+r)), koseiBase=kosei*(r<0?1+r:1), koseiAdd=r>0?kosei*avg*r:0;
  const monthAt=m=>{ if(m<st) return 0; const k=koseiBase/12-stopB(m,koseiBase/12); return kisoY/12+Math.max(0,k)+koseiAdd/12; };
  const cum=age=>{ let s=0; for(let m=Math.min(st,age*12);m<age*12;m++) s+=monthAt(m); return Math.round(s); };
  return {r,kisoY,koseiY:Math.round(koseiBase+koseiAdd),year:Math.round(kisoY+koseiBase+koseiAdd),avg,stop65:Math.round(stop(780)),cum,monthAt};
}
function nkCross(p,st0){ // 65歳（またはst0）で受け取り始めた場合と、合計が並ぶ年齢（歳・月）
  const a=nenkin(p), b=nenkin(Object.assign({},p,{st:st0||780}));
  let sa=0,sb=0;
  for(let m=Math.min(p.st,st0||780);m<1300;m++){ sa+=a.monthAt(m); sb+=b.monthAt(m);
    if(m>=Math.max(p.st,st0||780)&&((p.st>(st0||780)&&sa>=sb)||(p.st<(st0||780)&&sa<=sb))) return m+1; }
  return null;
}

// 年の途中で退職した人の確定申告（所得税の還付）
function taiShinkoku(p){
  const inc=p.inc||0, g=Math.max(0,inc-kyuyo(inc));
  const sh=(p.sha||0)+(p.shAfter||0);
  const L=lifeDed(p.ip||0,0,0,!!p.u23).it;
  const iryoD=Math.min(2000000,Math.max(0,(p.iryo||0)-(p.hoten||0)-Math.min(100000,Math.floor(g*0.05))));
  const kifuD=Math.max(0,Math.min((p.kifu||0),Math.floor(g*0.4))-2000);
  const spI=p.gw==null?0:spDed(SPI,g,p.gw);
  const ide=p.ideco||0;
  const ded={sh,kiso:kisoI(g),sp:spI,life:L,iryo:iryoD,kifu:kifuD,ideco:ide};
  const TI=fl1000(g-sh-ded.kiso-spI-L-iryoD-kifuD-ide);
  const tax=incomeTax(TI), wh=p.wh||0;
  const noAdd=incomeTax(fl1000(g-(p.sha||0)-ded.kiso-spI)); // 退職後の保険料などを入れない場合（源泉徴収票の分だけ）
  return {g,ded,TI:Math.max(0,TI),tax,wh,refund:wh-tax,noAdd};
}
const API={kyuyo,core,net,burden,furuLimit,hlUsed,idecoSave,spouse,student,idecoCap,evaluate,MODS,ORDER,HOUSE,kisoI,incomeTax,fx,crypto,iryo,fukugyo,lifeDed,nencho,shussan,shussanWd,izoku,izokuKosei,izokuKidEnd,sozokuUri,sozokuTax,sozokuDepr,sozokuChukai,fudosan,fdLife,fdRate,tenshoku,tenKokuho,iryoWork,hyojunK,kogaku,kgLimit,taishoku,tkKojo,tkTax,tkRaw,taiKenpo,kokuhoG,nenkin,nkRate,nkCross,taiShinkoku};
if(typeof module!=='undefined'&&module.exports){ module.exports=API; }
root.SEIDO=API;
if(typeof document==='undefined') return;

/* ===== 画面 ===== */
const man=v=>{const s=v<0?'−':'';const m=Math.abs(v)/10000;return s+(m>=100?Math.round(m):Math.round(m*10)/10).toLocaleString('ja-JP')+'万円';};
const yen=v=>{const s=v<0?'−':'';return s+(Math.round(Math.abs(v)/100)*100).toLocaleString('ja-JP')+'円';};
const yen1=v=>Math.round(v).toLocaleString('ja-JP')+'円';
const sel=(id,opts,v)=>'<select id="'+id+'">'+opts.map(([a,b])=>'<option value="'+a+'"'+(String(a)===String(v)?' selected':'')+'>'+b+'</option>').join('')+'</select>';
const range=(id,min,max,step,v)=>'<div class="row"><input type="range" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+v+'"><output id="'+id+'Out" for="'+id+'"></output></div>';
const box=(id,label,big)=>'<div'+(big?' class="big"':'')+'><span>'+label+'</span><b id="'+id+'">-</b><small id="'+id+'N"></small></div>';

const CSS='.sd-sec{border-top:1px dashed var(--g3);margin-top:18px;padding-top:6px}.sd-sec>h3{margin:8px 0 0;font-size:16px;color:var(--g)}.sd-sec>h3 small{color:var(--sub);font-weight:400;font-size:12px;margin-left:6px}.sd-max{font:inherit;font-size:14px;border:1px solid var(--g);background:#fff;color:var(--g);border-radius:999px;padding:4px 12px;cursor:pointer;white-space:nowrap}.sd-max[aria-pressed=true]{background:var(--g);color:#fff}.sd-links{background:#FFF4E0;border:1px solid #F1D19A;border-radius:10px;padding:10px 12px;margin-top:14px}.sd-links h3{margin:0 0 4px;font-size:15px;color:#8A4B0F}.sd-links ul{margin:0;padding-left:1.2em}.sd-links li{margin:4px 0}.sd-out{margin-top:20px}.sd-out h3{font-size:16px;margin:16px 0 0}details.sd-sweep{margin-top:10px}details.sd-sweep summary{cursor:pointer;color:var(--g);font-weight:700}';

function init(){
  const sec=document.getElementById('calc'); if(!sec||!sec.dataset.mods) return;
  const mods=sec.dataset.mods.split(',').filter(k=>MODS[k]);
  const has=k=>mods.includes(k);
  const D=Object.assign({inc:6000000,year:2026,ideco:'cap',wife:1200000,baito:1200000,bal:30000000},JSON.parse(sec.dataset.def||'{}'));
  const st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
  const app=document.getElementById('sd-app');
  let h='';
  // 共通：本人と家族
  h+='<div class="sd-sec" style="border:0;margin:0;padding:0"><h3>あなたと家族</h3>';
  h+='<label for="inc">あなたの年収（手取りではなく、税金や保険料が引かれる前の額）</label>'+range('inc',1500000,20000000,100000,D.inc);
  h+='<div class="hint">源泉徴収票の「支払金額」です。ないときは「毎月の総支給額×12＋ボーナス」で入れてください。'+(has('kabe')?'家計の中心で働く人（例：夫）の年収を入れてください。':'')+'</div>';
  if(!has('kabe')) h+='<label for="sp">配偶者</label>'+sel('sp',[[0,'いない／共働き（配偶者控除なし）'],[1,'配偶者控除を受けている（配偶者の収入なし）']],0);
  h+='<label for="kou">扶養している16〜18歳の子ども</label>'+sel('kou',[0,1,2,3].map(n=>[n,n+'人']),0);
  h+='<label for="dai">'+(has('baito')?'ほかに扶養している19〜22歳の子ども（下で入れる子をのぞく）':'扶養している19〜22歳の子ども')+'</label>'+sel('dai',[0,1,2,3].map(n=>[n,n+'人']),0);
  h+='</div>';
  if(has('ideco')){
    h+='<div class="sd-sec"><h3>iDeCo<small>条件を入れると上限が出ます</small></h3>';
    h+='<label for="year">計算する年</label>'+sel('year',[[2026,'2026年分（いまの上限）'],[2027,'2027年分（2027年1月からの新しい上限）']],D.year);
    h+='<label for="work">あなたの働き方</label>'+sel('work',[['emp','会社員（企業年金なし）'],['empdc','会社員（企業年金あり）'],['gov','公務員']],'emp');
    h+='<div id="otherBox" hidden><label for="other">会社の企業年金の掛金（月額）</label><div class="row"><input type="number" id="other" min="0" max="62000" step="1000" value="20000"> 円</div><div class="hint">企業型DCの会社掛金と、DBなどの掛金相当額の合計です。</div></div>';
    h+='<label for="ideco">iDeCoの掛金（月額）</label><div class="row"><input type="range" id="ideco" min="0" max="23000" step="1000" value="0"><output id="idecoOut" for="ideco"></output></div>';
    h+='<div class="row" style="justify-content:space-between;flex-wrap:wrap"><span class="hint" id="capHint"></span><button type="button" class="sd-max" id="idecoMax" aria-pressed="true">上限いっぱいにする</button></div>';
    h+='<div class="hint">最初は上限の額が入っています。上限より少なくしたいときは、つまみを左に動かしてください。</div></div>';
  }
  if(has('jutaku')){
    h+='<div class="sd-sec"><h3>住宅ローン控除</h3>';
    h+='<label for="bal">年末のローン残高</label>'+range('bal',0,50000000,1000000,D.bal);
    h+='<label for="house">家の種類（2026年に住み始める場合）</label>'+sel('house',[['nintei_new','新築：長期優良住宅・低炭素住宅'],['zeh_new','新築：ZEH水準省エネ住宅'],['sho_new','新築：省エネ基準適合住宅'],['nintei_old','中古：長期優良住宅・低炭素住宅'],['zeh_old','中古：ZEH水準省エネ住宅'],['sho_old','中古：省エネ基準適合住宅'],['other_old','中古：それ以外の住宅']],'zeh_new');
    h+='<label for="kosodate">子育て・若者夫婦世帯？</label>'+sel('kosodate',[[0,'いいえ'],[1,'はい（19歳未満の子がいる、または夫婦のどちらかが40歳未満）']],1);
    if(has('furusato')) h+='<label for="fmode">ふるさと納税の手続き</label>'+sel('fmode',[['onestop','ワンストップ特例（2年目以降、年末調整で住宅ローン控除を受ける人）'],['kakutei','確定申告（住宅ローン控除の1年目など）']],D.fmode||'onestop');
    h+='</div>';
  }
  if(has('kabe')){
    h+='<div class="sd-sec"><h3>配偶者のパート（年収の壁）</h3>';
    h+='<label for="wife">配偶者のパート年収（手取りではなく、税金や保険料が引かれる前の額）</label>'+range('wife',0,2500000,10000,D.wife)+'<div class="hint">パート先の源泉徴収票の「支払金額」です。ないときは「毎月の総支給額×12＋ボーナス」で入れてください。</div>';
    h+='<label for="wmode">配偶者は勤め先の社会保険に入る？</label>'+sel('wmode',[['no','入らない（扶養内・会社が対象外）'],['yes','入る（週20時間以上・対象の会社）']],'no');
    h+='<label for="wage">配偶者の年齢</label>'+sel('wage',[[0,'39歳以下'],[1,'40〜59歳'],[2,'60〜64歳']],1);
    h+='</div>';
  }
  if(has('baito')){
    h+='<div class="sd-sec"><h3>大学生の子のバイト（19〜22歳）</h3>';
    h+='<label for="baito">子のバイト代（1年・額面）</label>'+range('baito',0,2500000,10000,D.baito);
    h+='<div class="hint">扶養している19〜22歳の子1人分です。</div></div>';
  }
  // 答え
  h+='<div class="sd-out" aria-live="polite">';
  const outs=[];
  if(has('furusato')) outs.push(['furusato','<div class="res">'+box('oLim','ふるさと納税：2,000円の負担で済む寄付の上限（目安）',true)+box('oSafe','少し控えめにするなら')+box('oBase','あなたの所得税＋住民税（寄付する前）')+'</div>']);
  if(has('ideco')) outs.push(['ideco','<div class="res">'+box('oSave','iDeCoで1年に減る税金（所得税＋住民税）',!has('furusato'))+box('oCap','あなたのiDeCoの上限（月額）')+box('oRatio','掛金の何割が税金で戻る？')+'</div>']);
  if(has('jutaku')) outs.push(['jutaku','<div class="res">'+box('oUsed','住宅ローン控除で実際に戻る額（この年）',!has('furusato')&&!has('ideco'))+box('oC','住宅ローン控除の上限（この年）')+box('oUnused','引ききれずに消える額')+'</div>']);
  if(has('kabe')) outs.push(['kabe','<div class="res">'+box('oHH','夫婦2人の手取りの合計（1年・目安）',!has('furusato')&&!has('ideco')&&!has('jutaku'))+box('oWife','配偶者の手取り')+box('oHdown','配偶者が働くことで、あなたの手取りが減る額')+'</div>']);
  if(has('baito')) outs.push(['baito','<div class="res">'+box('oFam',has('kabe')?'家族の手取りの合計（あなた＋配偶者＋子・1年の目安）':'家族の手取りの合計（親＋子・1年の目安）',!has('furusato')&&!has('ideco')&&!has('jutaku')&&!has('kabe'))+box('oStu','子の手取り')+box('oPdown','子が働くことで、あなたの手取りが減る額')+'</div>']);
  outs.forEach(([k,html],i)=>{ h+=(outs.length>1?'<h3>'+MODS[k].name+'</h3>':'')+html; });
  h+='<div id="alertBox" class="alert" hidden></div>';
  if(mods.length>1) h+='<div class="sd-links"><h3>制度どうしのつながり（この条件で）</h3><ul id="links"></ul></div>';
  h+='<div id="sweeps"></div></div>';
  app.innerHTML=h;

  const $=id=>document.getElementById(id);
  let follow=true;
  function read(){
    return {inc:+$('inc').value,sp:$('sp')?+$('sp').value:0,kou:+$('kou').value,dai:+$('dai').value,
      year:$('year')?+$('year').value:2026,work:$('work')?$('work').value:'emp',other:$('other')?+$('other').value:0,ideco:$('ideco')?+$('ideco').value:0,
      bal:$('bal')?+$('bal').value:0,house:$('house')?$('house').value:'zeh_new',kosodate:$('kosodate')?+$('kosodate').value:1,fmode:$('fmode')?$('fmode').value:'onestop',
      wife:$('wife')?+$('wife').value:0,wmode:$('wmode')?$('wmode').value:'no',wage:$('wage')?+$('wage').value:1,baito:$('baito')?+$('baito').value:0};
  }
  const set=(id,v,n)=>{ if($(id)){ $(id).textContent=v; if(n!==undefined&&$(id+'N')) $(id+'N').textContent=n; } };
  function linkText(l){
    const amt=Math.abs(l.d);
    const who={ideco:'iDeCoの掛金で',jutaku:'住宅ローン控除で',kabe:'配偶者がパートで働くことで',baito:'子がバイトで働くことで'}[l.from];
    if(l.to==='furusato'){
      if(amt<1000) return who+'、ふるさと納税の上限は<b>ほとんど変わりません</b>。';
      return who+'、ふるさと納税の上限が<b>約'+yen1(Math.round(amt/1000)*1000)+(l.d<0?' 下がって':' 上がって')+'</b>います。';
    }
    if(l.to==='ideco'){
      if(amt<100) return who+'、iDeCoで減る税金は<b>ほとんど変わりません</b>。';
      return who+'、iDeCoで減る税金が<b>約'+yen(amt)+(l.d<0?' 少なく':' 多く')+'</b>なっています（税金のかかり方の段階が変わるため）。';
    }
    if(l.to==='kabe'){
      if(amt<100) return who+'、配偶者のパートで減るあなたの手取りは<b>ほとんど変わりません</b>。';
      return who+'、配偶者のパートで減るあなたの手取りが<b>約'+yen(amt)+(l.d>0?' 多く':' 少なく')+'</b>なっています（税金のかかり方の段階が変わるため）。';
    }
    if(amt<100) return who+'、住宅ローン控除で戻る額は<b>変わりません</b>。';
    return who+'、住宅ローン控除で戻る額が<b>約'+yen(amt)+(l.d<0?' 減って':' ふえて')+'</b>います'+(l.d<0?'（引ききれずに消える分がふえる）':'')+'。';
  }
  function sweep(inp,key,label,steps,fmt){
    let rows='';
    const cols=[];
    if(key!=='ideco'&&has('ideco')) cols.push(['iDeCoで減る税金',r=>yen(r.save)]);
    if(key==='ideco') cols.push(['減る税金（年）',r=>yen(r.save)]);
    if(has('jutaku')) cols.push(['住宅ローン控除で戻る額',r=>yen(r.used)]);
    if(key==='kabe') cols.push(['夫婦の手取り',r=>man(r.hh)]);
    if(key==='baito') cols.push(['家族の手取り',r=>man(r.fam)]);
    if(has('furusato')) cols.push(['ふるさと納税の上限',r=>yen1(r.lim)]);
    for(const v of steps){ const o=Object.assign({},inp); o[key]=v; const r=evaluate(o,mods); rows+='<tr'+(v===inp[key]?' style="background:#FFF4E0"':'')+'><th scope="row" style="white-space:nowrap">'+fmt(v)+'</th>'+cols.map(c=>'<td class="n">'+c[1](r)+'</td>').join('')+'</tr>'; }
    return '<details class="sd-sweep"><summary>'+label+'を動かすと、ほかの答えはこう変わる（表）</summary><div style="overflow-x:auto"><table><thead><tr><th scope="col">'+label+'</th>'+cols.map(c=>'<th scope="col">'+c[0]+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div></details>';
  }
  let openSweeps=new Set();
  function update(src){
    const inp=read();
    if(has('ideco')){
      $('otherBox').hidden=inp.work!=='empdc';
      const cap=idecoCap(inp.year,inp.work,inp.other), sl=$('ideco');
      if(src==='ideco') follow=+sl.value>=cap;
      sl.max=cap; if(follow) sl.value=cap; else if(+sl.value>cap) sl.value=cap;
      inp.ideco=+sl.value;
      $('idecoMax').setAttribute('aria-pressed',String(follow));
      $('capHint').textContent='あなたの上限：月'+yen1(cap)+(inp.year===2027?'（2027年1月から）':'（2026年分）');
      $('idecoOut').textContent=yen1(inp.ideco);
    }
    $('incOut').textContent=man(inp.inc);
    if($('bal')) $('balOut').textContent=man(inp.bal);
    if($('wife')) $('wifeOut').textContent=man(inp.wife);
    if($('baito')) $('baitoOut').textContent=man(inp.baito);
    const r=evaluate(inp,mods), msg=[];
    if(has('furusato')){
      set('oLim',r.lim>2000?'約'+yen1(r.lim):'ほぼ0円',r.lim>2000?'このうち'+yen1(r.lim-2000)+'が税金から引かれ、自己負担は2,000円です':'税金がほとんどかからないため、ふるさと納税で得になる額はほぼありません');
      set('oSafe',r.lim>2000?'約'+yen1(Math.floor(r.lim*0.9/1000)*1000):'-','上限の9割。余裕を見た目安で、こえない保証はありません');
      set('oBase',yen(r.c.total+5000),'所得税 '+yen(r.c.IT)+'＋住民税 '+yen(r.c.JT+5000));
    }
    if(has('ideco')){
      set('oSave','約'+yen(r.save),'掛金 月'+yen1(inp.ideco)+'（1年で'+man(inp.ideco*12)+'）の場合'+(has('jutaku')?'。住宅ローン控除が引ききれなくなる分を差し引いた、実際に減る額です':''));
      set('oCap',yen1(r.capM),inp.year===2027?'2027年1月の引き落とし分から':'2026年分（2027年からは上がります）');
      set('oRatio',inp.ideco>0?Math.round(r.save/(inp.ideco*12)*100)+'%':'-','所得税と住民税の税率で決まります');
      if(inp.ideco>0&&r.save<1) msg.push('この年収では所得税・住民税がほとんどかからないため、iDeCoで減る税金はほぼありません。');
    }
    if(has('jutaku')){
      const un=Math.max(0,r.C-r.used);
      set('oUsed','約'+yen(r.used),'所得税から引き、引ききれない分を住民税から引きます');
      set('oC',yen(r.C),'年末の残高（限度額まで）の0.7%');
      set('oUnused',un>500?'約'+yen(un):'0円',un>500?'所得税と住民税から引ききれず、使えずに消えます':'全部使いきれています');
    }
    if(has('kabe')){
      const kn={none:'',dep:'あなたの扶養なので社会保険料はかかりません',emp:'勤め先の社会保険料',kokuho:(inp.wage===2?'国民健康保険':'国民年金＋国民健康保険')}[r.sp.kind];
      set('oHH','約'+man(r.hh),'あなた '+man(r.net)+'＋配偶者 '+man(r.sp.net));
      set('oWife','約'+man(r.sp.net),(r.sp.sh?kn+' '+yen(r.sp.sh)+'／年、':kn+(kn?'。':''))+'所得税 '+yen(r.sp.it)+'、住民税 '+yen(r.sp.jt));
      const d=r.net0-r.net; set('oHdown',d>50?'約'+yen(d):'0円',d>50?'配偶者控除・配偶者特別控除が少なくなるため':'この年収では、あなたの税金は変わりません');
    }
    if(has('baito')){
      set('oFam','約'+man(r.fam),'あなた '+man(r.net)+(r.sp?'＋配偶者 '+man(r.sp.net):'')+'＋子 '+man(r.stu.net));
      set('oStu','約'+man(r.stu.net),(r.stu.kokuho?'国民健康保険 '+yen(r.stu.kokuho)+'、':'親の健康保険の扶養のまま、')+'所得税 '+yen(r.stu.it)+'、住民税 '+yen(r.stu.jt));
      const d=r.net0b-r.net; set('oPdown',d>50?'約'+yen(d):'0円',d>50?'特定扶養控除が特定親族特別控除に変わり、少なくなるため':'あなたの控除は変わりません');
    }
    if(has('jutaku')&&has('furusato')&&inp.fmode==='kakutei'){ const l=r.links.find(l=>l.from==='jutaku'&&l.to==='furusato'); if(l&&l.d<-3000) msg.push('住宅ローン控除で税金がほとんど0になっているため、ふるさと納税の上限が下がっています。サイトの一般的なシミュレーションの額で寄付すると、自己負担が2,000円をこえることがあります。'); }
    if($('links')) $('links').innerHTML=r.links.map(l=>'<li>'+linkText(l)+'</li>').join('')||'<li>この条件では、制度どうしの影響はほとんどありません。</li>';
    const al=$('alertBox'); al.hidden=!msg.length; al.textContent=msg.join(' ');
    // 動かして比べる表
    const sw=$('sweeps'); sw.querySelectorAll('details').forEach(d=>{ if(d.open) openSweeps.add(d.dataset.k); else openSweeps.delete(d.dataset.k); });
    let s='';
    if(has('ideco')){ const cap=r.capM; const st=[0,5000,10000,15000,20000,23000,30000,40000,50000,54000,62000].filter(v=>v<cap); st.push(cap); if(!st.includes(inp.ideco)) st.push(inp.ideco); st.sort((a,b)=>a-b); s+=sweep(inp,'ideco','iDeCoの掛金（月額）',st,v=>yen1(v)).replace('<details','<details data-k="ideco"'); }
    if(has('kabe')){ const st=[0,1000000,1100000,1190000,1290000,1300000,1360000,1500000,1690000,1780000,2070000,2500000]; if(!st.includes(inp.wife)) st.push(inp.wife); st.sort((a,b)=>a-b); s+=sweep(inp,'wife','配偶者の年収',st,v=>man(v)).replace('<details','<details data-k="kabe"'); }
    if(has('baito')){ const st=[0,1030000,1190000,1300000,1360000,1500000,1690000,1970000,2200000]; if(!st.includes(inp.baito)) st.push(inp.baito); st.sort((a,b)=>a-b); s+=sweep(inp,'baito','子のバイト代',st,v=>man(v)).replace('<details','<details data-k="baito"'); }
    if(has('jutaku')){ const st=[0,10000000,20000000,30000000,40000000,50000000]; if(!st.includes(inp.bal)) st.push(inp.bal); st.sort((a,b)=>a-b); s+=sweep(inp,'bal','年末のローン残高',st,v=>man(v)).replace('<details','<details data-k="jutaku"'); }
    sw.innerHTML=s; sw.querySelectorAll('details').forEach(d=>{ if(openSweeps.has(d.dataset.k)) d.open=true; });
  }
  app.addEventListener('input',e=>update(e.target.id));
  app.addEventListener('change',e=>update(e.target.id));
  if($('idecoMax')) $('idecoMax').addEventListener('click',()=>{ follow=true; update('max'); });
  if(has('ideco')&&D.ideco!=='cap'){ follow=false; $('ideco').max=62000; $('ideco').value=D.ideco; }
  update('init');
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})(typeof window!=='undefined'?window:globalThis);
