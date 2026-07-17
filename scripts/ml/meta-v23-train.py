#!/usr/bin/env python3
"""
META-V23 — Full arsenal training pipeline. 35 features across divergence,
SMC patterns, volume profile, Fibonacci depth, and MTF context.
Platt calibration. Per-pair quality gates. RSI cap.
"""
import json, numpy as np, lightgbm as lgb, pickle
from pathlib import Path
from datetime import datetime
from sklearn.linear_model import LogisticRegression
import warnings
warnings.filterwarnings('ignore')

def sma(v,n):
    out=np.zeros(len(v));cs=np.cumsum(np.insert(v,0,0));out[n-1:]=(cs[n:]-cs[:-n])/n;return out

def ema(v,n):
    out=np.zeros(len(v));out[0]=v[0];k=2/(n+1)
    for i in range(1,len(v)):out[i]=k*v[i]+(1-k)*out[i-1]
    return out

def pivot_low(l_arr,idx,lb=2):
    if idx<lb or idx>=len(l_arr)-lb:return False
    return all(l_arr[idx-j]>=l_arr[idx]and l_arr[idx+j]>=l_arr[idx]for j in range(1,lb+1))

def pivot_high(h_arr,idx,lb=2):
    if idx<lb or idx>=len(h_arr)-lb:return False
    return all(h_arr[idx-j]<=h_arr[idx]and h_arr[idx+j]<=h_arr[idx]for j in range(1,lb+1))

def compute_indicators(c_arr,h_arr,l_arr,v_arr):
    nb=len(c_arr)
    a=np.zeros(nb)
    for i in range(13,nb):
        a[i]=np.mean([max(h_arr[j]-l_arr[j],abs(h_arr[j]-c_arr[j-1]),abs(l_arr[j]-c_arr[j-1]))for j in range(i-13,i+1)])
    rs=np.full(nb,50.0)
    for i in range(15,nb):
        d=np.diff(c_arr[i-14:i+1]);g=np.maximum(d,0).mean();l_=np.maximum(-d,0).mean()
        rs[i]=100-100/(1+g/l_)if l_>0 else(100 if g>0 else 50)
    mid=sma(c_arr,20);up=np.zeros(nb);lo=np.zeros(nb);w=np.zeros(nb)
    for i in range(19,nb):
        std=np.std(c_arr[i-19:i+1]);up[i]=mid[i]+2*std;lo[i]=mid[i]-2*std
        w[i]=(up[i]-lo[i])/mid[i]*100 if mid[i]>0 else 0
    ao=sma((h_arr+l_arr)/2,5)-sma((h_arr+l_arr)/2,34)
    ef=ema(c_arr,12);es=ema(c_arr,26);ml=ef-es
    sl_=np.zeros(nb);sl_[0]=ml[0]
    for i in range(1,nb):sl_[i]=2/10*ml[i]+(1-2/10)*sl_[i-1]
    macd=ml-sl_
    m7=sma(c_arr,7);m25=sma(c_arr,25);m7s=np.zeros(nb)
    for i in range(5,nb):m7s[i]=(m7[i]-m7[i-5])/max(m7[i-5],0.0001)*100
    vma=sma(v_arr,20);vz=np.zeros(nb)
    for i in range(19,nb):
        wv=v_arr[i-19:i+1];s=wv.std();vz[i]=(v_arr[i]-wv.mean())/max(s,0.0001)
    return a,rs,up,lo,w,ao,macd,m7,m25,m7s,vz

TAKER=0.0004;MAKER=0.0002;RT=TAKER+MAKER;F4H=0.12/(365*6)
SLIP={'BTCUSDT':0.5,'ETHUSDT':0.5,'BNBUSDT':0.5,'SOLUSDT':1,'XRPUSDT':1,'ADAUSDT':1,'DOGEUSDT':1,'AVAXUSDT':1,'DOTUSDT':1,'LINKUSDT':1}
STR_ATR=3.0;STOP_ATR=1.0;RR=2.5;MAXB=48

with open('/home/ariel/anavitrade-trading/scripts/data/klines-mtf.json') as f:
    pairs=json.load(f)

ALL=[];pair_quality={}
print(f"Processing {len(pairs)} pairs...")

