// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Brain, CheckSquare, Clock, MessageCircle, ChevronDown, ChevronUp,
  Play, Pause, RotateCcw, Pencil, Check, X, Plus, Trash2, Calendar,
  RotateCw, Settings, Send, Lightbulb, List, Volume2, VolumeX
} from "lucide-react";

// ─── PALETA ───────────────────────────────────────────
const C={bg:'#ede8df',card:'#f8f5ef',primary:'#7b5ea7',primaryLight:'#ede6f7',primaryDark:'#5d4282',
  accent:'#c96a3a',accentLight:'#fdf0ea',success:'#4a8c72',successLight:'#e8f4ef',
  text:'#27211c',textMuted:'#7c7066',textFaint:'#a89d94',border:'#d8d0c5',borderLight:'#ede8df',
  shadow:'0 2px 14px rgba(39,33,28,0.10)',shadowSm:'0 1px 5px rgba(39,33,28,0.07)'};

const ENERGY_CFG=[
  {n:1,emoji:'😴',color:'#dc2626',label:'Wyczerpany/a'},
  {n:2,emoji:'😔',color:'#ea580c',label:'Zmęczony/a'},
  {n:3,emoji:'😐',color:'#ca8a04',label:'W porządku'},
  {n:4,emoji:'🙂',color:'#16a34a',label:'Dobra energia'},
  {n:5,emoji:'🤩',color:'#15803d',label:'W pełni sił'},
];
const TIMER_COLORS=['#7b5ea7','#c96a3a','#4a8c72','#3b7dd8','#be3a5a','#c9952a'];
const PS={high:{color:'#ad4e2e',background:'#fdf0ea',borderColor:'#f0c4ae'},
  medium:{color:'#6b5299',background:'#f2ecfa',borderColor:'#d4c5ef'},
  low:{color:'#7c7066',background:'#f5f3f0',borderColor:'#d8d0c5'}};
const PDOT={high:'#c96a3a',medium:'#7b5ea7',low:'#a09285'};
const PL={high:'Wysoki',medium:'Średni',low:'Niski'};
const GL={today:'Dzisiaj',week:'Ten tydzień',someday:'Kiedyś'};
const pad2=n=>String(n).padStart(2,'0');

// ─── HELPERS ──────────────────────────────────────────
const normStr=s=>s.toLowerCase().replace(/ą/g,'a').replace(/ć/g,'c').replace(/ę/g,'e')
  .replace(/ł/g,'l').replace(/ń/g,'n').replace(/ó/g,'o').replace(/ś/g,'s').replace(/[źż]/g,'z').trim();
const PMAP={wysoki:'high',wysok:'high',high:'high',sredni:'medium',medium:'medium',niski:'low',low:'low'};
const toPriority=s=>PMAP[normStr(s)]||null;

const buildGcalUrl=(name,dl,min,st,et)=>{
  const d=dl.replace(/-/g,'');let dates;
  if(st&&et){dates=`${d}T${st.replace(':','')}00/${d}T${et.replace(':','')}00`;}
  else{const end=new Date(`${dl}T09:00:00`);end.setMinutes(end.getMinutes()+(Number(min)||30));
    dates=`${d}T090000/${end.getFullYear()}${pad2(end.getMonth()+1)}${pad2(end.getDate())}T${pad2(end.getHours())}${pad2(end.getMinutes())}00`;}
  return`https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(name)}&dates=${dates}&details=${encodeURIComponent('Czas: '+(min||30)+' min')}`;
};
const timeDiff=(st,et)=>{if(!st||!et)return null;const[sh,sm]=st.split(':').map(Number),[eh,em]=et.split(':').map(Number);const d=(eh*60+em)-(sh*60+sm);return d>0?d:null;};

const parseMsg=txt=>{
  const parts=[];const re=/\[ZADANIE:\s*([^|\]]+?)\s*\|\s*(\d+)\s*min[a-z]*(?:\s*\|\s*([^|\]]+))?(?:\s*\|\s*([^\]]+))?\]/gi;
  let last=0,m;re.lastIndex=0;
  while((m=re.exec(txt))!==null){
    if(m.index>last)parts.push({t:'txt',v:txt.slice(last,m.index)});
    let priority='medium',subsStr=null;
    if(m[3]){const p=toPriority(m[3].trim());if(p){priority=p;subsStr=m[4]||null;}else{subsStr=m[3];}}
    parts.push({t:'task',name:m[1].trim(),min:+m[2],priority,subs:subsStr?subsStr.split(',').map(s=>s.trim()).filter(Boolean):[]});
    last=m.index+m[0].length;
  }
  if(last<txt.length)parts.push({t:'txt',v:txt.slice(last)});
  return parts.length?parts:[{t:'txt',v:txt}];
};

const migrate=ts=>(ts||[]).map(t=>({startTime:null,endTime:null,...t,substeps:(t.substeps||[]).map(s=>({...s}))}));

const DEFAULT_TASKS=[
  {id:'t1',name:'Napisać wstęp do rozdziału 2',group:'today',time:60,priority:'high',deadline:null,startTime:null,endTime:null,completed:false,expanded:false,
   substeps:[{id:'t1a',text:'Otwórz dokument',done:false},{id:'t1b',text:'Przeczytaj ostatni akapit',done:false},{id:'t1c',text:'Napisz jedno zdanie',done:false}]},
  {id:'t2',name:'Odpowiedzieć na e-maile',group:'today',time:20,priority:'medium',deadline:null,startTime:null,endTime:null,completed:false,expanded:false,
   substeps:[{id:'t2a',text:'Otwórz skrzynkę',done:false},{id:'t2b',text:'Przeczytaj 3 najważniejsze',done:false},{id:'t2c',text:'Odpowiedz na jeden',done:false}]},
  {id:'t3',name:'Zadzwonić do dentysty',group:'week',time:5,priority:'low',deadline:null,startTime:null,endTime:null,completed:false,expanded:false,substeps:[]},
];

const store={
  get:async k=>{try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null;}catch{return null;}},
  set:async(k,v)=>{try{await window.storage.set(k,JSON.stringify(v));}catch{}}
};

const playSound=(type,muted=false)=>{
  if(muted)return;
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const tone=(freq,t0,dur,vol=0.22)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=freq;o.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(0,ctx.currentTime+t0);g.gain.linearRampToValueAtTime(vol,ctx.currentTime+t0+0.04);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t0+dur);o.start(ctx.currentTime+t0);o.stop(ctx.currentTime+t0+dur+0.05);};
    if(type==='workEnd'){tone(659,0,0.45);tone(523,0.4,0.45);tone(392,0.8,0.7);}
    else if(type==='breakEnd'){tone(392,0,0.32);tone(523,0.3,0.32);tone(659,0.6,0.6);}
  }catch{}
};

const getTimeContext=()=>{
  const h=new Date().getHours();
  const date=new Date().toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long'});
  if(h>=5&&h<10)return`Pora dnia: rano (${h}:xx), ${date}. Sugeruj łagodny start i małe zadania.`;
  if(h>=10&&h<13)return`Pora dnia: przedpołudnie (${h}:xx), ${date}. Szczyt produktywności — zaproponuj wymagające zadania.`;
  if(h>=13&&h<16)return`Pora dnia: popołudnie (${h}:xx), ${date}. Możliwy spadek energii — sugeruj Pomodoro i mniejsze kroki.`;
  if(h>=16&&h<20)return`Pora dnia: wieczór (${h}:xx), ${date}. Czas na zamknięcie zadań i planowanie jutra.`;
  return`Pora dnia: noc (${h}:xx), ${date}. Tylko lekkie zadania, przygotowanie do snu.`;
};

