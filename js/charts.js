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
  const labels = series && series.labels ? series.labels : [];
  const lines = series && series.lines ? series.lines : []; // [{name,color,data:[]}]

  if (labels.length === 0 || lines.length === 0) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:${h}px;color:var(--ink-400);font-size:13px;">No data available</div>`;
    return;
  }

  const padL = 36, padR = 14, padT = 16, padB = 28;
  const allVals = lines.flatMap(l=>l.data);
  const maxV = Math.max(...allVals, 1) * 1.15;

  const svg = svgEl("svg", { viewBox:`0 0 ${w} ${h}`, width:"100%", height:h, class:"chart-svg" });

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const stepX = labels.length > 1 ? (plotW / (labels.length - 1)) : (plotW / 2);

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
    const x = labels.length > 1 ? (padL + stepX*i) : (padL + plotW / 2);
    const t = svgEl("text",{x:x,y:h-8,"font-size":10.5,fill:CHART_COLORS.ink400,"text-anchor":"middle"});
    t.textContent = lab;
    svg.appendChild(t);
  });

  lines.forEach(line=>{
    const pts = line.data.map((v,i)=>{
      const x = labels.length > 1 ? (padL + stepX*i) : (padL + plotW / 2);
      const y = padT + plotH - (v/maxV)*plotH;
      return [x,y];
    });

    if (pts.length === 0) return;

    // area fill
    if(line.fill && pts.length > 1){
      const areaPath = `M${pts[0][0]},${padT+plotH} ` + pts.map(p=>`L${p[0]},${p[1]}`).join(" ") + ` L${pts[pts.length-1][0]},${padT+plotH} Z`;
      svg.appendChild(svgEl("path",{d:areaPath, fill:line.color, opacity:0.08}));
    }

    if (pts.length > 1) {
      const path = "M" + pts.map(p=>p.join(",")).join(" L");
      svg.appendChild(svgEl("path",{d:path, fill:"none", stroke:line.color, "stroke-width":2.4, "stroke-linecap":"round","stroke-linejoin":"round"}));
    }

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

  if (!labels || labels.length === 0 || !values || values.length === 0) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:${h}px;color:var(--ink-400);font-size:13px;">No data available</div>`;
    return;
  }

  const padL = 36, padR = 14, padT = 14, padB = 28;
  const color = opts.color || CHART_COLORS.blue500;
  const maxV = Math.max(...values, 1) * 1.2;

  const svg = svgEl("svg", { viewBox:`0 0 ${w} ${h}`, width:"100%", height:h });
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const bw = (plotW / labels.length) * 0.55;
  const gap = plotW / labels.length;

  const gridSteps = 3;
  for(let i=0;i<=gridSteps;i++){
    const y = padT + (plotH/gridSteps)*i;
    svg.appendChild(svgEl("line",{x1:padL,x2:w-padR,y1:y,y2:y,stroke:CHART_COLORS.line,"stroke-width":1}));
  }

  labels.forEach((lab,i)=>{
    const v = values[i] || 0;
    const x = padL + gap*i + (gap-bw)/2;
    const barH = (v/maxV)*plotH;
    const y = padT + plotH - barH;
    svg.appendChild(svgEl("rect",{x,y,width:bw,height:barH,rx:4,fill:color, opacity: 0.85}));
    const t = svgEl("text",{x:x+bw/2,y:h-8,"font-size":10.5,fill:CHART_COLORS.ink400,"text-anchor":"middle"});
    t.textContent = lab.length > 15 ? lab.substring(0, 13) + '…' : lab;
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

  if (!segments || segments.length === 0) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:${size}px;color:var(--ink-400);font-size:13px;">No data available</div>`;
    return;
  }

  const r = (size - stroke) / 2;
  const cx = size/2, cy = size/2;
  const total = segments.reduce((a,s)=>a + (Number(s.value) || 0),0);

  const svg = svgEl("svg",{ viewBox:`0 0 ${size} ${size}`, width:size, height:size });
  svg.appendChild(svgEl("circle",{cx,cy,r,fill:"none",stroke:CHART_COLORS.line,"stroke-width":stroke}));

  if (total > 0) {
    let offset = 0;
    const circumference = 2*Math.PI*r;
    segments.forEach(seg=>{
      const val = Number(seg.value) || 0;
      const frac = val/total;
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
  }

  const label = svgEl("text",{x:cx,y:cy-2,"text-anchor":"middle","font-size":20,"font-weight":700,fill:"#12233F"});
  label.textContent = total;
  const sub = svgEl("text",{x:cx,y:cy+16,"text-anchor":"middle","font-size":9.5,fill:CHART_COLORS.ink400});
  sub.textContent = opts.centerLabel || "TOTAL";

  svg.appendChild(label);
  svg.appendChild(sub);

  container.innerHTML = "";
  container.appendChild(svg);
}

/* ---- Collaboration Network Graph ---- */
function renderCollaborationNetwork(container, collaborations, opts = {}) {
  const w = opts.width || container.clientWidth || 720;
  const h = opts.height || 360;

  if (!collaborations || !Array.isArray(collaborations) || collaborations.length === 0) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:${h}px;color:var(--ink-400);font-size:13.5px;text-align:center;">
        <span style="font-size:24px;margin-bottom:6px;">👥</span>
        <span style="font-weight:600;color:var(--ink-600);">No collaborations recorded yet</span>
        <span style="font-size:12px;margin-top:2px;">Co-authored publications between faculty members will generate network nodes and links.</span>
      </div>
    `;
    return;
  }

  // 1. Build node map from collaboration records
  const nodeMap = new Map();
  collaborations.forEach(c => {
    if (c.faculty1 && !nodeMap.has(c.faculty1)) {
      nodeMap.set(c.faculty1, { id: c.faculty1, name: c.faculty1Name || 'Faculty' });
    }
    if (c.faculty2 && !nodeMap.has(c.faculty2)) {
      nodeMap.set(c.faculty2, { id: c.faculty2, name: c.faculty2Name || 'Faculty' });
    }
  });
  const nodes = Array.from(nodeMap.values());

  if (nodes.length === 0) {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:${h}px;color:var(--ink-400);font-size:13px;">
        No collaboration nodes found
      </div>
    `;
    return;
  }

  const svg = svgEl("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: "100%",
    height: h,
    class: "collab-network-svg",
    style: "background: #FAFCFF; border-radius: 8px; border: 1px solid var(--line); display: block;"
  });

  const pad = 60;
  const cx = w / 2;
  const cy = h / 2 - 10;
  const radius = Math.min((w - pad * 2) / 2, (h - pad * 2) / 2, 130);

  // Position nodes
  if (nodes.length === 1) {
    nodes[0].x = cx;
    nodes[0].y = cy;
  } else if (nodes.length === 2) {
    const spread = Math.min(180, (w - pad * 2) / 3);
    nodes[0].x = cx - spread;
    nodes[0].y = cy;
    nodes[1].x = cx + spread;
    nodes[1].y = cy;
  } else {
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      node.x = cx + radius * Math.cos(angle);
      node.y = cy + radius * Math.sin(angle);
    });
  }

  const posMap = new Map();
  nodes.forEach(n => posMap.set(n.id, n));

  const maxPubs = Math.max(...collaborations.map(c => Number(c.publicationCount) || 1), 1);

  // Groups for layering: edges bottom, labels middle, nodes top
  const edgeGroup = svgEl("g", { class: "network-edges" });
  svg.appendChild(edgeGroup);

  const edgeLabelGroup = svgEl("g", { class: "network-edge-labels" });
  svg.appendChild(edgeLabelGroup);

  const nodeGroup = svgEl("g", { class: "network-nodes" });
  svg.appendChild(nodeGroup);

  // Render edges
  collaborations.forEach((collab, idx) => {
    const n1 = posMap.get(collab.faculty1);
    const n2 = posMap.get(collab.faculty2);
    if (!n1 || !n2) return;

    const count = Number(collab.publicationCount) || 1;
    // Edge thickness reflects shared publication count
    const strokeWidth = 2.5 + (count / maxPubs) * 5;
    // Edge opacity reflects strength
    const opacity = 0.55 + (count / maxPubs) * 0.4;

    const line = svgEl("line", {
      x1: n1.x, y1: n1.y,
      x2: n2.x, y2: n2.y,
      stroke: "#2E75C4",
      "stroke-width": strokeWidth,
      "stroke-linecap": "round",
      opacity: opacity,
      style: "cursor: pointer; transition: stroke-width 0.2s, stroke 0.2s, opacity 0.2s;",
      "data-edge-id": idx
    });

    const highlightEdge = (active) => {
      line.setAttribute("stroke", active ? "#0E3B70" : "#2E75C4");
      line.setAttribute("stroke-width", active ? strokeWidth + 3 : strokeWidth);
      line.setAttribute("opacity", active ? 1 : opacity);
    };

    line.addEventListener("mouseenter", () => {
      highlightEdge(true);
      if (typeof opts.onHoverCollaboration === "function") {
        opts.onHoverCollaboration(collab);
      }
    });

    line.addEventListener("mouseleave", () => {
      highlightEdge(false);
      if (typeof opts.onLeaveCollaboration === "function") {
        opts.onLeaveCollaboration();
      }
    });

    line.addEventListener("click", () => {
      if (typeof opts.onSelectCollaboration === "function") {
        opts.onSelectCollaboration(collab);
      }
    });

    edgeGroup.appendChild(line);

    // Edge midpoint label badge showing publication count
    const mx = (n1.x + n2.x) / 2;
    const my = (n1.y + n2.y) / 2;

    const badgeGroup = svgEl("g", {
      transform: `translate(${mx}, ${my})`,
      style: "cursor: pointer;"
    });

    const badgeWidth = count > 9 ? 64 : 56;
    const badgeBg = svgEl("rect", {
      x: -badgeWidth / 2, y: -10,
      width: badgeWidth, height: 20,
      rx: 10,
      fill: "#FFFFFF",
      stroke: "#2E75C4",
      "stroke-width": 1.5,
      style: "filter: drop-shadow(0 1px 3px rgba(14,59,112,0.12)); transition: fill 0.2s;"
    });

    const badgeText = svgEl("text", {
      x: 0, y: 3.5,
      "text-anchor": "middle",
      "font-size": 10.5,
      "font-weight": 600,
      fill: "#0E3B70",
      "font-family": "var(--font-body)"
    });
    badgeText.textContent = `${count} pub${count > 1 ? 's' : ''}`;

    badgeGroup.appendChild(badgeBg);
    badgeGroup.appendChild(badgeText);

    badgeGroup.addEventListener("mouseenter", () => {
      highlightEdge(true);
      badgeBg.setAttribute("fill", "#EAF2FB");
      if (typeof opts.onHoverCollaboration === "function") {
        opts.onHoverCollaboration(collab);
      }
    });
    badgeGroup.addEventListener("mouseleave", () => {
      highlightEdge(false);
      badgeBg.setAttribute("fill", "#FFFFFF");
      if (typeof opts.onLeaveCollaboration === "function") {
        opts.onLeaveCollaboration();
      }
    });
    badgeGroup.addEventListener("click", () => {
      if (typeof opts.onSelectCollaboration === "function") {
        opts.onSelectCollaboration(collab);
      }
    });

    edgeLabelGroup.appendChild(badgeGroup);
  });

  // Render nodes
  nodes.forEach(node => {
    const ng = svgEl("g", {
      class: "network-node",
      style: "cursor: pointer;"
    });

    const halo = svgEl("circle", {
      cx: node.x, cy: node.y,
      r: 28,
      fill: "#2E75C4",
      opacity: 0,
      style: "transition: opacity 0.2s;"
    });

    const circle = svgEl("circle", {
      cx: node.x, cy: node.y,
      r: 22,
      fill: "#1B54A3",
      stroke: "#FFFFFF",
      "stroke-width": 2.5,
      style: "filter: drop-shadow(0 2px 5px rgba(14,59,112,0.2)); transition: fill 0.2s;"
    });

    const cleaned = node.name.replace(/^Dr\.\s*/i, '').trim();
    const parts = cleaned.split(/\s+/);
    const initials = parts.length === 1 
      ? parts[0].substring(0, 2).toUpperCase() 
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

    const textInitials = svgEl("text", {
      x: node.x, y: node.y + 4.5,
      "text-anchor": "middle",
      "font-size": 11.5,
      "font-weight": 700,
      fill: "#FFFFFF",
      "font-family": "var(--font-body)"
    });
    textInitials.textContent = initials;

    const nameY = node.y + 36;
    const nameLabel = svgEl("text", {
      x: node.x, y: nameY,
      "text-anchor": "middle",
      "font-size": 12,
      "font-weight": 600,
      fill: "#12233F",
      "font-family": "var(--font-body)",
      style: "paint-order: stroke; stroke: #FFFFFF; stroke-width: 3px; stroke-linecap: round; stroke-linejoin: round;"
    });
    nameLabel.textContent = node.name;

    ng.appendChild(halo);
    ng.appendChild(circle);
    ng.appendChild(textInitials);
    ng.appendChild(nameLabel);

    ng.addEventListener("mouseenter", () => {
      halo.setAttribute("opacity", 0.18);
      circle.setAttribute("fill", "#0E3B70");
      if (typeof opts.onHoverNode === "function") {
        opts.onHoverNode(node);
      }
    });

    ng.addEventListener("mouseleave", () => {
      halo.setAttribute("opacity", 0);
      circle.setAttribute("fill", "#1B54A3");
      if (typeof opts.onLeaveNode === "function") {
        opts.onLeaveNode();
      }
    });

    ng.addEventListener("click", () => {
      if (typeof opts.onSelectNode === "function") {
        opts.onSelectNode(node);
      }
    });

    nodeGroup.appendChild(ng);
  });

  container.innerHTML = "";
  container.appendChild(svg);
}