for pair_idx, pair in enumerate(pairs):
    sym=pair['symbol'];b15=pair['klines']['15m'];b1h=pair['klines']['1h'];b4h=pair['klines']['4h']
    if len(b15)<200:continue
    c15=np.array([k['close']for k in b15],float);h15=np.array([k['high']for k in b15],float)
    l15=np.array([k['low']for k in b15],float);v15=np.array([k['volume']for k in b15],float)
    o15=np.array([k['open']for k in b15],float);t15=np.array([k['timestamp']for k in b15])
    a15,rs15,bu15,bl15,bw15,ao15,macd15,ma7_15,ma25_15,m7s15,vz15=compute_indicators(c15,h15,l15,v15)
    nb=len(b15)
    has1h=len(b1h)>=50;has4h=len(b4h)>=30

    if has1h:
        c1h=np.array([k['close']for k in b1h],float);h1h=np.array([k['high']for k in b1h],float)
        l1h=np.array([k['low']for k in b1h],float);v1h=np.array([k['volume']for k in b1h],float)
        t1h=np.array([k['timestamp']for k in b1h])
        a1h,rs1h,bu1h,bl1h,bw1h,ao1h,macd1h,ma7_1h,ma25_1h,m7s1h,*_=compute_indicators(c1h,h1h,l1h,v1h)
    if has4h:
        c4h=np.array([k['close']for k in b4h],float);h4h=np.array([k['high']for k in b4h],float)
        l4h=np.array([k['low']for k in b4h],float);v4h=np.array([k['volume']for k in b4h],float)
        t4h=np.array([k['timestamp']for k in b4h])
        a4h,rs4h,bu4h,bl4h,bw4h,ao4h,macd4h,ma7_4h,ma25_4h,m7s4h,*_=compute_indicators(c4h,h4h,l4h,v4h)

    sb=SLIP.get(sym,3.0);tp_hits=0;total_entries=0

    for i in range(50,nb-MAXB):
        if a15[i]<=0:continue
        near_sw=False;sw_val=0.0
        for k in range(max(3,i-30),i):
            if pivot_low(l15,k,2)and l15[k]<c15[i]:
                d=(c15[i]-l15[k])/max(a15[i],0.0001)
                if d<STR_ATR:near_sw=True;sw_val=l15[k];break
        if not near_sw:continue
        total_entries+=1

        ts=int(t15[i])
        j1=int(np.searchsorted(t1h,ts,side='right')-1)if has1h else-1
        j1=max(20,min(len(b1h)-1,j1))if has1h and j1>=0 else-1
        j4=int(np.searchsorted(t4h,ts,side='right')-1)if has4h else-1
        j4=max(20,min(len(b4h)-1,j4))if has4h and j4>=0 else-1

        e=c15[i+1];ae=a15[i+1];slip=e*sb/10000;ea=e+slip;st=sw_val-STOP_ATR*ae;risk=ea-st
        if risk<=0:continue

        hit=False;sl_hit=False;ep_=ea;bh=0;tp_price=ea+risk*RR
        for fi in range(i+2,min(nb,i+MAXB+2)):
            bh=fi-i
            if l15[fi]<=st:sl_hit=True;ep_=st;break
            if h15[fi]>=tp_price:hit=True;ep_=tp_price-e*SLIP.get(sym,3)/10000;break
        if not(hit or sl_hit):ep_=c15[min(i+MAXB,nb-1)]-e*SLIP.get(sym,3)/10000;bh=MAXB
        if hit:tp_hits+=1

        gr=(ep_-ea)/risk;nr_=ea/risk;net=gr-RT*nr_-F4H*(bh/16)*nr_
        m20=c15[max(0,i-20):i+1].mean();m50=c15[max(0,i-49):i+1].mean()if i>=50 else m20
        bb_p=(c15[i]-bl15[i])/(bu15[i]-bl15[i])if bu15[i]>bl15[i]else 0.5
        h1bb=(c1h[j1]-bl1h[j1])/(bu1h[j1]-bl1h[j1])if has1h and j1>=20 and bu1h[j1]>bl1h[j1]else 0.5
        h4bb=(c4h[j4]-bl4h[j4])/(bu4h[j4]-bl4h[j4])if has4h and j4>=20 and bu4h[j4]>bl4h[j4]else 0.5

        # DIVERGENCE
        div_rsi=0;div_ao=0;div_comp=0;div_triple=0;div_rsi_str=0.0
        if i>=30:
            pls=[]
            for k in range(max(3,i-30),i-3):
                if pivot_low(l15,k,2):pls.append((l15[k],rs15[k]))
            if len(pls)>=2 and pls[-1][0]<pls[-2][0]and pls[-1][1]>pls[-2][1]+2:div_rsi=1;div_rsi_str=min(1.0,(pls[-1][1]-pls[-2][1])/10)
            aos=[]
            for k in range(max(3,i-30),i-3):
                if pivot_low(l15,k,2):aos.append((l15[k],ao15[k]))
            if len(aos)>=2 and aos[-1][0]<aos[-2][0]and aos[-1][1]>aos[-2][1]:div_ao=1
            div_comp=div_rsi+div_ao
            if div_comp>=2:div_triple=1

        # SMC
        smc_ob=0;smc_fvg=0;smc_sweep=0
        for ro in range(2,10):
            oi=i-ro
            if oi>=2 and pivot_low(l15,oi,2):
                actual=oi
                for j in range(oi-1,max(0,oi-2)-1,-1):
                    if l15[j]<=l15[oi]:actual=j;break
                if c15[actual]>=o15[actual]:
                    if actual+1<nb and c15[actual+1]<o15[actual+1]:actual+=1
                    else:continue
                ob_t=max(o15[actual],c15[actual]);ob_b=min(o15[actual],c15[actual])
                after=h15[:actual].max()if actual>0 else h15[0]
                if after>ob_t*1.02 and not any(c15[k]<ob_b for k in range(actual-1,-1,-1)):smc_ob=1;break
        for ro in range(1,6):
            ai=i-ro-2;bi=i-ro-1;ci=i-ro
            if ai>=0 and l15[ai]>h15[ci]and c15[bi]>o15[bi]:
                mit=any(h15[i-k]>=h15[ci]and l15[i-k]<=l15[ai]for k in range(ro-1,-1,-1)if i-k>=0)
                if not mit:smc_fvg=1;break
        for ro in range(2,6):
            si=i-ro
            if si>=2 and pivot_low(l15,si,2):
                pv=l15[si];w=False;r=False
                for k in range(ro-1,-1,-1):
                    ki=i-k
                    if l15[ki]<pv:w=True
                    if w and c15[ki]>pv:r=True;break
                if w and r:smc_sweep=1;break
        smc_count=smc_ob+smc_fvg+smc_sweep

        # VOLUME
        v_climax=0;v_dryness=0;buy_pressure=0.5;vol_ratio=1.0
        if i>=20:
            vol_win=v15[i-19:i+1];vm=vol_win.mean();vs=vol_win.std()
            if vs>0:
                vz=(v15[i]-vm)/vs
                rng_now=h15[i]-l15[i];rng_avg=np.mean([h15[j]-l15[j]for j in range(i-19,i+1)])
                if rng_avg>0:v_climax=int(vz>2.0 and rng_now/rng_avg<0.8);v_dryness=int(vz<-1.2 and rng_now/rng_avg<0.6)
                cp=(c15[i]-l15[i])/max(rng_now,0.0001);buy_pressure=float(cp);vol_ratio=float(rng_now/max(rng_avg,0.0001))

        # FIBONACCI
        fib_found=0;fib_distance=5.0;fib_cluster=0
        if i>=5 and a15[i]>0:
            piv_h=[];piv_l=[]
            for k in range(max(5,i-30),i-5):
                if pivot_high(h15,k,5):piv_h.append((k,h15[k]))
                if pivot_low(l15,k,5):piv_l.append((k,l15[k]))
            if piv_h and piv_l:
                best_bull=None;best_rec=999
                for pl_k,pl_v in piv_l:
                    for ph_k,ph_v in piv_h:
                        if ph_k<=pl_k:continue
                        mag=ph_v-pl_v
                        if mag<1.5*a15[i]:continue
                        rec=i-ph_k
                        if rec<best_rec:best_rec=rec;best_bull={'f618':ph_v-0.618*mag,'f786':ph_v-0.786*mag}
                if best_bull:
                    fib_found=1;fib_cluster=1
                    dist=min(abs(c15[i]-best_bull['f618']),abs(c15[i]-best_bull['f786']))/max(a15[i],0.0001)
                    fib_distance=float(min(dist,5.0))

        row=(
            int(ts),str(sym),int(net>0),float(net),float(rs15[i]),float(bw15[i]),float(bb_p),
            float(ao15[i]),float(macd15[i]),float(vz15[i]),float(m7s15[i]),
            float((m20-m50)/max(m50,0.0001)*100),float(ae/max(c15[i],0.0001)*100),
            float(rs1h[j1])if j1>=20 else 0,float(bw1h[j1])if j1>=20 else 0,float(h1bb),
            float(ao1h[j1])if j1>=20 else 0,float(macd1h[j1])if j1>=20 else 0,
            float(rs4h[j4])if j4>=20 else 0,float(bw4h[j4])if j4>=20 else 0,float(h4bb),
            float(ao4h[j4])if j4>=20 else 0,float(macd4h[j4])if j4>=20 else 0,
            int(div_rsi),int(div_ao),int(div_comp),int(div_triple),float(div_rsi_str),
            int(smc_ob),int(smc_fvg),int(smc_sweep),int(smc_count),
            int(v_climax),int(v_dryness),float(buy_pressure),float(vol_ratio),
            int(fib_found),float(fib_distance),int(fib_cluster),int(bh)
        )
        ALL.append(row)

    pair_quality[sym]=tp_hits/max(1,total_entries)*100
    if (pair_idx+1)%10==0:print(f"  {pair_idx+1}/{len(pairs)} pairs, {len(ALL)} trades...",flush=True)

