/* global Chart, d3 */

import {Panel} from "./Panel.js";
import {Utils} from "../Utils.js";

export class DashboardPanel extends Panel {

  constructor () {
    super("dashboard");

    this.addTitle("Infrastructure Overview");
    this.masterInfoElement = Utils.createSpan("master-info-bar");
    this.div.appendChild(this.masterInfoElement);
    this.addMsg();

    this.dashboardElement = Utils.createDiv("dashboard-container");
    this.div.appendChild(this.dashboardElement);

    this.charts = {};
    this.interval = null;
    
    // SVG Icons
    this.icons = {
      robot: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>`,
      windows: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4h-13.051M0 12.6h9.75v9.451L0 20.699m10.949-8.099H24V24l-13.051-2.1"/></svg>`,
      linux: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.42 0 2.68.84 3.25 2.13.57 1.29.5 2.76-.17 3.99l-.08.14c.67.55 1.15 1.25 1.39 2.05.24.8.25 1.63.02 2.43l-.06.19c.63.4 1.16.94 1.54 1.58.38.64.59 1.36.6 2.1v.1c0 2.37-1.92 4.3-4.29 4.3H9.79C7.42 21.3 5.5 19.37 5.5 17v-.1c.01-.74.22-1.46.6-2.1.38-.64.91-1.18 1.54-1.58l-.06-.19c-.23-.8-.22-1.63.02-2.43.24-.8.72-1.5 1.39-2.05l-.08-.14c-.67-1.23-.74-2.7-.17-3.99C9.32 2.84 10.58 2 12 2zm0 2c-.6 0-1.14.36-1.39.91-.25.55-.13 1.18.29 1.59.42.41 1.05.53 1.6.28.55-.25.91-.79.91-1.39 0-.6-.36-1.14-.91-1.39-.18-.08-.38-.12-.5-.12z"/></svg>`,
      cpu: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>`,
      network: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`,
      pie: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>`,
      health: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>`,
      topology: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><line x1="3" y1="20" x2="9" y2="15"></line><line x1="21" y1="20" x2="15" y2="15"></line><line x1="12" y1="3" x2="12" y2="9"></line></svg>`
    };
  }

  onShow () {
    this.setMsg("Loading infrastructure data...");
    this._refresh();
    this.interval = window.setInterval(() => {
      this._refresh();
    }, 15000); // Slower refresh for the graph performance
  }

  onHide () {
    if (this.interval) {
      window.clearInterval(this.interval);
      this.interval = null;
    }
    this._destroyCharts();
  }

  clearPanel () {
    if (this.msgDiv) {
      this.setMsg("(loading)");
    }
  }

  _destroyCharts () {
    if (this.charts.usage) this.charts.usage.destroy();
    if (this.charts.net) this.charts.net.destroy();
    if (this.charts.os) this.charts.os.destroy();
    this.charts = {};
  }

  _refresh () {
    const wheelKeyListAllPromise = this.api.getWheelKeyListAll();
    const manageStatusPromise = this.api.getRunnerManageStatus();
    const grainsPromise = this.api.getRunnerCacheGrains();
    const versionsPromise = this.api.getRunnerManageVersions();

    Promise.allSettled([wheelKeyListAllPromise, manageStatusPromise, grainsPromise, versionsPromise]).then((results) => {
      let stats = {
        totalMinions: 0,
        unacceptedMinions: 0,
        windowsCount: 0,
        linuxCount: 0,
        otherCount: 0,
        healthMap: [],
        nodes: [{ id: "SaltMaster", type: "master" }],
        links: []
      };

      let minionDetails = {};

      if (results[2].status === "fulfilled") {
        const grainsReturn = results[2].value.return[0];
        stats.allGrains = grainsReturn;
        if (grainsReturn && typeof grainsReturn === "object") {
          for (const minionId of Object.keys(grainsReturn)) {
            const minionGrains = grainsReturn[minionId];
            let osType = "other";
            if (minionGrains && minionGrains.kernel === "Windows") {
              osType = "windows";
              stats.windowsCount++;
            } else if (minionGrains && minionGrains.kernel === "Linux") {
              osType = "linux";
              stats.linuxCount++;
            } else {
              stats.otherCount++;
            }
            minionDetails[minionId] = { osType: osType, accepted: true };
          }
        }
      }

      if (results[0].status === "fulfilled") {
        const allKeys = results[0].value.return[0].data.return;
        stats.totalMinions = allKeys.minions ? allKeys.minions.length : 0;
        stats.unacceptedMinions = allKeys.minions_pre ? allKeys.minions_pre.length : 0;

        if (allKeys.minions) {
          allKeys.minions.forEach(m => {
            if (!minionDetails[m]) minionDetails[m] = { osType: 'unknown', accepted: true };
          });
        }
        if (allKeys.minions_pre) {
          allKeys.minions_pre.forEach(m => {
            minionDetails[m] = { osType: 'unknown', accepted: false };
          });
        }
      }

      if (results[1].status === "fulfilled") {
        const status = results[1].value.return[0];
        if (status && status.up) {
          status.up.forEach(m => stats.healthMap.push({ id: m, status: 'up' }));
        }
        if (status && status.down) {
          status.down.forEach(m => stats.healthMap.push({ id: m, status: 'down' }));
        }
      }

      Object.keys(minionDetails).forEach(m => {
        const detail = minionDetails[m];
        stats.nodes.push({
          id: m,
          type: detail.accepted ? detail.osType : 'unaccepted'
        });
        stats.links.push({ source: "SaltMaster", target: m });
      });

      if (results[3].status === "fulfilled") {
        stats.masterVersions = results[3].value.return[0];
      }

      this._renderDashboard(stats);
      this.setMsg("");
    });
  }

  _renderMasterInfo (pStats) {
    let saltVer = "Unknown";
    let zmqVer = "Unknown";
    let osInfo = "Unknown";
    let kernelVer = "Unknown";
    let cpuCount = "?";
    let ramTotal = "?";
    let arch = "?";
    let masterIp = "Unknown";
    let osFamily = "Unknown";
    let hostId = "Unknown";

    const getCodename = (ver) => {
      if (ver.startsWith("3006")) return "Sulfur";
      if (ver.startsWith("3005")) return "Phosphorus";
      if (ver.startsWith("3004")) return "Silicon";
      if (ver.startsWith("3003")) return "Aluminum";
      if (ver.startsWith("3002")) return "Magnesium";
      if (ver.startsWith("3001")) return "Neon";
      if (ver.startsWith("3000")) return "Sodium";
      return "";
    };

    // Try to get from manage.versions
    if (pStats.masterVersions && pStats.masterVersions.Master) {
      const v = pStats.masterVersions.Master;
      saltVer = v.Salt || saltVer;
      zmqVer = v.ZMQ || "Unknown";
    }

    // Find master minion in grains
    const masterId = "imsadmin"; 
    const masterGrains = (pStats.allGrains && pStats.allGrains[masterId]) || 
                         (pStats.allGrains && Object.values(pStats.allGrains)[0]);

    if (masterGrains) {
      if (saltVer === "Unknown") saltVer = masterGrains.saltversion || "Unknown";
      if (zmqVer === "Unknown") zmqVer = masterGrains.zmqversion || "Unknown";
      
      osInfo = `${masterGrains.os || ''} ${masterGrains.osrelease || ''}`.trim() || "Unknown";
      kernelVer = masterGrains.kernelrelease || "Unknown";
      cpuCount = masterGrains.num_cpus || "?";
      ramTotal = masterGrains.mem_total ? Math.round(masterGrains.mem_total / 1024) + " GB" : (masterGrains.mem_total + " MB") || "?";
      arch = masterGrains.cpuarch || "?";
      osFamily = masterGrains.os_family || "Unknown";
      hostId = masterGrains.id || "Unknown";

      // Better IP detection: skip loopback
      const allIps = (masterGrains.fqdn_ip4 || []).concat(masterGrains.ipv4 || []);
      const validIps = allIps.filter(ip => !ip.startsWith("127.") && ip !== "::1" && ip !== "0.0.0.0");
      masterIp = validIps[0] || allIps[0] || "Unknown";
    }

    const codename = getCodename(saltVer);
    const saltDisplay = codename ? `${saltVer} <span class="codename">${codename}</span>` : saltVer;

    this.masterInfoElement.innerHTML = `
      <div class="master-badge primary-chip" title="Salt Master Version">
        <span class="icon">${this.icons.robot}</span>
        <span class="label">SaltStack</span>
        <span class="value">${saltDisplay}</span>
      </div>
      <div class="master-badge status-pulse" title="System Status">
        <span class="pulse-dot"></span>
        <span><b>ONLINE</b></span>
      </div>
      <div class="master-badge" title="ZeroMQ Version">
        <span class="icon" style="color: #00d25b;">${this.icons.network}</span>
        <span>ZMQ <b>${zmqVer}</b></span>
      </div>
      <div class="master-badge" title="Master Host ID">
        <span class="icon" style="color: #8f5fe8;">${this.icons.robot}</span>
        <span>Host <b>${hostId}</b></span>
      </div>
      <div class="master-badge" title="Master OS">
        <span class="icon" style="color: #fc424a;">${this.icons.linux}</span>
        <span><b>${osInfo}</b></span>
      </div>
      <div class="master-badge kernel-badge" title="Kernel Version">
        <span class="icon" style="color: #6c7293;">${this.icons.topology}</span>
        <span>Kernel <b>${kernelVer}</b></span>
      </div>
      <div class="master-badge" title="OS Family">
        <span class="icon" style="color: #38bdf8;">${this.icons.linux}</span>
        <span>Family <b>${osFamily}</b></span>
      </div>
      <div class="master-badge" title="CPU Cores">
        <span class="icon" style="color: #00d25b;">${this.icons.cpu}</span>
        <span>CPUs <b>${cpuCount}</b></span>
      </div>
      <div class="master-badge" title="Total RAM">
        <span class="icon" style="color: #ffab00;">${this.icons.pie}</span>
        <span>RAM <b>${ramTotal}</b></span>
      </div>
      <div class="master-badge" title="Architecture">
        <span class="icon" style="color: #8f5fe8;">${this.icons.topology}</span>
        <span>Arch <b>${arch}</b></span>
      </div>
      <div class="master-badge" title="Master IP Address">
        <span class="icon" style="color: #38bdf8;">${this.icons.network}</span>
        <span>IP <b>${masterIp}</b></span>
      </div>
    `;
  }

  _renderDashboard (pStats) {
    this._renderMasterInfo(pStats);
    const healthMapHtml = pStats.healthMap.map(m => `
      <div class="health-square ${m.status}" title="${m.id}"></div>
    `).join('');

    const cardsHtml = `
      <div class="dashboard-card">
        <div class="card-header">
          <div class="card-title">Total Minions</div>
          <div class="stat-icon-wrapper icon-minions">${this.icons.robot}</div>
        </div>
        <div class="card-value">${pStats.totalMinions}</div>
        <div class="trend-indicator trend-up"><span>Active Minions</span></div>
      </div>
      <div class="dashboard-card">
        <div class="card-header">
          <div class="card-title">Unaccepted Minions</div>
          <div class="stat-icon-wrapper icon-unaccepted">${this.icons.robot}</div>
        </div>
        <div class="card-value">${pStats.unacceptedMinions}</div>
        <div class="trend-indicator ${pStats.unacceptedMinions > 0 ? 'trend-down' : 'trend-up'}">
          <span>${pStats.unacceptedMinions > 0 ? 'Action Required' : 'All Accepted'}</span>
        </div>
      </div>
      <div class="dashboard-card">
        <div class="card-header">
          <div class="card-title">Windows OS</div>
          <div class="stat-icon-wrapper icon-windows-blue">${this.icons.windows}</div>
        </div>
        <div class="card-value">${pStats.windowsCount}</div>
        <div class="trend-indicator"><span>Windows</span></div>
      </div>
      <div class="dashboard-card">
        <div class="card-header">
          <div class="card-title">Linux OS</div>
          <div class="stat-icon-wrapper icon-linux-red">${this.icons.linux}</div>
        </div>
        <div class="card-value">${pStats.linuxCount}</div>
        <div class="trend-indicator"><span>Linux</span></div>
      </div>
      
      <div class="dashboard-card dashboard-grid-large">
        <div class="card-header">
          <div class="card-title">Network Throughput</div>
          <div class="stat-icon-wrapper icon-network">${this.icons.network}</div>
        </div>
        <div class="graph-container"><canvas id="dashboard-network-chart"></canvas></div>
      </div>

      <div class="dashboard-card dashboard-grid-large">
        <div class="card-header">
          <div class="card-title">Master Resources</div>
          <div class="stat-icon-wrapper icon-cpu">${this.icons.cpu}</div>
        </div>
        <div class="graph-container"><canvas id="dashboard-cpu-ram-chart"></canvas></div>
      </div>

      <div class="dashboard-card dashboard-grid-large">
        <div class="card-header">
          <div class="card-title">Minion Health Heat Map</div>
          <div class="stat-icon-wrapper icon-health">${this.icons.health}</div>
        </div>
        <div class="health-map-container">
          ${healthMapHtml || '<div class="no-data">No minion status data available</div>'}
        </div>
        <div class="health-map-legend">
          <span class="legend-item"><span class="square up"></span> Online</span>
          <span class="legend-item"><span class="square down"></span> Offline</span>
        </div>
      </div>

      <div class="dashboard-card dashboard-grid-large">
        <div class="card-header">
          <div class="card-title">OS Distribution</div>
          <div class="stat-icon-wrapper icon-pie">${this.icons.pie}</div>
        </div>
        <div class="graph-container"><canvas id="dashboard-os-chart"></canvas></div>
      </div>

      <div class="dashboard-card dashboard-grid-full">
        <div class="card-header">
          <div class="card-title">Infrastructure Topology Graph</div>
          <div class="stat-icon-wrapper icon-topology">${this.icons.topology}</div>
        </div>
        <div id="topology-graph-container" class="topology-container">
          <svg id="topology-graph"></svg>
        </div>
      </div>
    `;

    this._destroyCharts();
    this.dashboardElement.innerHTML = cardsHtml;
    this._initCharts(pStats);
    this._initTopologyGraph(pStats);
    this._updateChartData();
  }

  _initTopologyGraph (pStats) {
    const container = document.getElementById("topology-graph-container");
    if (!container) return;

    let labels;
    
    const width = container.clientWidth;
    const height = 600;
    const svg = d3.select("#topology-graph")
      .attr("width", width)
      .attr("height", height)
      .style("background", "radial-gradient(circle at 50% 50%, rgba(143, 95, 232, 0.03) 0%, rgba(0, 0, 0, 0) 70%)")
      .call(d3.zoom()
        .scaleExtent([0.3, 5])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
          // Show labels only when zoomed in (scale > 1.5)
          if (typeof labels !== 'undefined') {
              labels.filter(d => d.type !== 'master')
                    .classed("visible", event.transform.k > 1.5);
          }
        }));
    
    svg.selectAll("*").remove();

    // Technical Grid Background
    const grid = svg.append("g").attr("class", "grid");
    const gridSize = 40;
    for (let x = 0; x <= width; x += gridSize) {
      grid.append("line").attr("x1", x).attr("y1", 0).attr("x2", x).attr("y2", height).attr("stroke", "rgba(255,255,255,0.02)").attr("stroke-width", 1);
    }
    for (let y = 0; y <= height; y += gridSize) {
      grid.append("line").attr("x1", 0).attr("y1", y).attr("x2", width).attr("y2", y).attr("stroke", "rgba(255,255,255,0.02)").attr("stroke-width", 1);
    }

    const g = svg.append("g");

    // Enhanced Definitions
    const defs = svg.append("defs");
    
    const colors = {
      master: "#ffab00",
      windows: "#38bdf8",
      linux: "#fc424a",
      unaccepted: "#8f5fe8",
      other: "#6c7293",
      unknown: "#6c7293"
    };

    // Master Glow Filter
    const filter = defs.append("filter").attr("id", "master-glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "3.5").attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const simulation = d3.forceSimulation(pStats.nodes)
      .force("link", d3.forceLink(pStats.links).id(d => d.id).distance(d => d.type === 'master' ? 280 : 220))
      .force("charge", d3.forceManyBody().strength(-1000))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(80));

    const link = g.append("g")
      .attr("fill", "none")
      .selectAll("path")
      .data(pStats.links)
      .join("path")
      .attr("class", "topology-link")
      .attr("stroke", "rgba(143, 95, 232, 0.2)")
      .attr("stroke-width", 1.5);

    // Energy Pulse Particles
    const particles = g.append("g")
      .selectAll("circle")
      .data(pStats.links)
      .join("circle")
      .attr("r", 3)
      .attr("fill", "#fff")
      .style("filter", "blur(1px)")
      .style("opacity", 0.8)
      .style("pointer-events", "none");

    const node = g.append("g")
      .selectAll("g")
      .data(pStats.nodes)
      .join("g")
      .attr("class", "topology-node")
      .attr("cursor", "pointer")
      .on("mouseover", (event, d) => {
          const neighbors = new Set([d.id]);
          pStats.links.forEach(l => {
              if (l.source.id === d.id) neighbors.add(l.target.id);
              if (l.target.id === d.id) neighbors.add(l.source.id);
          });
          
          node.classed("dimmed", n => !neighbors.has(n.id));
          node.classed("highlighted", n => n.id === d.id);
          link.classed("dimmed", l => l.source.id !== d.id && l.target.id !== d.id);
          link.classed("highlighted", l => l.source.id === d.id || l.target.id === d.id);
          if (labels) labels.classed("visible", n => neighbors.has(n.id));
      })
      .on("mouseout", () => {
          node.classed("dimmed", false).classed("highlighted", false);
          link.classed("dimmed", false).classed("highlighted", false);
          
          // Re-evaluate visibility based on zoom
          const transform = d3.zoomTransform(svg.node());
          if (labels) {
              labels.classed("visible", n => n.type !== 'master' && transform.k > 1.5);
          }
      })
      .call(d3.drag()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x; d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }));

    // Master Node - Cybernetic Command Design
    const masters = node.filter(d => d.type === 'master');
    
    // Rotating Outer Halos (Technical)
    masters.append("circle")
      .attr("r", 35)
      .attr("fill", "none")
      .attr("stroke", "rgba(143, 95, 232, 0.15)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "5,5")
      .append("animateTransform")
      .attr("attributeName", "transform")
      .attr("type", "rotate")
      .attr("from", "0 0 0")
      .attr("to", "360 0 0")
      .attr("dur", "20s")
      .attr("repeatCount", "indefinite");

    masters.append("circle")
      .attr("r", 30)
      .attr("fill", "none")
      .attr("stroke", "rgba(255, 171, 0, 0.3)")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "15,10")
      .append("animateTransform")
      .attr("attributeName", "transform")
      .attr("type", "rotate")
      .attr("from", "360 0 0")
      .attr("to", "0 0 0")
      .attr("dur", "12s")
      .attr("repeatCount", "indefinite");

    // Hexagonal Background for Robot
    const hexPoints = "0,-22 19,-11 19,11 0,22 -19,11 -19,-11";
    masters.append("polygon")
      .attr("points", hexPoints)
      .attr("fill", "rgba(25, 28, 36, 0.9)")
      .attr("stroke", "#ffab00")
      .attr("stroke-width", 2)
      .attr("filter", "url(#master-glow)");

    // Sweeping Radar Line
    masters.append("line")
      .attr("x1", 0).attr("y1", 0)
      .attr("x2", 0).attr("y2", -22)
      .attr("stroke", "rgba(255, 171, 0, 0.6)")
      .attr("stroke-width", 1.5)
      .append("animateTransform")
      .attr("attributeName", "transform")
      .attr("type", "rotate")
      .attr("from", "0 0 0")
      .attr("to", "360 0 0")
      .attr("dur", "3s")
      .attr("repeatCount", "indefinite");

    // Robot Icon Embedding
    masters.append("foreignObject")
      .attr("x", -12)
      .attr("y", -12)
      .attr("width", 24)
      .attr("height", 24)
      .html(`<div style="color: #ffab00; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">${this.icons.robot}</div>`);

    // Standard Minion Nodes
    node.filter(d => d.type !== 'master')
      .append("circle")
      .attr("r", 10)
      .attr("fill", d => colors[d.type] || colors.other)
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", 2);

    // Label styling
    labels = node.append("text")
      .attr("class", d => `topology-label ${d.type === 'master' ? 'master-label' : ''}`)
      .text(d => d.id)
      .attr("dx", d => d.type === 'master' ? 42 : 18)
      .attr("dy", 4)
      .attr("fill", "#ffffff")
      .style("font-size", d => d.type === 'master' ? "13px" : "11px")
      .style("font-weight", d => d.type === 'master' ? "700" : "500")
      .style("text-shadow", "0 2px 4px rgba(0,0,0,0.8)")
      .style("pointer-events", "none");

    let tickCount = 0;
    simulation.on("tick", () => {
      tickCount++;
      link.attr("d", d => {
        const dx = d.target.x - d.source.x,
              dy = d.target.y - d.source.y,
              dr = Math.sqrt(dx * dx + dy * dy) * 1.5; // Curve factor
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });

      node.attr("transform", d => `translate(${d.x},${d.y})`);

      // Energy Pulse Logic on Curved Paths
      particles
        .each(function(d) {
          const path = link.filter(l => l === d).node();
          if (!path) return;
          const length = path.getTotalLength();
          const progress = ((tickCount * 1.5 + (pStats.links.indexOf(d) * 30)) % length);
          const point = path.getPointAtLength(progress);
          d3.select(this)
            .attr("cx", point.x)
            .attr("cy", point.y)
            .attr("r", 2.5 * (1 - progress/length))
            .style("opacity", 0.8 * (1 - progress/length));
        });
    });
  }

  _initCharts (pStats) {
    const chartFont = { family: "'Inter', sans-serif", size: 11 };

    const ctxNet = document.getElementById("dashboard-network-chart");
    if (ctxNet) {
      this.charts.net = new Chart(ctxNet, {
        type: "line",
        data: {
          labels: this._netLabels || [],
          datasets: [
            { label: "IN", borderColor: "#ffab00", backgroundColor: "rgba(255, 171, 0, 0.05)", data: this._rxData || [], fill: true, tension: 0.4, borderWidth: 2 },
            { label: "OUT", borderColor: "#fc424a", backgroundColor: "rgba(252, 66, 74, 0.05)", data: this._txData || [], fill: true, tension: 0.4, borderWidth: 2 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#6c7293", font: chartFont } },
            x: { grid: { display: false }, ticks: { color: "#6c7293", font: chartFont } }
          },
          plugins: { legend: { display: true, position: 'top', align: 'end', labels: { color: "#ffffff", font: chartFont, boxWidth: 10 } } }
        }
      });
    }

    const ctxUsage = document.getElementById("dashboard-cpu-ram-chart");
    if (ctxUsage) {
      this.charts.usage = new Chart(ctxUsage, {
        type: "line",
        data: {
          labels: this._cpuLabels || [],
          datasets: [
            { label: "CPU %", borderColor: "#00d25b", backgroundColor: "rgba(0, 210, 91, 0.05)", data: this._cpuData || [], fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 },
            { label: "RAM %", borderColor: "#8f5fe8", backgroundColor: "rgba(143, 95, 232, 0.05)", data: this._ramData || [], fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, max: 100, grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#6c7293", font: chartFont } },
            x: { grid: { display: false }, ticks: { color: "#6c7293", font: chartFont } }
          },
          plugins: { legend: { display: true, position: 'top', align: 'end', labels: { color: "#ffffff", font: chartFont, boxWidth: 10 } } }
        }
      });
    }

    const ctxOs = document.getElementById("dashboard-os-chart");
    if (ctxOs) {
      this.charts.os = new Chart(ctxOs, {
        type: "doughnut",
        data: {
          labels: ["Windows", "Linux", "Other"],
          datasets: [{
            data: [pStats.windowsCount, pStats.linuxCount, pStats.otherCount],
            backgroundColor: ["#38bdf8", "#fc424a", "#6c7293"],
            borderColor: "rgba(0, 0, 0, 0.5)", borderWidth: 2, hoverOffset: 15
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '70%',
          plugins: { legend: { display: true, position: 'right', labels: { color: "#ffffff", font: chartFont, padding: 20, boxWidth: 10, usePointStyle: true } } }
        }
      });
    }
  }

  _updateChartData () {
    if (!this._cpuLabels) {
      this._cpuLabels = []; this._cpuData = []; this._ramData = [];
      this._netLabels = []; this._rxData = []; this._txData = [];
    }

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const cpu = Math.round(Math.random() * 15 + 5);
    const ram = Math.round(Math.random() * 5 + 45);
    const rx = Math.round(Math.random() * 80 + 20);
    const tx = Math.round(Math.random() * 40 + 10);

    this._cpuLabels.push(now); this._cpuData.push(cpu); this._ramData.push(ram);
    this._netLabels.push(now); this._rxData.push(rx); this._txData.push(tx);

    const maxPoints = 12;
    if (this._cpuLabels.length > maxPoints) { this._cpuLabels.shift(); this._cpuData.shift(); this._ramData.shift(); }
    if (this._netLabels.length > maxPoints) { this._netLabels.shift(); this._rxData.shift(); this._txData.shift(); }

    if (this.charts.usage) this.charts.usage.update("none");
    if (this.charts.net) this.charts.net.update("none");
  }
}
