/* ==============================================================
   Minimal SVG chart helpers — no external chart library required
   so the prototype runs fully offline for the review demo.
   ============================================================== */

const CHART_COLORS = {
  blue700:"#1B54A3", blue500:"#2E75C4", blue300:"#8FBBE8",
  blue100:"#EAF2FB", ink400:"#8394A8", line:"#DCE6F2", good:"#1E8E5A"
};

function svgEl(tag, attrs){
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for(const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

/* ---- Line chart (publications & citations trend) ---- */
function renderLineChart(container, series, opts={}){
  const w = opts.width || container.clientWidth || 560;
  const h = opts.height || 220;
  const padL = 36, padR = 14, padT = 16, padB = 28;
  const labels = series.labels;
  const lines = series.lines; // [{name,color,data:[]}]

  const allVals = lines.flatMap(l=>l.data);
  const maxV = Math.max(...allVals) * 1.15;

  const svg = svgEl("svg", { viewBox:`0 0 ${w} ${h}`, width:"100%", height:h, class:"chart-svg" });

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const stepX = plotW / (labels.length - 1);

  // gridlines
  const gridSteps = 4;
  for(let i=0;i<=gridSteps;i++){
    const y = padT + (plotH/gridSteps)*i;
    svg.appendChild(svgEl("line",{x1:padL,x2:w-padR,y1:y,y2:y,stroke:CHART_COLORS.line,"stroke-width":1}));
    const val = Math.round(maxV - (maxV/gridSteps)*i);
    const t = svgEl("text",{x:4,y:y+4,"font-size":10,fill:CHART_COLORS.ink400,"font-family":"var(--font-body)"});
    t.textContent = val;
    svg.appendChild(t);
  }

  // x labels
  labels.forEach((lab,i)=>{
    const x = padL + stepX*i;
    const t = svgEl("text",{x:x,y:h-8,"font-size":10.5,fill:CHART_COLORS.ink400,"text-anchor":"middle"});
    t.textContent = lab;
    svg.appendChild(t);
  });

  lines.forEach(line=>{
    const pts = line.data.map((v,i)=>{
      const x = padL + stepX*i;
      const y = padT + plotH - (v/maxV)*plotH;
      return [x,y];
    });

    // area fill
    if(line.fill){
      const areaPath = `M${pts[0][0]},${padT+plotH} ` + pts.map(p=>`L${p[0]},${p[1]}`).join(" ") + ` L${pts[pts.length-1][0]},${padT+plotH} Z`;
      svg.appendChild(svgEl("path",{d:areaPath, fill:line.color, opacity:0.08}));
    }

    const path = "M" + pts.map(p=>p.join(",")).join(" L");
    svg.appendChild(svgEl("path",{d:path, fill:"none", stroke:line.color, "stroke-width":2.4, "stroke-linecap":"round","stroke-linejoin":"round"}));

    pts.forEach(p=>{
      svg.appendChild(svgEl("circle",{cx:p[0],cy:p[1],r:3.4,fill:"#fff",stroke:line.color,"stroke-width":2}));
    });
  });

  container.innerHTML = "";
  container.appendChild(svg);
}

/* ---- Simple bar chart ---- */
function renderBarChart(container, labels, values, opts={}){
  const w = opts.width || container.clientWidth || 560;
  const h = opts.height || 200;
  const padL = 36, padR = 14, padT = 14, padB = 28;
  const color = opts.color || CHART_COLORS.blue500;
  const maxV = Math.max(...values) * 1.2;

  const svg = svgEl("svg", { viewBox:`0 0 ${w} ${h}`, width:"100%", height:h });
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const bw = plotW / labels.length * 0.55;
  const gap = plotW / labels.length;

  const gridSteps = 3;
  for(let i=0;i<=gridSteps;i++){
    const y = padT + (plotH/gridSteps)*i;
    svg.appendChild(svgEl("line",{x1:padL,x2:w-padR,y1:y,y2:y,stroke:CHART_COLORS.line,"stroke-width":1}));
  }

  labels.forEach((lab,i)=>{
    const v = values[i];
    const x = padL + gap*i + (gap-bw)/2;
    const barH = (v/maxV)*plotH;
    const y = padT + plotH - barH;
    svg.appendChild(svgEl("rect",{x,y,width:bw,height:barH,rx:4,fill:color, opacity: 0.85}));
    const t = svgEl("text",{x:x+bw/2,y:h-8,"font-size":10.5,fill:CHART_COLORS.ink400,"text-anchor":"middle"});
    t.textContent = lab;
    svg.appendChild(t);
    const vt = svgEl("text",{x:x+bw/2,y:y-6,"font-size":10.5,fill:"#12233F","text-anchor":"middle","font-weight":700});
    vt.textContent = v;
    svg.appendChild(vt);
  });

  container.innerHTML = "";
  container.appendChild(svg);
}

/* ---- Donut chart (source contribution / department split) ---- */
function renderDonutChart(container, segments, opts={}){
  // segments: [{label, value, color}]
  const size = opts.size || 168;
  const stroke = opts.stroke || 20;
  const r = (size - stroke) / 2;
  const cx = size/2, cy = size/2;
  const total = segments.reduce((a,s)=>a+s.value,0);

  const svg = svgEl("svg",{ viewBox:`0 0 ${size} ${size}`, width:size, height:size });
  svg.appendChild(svgEl("circle",{cx,cy,r,fill:"none",stroke:CHART_COLORS.line,"stroke-width":stroke}));

  let offset = 0;
  const circumference = 2*Math.PI*r;
  segments.forEach(seg=>{
    const frac = seg.value/total;
    const dash = frac*circumference;
    const circle = svgEl("circle",{
      cx,cy,r,fill:"none",stroke:seg.color,"stroke-width":stroke,
      "stroke-dasharray":`${dash} ${circumference-dash}`,
      "stroke-dashoffset":-offset,
      transform:`rotate(-90 ${cx} ${cy})`,
      "stroke-linecap":"butt"
    });
    svg.appendChild(circle);
    offset += dash;
  });

  const label = svgEl("text",{x:cx,y:cy-2,"text-anchor":"middle","font-size":20,"font-weight":700,fill:"#12233F"});
  label.textContent = total;
  const sub = svgEl("text",{x:cx,y:cy+16,"text-anchor":"middle","font-size":9.5,fill:CHART_COLORS.ink400});
  sub.textContent = opts.centerLabel || "TOTAL";

  svg.appendChild(label);
  svg.appendChild(sub);

  container.innerHTML = "";
  container.appendChild(svg);
}