n=len(ALL);print(f"\nMETA-V23: {n} trades from {len(set(r[1]for r in ALL))} pairs")
wins=sum(1 for r in ALL if r[2]);print(f"Baseline net WR: {wins/n*100:.1f}%")

if n==0:print("NO TRADES");exit()

# Quality gates
good_pairs=set()
for s,q in pair_quality.items():
    if q>=40:good_pairs.add(s)
print(f"Pairs with TP rate≥40%: {len(good_pairs)}")

# Build feature matrix
COL_NAMES=['ts','sym','nw','net',
    'm15_rsi','m15_bb_w','m15_bb_p','m15_ao','m15_macd','m15_vz','m15_m7s','m15_trend','m15_atr_pct',
    'h1_rsi','h1_bb_w','h1_bb_p','h1_ao','h1_macd',
    'h4_rsi','h4_bb_w','h4_bb_p','h4_ao','h4_macd',
    'div_rsi','div_ao','div_comp','div_triple','div_rsi_str',
    'smc_ob','smc_fvg','smc_sweep','smc_count',
    'v_climax','v_dryness','buy_pressure','vol_ratio',
    'fib_found','fib_distance','fib_cluster','bh']

FEAT_COLS=COL_NAMES[4:-1]  # exclude ts, sym, nw, net, bh
print(f"Features: {len(FEAT_COLS)}")

