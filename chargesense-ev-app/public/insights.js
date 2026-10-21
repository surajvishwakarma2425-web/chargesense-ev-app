var H=["12 am","3 am","6 am","9 am","12 pm","3 pm","6 pm","9 pm"];
var ST=["City Mall","Highway Hub","Metro Point","Tech Park","Airport Road"],M=[1,.8,1.1,.6,.9];
function hr(h){return (h%12===0?12:h%12)+(h<12?" am":" pm")}
function use(s,h){var a=.75*Math.exp(-Math.pow(h-9,2)/6)+.95*Math.exp(-Math.pow(h-19,2)/6)+.12;var v=a*M[s]+((s*7+h*13)%10)/100;return Math.max(.05,Math.min(1,v))}
var heat=document.getElementById("heat"),avg=[];
for(var h=0;h<24;h++)avg[h]=0;
ST.forEach(function(n,s){
 var l=document.createElement("div");l.className="lab";l.textContent=n;heat.appendChild(l);
 for(var h=0;h<24;h++){var u=use(s,h);avg[h]+=u/ST.length;
  var b=document.createElement("button");b.className="cell";b.style.opacity=(.15+u*.85).toFixed(2);
  var t=n+", "+hr(h)+", "+Math.round(u*100)+"% busy";b.title=t;b.setAttribute("aria-label",t);
  b.onclick=(function(t){return function(){document.getElementById("read").textContent=t}})(t);heat.appendChild(b)}
});
var e=document.createElement("div");heat.appendChild(e);
for(var h=0;h<24;h++){var d=document.createElement("div");d.className="hr";d.textContent=h%3===0?(h%12===0?12:h%12):"";heat.appendChild(d)}
var pk=0,qt=6;for(h=0;h<24;h++){if(avg[h]>avg[pk])pk=h}for(h=6;h<=22;h++){if(avg[h]<avg[qt])qt=h}
document.getElementById("read").textContent="Busiest around "+hr(pk)+". Quietest daytime hour: "+hr(qt)+".";
var PR=[["Chargers hard to find",78],["Range anxiety",71],["Long waiting at stations",64],["Broken or offline chargers",58],["Slow charging",52],["High charging cost",40],["Plug does not fit",33]];
var bars=document.getElementById("bars");
PR.forEach(function(p){var d=document.createElement("div");d.className="bar";d.innerHTML="<span>"+p[0]+"</span><div class='track'><div class='fill' style='width:"+p[1]+"%'></div></div><b>"+p[1]+"%</b>";bars.appendChild(d)});
document.getElementById("top").textContent="Most common problem: "+PR[0][0].toLowerCase()+" ("+PR[0][1]+"% of drivers). This is why ChargeSense starts with station finding.";
var S=[];
var plug=null,spd=null,onlyFree=false,LB={free:"Free now",busy:"In use",off:"Offline"};
function chips(id,items,get,set){var box=document.getElementById(id);
 items.forEach(function(t){var b=document.createElement("button");b.className="chip";b.textContent=t.l;b.setAttribute("aria-pressed","false");
  b.onclick=function(){var on=get()===t.v;set(on?null:t.v);Array.prototype.forEach.call(box.children,function(x){x.setAttribute("aria-pressed","false")});if(!on)b.setAttribute("aria-pressed","true");render()};box.appendChild(b)})}
chips("plugs",["CCS2","Type 2","CHAdeMO","Bharat AC"].map(function(x){return{l:x,v:x}}),function(){return plug},function(v){plug=v});
chips("speeds",[{l:"Fast 50 kW+",v:50},{l:"Standard up to 22 kW",v:0}],function(){return spd},function(v){spd=v});
document.getElementById("avail").onclick=function(){onlyFree=!onlyFree;this.setAttribute("aria-pressed",onlyFree);render()};
document.getElementById("q").oninput=render;
function esc(t){var d=document.createElement("div");d.textContent=t;return d.innerHTML}
function render(){var q=document.getElementById("q").value.toLowerCase().trim();
 var r=S.filter(function(s){if(q&&(s.n+" "+s.a).toLowerCase().indexOf(q)<0)return false;if(plug&&s.c.indexOf(plug)<0)return false;if(spd===50&&s.kw<50)return false;if(spd===0&&s.kw>22)return false;if(onlyFree&&s.s!=="free")return false;return true}).sort(function(a,b){return a.km-b.km});
 var el=document.getElementById("list");
 if(!r.length){el.innerHTML='<li class="empty">No stations match. Remove a filter or search a wider area.</li>';return}
 el.innerHTML=r.map(function(s){return '<li class="st"><div><h3>'+esc(s.n)+'</h3><div class="meta">'+esc(s.a)+' · '+s.km+' km away</div><div class="meta">'+s.c.join(", ")+' · '+s.kw+' kW · ₹'+s.p+'/kWh</div></div><span class="status '+s.s+'"><span class="dot"></span>'+LB[s.s]+'</span></li>'}).join("")}
function v(id){return parseFloat(document.getElementById(id).value)||0}
function calc(){var range=v("cap")*v("pct")/100*1000/Math.max(v("eff"),1),us=range*.9,d=v("dist"),o;
 if(d<=us)o="You can drive about "+Math.round(range)+" km. This trip needs no charging stop.";
 else{var full=v("cap")*.7*1000/Math.max(v("eff"),1),n=Math.ceil((d-us)/Math.max(full,1));o="You can drive about "+Math.round(range)+" km. Plan about "+n+" charging stop"+(n>1?"s":"")+" for "+d+" km."}
 document.getElementById("rangeOut").textContent=o;
 var k=Math.max(v("to")-v("from"),0)/100*v("cap");
 document.getElementById("costOut").textContent="Adds about "+k.toFixed(1)+" kWh, costing about ₹"+Math.round(k*v("price"))+"."}
Array.prototype.forEach.call(document.querySelectorAll("input[type=number]"),function(i){i.oninput=calc});
render();calc();
