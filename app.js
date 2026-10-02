const $ = id => document.getElementById(id);
const fmt = (x, digits=2) => Number.isFinite(x) ? x.toLocaleString("en-US",{maximumFractionDigits:digits}) : "—";
let lastFit=null, demo=true, partSerial=0;

function addPart(name="",mass="",cp=""){
  const row=document.createElement("div"); row.className="part-row"; row.dataset.part=String(++partSerial);
  for(const [label,value,type] of [["材料名稱",name,"text"],["重量 kg",mass,"number"],["比熱 J/(kg·K)",cp,"number"]]){
    const input=document.createElement("input"); input.type=type; input.value=value; input.setAttribute("aria-label",label);
    if(type==="number"){input.min="0";input.step="any"}
    input.addEventListener("input",updateBom);row.appendChild(input);
  }
  const remove=document.createElement("button");remove.type="button";remove.className="icon-button";remove.setAttribute("aria-label","移除材料");remove.textContent="×";
  remove.addEventListener("click",()=>{row.remove();updateBom()});row.appendChild(remove);$("parts").appendChild(row);updateBom();
}
function bomCapacity(){
  const n=+$("cell-count").value,m=+$("cell-mass").value,cp=+$("cell-cp").value;
  const cell=(Number.isFinite(n)&&n>0&&Number.isInteger(n)&&m>=0&&cp>=0)?n*m*cp:NaN;
  let structural=0;
  for(const row of $("parts").children){
    const [name, mass, heat]=row.querySelectorAll("input");
    if(mass.value===""&&heat.value==="")continue;
    const mm=+mass.value,cc=+heat.value;
    if(!Number.isFinite(mm)||!Number.isFinite(cc)||mm<0||cc<0||mass.value===""||heat.value==="")return {cell,structural:NaN,total:NaN};
    structural+=mm*cc;
  }
  return {cell,structural,total:cell+structural};
}
function updateBom(){
  const b=bomCapacity();$("bom-total").textContent=Number.isFinite(b.total)?fmt(b.total,0)+" J/K":"請檢查輸入";
  if(lastFit)assessment(lastFit);
}
function splitDelimited(line,delimiter){
  const cells=[];let cur="",quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted}
    else if(ch===delimiter&&!quoted){cells.push(cur.trim());cur=""}
    else cur+=ch;
  }
  cells.push(cur.trim());return cells;
}
function parseTable(raw){
  const lines=raw.replace(/^\uFEFF/,"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length<2)return {header:[],rows:[]};
  const head=lines[0];const delim=["\t",",",";"].sort((a,b)=>splitDelimited(head,b).length-splitDelimited(head,a).length)[0];
  const header=splitDelimited(head,delim);
  const rows=lines.slice(1).map(line=>splitDelimited(line,delim));
  return {header,rows};
}
function fieldMatch(header,type){
  const patterns={
    time:[/^time/i,/^t_?s$/i,/時間/,/秒數/],
    temp:[/^temp/i,/^t_?(cell|surface|meas)/i,/量測.*溫/,/電池.*溫/,/^溫度/],
    heat:[/^heat/i,/^p_?(w|heat)/i,/^q_?(w|dot)/i,/發熱/,/熱功率/,/熱損/],
    ambient:[/^amb/i,/^t_?(air|cool|inlet)/i,/環境/,/入口.*溫/,/冷卻.*溫/]
  };
  return header.findIndex(h=>patterns[type].some(re=>re.test(h.trim())));
}
function populateMaps(preserve=false){
  const {header}=parseTable($("data-text").value);
  for(const [type,id,optional] of [["time","map-time",false],["temp","map-temp",false],["heat","map-heat",true],["ambient","map-ambient",true]]){
    const el=$(id),old=preserve?el.value:null;el.replaceChildren();
    if(optional){const opt=document.createElement("option");opt.value="-1";opt.textContent=type==="heat"?"使用下方固定脈衝":"使用下方固定溫度";el.appendChild(opt)}
    header.forEach((h,i)=>{const opt=document.createElement("option");opt.value=String(i);opt.textContent=h||"第 "+(i+1)+" 欄";el.appendChild(opt)});
    const suggested=fieldMatch(header,type);
    el.value=old!==null&&[...el.options].some(o=>o.value===old)?old:String(suggested>=0?suggested:(optional?-1:type==="time"?0:Math.min(1,header.length-1)));
  }
  $("data-count").textContent=header.length?fmt(parseTable($("data-text").value).rows.length,0)+" 列資料":"";
}
function finiteField(raw,label){if(raw===undefined||raw===null||String(raw).trim()==="")throw new Error(label+" 有空白資料");const n=Number(String(raw).trim());if(!Number.isFinite(n))throw new Error(label+" 必須是數字");return n}
function readSamples(){
  const table=parseTable($("data-text").value);
  if(table.rows.length<6)throw new Error("至少需要 6 筆有時間和量測溫度的資料");
  if(table.rows.length>10000)throw new Error("最多支援 10,000 筆資料，請先降低取樣頻率");
  const col=id=>+$("map-"+id).value;
  const it=col("time"),iy=col("temp"),ip=col("heat"),ia=col("ambient");
  if(it<0||iy<0||it===iy)throw new Error("請選擇不同的時間與溫度欄位");
  let pulse=null;
  if(ip<0){const power=finiteField($("heat-constant").value,"加熱功率"),start=finiteField($("heat-start").value,"開始時間"),stop=finiteField($("heat-stop").value,"停止時間");
    if(power===0||start<0||stop<=start)throw new Error("淨發熱功率不可為 0，停止時間須晚於開始時間");
    pulse={power,start,stop};
  }
  const ambientDefault=ia<0?finiteField($("ambient-constant").value,"固定環境溫度"):null;
  const samples=table.rows.map((r,i)=>({
    t:finiteField(r[it],"第 "+(i+2)+" 列時間"),
    y:finiteField(r[iy],"第 "+(i+2)+" 列溫度"),
    p:ip>=0?finiteField(r[ip],"第 "+(i+2)+" 列熱功率"):null,
    a:ia>=0?finiteField(r[ia],"第 "+(i+2)+" 列環境溫度"):ambientDefault
  }));
  for(let i=1;i<samples.length;i++)if(samples[i].t<=samples[i-1].t)throw new Error("時間必須嚴格遞增；第 "+(i+2)+" 列有重複或倒退");
  if(!samples.some(s=>Math.abs(s.y-samples[0].y)>0.15))throw new Error("量測溫度變化太小，無法辨識熱 RC");
  if(ip>=0&&!samples.some(s=>Math.abs(s.p)>0))throw new Error("發熱功率欄位全為 0，無法同時辨識 R 與 C");
  if(pulse&&(pulse.stop<=samples[0].t||pulse.start>=samples.at(-1).t))throw new Error("加熱區間沒有落在量測時間內");
  return {samples,pulse};
}
// The input is held constant over each interval; pulse transitions are split exactly.
function simulate(data,R,C){
  const {samples,pulse}=data, predicted=[samples[0].y];
  for(let i=0;i<samples.length-1;i++){
    const s=samples[i],e=samples[i+1],cuts=pulse?[s.t,...[pulse.start,pulse.stop].filter(v=>v>s.t&&v<e.t),e.t]:[s.t,e.t];
    let T=predicted[i];
    for(let j=0;j<cuts.length-1;j++){
      const mid=(cuts[j]+cuts[j+1])/2, P=pulse?(mid>=pulse.start&&mid<pulse.stop?pulse.power:0):s.p;
      const alpha=Math.exp(-(cuts[j+1]-cuts[j])/(R*C));
      T=s.a+P*R+(T-s.a-P*R)*alpha;
    }
    predicted.push(T);
  }
  return predicted;
}
function loss(x,data){
  const R=Math.exp(x[0]),C=Math.exp(x[1]);
  if(R<1e-5||R>1e5||C<.01||C>1e9)return 1e12;
  const model=simulate(data,R,C);
  let sum=0;for(let i=0;i<model.length;i++){const d=model[i]-data.samples[i].y;sum+=d*d}
  return sum/model.length;
}
function nelderMead(initial,data){
  const simplex=[initial,[initial[0]+.35,initial[1]],[initial[0],initial[1]+.35]];
  const val=p=>loss(p,data);
  let f=simplex.map(val);
  for(let k=0;k<190;k++){
    const ids=[0,1,2].sort((a,b)=>f[a]-f[b]);
    const [best,mid,worst]=ids,centroid=[(simplex[best][0]+simplex[mid][0])/2,(simplex[best][1]+simplex[mid][1])/2];
    if(Math.abs(f[worst]-f[best])<1e-11&&Math.hypot(simplex[worst][0]-simplex[best][0],simplex[worst][1]-simplex[best][1])<1e-5)break;
    const move=(factor,ref=simplex[worst])=>[centroid[0]+factor*(centroid[0]-ref[0]),centroid[1]+factor*(centroid[1]-ref[1])];
    const reflected=move(1),fr=val(reflected);
    if(fr<f[best]){const expanded=move(2),fe=val(expanded);simplex[worst]=fe<fr?expanded:reflected;f[worst]=Math.min(fe,fr)}
    else if(fr<f[mid]){simplex[worst]=reflected;f[worst]=fr}
    else {
      const contracted=fr<f[worst]?[centroid[0]+.5*(reflected[0]-centroid[0]),centroid[1]+.5*(reflected[1]-centroid[1])]:[centroid[0]+.5*(simplex[worst][0]-centroid[0]),centroid[1]+.5*(simplex[worst][1]-centroid[1])];
      const fc=val(contracted);
      if(fc<Math.min(fr,f[worst])){simplex[worst]=contracted;f[worst]=fc}
      else for(const id of [mid,worst]){simplex[id]=[(simplex[id][0]+simplex[best][0])/2,(simplex[id][1]+simplex[best][1])/2];f[id]=val(simplex[id])}
    }
  }
  const best=[0,1,2].sort((a,b)=>f[a]-f[b])[0];return {x:simplex[best],mse:f[best]};
}
function fit(data){
  const b=bomCapacity();
  const c0=Number.isFinite(b.total)&&b.total>0?b.total:2000;
  const s=data.samples, positive=data.pulse?Math.abs(data.pulse.power):Math.max(...s.map(x=>Math.abs(x.p)));
  const span=Math.max(...s.map(x=>x.y))-Math.min(...s.map(x=>x.y));
  const r0=Math.max(.0001,span/Math.max(positive,1));
  const starts=[[r0,c0],[r0*.3,c0],[r0*3,c0],[r0,c0*.15],[r0,c0*5]];
  const best=starts.map(v=>nelderMead(v.map(Math.log),data)).sort((a,b)=>a.mse-b.mse)[0];
  const R=Math.exp(best.x[0]),C=Math.exp(best.x[1]),model=simulate(data,R,C);
  const errors=model.map((v,i)=>Math.abs(v-s[i].y));
  return {R,C,model,data,mae:errors.reduce((a,b)=>a+b,0)/errors.length,max:Math.max(...errors),bom:b};
}
function svgEl(tag,attrs,text){
  const el=document.createElementNS("http://www.w3.org/2000/svg",tag);
  for(const [key,val] of Object.entries(attrs))el.setAttribute(key,String(val));
  if(text!==undefined)el.textContent=text;
  return el;
}
function drawChart(result){
  const svg=$("chart");svg.replaceChildren();
  const samples=result.data.samples, w=720,h=330,L=58,R=18,T=20,B=40;
  let ymin=Math.min(...samples.map(x=>x.y),...result.model),ymax=Math.max(...samples.map(x=>x.y),...result.model);
  const pad=Math.max(1.5,(ymax-ymin)*.12);ymin-=pad;ymax+=pad;
  const tmin=samples[0].t,tmax=samples.at(-1).t;
  const x=t=>L+(t-tmin)/(tmax-tmin)*(w-L-R);
  const y=v=>T+(ymax-v)/(ymax-ymin)*(h-T-B);
  for(let k=0;k<=4;k++){
    const yy=T+(h-T-B)*k/4, val=ymax-(ymax-ymin)*k/4;
    svg.appendChild(svgEl("line",{x1:L,x2:w-R,y1:yy,y2:yy,stroke:"#e5edf0","stroke-width":1}));
    svg.appendChild(svgEl("text",{x:L-9,y:yy+4,"text-anchor":"end",fill:"#7b929e","font-size":12},fmt(val,1)));
  }
  for(let k=0;k<=4;k++){
    const xx=L+(w-L-R)*k/4,tt=tmin+(tmax-tmin)*k/4;
    svg.appendChild(svgEl("text",{x:xx,y:h-12,"text-anchor":"middle",fill:"#7b929e","font-size":12},fmt(tt/60,0)));
  }
  svg.appendChild(svgEl("text",{x:w-15,y:h-12,"text-anchor":"end",fill:"#66818e","font-size":12},"min"));
  const path=vals=>vals.map((v,i)=>(i?"L":"M")+x(samples[i].t).toFixed(2)+" "+y(v).toFixed(2)).join(" ");
  svg.appendChild(svgEl("path",{d:path(samples.map(s=>s.y)),fill:"none",stroke:"#2184a5","stroke-width":2.8,"stroke-linecap":"round","stroke-linejoin":"round"}));
  svg.appendChild(svgEl("path",{d:path(result.model),fill:"none",stroke:"#ea8e54","stroke-width":2.7,"stroke-dasharray":"8 5","stroke-linecap":"round","stroke-linejoin":"round"}));
}
function assessment(f){
  const b=bomCapacity(),a=$("assessment");
  let notes=[];
  if(b.total>0){
    const ratio=f.C/b.total;
    if(ratio<.5||ratio>2)notes.push("擬合熱容為材料清單的 "+fmt(ratio,2)+" 倍；請檢查發熱功率、測點、接觸件與熱耦合。");
    else notes.push("擬合熱容約為材料清單的 "+fmt(ratio,2)+" 倍，量級相近。");
  }else notes.push("可輸入重量與比熱，檢查熱容的物理量級。");
  const range=Math.max(...f.data.samples.map(x=>x.y))-Math.min(...f.data.samples.map(x=>x.y));
  if(f.max>Math.max(1.5,range*.1))notes.push("最大誤差偏大；一階模型可能不足以描述測點與冷卻路徑。");
  const powers=f.data.samples.map(s=>f.data.pulse?(s.t>=f.data.pulse.start&&s.t<f.data.pulse.stop?f.data.pulse.power:0):s.p);
  if(!powers.some(p=>p===0))notes.push("資料沒有停止發熱的冷卻段，R 與 C 可能難以分開辨識。");
  if($("scope").value==="cabinet")notes.push("整櫃擬合值是此測點的等效熱容，不等於全櫃材料總熱容。");
  a.textContent=notes.join(" ");a.className="assessment"+((b.total>0&&(f.C/b.total<.5||f.C/b.total>2)||f.max>Math.max(1.5,range*.1))?" warning":"");
}
function updateScope(){
  const scope=$("scope").value;
  const info={
    cell:"<strong>Cell：</strong>若單顆內部溫差小，擬合熱容可與單顆 m·cₚ 比較。",
    module:"<strong>Module：</strong>清單可包含 cell 與框架；若冷板與電池不同步升溫，應分成不同熱節點。",
    cabinet:"<strong>Cabinet：</strong>清單提供全櫃熱容上限的物理參考。一階模型只能描述單一測點的等效響應，不能同時預測電池、空氣與箱體溫度。"
  };
  $("scope-note").innerHTML=info[scope];if(lastFit)assessment(lastFit);
}
function renderFit(f){
  lastFit=f;$("r-value").textContent=fmt(f.R,Math.abs(f.R)<.01?5:3);
  $("c-value").textContent=fmt(f.C,0);$("tau-value").textContent=fmt(f.R*f.C/60,1);
  $("mae").textContent=fmt(f.mae,2)+" °C";$("max-error").textContent=fmt(f.max,2)+" °C";
  $("point-count").textContent=fmt(f.data.samples.length,0);
  $("status-pill").textContent=demo?"示範資料":"已擬合";drawChart(f);assessment(f);
}
function runFit(){
  try{$("error").hidden=true;const f=fit(readSamples());renderFit(f)}
  catch(err){$("error").textContent=err.message;$("error").hidden=false}
}
function sampleCSV(){
  const R=2.4,C=2100,ambient=20,power=50,stop=3700,rows=["time_s,temp_C,heat_W,ambient_C"];
  let T=20,prev=0;
  for(let t=0;t<=9000;t+=60){
    if(t>0){
      let cuts=[prev,...[stop].filter(v=>v>prev&&v<t),t];
      for(let i=0;i<cuts.length-1;i++){
        const p=(cuts[i]+cuts[i+1])/2<stop?power:0,alpha=Math.exp(-(cuts[i+1]-cuts[i])/(R*C));
        T=ambient+p*R+(T-ambient-p*R)*alpha;
      }
    }
    const measured=t===0?20:T+0.08*Math.sin(t/190)+0.04*Math.cos(t/310);
    rows.push([t,measured.toFixed(3),t<stop?power:0,ambient].join(","));prev=t;
  }
  return rows.join("\n");
}
function registerWebMCP(){
  const context=document.modelContext;if(!context?.registerTool)return;
  try{
    const result=context.registerTool({
      name:"set_thermal_experiment",
      title:"設定並擬合電池熱實驗",
      description:"將帶欄名的 CSV 實驗資料填入頁面並執行一階熱 RC 擬合；需要時間、量測溫度及發熱功率。",
      inputSchema:{type:"object",properties:{csv:{type:"string",description:"含 time_s、temp_C、heat_W，ambient_C 可選的 CSV"}},required:["csv"],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:true},
      execute(input){
        if(!input||typeof input.csv!=="string"||input.csv.length>1_000_000)throw new Error("csv 必須是文字且長度低於 1 MB");
        const previous=$("data-text").value;
        $("data-text").value=input.csv;populateMaps();
        try{const data=readSamples();const f=fit(data);demo=false;renderFit(f);$("error").hidden=true;return {R_th_K_per_W:f.R,C_th_J_per_K:f.C,mae_C:f.mae,points:data.samples.length}}
        catch(e){$("data-text").value=previous;populateMaps();throw e}
      }
    });
    Promise.resolve(result).catch(()=>{});
  }catch(_){/* Unsupported browser context: the visible app remains available. */}
}
document.addEventListener("DOMContentLoaded",()=>{
  addPart();
  $("scope").addEventListener("change",updateScope);updateScope();
  for(const id of ["cell-count","cell-mass","cell-cp"])$(id).addEventListener("input",updateBom);
  $("add-part").addEventListener("click",()=>addPart());
  $("data-text").addEventListener("input",()=>{demo=false;populateMaps(true)});
  $("csv-file").addEventListener("change",async ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    if(file.size>1_000_000){$("error").textContent="檔案大於 1 MB，請先降低取樣頻率";$("error").hidden=false;return}
    $("data-text").value=await file.text();$("file-name").textContent=file.name;demo=false;populateMaps();$("error").hidden=true;
  });
  $("sample").addEventListener("click",()=>{demo=true;$("data-text").value=sampleCSV();$("file-name").textContent="示範：50 W 加熱、停止後冷卻";populateMaps();runFit()});
  $("fit-button").addEventListener("click",runFit);
  $("data-text").value=sampleCSV();populateMaps();runFit();registerWebMCP();
});