// ─── usePomodoro HOOK ─────────────────────────────────
function usePomodoro(){
  const[wM,setWM]=useState(25),[bM,setBM]=useState(5),[tot,setTot]=useState(4);
  const[sess,setSess]=useState(1),[work,setWork]=useState(true),[run,setRun]=useState(false);
  const[secs,setSecs]=useState(25*60),[color,setColor]=useState(TIMER_COLORS[0]),[muted,setMuted]=useState(false);
  const iv=useRef(null),wRef=useRef(25),bRef=useRef(5),totRef=useRef(4),wkRef=useRef(true),ssRef=useRef(1);
  useEffect(()=>{wRef.current=wM;},[wM]);
  useEffect(()=>{bRef.current=bM;},[bM]);
  useEffect(()=>{totRef.current=tot;},[tot]);
  const reset=(newWM)=>{clearInterval(iv.current);setRun(false);setWork(true);wkRef.current=true;setSess(1);ssRef.current=1;setSecs((newWM!==undefined?newWM:wRef.current)*60);};
  const adjWM=d=>{const n=Math.max(1,Math.min(60,wM+d));setWM(n);wRef.current=n;reset(n);};
  const adjBM=d=>{const n=Math.max(1,Math.min(30,bM+d));setBM(n);bRef.current=n;if(!run)clearInterval(iv.current);};
  const adjTot=n=>{setTot(n);totRef.current=n;};
  const setWorkMinutes=n=>{const c=Math.max(1,Math.min(60,n));setWM(c);wRef.current=c;if(!run)setSecs(c*60);};
  const setBreakMinutes=n=>{const c=Math.max(1,Math.min(30,n));setBM(c);bRef.current=c;if(!run&&!wkRef.current)setSecs(c*60);};
  useEffect(()=>{
    if(!run){clearInterval(iv.current);return;}
    iv.current=setInterval(()=>{
      setSecs(p=>{
        if(p<=1){clearInterval(iv.current);const nw=!wkRef.current;wkRef.current=nw;setWork(nw);playSound(nw?'breakEnd':'workEnd',muted);
          if(!nw){const ns=Math.min(ssRef.current+1,totRef.current);ssRef.current=ns;setSess(ns);}setRun(false);return nw?wRef.current*60:bRef.current*60;}
        return p-1;
      });
    },1000);
    return()=>clearInterval(iv.current);
  },[run,muted]);
  return{wM,bM,tot,sess,work,run,setRun,secs,color,setColor,muted,setMuted,reset,adjWM,adjBM,adjTot,setWorkMinutes,setBreakMinutes};
}

// ─── SUB-COMPONENTS ───────────────────────────────────
// ─── TIME INPUT ───────────────────────────────────────
function TimeInput({value,onChange,min=1,max=60,disabled=false,style={}}){
  const[v,setV]=useState(String(value));
  useEffect(()=>setV(String(value)),[value]);
  const commit=()=>{const n=parseInt(v);if(!isNaN(n)&&n>=min&&n<=max)onChange(n);else setV(String(value));};
  const handleChange=e=>{if(/^\d*$/.test(e.target.value))setV(e.target.value);};
  return(
    <input type="text" inputMode="numeric" pattern="[0-9]*"
      value={v} onChange={handleChange}
      onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){commit();e.target.blur();}}}
      disabled={disabled}
      style={{width:44,fontSize:13,fontWeight:800,textAlign:'center',border:`1px solid ${C.border}`,
        borderRadius:6,padding:'2px 0',outline:'none',
        background:disabled?C.borderLight:C.card,color:disabled?C.textFaint:C.text,...style}}/>
  );
}

function EnergySelector({value,onChange,compact=false}){
  const cfg=ENERGY_CFG[value-1];
  return(
    <div>
      <div style={{display:'flex',gap:compact?4:6,justifyContent:'center'}}>
        {ENERGY_CFG.map(e=>(
          <button key={e.n} onClick={()=>onChange(e.n)} title={e.label}
            style={{background:e.n===value?e.color+'18':'transparent',border:`2px solid ${e.n===value?e.color:'transparent'}`,
              borderRadius:12,padding:compact?'3px 5px':'7px 9px',cursor:'pointer',transition:'all 0.15s',
              transform:e.n===value?'scale(1.12)':'scale(1)',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
            <span style={{fontSize:compact?15:24,lineHeight:1}}>{e.emoji}</span>
            {!compact&&<div style={{width:5,height:5,borderRadius:'50%',background:e.n===value?e.color:C.border,transition:'background 0.15s'}}/>}
          </button>
        ))}
      </div>
      {!compact&&<p style={{textAlign:'center',fontSize:12,fontWeight:700,color:cfg.color,margin:'5px 0 0'}}>{cfg.label}</p>}
    </div>
  );
}

function PBadge({priority}){
  const s=PS[priority];
  return (
    <span style={{...s,border:`1px solid ${s.borderColor}`,fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:99,whiteSpace:'nowrap'}}>{PL[priority]}</span>
  );
}

function ProgressBar({done,total}){
  if(!total)return null;
  const pct=Math.round((done/total)*100),full=pct===100;
  return(
    <div style={{marginBottom:8}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:5,fontSize:11}}>
        <span style={{color:C.textMuted,fontWeight:600}}>Postęp</span>
        <span style={{color:full?C.success:C.primary,fontWeight:700}}>{done}/{total}</span>
      </div>
      <div style={{height:8,background:C.borderLight,borderRadius:99,overflow:'hidden'}}>
        <div style={{height:'100%',borderRadius:99,width:`${pct}%`,transition:'width 0.6s ease-out',
          background:full?`linear-gradient(90deg,${C.success},#3a7a5e)`:`linear-gradient(90deg,#c084d4,${C.primary},${C.primaryDark})`}}/>
      </div>
      <style>{`@keyframes strikeAnim{from{width:0}to{width:100%}}`}</style>
    </div>
  );
}

function WalkingFigure({color,run,size=24}){
  const[f,setF]=useState(0);
  useEffect(()=>{if(!run){setF(0);return;}const id=setInterval(()=>setF(v=>1-v),370);return()=>clearInterval(id);},[run]);
  const cx=size/2,hr=size*0.19,sw=size*0.1;
  const bodyTop=hr*2.4,bodyBot=size*0.7,armY=size*0.44;
  const s=f===0?1:-1;
  return(
    <svg width={size} height={size+6} viewBox={`0 0 ${size} ${size+6}`} overflow="visible">
      <circle cx={cx} cy={hr*1.2} r={hr} fill={color}/>
      <line x1={cx} y1={bodyTop} x2={cx} y2={bodyBot} stroke={color} strokeWidth={sw} strokeLinecap="round"/>
      <line x1={cx} y1={armY} x2={cx-s*size*0.2} y2={armY+size*0.13} stroke={color} strokeWidth={sw*0.85} strokeLinecap="round"/>
      <line x1={cx} y1={armY} x2={cx+s*size*0.2} y2={armY+size*0.13} stroke={color} strokeWidth={sw*0.85} strokeLinecap="round"/>
      <line x1={cx} y1={bodyBot} x2={cx+s*size*0.23} y2={size+2} stroke={color} strokeWidth={sw} strokeLinecap="round"/>
      <line x1={cx} y1={bodyBot} x2={cx-s*size*0.23} y2={size+2} stroke={color} strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );
}

function LinearTimer({secs,totalSecs,run,color,sess,tot,work}){
  const pct=totalSecs>0?Math.max(0,Math.min(1,1-secs/totalSecs)):0;
  const fmt=v=>`${pad2(Math.floor(v/60))}:${pad2(v%60)}`;
  const FW=26;
  return(
    <div>
      <div style={{position:'relative',height:54,overflow:'hidden'}}>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:13,background:C.borderLight,borderRadius:99}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,borderRadius:99,width:`${pct*100}%`,background:color,transition:run?'width 1s linear':'width 0.3s ease'}}/>
        </div>
        <div style={{position:'absolute',bottom:11,left:`calc(${pct*100}% - ${FW/2}px)`,transition:run?'left 1s linear':'left 0.3s ease'}}>
          <WalkingFigure color={color} run={run} size={FW}/>
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:5}}>
        <span style={{fontSize:17,fontWeight:900,color:C.text,fontFamily:'monospace'}}>{fmt(secs)}</span>
        <span style={{fontSize:12,color:C.textMuted,fontWeight:500}}>{work?'🎯 Praca':'☕ Przerwa'}</span>
        <span style={{fontSize:11,color:C.textFaint}}>Sesja {sess}/{tot}</span>
      </div>
    </div>
  );
}