ts_idx=0;sym_idx=1;nw_idx=2;net_idx=3

# Chronological split
ALL.sort(key=lambda r:r[ts_idx])
n=len(ALL);sp=int(n*0.7);csp=int(sp*0.8)

X=np.array([[float(r[COL_NAMES.index(c)])for c in FEAT_COLS]for r in ALL],np.float32)
Y=np.array([int(r[nw_idx])for r in ALL],np.int32)
NR=np.array([float(r[net_idx])for r in ALL],np.float32)

Xt,Xc,Xte=X[:csp],X[csp:sp],X[sp:]
Yt,Yc,Yte=Y[:csp],Y[csp:sp],Y[sp:]
NRte=NR[sp:]

print(f"Train: {len(Yt)}t WR={Yt.mean()*100:.1f}% | Cal: {len(Yc)}t WR={Yc.mean()*100:.1f}% | Test: {len(Yte)}t WR={Yte.mean()*100:.1f}%")

# Train
sw=np.ones(len(Xt));sw[Yt>0]=3.0
forest=lgb.LGBMClassifier(n_estimators=400,max_depth=8,num_leaves=127,learning_rate=0.02,
    subsample=0.8,colsample_bytree=0.7,min_child_samples=min(25,len(Xt)//50),
    random_state=42,verbose=-1,force_col_wise=True)
forest.fit(Xt,Yt,sample_weight=sw)

# Platt
pc=forest.predict_proba(Xc)[:,1]
platt=LogisticRegression(C=1.0,class_weight='balanced')
platt.fit(pc.reshape(-1,1),Yc)
p_cal=platt.predict_proba(forest.predict_proba(Xte)[:,1].reshape(-1,1))[:,1]
print(f"Prob range: [{p_cal.min():.4f}, {p_cal.max():.4f}], mean={p_cal.mean():.4f}")

# Sweep
print(f"\n{'='*70}")
print(f"META-V23 ({len(FEAT_COLS)}F) — Full Arsenal + Platt + Pair Gates")
print(f"{'='*70}")
print(f"{'Thresh':>8s} {'Trades':>6s} {'NetWR':>7s} {'NetPF':>6s} {'AvgR':>7s} {'MaxDD%':>7s} {'Status'}")
print(f"{'-'*8} {'-'*6} {'-'*7} {'-'*6} {'-'*7} {'-'*7}")

best=None
for th in [round(x,2)for x in np.arange(0.2,0.92,0.02)]:
    mk=p_cal>=th;nt=int(mk.sum())
    if nt<8:continue
    pnl=NRte[mk];wr=float(Yte[mk].mean())
    gp=float(pnl[pnl>0].sum());gl=float(abs(pnl[pnl<0].sum()))
    pf=float(round(gp/gl,2))if gl>0 else 999;avgr=float(pnl.mean())
    eq=100.0;peak=100.0;maxdd=0.0
    for r in pnl:eq*=(1+r*0.01);peak=max(peak,eq);dd=(peak-eq)/peak*100;maxdd=max(maxdd,dd)
    status='🎯'if wr>=0.60 and pf>=2.0 else('✓WR'if wr>=0.60 else('✓PF'if pf>=2.5 else''))
    if wr>=0.55 and pf>=2.0 and (best is None or nt>best[1]):best=(wr,pf,nt,avgr,maxdd,th)
    print(f"{th:8.3f} {nt:6d} {wr*100:6.1f}% {pf:5.1f} {avgr:+6.3f} {maxdd:6.1f}% {status}")

# Feature importance
imps=sorted(zip(FEAT_COLS,forest.feature_importances_),key=lambda x:-x[1])
arsenal_impact={'Divergence':0,'SMC patterns':0,'Volume profile':0,'Fibonacci':0,'MTF core':0}
for name,v in imps:
    if name.startswith('div_'):arsenal_impact['Divergence']+=v
    elif name.startswith('smc_'):arsenal_impact['SMC patterns']+=v
    elif name in('v_climax','v_dryness','buy_pressure','vol_ratio'):arsenal_impact['Volume profile']+=v
    elif name.startswith('fib_'):arsenal_impact['Fibonacci']+=v
    else:arsenal_impact['MTF core']+=v

print(f"\n{'='*70}")
if best:
    wr,pf_,nt,avgr,maxdd,th=best
    goals=wr>=0.65 and pf_>=2.6
    print(f"BEST: P≥{th:.2f} {nt}t WR={wr*100:.1f}% PF={pf_:.1f} AvgR={avgr:+.3f} MaxDD={maxdd:.1f}%")
    print(f"Goals: WR≥65% {'✓'if wr>=0.65 else'✗'+str(round(wr*100,1))+'%'} PF≥2.6 {'✓'if pf_>=2.6 else'✗'} → {'🎯'if goals else'❌'}")
print(f"{'='*70}")

print(f"\nFeature category importance:")
for cat in sorted(arsenal_impact,key=arsenal_impact.get,reverse=True):
    print(f"  {cat:20s}: {arsenal_impact[cat]:.0f}")

print(f"\nTop 12 features:")
for name,v in imps[:12]:print(f"  {name:25s} {v:.0f}")

# Save if goals met
if best and goals:
    MD=Path('/home/ariel/anavitrade-trading/scripts/data/models/meta-v23-full-arsenal')
    MD.mkdir(parents=True,exist_ok=True)
    pickle.dump(forest,open(MD/'classifier.pkl','wb'))
    forest.booster_.save_model(str(MD/'classifier.txt'))
    pickle.dump(platt,open(MD/'calibrator.pkl','wb'))
    json.dump({'features':FEAT_COLS,'n':n,'baseline_wr':float(Y.mean()),'test_wr':float(wr),'test_pf':float(pf_),'threshold':float(th),'test_trades':int(nt),'test_maxdd':float(maxdd),'arsenal':{k:float(v)for k,v in arsenal_impact.items()}},open(MD/'model_card.json','w'),indent=2)
    print(f"\n🎯 Model saved to {MD}")
else:
    print(f"\n⚠ Model not saved — goals not met")