function TimeRangeInputs({startTime,endTime,onChange}){
  const dur=timeDiff(startTime,endTime);
  const inp={border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 8px',fontSize:12,outline:'none',background:C.card,color:C.text,flex:1};
  return(
    <div>
      <label style={{fontSize:11,color:C.textMuted,fontWeight:600,display:'block',marginBottom:4}}>Godziny (opcjonalnie)</label>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <input type="time" value={startTime||''} onChange={e=>onChange('startTime',e.target.value)} style={inp}/>
        <span style={{color:C.textMuted,fontSize:12}}>–</span>
        <input type="time" value={endTime||''} onChange={e=>onChange('endTime',e.target.value)} style={inp}/>
      </div>
      {dur&&<p style={{fontSize:11,color:C.primary,margin:'4px 0 0',fontWeight:600}}>⏱ {dur} min</p>}
    </div>
  );
}

function Bubble({msg,addTaskFn}){
  const[added,setAdded]=useState({});
  const isU=msg.role==='user',parts=parseMsg(msg.content);
  const handleAdd=(p,i)=>{addTaskFn(p.name,p.min,p.priority,p.subs);setAdded(prev=>({...prev,[i]:true}));setTimeout(()=>setAdded(prev=>({...prev,[i]:false})),2500);};
  return(
    <div style={{display:'flex',justifyContent:isU?'flex-end':'flex-start',marginBottom:8}}>
      <div style={{maxWidth:'88%',borderRadius:isU?'16px 16px 4px 16px':'16px 16px 16px 4px',padding:'10px 14px',fontSize:13,lineHeight:1.55,
        wordBreak:'break-word',overflowWrap:'anywhere',background:isU?C.primary:C.card,color:isU?'#fff':C.text,boxShadow:isU?'none':C.shadowSm}}>
        {parts.map((p,i)=>p.t==='txt'
          ?<span key={i} className="whitespace-pre-wrap">{p.v}</span>
          :(
            <div key={i} style={{marginTop:8,background:C.primaryLight,border:`1px solid ${C.border}`,borderRadius:12,padding:'10px 12px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:12,fontWeight:700,color:C.primaryDark,margin:0,wordBreak:'break-word'}}>{p.name}</p>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginTop:4}}>
                    <span style={{fontSize:11,color:C.textMuted}}>{p.min} min</span>
                    <PBadge priority={p.priority}/>
                    {p.subs.length>0&&<span style={{fontSize:11,color:C.textFaint}}>{p.subs.length} kroków</span>}
                  </div>
                </div>
                <button onClick={()=>handleAdd(p,i)}
                  style={{flexShrink:0,fontSize:11,fontWeight:700,color:'#fff',padding:'5px 10px',borderRadius:8,border:'none',cursor:'pointer',
                    background:added[i]?C.success:C.primary,transition:'all 0.25s'}}>
                  {added[i]?'✓ Dodano':'+ Dodaj'}
                </button>
              </div>
              {p.subs.length>0&&<div style={{marginTop:8,display:'flex',flexDirection:'column',gap:3}}>
                {p.subs.map((s,j)=><div key={j} style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:C.primaryDark}}>
                  <div style={{width:5,height:5,borderRadius:'50%',background:C.primary,flexShrink:0}}/>{s}
                </div>)}
              </div>}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// HOME VIEW
// ═══════════════════════════════════════════════════════
function HomeView({tasks,setTasks,activeTaskId,setActiveTaskId,energy,onSetEnergy,timer,setActiveView}){
  const[helpLoad,setHelpLoad]=useState(false),[helpText,setHelpText]=useState(null);
  const[showPick,setShowPick]=useState(false),[editName,setEditName]=useState(false),[nameDraft,setNameDraft]=useState('');
  const[editSubId,setEditSubId]=useState(null),[subDraft,setSubDraft]=useState('');
  const[justDoneId,setJustDoneId]=useState(null),[newSubText,setNewSubText]=useState('');
  const helpTORef=useRef(null);

  const activeTasks=tasks.filter(t=>!t.completed);
  const at=tasks.find(t=>t.id===activeTaskId&&!t.completed);
  const done=at?.substeps.filter(s=>s.done).length??0;
  const total=at?.substeps.length??0;
  const totalSecs=timer.work?timer.wM*60:timer.bM*60;

  useEffect(()=>()=>{if(helpTORef.current)clearTimeout(helpTORef.current);},[]);
  useEffect(()=>{const task=tasks.find(t=>t.id===activeTaskId&&!t.completed);if(task&&!timer.run)timer.setWorkMinutes(task.time);},[activeTaskId]);

  const toggleSub=useCallback(sid=>{
    setTasks(prev=>{
      const u=prev.map(t=>{
        if(t.id!==activeTaskId)return t;
        const wasOff=t.substeps.find(s=>s.id===sid)?.done===false;
        if(wasOff){setJustDoneId(sid);setTimeout(()=>setJustDoneId(null),650);}
        return{...t,substeps:t.substeps.map(s=>s.id===sid?{...s,done:!s.done}:s)};
      });
      store.set('adhd-tasks',u);return u;
    });
  },[activeTaskId]);

  const saveTaskName=()=>{if(!nameDraft.trim()){setEditName(false);return;}setTasks(prev=>{const u=prev.map(t=>t.id===activeTaskId?{...t,name:nameDraft.trim()}:t);store.set('adhd-tasks',u);return u;});setEditName(false);};
  const saveSub=sid=>{if(!subDraft.trim()){setEditSubId(null);return;}setTasks(prev=>{const u=prev.map(t=>t.id!==activeTaskId?t:{...t,substeps:t.substeps.map(s=>s.id===sid?{...s,text:subDraft.trim()}:s)});store.set('adhd-tasks',u);return u;});setEditSubId(null);};
  const deactivate=()=>{setActiveTaskId(null);store.set('adhd-active-task',null);setShowPick(false);};

  const addSubstep=()=>{
    if(!newSubText.trim()||!activeTaskId)return;
    setTasks(prev=>{const u=prev.map(t=>t.id===activeTaskId?{...t,substeps:[...t.substeps,{id:Date.now().toString(),text:newSubText.trim(),done:false}]}:t);store.set('adhd-tasks',u);return u;});
    setNewSubText('');
  };

  const getHelp=async()=>{
    if(helpLoad)return;setHelpLoad(true);setHelpText(null);
    helpTORef.current=setTimeout(()=>{setHelpLoad(false);setHelpText('⚠ Czas oczekiwania minął. Spróbuj ponownie.');},25000);
    try{
      const subInfo=at?.substeps.length>0?`\nPodkroki: ${at.substeps.map(s=>`${s.done?'✓':'○'} ${s.text}`).join(', ')}`:'';
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:200,
          system:'Daj JEDEN mikrokrok po polsku. Jedno zdanie. Bez wstępu.',
          messages:[{role:'user',content:`Zablokowany/a. Zadanie: "${at?.name||'brak'}". Energia: ${energy}/5.${subInfo} ${getTimeContext()}`}]})});
      const d=await res.json();clearTimeout(helpTORef.current);
      setHelpText(!res.ok?`⚠ ${d?.error?.message||res.status}`:d?.content?.[0]?.text||'Otwórz zadanie i zrób jeden krok.');
    }catch{clearTimeout(helpTORef.current);setHelpText('Weź głęboki oddech. Otwórz zadanie. Zrób jeden krok.');}
    finally{setHelpLoad(false);}
  };

  const ecfg=ENERGY_CFG[energy-1];
  const priorityBorderColor=at?PS[at.priority].borderColor:C.border;

  return(
    <div style={{padding:'14px 14px 88px',display:'flex',flexDirection:'column',gap:12}}>

      {/* ENERGIA */}
      <div style={{background:C.card,borderRadius:20,boxShadow:C.shadow,padding:'14px 16px'}}>
        <div style={{fontSize:10,fontWeight:700,color:C.textFaint,letterSpacing:'0.07em',textTransform:'uppercase',textAlign:'center',marginBottom:8}}>Poziom energii</div>
        <EnergySelector value={energy} onChange={onSetEnergy}/>
      </div>

      {/* AKTYWNE ZADANIE */}
      <div style={{background:C.card,borderRadius:20,boxShadow:C.shadow,borderLeft:`4px solid ${priorityBorderColor}`,overflow:'hidden'}}>
        <div style={{padding:'12px 14px 10px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:10,fontWeight:700,color:C.textFaint,letterSpacing:'0.07em',textTransform:'uppercase'}}>Aktywne zadanie</span>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <button onClick={()=>setShowPick(v=>!v)}
                style={{display:'flex',alignItems:'center',gap:3,fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:7,border:'none',cursor:'pointer',
                  background:showPick?C.primary:C.primaryLight,color:showPick?'#fff':C.primary}}>
                <List size={10}/>Zmień
              </button>
              {at&&<button onClick={deactivate} style={{background:'none',border:'none',cursor:'pointer',color:C.border,padding:2}}><X size={13}/></button>}
            </div>
          </div>

          {showPick&&(
            <div style={{border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',marginBottom:10}}>
              {activeTasks.length===0
                ?<p style={{fontSize:12,color:C.textFaint,textAlign:'center',padding:'10px',margin:0}}>Brak aktywnych zadań</p>
                :activeTasks.map((t,i)=>(
                  <button key={t.id} onClick={()=>{setActiveTaskId(t.id);store.set('adhd-active-task',t.id);setShowPick(false);}}
                    style={{width:'100%',textAlign:'left',padding:'9px 12px',display:'flex',alignItems:'center',gap:8,
                      background:t.id===activeTaskId?C.primaryLight:i%2===0?C.bg:C.card,border:'none',borderBottom:`1px solid ${C.borderLight}`,cursor:'pointer',
                      color:t.id===activeTaskId?C.primaryDark:C.text,fontWeight:t.id===activeTaskId?700:400}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:PDOT[t.priority],flexShrink:0}}/>
                    <span style={{flex:1,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                    <span style={{fontSize:11,color:C.textFaint,fontWeight:600}}>{t.time}min</span>
                  </button>
                ))}
            </div>
          )}

          {at?(
            <>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:6}}>
                {editName?(
                  <input value={nameDraft} onChange={e=>setNameDraft(e.target.value)} autoFocus
                    style={{flex:1,border:`1.5px solid ${C.primary}`,borderRadius:8,padding:'4px 10px',fontSize:14,fontWeight:700,outline:'none',background:C.bg,color:C.text}}
                    onBlur={saveTaskName} onKeyDown={e=>{if(e.key==='Enter')saveTaskName();if(e.key==='Escape')setEditName(false);}}/>
                ):(
                  <p style={{fontSize:15,fontWeight:700,color:C.text,flex:1,margin:0,cursor:'pointer',lineHeight:1.3,wordBreak:'break-word'}}
                    onClick={()=>{setNameDraft(at.name);setEditName(true);}}>{at.name}</p>
                )}
                <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
                  <span style={{fontSize:11,color:C.textMuted,fontWeight:600,background:C.bg,padding:'3px 7px',borderRadius:8,border:`1px solid ${C.border}`}}>⏱ {at.time}min</span>
                  <PBadge priority={at.priority}/>
                </div>
              </div>

              <ProgressBar done={done} total={total}/>

              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {at.substeps.map(s=>(
                  <div key={s.id} className="group"
                    style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:10,background:s.done?C.successLight:C.bg,transition:'background 0.2s'}}>
                    <button onClick={()=>toggleSub(s.id)}
                      style={{flexShrink:0,width:18,height:18,borderRadius:'50%',border:`2px solid ${s.done?C.success:C.border}`,background:s.done?C.success:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all 0.2s'}}>
                      {s.done&&<Check size={10} color="#fff"/>}
                    </button>
                    {editSubId===s.id?(
                      <input value={subDraft} onChange={e=>setSubDraft(e.target.value)} autoFocus
                        style={{flex:1,border:`1.5px solid ${C.primary}`,borderRadius:6,padding:'3px 8px',fontSize:13,outline:'none',background:C.card,color:C.text}}
                        onBlur={()=>saveSub(s.id)} onKeyDown={e=>{if(e.key==='Enter')saveSub(s.id);if(e.key==='Escape')setEditSubId(null);}}/>
                    ):(
                      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
                        <span style={{fontSize:13,color:s.done?C.success:C.text,textDecoration:s.done?'line-through':'none',opacity:s.done?0.65:1}}>{s.text}</span>
                        {justDoneId===s.id&&<div style={{position:'absolute',top:'50%',left:0,height:1.5,background:C.success,borderRadius:99,animation:'strikeAnim 0.5s ease-out forwards'}}/>}
                      </div>
                    )}
                    {!s.done&&editSubId!==s.id&&(
                      <button onClick={()=>{setSubDraft(s.text);setEditSubId(s.id);}}
                        style={{background:'none',border:'none',cursor:'pointer',color:C.border,padding:2,flexShrink:0,opacity:0.7}}><Pencil size={11}/></button>
                    )}
                  </div>
                ))}
                {/* Dodaj podkrok */}
                <div style={{display:'flex',gap:6,marginTop:2}}>
                  <input value={newSubText} onChange={e=>setNewSubText(e.target.value)} placeholder="Dodaj podkrok…"
                    style={{flex:1,border:`1px dashed ${C.border}`,borderRadius:8,padding:'6px 10px',fontSize:12,outline:'none',background:'transparent',color:C.text}}
                    onKeyDown={e=>{if(e.key==='Enter')addSubstep();}}/>
                  <button onClick={addSubstep} disabled={!newSubText.trim()}
                    style={{background:newSubText.trim()?C.primaryLight:C.borderLight,border:'none',borderRadius:8,padding:'6px 10px',cursor:newSubText.trim()?'pointer':'default',
                      color:newSubText.trim()?C.primary:C.textFaint,fontWeight:700,fontSize:13,transition:'all 0.15s'}}>
                    <Plus size={14}/>
                  </button>
                </div>
              </div>
            </>
          ):(
            <div style={{textAlign:'center',padding:'16px 0'}}>
              <p style={{fontSize:13,color:C.textFaint,margin:'0 0 8px'}}>Brak aktywnego zadania</p>
              <button onClick={()=>setActiveView('tasks')}
                style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:13,fontWeight:600,color:C.primary,background:C.primaryLight,border:'none',borderRadius:8,padding:'7px 14px',cursor:'pointer'}}>
                Wybierz zadanie →
              </button>
            </div>
          )}
        </div>
      </div>

      <button onClick={getHelp} disabled={helpLoad}
        style={{width:'100%',background:helpLoad?'#c0855f':C.accent,color:'#fff',border:'none',borderRadius:16,padding:'11px 16px',
          fontSize:14,fontWeight:700,cursor:helpLoad?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          boxShadow:C.shadowSm,transition:'background 0.2s'}}>
        <Lightbulb size={17}/>{helpLoad?'Szukam pomysłu…':'Zablokowany/a? Pomóż mi'}
      </button>
      {helpText&&<div style={{background:C.accentLight,border:`1px solid #f0c4ae`,borderRadius:16,padding:'12px 14px'}}>
        <p style={{fontSize:13,color:'#7a3a18',fontWeight:500,margin:0,lineHeight:1.5}}>{helpText}</p>
      </div>}

      {/* TIMER LINIOWY */}
      <div style={{background:C.card,borderRadius:20,boxShadow:C.shadow,padding:'14px 16px'}}>
        <LinearTimer secs={timer.secs} totalSecs={totalSecs} run={timer.run} color={timer.color} sess={timer.sess} tot={timer.tot} work={timer.work}/>
        {/* Ustawienia sesji */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'10px 0 4px',padding:'8px 10px',background:C.bg,borderRadius:12}}>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <span style={{fontSize:11,color:C.textMuted,fontWeight:600}}>Praca:</span>
            <button onClick={()=>timer.adjWM(-1)} disabled={timer.run}
              style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:'none',cursor:timer.run?'not-allowed':'pointer',fontSize:15,fontWeight:700,color:C.textMuted,lineHeight:'22px',textAlign:'center'}}>−</button>
            <TimeInput value={timer.wM} onChange={v=>timer.setWorkMinutes(v)} min={1} max={60} disabled={timer.run}/>
            <span style={{fontSize:10,fontWeight:400,color:C.textFaint,marginLeft:1}}>min</span>
            <button onClick={()=>timer.adjWM(+1)} disabled={timer.run}
              style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:'none',cursor:timer.run?'not-allowed':'pointer',fontSize:15,fontWeight:700,color:C.textMuted,lineHeight:'22px',textAlign:'center'}}>+</button>
            {at&&at.time!==timer.wM&&!timer.run&&(
              <button onClick={()=>timer.setWorkMinutes(at.time)}
                style={{fontSize:10,fontWeight:700,color:C.primary,background:C.primaryLight,border:'none',borderRadius:6,padding:'3px 8px',cursor:'pointer',marginLeft:2}}>
                ↩ {at.time}min
              </button>
            )}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{fontSize:11,color:C.textMuted,fontWeight:600,marginRight:2}}>Sesje:</span>
            {[1,2,3,4].map(n=>(
              <button key={n} onClick={()=>timer.adjTot(n)} disabled={timer.run}
                style={{width:24,height:24,borderRadius:6,fontSize:11,fontWeight:700,border:'none',
                  cursor:timer.run?'not-allowed':'pointer',transition:'all 0.15s',
                  background:n===timer.tot?timer.color:C.bg,color:n===timer.tot?'#fff':C.textMuted}}>{n}</button>
            ))}
          </div>
        </div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button onClick={()=>timer.setRun(v=>!v)}
            style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'12px',
              background:timer.run?C.accentLight:C.primary,color:timer.run?C.accent:'#fff',
              border:`2px solid ${timer.run?C.accent:'transparent'}`,
              borderRadius:14,fontSize:14,fontWeight:700,cursor:'pointer',transition:'all 0.2s',boxShadow:timer.run?'none':C.shadowSm}}>
            {timer.run?<Pause size={18}/>:<Play size={18}/>}{timer.run?'Zatrzymaj':'Rozpocznij sesję'}
          </button>
          <button onClick={()=>timer.reset()}
            style={{padding:'12px 14px',background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,cursor:'pointer'}}>
            <RotateCcw size={16} color={C.textMuted}/>
          </button>
          <button onClick={()=>timer.setMuted(v=>!v)}
            style={{padding:'12px 14px',background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,cursor:'pointer'}}>
            {timer.muted?<VolumeX size={16} color={C.border}/>:<Volume2 size={16} color={C.textMuted}/>}
          </button>
        </div>
      </div>

    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TASKS VIEW
// ═══════════════════════════════════════════════════════
function TasksView({tasks,setTasks,activeTaskId,setActiveTaskId,setActiveView}){
  const[tab,setTab]=useState('active'),[showForm,setShowForm]=useState(false),[showDL,setShowDL]=useState(false);
  const[fadingId,setFadingId]=useState(null),[toast,setToast]=useState(null);
  const[form,setForm]=useState({name:'',group:'today',time:25,priority:'medium',deadline:'',startTime:'',endTime:''});
  const activeTasks=tasks.filter(t=>!t.completed),doneTasks=tasks.filter(t=>t.completed),withDL=activeTasks.filter(t=>t.deadline);
  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),3000);};
  const updateTasks=useCallback(fn=>{setTasks(prev=>{const u=fn(prev);store.set('adhd-tasks',u);return u;});},[]);
  const hFC=(f,v)=>{const u={...form,[f]:v};if(f==='startTime'||f==='endTime'){const d=timeDiff(u.startTime,u.endTime);if(d)u.time=d;}setForm(u);};
  const addTask=()=>{
    if(!form.name.trim())return;
    updateTasks(prev=>[...prev,{id:Date.now().toString(),name:form.name.trim(),group:form.group,time:Number(form.time),priority:form.priority,
      deadline:form.deadline||null,startTime:form.startTime||null,endTime:form.endTime||null,completed:false,expanded:false,substeps:[]}]);
    setForm({name:'',group:'today',time:25,priority:'medium',deadline:'',startTime:'',endTime:''});setShowForm(false);
  };
  const deleteTask=id=>{updateTasks(prev=>prev.filter(t=>t.id!==id));setActiveTaskId(prev=>{if(prev===id){store.set('adhd-active-task',null);return null;}return prev;});};
  const restoreTask=id=>updateTasks(prev=>prev.map(t=>t.id===id?{...t,completed:false}:t));
  const toggleExpand=id=>updateTasks(prev=>prev.map(t=>t.id===id?{...t,expanded:!t.expanded}:t));
  const startTask=id=>{setActiveTaskId(id);store.set('adhd-active-task',id);setActiveView('home');};
  const toggleSub=(tid,sid)=>updateTasks(prev=>prev.map(t=>t.id===tid?{...t,substeps:t.substeps.map(s=>s.id===sid?{...s,done:!s.done}:s)}:t));
  const addSub=(tid,txt)=>{if(!txt.trim())return;updateTasks(prev=>prev.map(t=>t.id===tid?{...t,substeps:[...t.substeps,{id:Date.now().toString(),text:txt,done:false}]}:t));};
  const completeTask=id=>{
    setFadingId(id);
    setTimeout(()=>{updateTasks(prev=>prev.map(t=>t.id===id?{...t,completed:true}:t));setActiveTaskId(prev=>{if(prev===id){store.set('adhd-active-task',null);return null;}return prev;});setFadingId(null);},480);
  };

  const inp={border:`1px solid ${C.border}`,borderRadius:10,padding:'8px 10px',fontSize:13,outline:'none',background:C.bg,color:C.text,width:'100%',boxSizing:'border-box'};
  const lbl={fontSize:10,fontWeight:700,color:C.textFaint,letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:4};

  function TaskCard({task}){
    const[ns,setNs]=useState(''),[showEd,setShowEd]=useState(false);
    const[ed,setEd]=useState({priority:task.priority,time:task.time,deadline:task.deadline||'',startTime:task.startTime||'',endTime:task.endTime||''});
    const isActive=task.id===activeTaskId,isFading=task.id===fadingId;
    const dc=task.substeps.filter(s=>s.done).length;
    const hEC=(f,v)=>{const u={...ed,[f]:v};if(f==='startTime'||f==='endTime'){const d=timeDiff(u.startTime,u.endTime);if(d)u.time=d;}setEd(u);};
    const saveEdit=()=>{updateTasks(prev=>prev.map(t=>t.id===task.id?{...t,priority:ed.priority,time:Number(ed.time),deadline:ed.deadline||null,startTime:ed.startTime||null,endTime:ed.endTime||null}:t));setShowEd(false);};
    const tl=task.startTime&&task.endTime?`${task.startTime}–${task.endTime}`:`${task.time}min`;
    return(
      <div style={{background:C.card,borderRadius:14,boxShadow:C.shadowSm,borderLeft:`3px solid ${isActive?C.primary:'transparent'}`,
        transition:'all 0.48s',opacity:isFading?0.08:1,transform:isFading?'translateX(-12px) scale(0.96)':'none',overflow:'hidden'}}>
        <div style={{padding:'10px 12px'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
            <button onClick={()=>task.completed?restoreTask(task.id):completeTask(task.id)}
              style={{flexShrink:0,marginTop:2,width:18,height:18,borderRadius:5,border:`2px solid ${task.completed?C.success:C.border}`,background:task.completed?C.success:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all 0.2s'}}>
              {task.completed&&<Check size={10} color="#fff"/>}
            </button>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:13,fontWeight:600,color:task.completed?C.textFaint:C.text,textDecoration:task.completed?'line-through':'none',margin:0,wordBreak:'break-word',lineHeight:1.35}}>{task.name}</p>
              <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:5,marginTop:4}}>
                <span style={{fontSize:11,color:C.textMuted}}>{tl}</span>
                <PBadge priority={task.priority}/>
                {task.substeps.length>0&&<span style={{fontSize:11,color:C.textFaint}}>{dc}/{task.substeps.length} kroków</span>}
                {task.deadline&&<span style={{fontSize:11,color:C.textFaint,display:'flex',alignItems:'center',gap:2}}><Calendar size={10}/>{task.deadline}</span>}
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
              {!task.completed&&<button onClick={()=>startTask(task.id)}
                style={{fontSize:11,fontWeight:700,padding:'4px 9px',borderRadius:8,border:'none',cursor:'pointer',background:isActive?C.primaryLight:C.primary,color:isActive?C.primaryDark:'#fff'}}>
                {isActive?'Aktywne':'Start'}
              </button>}
              {task.completed&&<button onClick={()=>restoreTask(task.id)} style={{fontSize:11,padding:'4px 8px',borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,color:C.textMuted,cursor:'pointer'}}>Przywróć</button>}
              <button onClick={()=>toggleExpand(task.id)} style={{background:'none',border:'none',cursor:'pointer',color:C.textFaint,padding:3}}>{task.expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>
              <button onClick={()=>deleteTask(task.id)} style={{background:'none',border:'none',cursor:'pointer',color:C.border,padding:3}}><Trash2 size={12}/></button>
            </div>
          </div>
        </div>
        {task.expanded&&(
          <div style={{borderTop:`1px solid ${C.borderLight}`,padding:'10px 12px',display:'flex',flexDirection:'column',gap:8}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:11,color:C.textMuted,fontWeight:600}}>Ustawienia</span>
              <button onClick={()=>setShowEd(v=>!v)} style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:C.primary,background:'none',border:'none',cursor:'pointer',fontWeight:600}}>
                <Pencil size={10}/>{showEd?'Zwiń':'Edytuj'}
              </button>
            </div>
            {showEd&&(
              <div style={{background:C.bg,borderRadius:12,padding:12,display:'flex',flexDirection:'column',gap:8}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div><label style={lbl}>Priorytet</label>
                    <select value={ed.priority} onChange={e=>setEd({...ed,priority:e.target.value})} style={{...inp,cursor:'pointer'}}>
                      <option value="high">Wysoki</option><option value="medium">Średni</option><option value="low">Niski</option>
                    </select></div>
                  <div><label style={lbl}>Czas (min)</label><input type="number" min="1" value={ed.time} onChange={e=>setEd({...ed,time:Number(e.target.value)})} style={inp}/></div>
                </div>
                <div><label style={lbl}>Termin</label><input type="date" value={ed.deadline} onChange={e=>hEC('deadline',e.target.value)} style={inp}/></div>
                <TimeRangeInputs startTime={ed.startTime} endTime={ed.endTime} onChange={hEC}/>
                {ed.deadline&&<a href={buildGcalUrl(task.name,ed.deadline,Number(ed.time),ed.startTime||null,ed.endTime||null)} target="_blank" rel="noopener noreferrer"
                  style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,background:'#eaf0fd',border:'1px solid #c5d4f5',color:'#3b5fd4',borderRadius:8,padding:'7px',fontSize:11,fontWeight:600,textDecoration:'none'}}>
                  <Calendar size={11}/>Dodaj do Google Calendar
                </a>}
                <div style={{display:'flex',gap:6}}>
                  <button onClick={saveEdit} style={{flex:1,background:C.primary,color:'#fff',border:'none',borderRadius:8,padding:'7px',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}><Check size={11}/>Zapisz</button>
                  <button onClick={()=>setShowEd(false)} style={{padding:'7px 12px',background:C.borderLight,border:'none',borderRadius:8,fontSize:12,color:C.textMuted,cursor:'pointer'}}>Anuluj</button>
                </div>
              </div>
            )}
            {task.substeps.length>0&&<div style={{display:'flex',flexDirection:'column',gap:3}}>
              {task.substeps.map(s=>(
                <button key={s.id} onClick={()=>toggleSub(task.id,s.id)}
                  style={{display:'flex',alignItems:'center',gap:7,padding:'6px 8px',borderRadius:8,border:'none',cursor:'pointer',textAlign:'left',background:s.done?C.successLight:C.bg,transition:'background 0.15s'}}>
                  <div style={{width:12,height:12,borderRadius:3,border:`2px solid ${s.done?C.success:C.border}`,background:s.done?C.success:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {s.done&&<Check size={7} color="#fff"/>}
                  </div>
                  <span style={{fontSize:12,color:s.done?C.success:C.textMuted,textDecoration:s.done?'line-through':'none',opacity:s.done?0.7:1,flex:1,wordBreak:'break-word'}}>{s.text}</span>
                </button>
              ))}
            </div>}
            <div style={{display:'flex',gap:5}}>
              <input value={ns} onChange={e=>setNs(e.target.value)} placeholder="Dodaj podkrok…"
                style={{...inp,padding:'6px 10px',fontSize:12,flex:1,width:'auto'}}
                onKeyDown={e=>{if(e.key==='Enter'){addSub(task.id,ns);setNs('');}}}/>
              <button onClick={()=>{addSub(task.id,ns);setNs('');}} style={{background:C.primaryLight,color:C.primary,border:'none',borderRadius:8,padding:'6px 10px',cursor:'pointer'}}><Plus size={13}/></button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const tabBtn=(k,l)=><button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'8px',borderRadius:10,border:'none',cursor:'pointer',fontSize:13,fontWeight:700,background:tab===k?C.primary:C.card,color:tab===k?'#fff':C.textMuted,boxShadow:tab===k?'none':C.shadowSm,transition:'all 0.2s'}}>{l}</button>;

  return(
    <div style={{padding:'14px 14px 88px',display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',gap:8}}>{tabBtn('active','Aktywne')}{tabBtn('done','Ukończone')}</div>
      {tab==='active'?(
        <>
          {['today','week','someday'].map(g=>{const gt=activeTasks.filter(t=>t.group===g);if(!gt.length)return null;
            return (<div key={g}><div style={{fontSize:10,fontWeight:700,color:C.textFaint,letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:6,paddingLeft:2}}>{GL[g]}</div><div style={{display:'flex',flexDirection:'column',gap:6}}>{gt.map(t=><TaskCard key={t.id} task={t}/>)}</div></div>);})}
          {activeTasks.length===0&&<p style={{textAlign:'center',color:C.textFaint,fontSize:13,padding:'24px 0'}}>Brak aktywnych zadań 🎉</p>}
          {showForm?(
            <div style={{background:C.card,borderRadius:16,boxShadow:C.shadow,padding:16,display:'flex',flexDirection:'column',gap:10}}>
              <input value={form.name} onChange={e=>hFC('name',e.target.value)} placeholder="Nazwa zadania" autoFocus
                style={{border:`1.5px solid ${C.primary}`,borderRadius:10,padding:'9px 12px',fontSize:14,outline:'none',background:C.bg,color:C.text,width:'100%',boxSizing:'border-box'}}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <select value={form.group} onChange={e=>hFC('group',e.target.value)} style={{...inp,cursor:'pointer'}}>
                  <option value="today">Dzisiaj</option><option value="week">Ten tydzień</option><option value="someday">Kiedyś</option>
                </select>
                <select value={form.priority} onChange={e=>hFC('priority',e.target.value)} style={{...inp,cursor:'pointer'}}>
                  <option value="high">Wysoki</option><option value="medium">Średni</option><option value="low">Niski</option>
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div><label style={lbl}>Czas (min)</label><input type="number" min="1" value={form.time} onChange={e=>hFC('time',e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Termin</label><input type="date" value={form.deadline} onChange={e=>hFC('deadline',e.target.value)} style={inp}/></div>
              </div>
              <TimeRangeInputs startTime={form.startTime} endTime={form.endTime} onChange={hFC}/>
              <div style={{display:'flex',gap:8}}>
                <button onClick={addTask} style={{flex:1,background:C.primary,color:'#fff',border:'none',borderRadius:12,padding:'11px',fontSize:14,fontWeight:700,cursor:'pointer'}}>Dodaj zadanie</button>
                <button onClick={()=>setShowForm(false)} style={{padding:'11px 16px',background:C.borderLight,border:'none',borderRadius:12,fontSize:14,color:C.textMuted,cursor:'pointer'}}>Anuluj</button>
              </div>
            </div>
          ):(
            <button onClick={()=>setShowForm(true)} style={{width:'100%',background:C.card,border:`1.5px dashed ${C.border}`,borderRadius:14,padding:'12px',fontSize:13,fontWeight:700,color:C.primary,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              <Plus size={15}/>Dodaj zadanie
            </button>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <button onClick={()=>{if(!withDL.length){showToast('Brak zadań z terminem.');return;}setShowDL(v=>!v);}}
              style={{width:'100%',background:C.card,border:'1px solid #c5d4f5',color:'#3b5fd4',borderRadius:14,padding:'11px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,boxShadow:C.shadowSm}}>
              <Calendar size={14}/>Dodaj wszystkie do Google Calendar
              {withDL.length>0&&<span style={{background:'#eaf0fd',color:'#3b5fd4',fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:99}}>{withDL.length}</span>}
            </button>
            {showDL&&withDL.length>0&&(
              <div style={{background:C.card,borderRadius:14,border:'1px solid #dde8fc',padding:10,display:'flex',flexDirection:'column',gap:5}}>
                <p style={{fontSize:11,color:C.textFaint,fontWeight:600,margin:'0 0 4px'}}>Kliknij, aby otworzyć w Google Calendar:</p>
                {withDL.map(t=><a key={t.id} href={buildGcalUrl(t.name,t.deadline,t.time,t.startTime,t.endTime)} target="_blank" rel="noopener noreferrer"
                  style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'#eaf0fd',borderRadius:10,textDecoration:'none'}}>
                  <Calendar size={11} color="#3b5fd4" style={{flexShrink:0}}/>
                  <span style={{fontSize:13,color:'#3b5fd4',fontWeight:600,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                  <span style={{fontSize:11,color:'#7a9ad4'}}>{t.startTime&&t.endTime?`${t.startTime}–${t.endTime}`:t.deadline}</span>
                </a>)}
              </div>
            )}
          </div>
        </>
      ):<div style={{display:'flex',flexDirection:'column',gap:6}}>
        {doneTasks.length===0?<p style={{textAlign:'center',color:C.textFaint,fontSize:13,padding:'32px 0'}}>Brak ukończonych zadań</p>:doneTasks.map(t=><TaskCard key={t.id} task={t}/>)}
      </div>}
      {toast&&<div style={{position:'fixed',bottom:70,left:'50%',transform:'translateX(-50%)',background:C.text,color:'#fff',fontSize:13,borderRadius:14,padding:'9px 18px',boxShadow:C.shadow,zIndex:50,whiteSpace:'nowrap'}}>{toast}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TIMER VIEW
// ═══════════════════════════════════════════════════════
function TimerView({timer}){
  const{wM,bM,tot,sess,work,run,setRun,secs,color,setColor,muted,setMuted,reset,adjWM,adjBM,adjTot}=timer;
  const[showSet,setSt]=useState(false);
  const fmt=v=>`${pad2(Math.floor(v/60))}:${pad2(v%60)}`;
  const full=work?wM*60:bM*60,r=90,circ=2*Math.PI*r;
  const off=(run||secs<full)?circ*(1-secs/full):0;
  return(
    <div style={{padding:'14px 14px 88px',display:'flex',flexDirection:'column',gap:12}}>
      <div style={{background:C.card,borderRadius:20,boxShadow:C.shadow,padding:'20px 16px',display:'flex',flexDirection:'column',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <span style={{fontSize:22}}>{work?'🎯':'☕'}</span>
          <span style={{fontSize:17,fontWeight:800,color:C.text}}>{work?'Praca':'Przerwa'}</span>
          <span style={{fontSize:12,color:C.textMuted,marginLeft:4}}>Sesja {sess}/{tot}</span>
          <button onClick={()=>setMuted(v=>!v)} title={muted?'Włącz dźwięk':'Wycisz'}
            style={{marginLeft:6,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:'4px 7px',cursor:'pointer',display:'flex',alignItems:'center'}}>
            {muted?<VolumeX size={13} color={C.border}/>:<Volume2 size={13} color={C.textMuted}/>}
          </button>
        </div>
        <svg width="230" height="230" viewBox="0 0 240 240">
          <circle cx="120" cy="120" r={r} fill="none" stroke={C.borderLight} strokeWidth="10"/>
          <g transform="scale(-1,1) translate(-240,0)">
            <circle cx="120" cy="120" r={r} fill="none" stroke={color} strokeWidth="10"
              strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 120 120)"
              style={{transition:run?'stroke-dashoffset 0.8s linear':'none'}}/>
          </g>
          <text x="120" y="133" textAnchor="middle" style={{fontSize:42,fontWeight:800,fill:C.text,fontFamily:'monospace'}}>{fmt(secs)}</text>
        </svg>
        {/* Wybór koloru */}
        <div style={{display:'flex',gap:8,marginTop:6}}>
          {TIMER_COLORS.map(tc=>(
            <button key={tc} onClick={()=>setColor(tc)} title={tc}
              style={{width:22,height:22,borderRadius:'50%',background:tc,border:`2.5px solid ${color===tc?C.text:'transparent'}`,cursor:'pointer',transition:'border 0.15s'}}/>
          ))}
        </div>
        <div style={{display:'flex',gap:10,marginTop:12}}>
          <button onClick={()=>setRun(v=>!v)}
            style={{display:'flex',alignItems:'center',gap:8,padding:'12px 28px',background:run?C.accentLight:color,
              color:run?C.accent:'#fff',border:`2px solid ${run?C.accent:'transparent'}`,borderRadius:14,fontSize:14,fontWeight:700,cursor:'pointer',transition:'all 0.2s'}}>
            {run?<Pause size={18}/>:<Play size={18}/>}{run?'Pauza':'Start'}
          </button>
          <button onClick={()=>reset()} style={{padding:'12px 14px',background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,cursor:'pointer'}}><RotateCcw size={17} color={C.textMuted}/></button>
        </div>
      </div>
      <button onClick={()=>setSt(v=>!v)} style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:'11px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:13,fontWeight:700,color:C.textMuted,cursor:'pointer',boxShadow:C.shadowSm}}>
        <span style={{display:'flex',alignItems:'center',gap:6}}><Settings size={14}/>Ustawienia</span>
        {showSet?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
      </button>
      {showSet&&(
        <div style={{background:C.card,borderRadius:16,boxShadow:C.shadowSm,padding:16,display:'flex',flexDirection:'column',gap:14}}>
          {[['Czas pracy (min)',wM,adjWM],['Czas przerwy (min)',bM,adjBM]].map(([lbl,val,fn])=>(
            <div key={lbl} style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:13,color:C.text}}>{lbl}</span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button onClick={()=>fn(-1)} style={{width:32,height:32,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,fontSize:16,fontWeight:700,color:C.textMuted,cursor:'pointer'}}>−</button>
                <span style={{width:28,textAlign:'center',fontWeight:700,fontSize:14,color:C.text}}>{val}</span>
                <button onClick={()=>fn(+1)} style={{width:32,height:32,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,fontSize:16,fontWeight:700,color:C.textMuted,cursor:'pointer'}}>+</button>
              </div>
            </div>
          ))}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:13,color:C.text}}>Liczba sesji</span>
            <div style={{display:'flex',gap:6}}>
              {[1,2,3,4].map(n=><button key={n} onClick={()=>adjTot(n)} style={{width:32,height:32,borderRadius:8,border:'none',fontSize:13,fontWeight:700,cursor:'pointer',background:n===tot?color:C.bg,color:n===tot?'#fff':C.textMuted,transition:'all 0.15s'}}>{n}</button>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// AI VIEW
// ═══════════════════════════════════════════════════════
function AIView({chatMessages,setChatMessages,energy,onSetEnergy,todayGoal,tasks,activeTaskId,setTasks}){
  const[input,setInput]=useState(''),[isProcessing,setIsProcessing]=useState(false),[animating,setAnimating]=useState(false);
  const endRef=useRef(null),twRef=useRef(null),taRef=useRef(null),toRef=useRef(null);
  const activeTask=tasks.find(t=>t.id===activeTaskId&&!t.completed);
  const userCount=chatMessages.filter(m=>m.role==='user').length,LIMIT=15;
  useEffect(()=>()=>{if(twRef.current)clearInterval(twRef.current);if(toRef.current)clearTimeout(toRef.current);},[]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'});},[chatMessages,isProcessing]);
  const SUGG=['Pomóż mi zaplanować dzień','Mam problem z koncentracją','Nie wiem od czego zacząć','Czuję się przytłoczony/a zadaniami'];
  const buildSys=()=>{
    const tl=tasks.filter(t=>!t.completed).slice(0,8).map(t=>`- ${t.name} (${t.time}min, ${PL[t.priority]})`).join('\n');
    const msgN=chatMessages.filter(m=>m.role==='user').length;
    return`Jesteś empatycznym asystentem ADHD. Odpowiadaj po polsku, ciepło i konkretnie, max 3-4 zdania.\nEnergia: ${energy}/5. Aktywne: ${activeTask?.name||'brak'}.\n${getTimeContext()}\nZadania:\n${tl||'brak'}\nNumer wiadomości: ${msgN+1}\n\nZASADY:\n- Wiad. 1: NIE proponuj zadania, posłuchaj i wesprzyj.\n- Od wiad. 2: jeśli temat sugeruje działanie, zaproponuj zadanie z priorytetem.\n- Format: [ZADANIE: Tytuł | 30 min | wysoki] lub [ZADANIE: Tytuł | 30 min | średni | krok 1, krok 2]\n- Max 1 zadanie, 3–5 kroków. NIGDY nie pisz "dodałem".\n- Dostosuj granularność do energii: 1-2=mikrokroki, 3=małe, 4-5=normalne.\n- Uwzględnij porę dnia.`;
  };
  const resetP=useCallback(()=>{if(twRef.current){clearInterval(twRef.current);twRef.current=null;}if(toRef.current){clearTimeout(toRef.current);toRef.current=null;}setIsProcessing(false);setAnimating(false);},[]);
  const startTW=useCallback(fullText=>{
    if(twRef.current)clearInterval(twRef.current);let pos=0;setAnimating(true);
    twRef.current=setInterval(()=>{pos+=3;if(pos>=fullText.length){pos=fullText.length;clearInterval(twRef.current);twRef.current=null;setAnimating(false);}
      setChatMessages(prev=>{const u=[...prev];u[u.length-1]={role:'assistant',content:fullText.slice(0,pos)};return u;});},15);
  },[setChatMessages]);
  const send=async userText=>{
    if(!userText.trim()||isProcessing||animating||userCount>=LIMIT)return;
    const msgs=[...chatMessages,{role:'user',content:userText}];
    setInput('');if(taRef.current)taRef.current.style.height='42px';
    setChatMessages(msgs);setIsProcessing(true);
    toRef.current=setTimeout(()=>{setIsProcessing(false);if(twRef.current){clearInterval(twRef.current);twRef.current=null;}setAnimating(false);
      setChatMessages(prev=>{const last=prev[prev.length-1];const e={role:'assistant',content:'⚠ Czas oczekiwania minął. Spróbuj ponownie.'};return last?.role==='assistant'&&last.content===''?[...prev.slice(0,-1),e]:[...prev,e];});},28000);
    try{
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:450,system:buildSys(),messages:msgs.map(m=>({role:m.role,content:m.content}))})});
      clearTimeout(toRef.current);const d=await res.json();
      if(!res.ok){setChatMessages([...msgs,{role:'assistant',content:`⚠ Błąd API: ${d?.error?.message||res.status}`}]);return;}
      const reply=d?.content?.[0]?.text||'(brak odpowiedzi)';
      setChatMessages([...msgs,{role:'assistant',content:''}]);startTW(reply);
    }catch(e){clearTimeout(toRef.current);setChatMessages([...msgs,{role:'assistant',content:`⚠ Błąd: ${e.message}`}]);}
    finally{setIsProcessing(false);}
  };
  const clearChat=()=>{resetP();setChatMessages([]);};
  const addTaskFn=useCallback((name,time,priority='medium',subs=[])=>{
    setTasks(prev=>{const t={id:Date.now().toString(),name,group:'today',time,priority,deadline:null,startTime:null,endTime:null,completed:false,expanded:false,substeps:subs.map((tx,i)=>({id:`${Date.now()}-${i}`,text:tx,done:false}))};const u=[...prev,t];store.set('adhd-tasks',u);return u;});
  },[setTasks]);
  const onTA=e=>{setInput(e.target.value);const ta=taRef.current;if(ta){ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,84)+'px';}};
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',paddingBottom:56}}>
      <div style={{background:C.card,boxShadow:C.shadowSm,padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><Brain size={19} color={C.primary}/><span style={{fontSize:16,fontWeight:800,color:C.text}}>Asystent AI</span></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <EnergySelector value={energy} onChange={onSetEnergy} compact/>
          <button onClick={clearChat} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:'5px 7px',cursor:'pointer',display:'flex',alignItems:'center'}}><RotateCw size={13} color={C.textMuted}/></button>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',overflowX:'hidden',padding:'14px',background:C.bg}}>
        {chatMessages.length===0&&(
          <div style={{display:'flex',flexDirection:'column',gap:7,paddingTop:8}}>
            <p style={{textAlign:'center',color:C.textFaint,fontSize:13,marginBottom:8}}>Jak mogę Ci dzisiaj pomóc? 🧠</p>
            {SUGG.map((s,i)=><button key={i} onClick={()=>send(s)} disabled={isProcessing||animating}
              style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:'11px 14px',fontSize:13,color:C.textMuted,textAlign:'left',cursor:'pointer',boxShadow:C.shadowSm,fontWeight:500}}>{s}</button>)}
          </div>
        )}
        {chatMessages.map((m,i)=><Bubble key={i} msg={m} addTaskFn={addTaskFn}/>)}
        {isProcessing&&!animating&&(
          <div style={{display:'flex',justifyContent:'flex-start',marginBottom:8}}>
            <div style={{background:C.card,borderRadius:'14px 14px 14px 4px',padding:'10px 14px',boxShadow:C.shadowSm,display:'flex',gap:5,alignItems:'center'}}>
              {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:C.border,animation:`dotBounce 1.2s ${i*0.18}s infinite`}}/>)}
            </div>
          </div>
        )}
        <style>{`@keyframes dotBounce{0%,80%,100%{transform:scale(0.7)}40%{transform:scale(1.1)}}`}</style>
        {userCount>=LIMIT&&<div style={{background:C.accentLight,border:`1px solid #f0c4ae`,borderRadius:14,padding:'10px 12px',textAlign:'center'}}>
          <p style={{fontSize:12,color:'#7a3a18',margin:'0 0 4px'}}>Limit {LIMIT} wiadomości osiągnięty.</p>
          <button onClick={clearChat} style={{fontSize:12,color:C.accent,fontWeight:700,background:'none',border:'none',cursor:'pointer'}}>Wyczyść historię ↺</button>
        </div>}
        <div ref={endRef}/>
      </div>
      <div style={{background:C.card,borderTop:`1px solid ${C.border}`,padding:'10px 12px',flexShrink:0}}>
        <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
          <textarea ref={taRef} value={input} onChange={onTA}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(input);}}}
            placeholder={userCount>=LIMIT?'Limit osiągnięty':'Napisz wiadomość…'}
            disabled={isProcessing||animating||userCount>=LIMIT}
            rows={1} style={{flex:1,height:42,maxHeight:84,resize:'none',overflowY:'auto',border:`1.5px solid ${C.border}`,borderRadius:12,padding:'9px 12px',fontSize:13,outline:'none',background:C.bg,color:C.text,fontFamily:'inherit',opacity:isProcessing||animating?0.6:1}}/>
          <button onClick={()=>send(input)} disabled={isProcessing||animating||!input.trim()||userCount>=LIMIT}
            style={{width:42,height:42,background:C.primary,border:'none',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',opacity:isProcessing||animating||!input.trim()?0.4:1,transition:'opacity 0.15s',flexShrink:0}}>
            <Send size={16} color="#fff"/>
          </button>
        </div>
        <p style={{fontSize:10,color:C.textFaint,marginTop:4,paddingLeft:2}}>Enter — wyślij · Shift+Enter — nowa linia</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════
export default function App(){
  const[view,setView]=useState('home'),[tasks,setTasks]=useState([]),[actId,setActId]=useState(null);
  const[energy,setEnergy]=useState(3),[chat,setChat]=useState([]),[loaded,setLoaded]=useState(false);
  const timer=usePomodoro();

  useEffect(()=>{
    (async()=>{
      const t=await store.get('adhd-tasks'),e=await store.get('adhd-energy');
      const a=await store.get('adhd-active-task');
      setTasks(migrate(t||DEFAULT_TASKS));setEnergy(e??3);setActId(a??null);setLoaded(true);
    })();
  },[]);

  const setEn=n=>{setEnergy(n);store.set('adhd-energy',n);};

  if(!loaded)return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:C.bg}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:36,height:36,border:`3px solid ${C.primary}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 10px'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{fontSize:13,color:C.primary,fontWeight:600,margin:0}}>Ładowanie…</p>
      </div>
    </div>
  );

  const NAV=[{id:'home',lbl:'Główna',icon:<Brain size={20}/>},{id:'tasks',lbl:'Zadania',icon:<CheckSquare size={20}/>},{id:'timer',lbl:'Timer',icon:<Clock size={20}/>},{id:'ai',lbl:'AI',icon:<MessageCircle size={20}/>}];
  const cp={tasks,setTasks,activeTaskId:actId,setActiveTaskId:setActId};

  return(
    <div style={{minHeight:'100vh',background:C.bg,maxWidth:560,margin:'0 auto',position:'relative',fontFamily:'system-ui,sans-serif'}}>
      <div style={{minHeight:'100vh',overflowY:'auto',overflowX:'hidden'}}>
        {view==='home'  &&<HomeView  {...cp} energy={energy} onSetEnergy={setEn} timer={timer} setActiveView={setView}/>}
        {view==='tasks' &&<TasksView {...cp} setActiveView={setView}/>}
        {view==='timer' &&<TimerView timer={timer}/>}
        {view==='ai'    &&<AIView chatMessages={chat} setChatMessages={setChat} energy={energy} onSetEnergy={setEn} todayGoal="" tasks={tasks} activeTaskId={actId} setTasks={setTasks}/>}
      </div>
      <nav style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:560,height:56,background:C.card,borderTop:`1px solid ${C.border}`,display:'flex',zIndex:40,boxShadow:'0 -2px 12px rgba(39,33,28,0.08)'}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setView(n.id)}
            style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,border:'none',background:'none',cursor:'pointer',
              color:view===n.id?C.primary:C.textFaint,transition:'color 0.15s',position:'relative'}}>
            {n.icon}
            <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase'}}>{n.lbl}</span>
            {view===n.id&&<div style={{position:'absolute',top:0,left:'25%',right:'25%',height:2,background:C.primary,borderRadius:'0 0 2px 2px'}}/>}
          </button>
        ))}
      </nav>
    </div>
  );
}
