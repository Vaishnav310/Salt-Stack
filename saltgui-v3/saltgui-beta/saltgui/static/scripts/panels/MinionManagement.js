import {Panel} from "./Panel.js";
import {Utils} from "../Utils.js";

export class MinionManagementPanel extends Panel {

  constructor () {
    super("minion-management");

    this.addTitle("Fleet Command & Intelligence");
    this.addMsg();

    this.managementElement = Utils.createDiv("management-layout");
    this.div.appendChild(this.managementElement);

    this.minionsData = [];
    this.selectedMinions = new Set();
    this.customCommands = JSON.parse(localStorage.getItem('saltmaster_custom_cmds') || '["test.version"]');
    
    this.quickCommands = [];
    this._isMaximized = false;
  }

  onShow () {
    this._refresh();
  }

  _refresh () {
    this.setMsg("Synchronizing fleet telemetry...");
    const grainsPromise = this.api.getRunnerCacheGrains();
    const wheelKeyListAllPromise = this.api.getWheelKeyListAll();
    
    const fetchCommands = async () => {
      const paths = ["static/command_sets.json", "command_sets.json"];
      for (const path of paths) {
        try {
          const r = await fetch(path + "?t=" + Date.now());
          if (r.ok) {
            const data = await r.json();
            if (data && data.presets) return data.presets;
          }
        } catch (e) {}
      }
      return [];
    };

    const versionsPromise = this.api.getRunnerManageVersions();
    
    Promise.allSettled([grainsPromise, wheelKeyListAllPromise, fetchCommands(), versionsPromise]).then((results) => {
      let grains = {};
      let keys = [];
      let masterSaltVer = "Unknown";

      if (results[0].status === "fulfilled") grains = results[0].value.return[0];
      if (results[1].status === "fulfilled") keys = results[1].value.return[0].data.return.minions || [];
      
      if (results[3].status === "fulfilled" && results[3].value.return && results[3].value.return[0]) {
        const verData = results[3].value.return[0];
        if (verData.Master && verData.Master.Salt) {
          masterSaltVer = verData.Master.Salt.toString();
        } else if (verData.Salt) {
          masterSaltVer = verData.Salt.toString();
        }
      }

      // Fallback: If still unknown, try to find the master version from the grains list (imsadmin usually)
      if (masterSaltVer === "Unknown" || masterSaltVer === "") {
        const masterMinion = grains["imsadmin"] || Object.values(grains).find(g => g.id === "imsadmin");
        if (masterMinion && masterMinion.saltversion) {
          masterSaltVer = masterMinion.saltversion.toString();
        }
      }

      this.masterSaltVer = masterSaltVer;
      
      if (results[2].status === "fulfilled" && results[2].value.length > 0) {
        this.quickCommands = results[2].value;
      } else {
        this.quickCommands = [
          { "label": "Ping", "cmd": "test.ping" },
          { "label": "Highstate", "cmd": "state.apply" }
        ];
      }

      this.minionsData = keys.map(m => {
        const g = grains[m] || {};
        const allIps = (g.fqdn_ip4 || []).concat(g.ipv4 || []);
        const validIps = allIps.filter(ip => 
          ip && 
          !ip.startsWith("127.") && 
          !ip.startsWith("169.254.") && 
          ip !== "::1" && 
          ip !== "0.0.0.0"
        );
        const ips = validIps.length > 0 ? validIps.join(", ") : (allIps[0] || "Unknown");
        
        // RAM calculation
        let ram = "Unknown";
        if (g.mem_total) {
          ram = (g.mem_total > 1024) ? (g.mem_total / 1024).toFixed(1) + " GB" : g.mem_total + " MB";
        }

        // Kernel version is more useful than unreliable HDD grains
        let kernel = g.kernelrelease || "Unknown";

        return {
          id: m,
          version: g.saltversion || "Unknown",
          os: g.os || "Unknown",
          ip: ips,
          osrelease: g.osrelease || "",
          cpu: g.num_cpus || "Unknown",
          ram: ram,
          kernel: kernel,
          fqdn: g.fqdn || "N/A",
          cpu_arch: g.cpuarch || "Unknown",
          virtual: g.virtual || "Physical"
        };
      });

      this._renderManagement();
      this.setMsg("");
    });
  }

  _renderManagement () {
    this.managementElement.innerHTML = `
      <div class="management-toolbar-compact">
        <div class="intel-stat-group">
          <div class="intel-stat-mini"><span class="label">Infrastructure Nodes</span><span class="value" id="total-count-badge">${this.minionsData.length}</span></div>
          <div class="intel-stat-mini"><span class="label">Targeted Fleet</span><span class="value accent" id="sel-count-badge">${this.selectedMinions.size}</span></div>
        </div>
        
        <div class="toolbar-actions">
          <div class="search-field-group">
            <div class="mgmt-custom-dropdown" id="mgmt-filter-dropdown">
              <div class="dropdown-trigger" id="dropdown-trigger">
                <span id="current-filter-label">Global Search</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>
              </div>
              <ul class="dropdown-options" id="dropdown-options">
                <li data-value="all" class="active">Global Search</li>
                <li data-value="id">Node ID</li>
                <li data-value="ip">IP Endpoint</li>
                <li data-value="os">Platform</li>
                <li data-value="version">Release</li>
              </ul>
              <input type="hidden" id="mgmt-filter-field" value="all">
            </div>
            <input type="text" id="mgmt-filter-input" placeholder="Scan infrastructure..." class="mgmt-search-mini">
          </div>
        </div>

        <div class="terminal-action-cell">
          <button id="toggle-terminal" class="terminal-trigger-btn" title="Open Command Center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
          </button>
        </div>
      </div>

      <div class="management-table-wrapper">
        <table class="mgmt-table-pro">
          <thead>
            <tr>
              <th class="col-chk"><input type="checkbox" id="mgmt-select-all" class="corona-chk"></th>
              <th class="col-id">Node Identifier</th>
              <th class="col-ip">IP Endpoint</th>
              <th class="col-fqdn">FQDN</th>
              <th class="col-os">Environment</th>
              <th class="col-version">Release</th>
              <th class="col-cpu">vCPU</th>
              <th class="col-ram">RAM</th>
              <th class="col-kernel">Kernel</th>
              <th class="col-arch">Arch</th>
              <th class="col-virtual">Platform</th>
            </tr>
          </thead>
          <tbody id="mgmt-table-body">
            ${this._renderTableRows(this.minionsData)}
          </tbody>
        </table>
      </div>

      <div id="terminal-sidebar" class="terminal-sidebar">
        <div class="terminal-header-sidebar">
          <div class="terminal-title-row">
            <div class="term-status-dot"></div>
            <span>Command Center</span>
          </div>
          <div class="header-controls">
            <button id="maximize-terminal-btn" class="term-header-btn" title="Toggle Full Screen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" class="max-icon"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" class="restore-icon hidden"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
            </button>
            <button id="close-terminal-btn" class="term-close">&times;</button>
          </div>
        </div>
        
        <div class="terminal-body-sidebar">
          <div id="terminal-display" class="terminal-display-cool">
            <div class="terminal-scanline"></div>
            <div class="term-line info-line"># Target Nodes: <span id="term-live-targets" class="term-highlight">[*]</span></div>
            <div id="term-history" class="term-history-flow"></div>
            <div class="term-input-line">
              <span class="term-prompt">root@saltmaster:~$</span>
              <span class="term-prefix">salt -L</span>
              <input type="text" id="term-input" placeholder="Execute command..." autofocus autocomplete="off">
            </div>
            <div id="term-loader" class="term-loader-hidden">
              <div class="loader-meta">
                <span class="loader-text">Executing Fleet Command</span>
                <span class="loader-percent">Synchronizing...</span>
              </div>
              <div class="loader-track">
                <div class="loader-bar"></div>
              </div>
            </div>
          </div>

          <div class="quick-commands-section">
            <div class="section-label">Enterprise Presets</div>
            <div class="command-pills" id="fleet-presets-list">
              ${this.quickCommands.map(c => `<button class="cmd-pill" data-cmd="${c.cmd}">${c.label}</button>`).join('')}
            </div>
            
            <div class="section-label">Administrative Functions</div>
            <div class="command-pills" id="custom-cmds-list">
              ${this.customCommands.map(c => `<button class="cmd-pill custom" data-cmd="${c}">${c}</button>`).join('')}
              <button id="add-custom-cmd" class="cmd-pill add-btn">+</button>
            </div>
          </div>
        </div>
        
        <div class="terminal-footer-sidebar">
          <button id="term-run-btn" class="term-execute-btn">Execute</button>
        </div>
      </div>
    `;

    this._setupEventListeners();
  }

  _renderTableRows (data) {
    return data.map(m => {
      const osLower = m.os.toLowerCase();
      let osLogo = "UNKNOWN.png";
      if (osLower.includes("ubuntu")) osLogo = "os-ubuntu.png";
      else if (osLower.includes("windows")) osLogo = "os-windows.png";
      else if (osLower.includes("centos")) osLogo = "os-centos.png";
      else if (osLower.includes("debian")) osLogo = "os-debian.png";
      else if (osLower.includes("redhat") || osLower.includes("rhel")) osLogo = "os-redhat.png";
      else if (osLower.includes("fedora")) osLogo = "os-fedora.png";
      else if (osLower.includes("arch")) osLogo = "os-arch.png";
      else if (osLower.includes("suse")) osLogo = "os-suse.png";
      else if (osLower.includes("mint")) osLogo = "os-mint.png";
      else if (osLower.includes("alpine")) osLogo = "os-alpine.png";
      else if (osLower.includes("freebsd")) osLogo = "os-freebsd.png";

      return `
        <tr data-id="${m.id}" class="mgmt-row">
          <td class="col-chk"><input type="checkbox" class="minion-chk corona-chk" data-id="${m.id}" ${this.selectedMinions.has(m.id) ? 'checked' : ''}></td>
          <td class="col-id-cell-pro">${m.id}</td>
          <td class="col-ip-cell-pro">${m.ip}</td>
          <td class="col-fqdn-cell-pro" style="color: #6c7293; font-size: 0.85rem;">${m.fqdn}</td>
          <td>
            <div class="os-badge-pro-logo">
              <img src="static/images/${osLogo}" class="os-logo-img" onerror="this.src='static/images/UNKNOWN.png'">
              <div class="os-text-group">
                <span class="os-text">${m.os}</span>
                <span class="os-sub">${m.osrelease}</span>
              </div>
            </div>
          </td>
          <td><span class="ver-badge-pro ${m.version.split(' ')[0] === this.masterSaltVer.split(' ')[0] ? 'match' : 'mismatch'}">${m.version}</span></td>
          <td><span style="font-weight:700;">${m.cpu}</span></td>
          <td><span style="font-weight:700; color:#fff;">${m.ram}</span></td>
          <td><span style="font-weight:700; color:#8b8ea8;">${m.kernel}</span></td>
          <td><span style="color:#8b8ea8;">${m.cpu_arch}</span></td>
          <td><span class="plat-badge-pro ${m.virtual.toLowerCase()}">${m.virtual}</span></td>
        </tr>
      `;
    }).join('');
  }

  _setupEventListeners () {
    const sidebar = document.getElementById("terminal-sidebar");
    const toggleBtn = document.getElementById("toggle-terminal");
    const closeBtn = document.getElementById("close-terminal-btn");
    const maxBtn = document.getElementById("maximize-terminal-btn");
    const selectAll = document.getElementById("mgmt-select-all");
    const filterInput = document.getElementById("mgmt-filter-input");
    const filterField = document.getElementById("mgmt-filter-field");
    const termInput = document.getElementById("term-input");
    const runBtn = document.getElementById("term-run-btn");
    const addCmdBtn = document.getElementById("add-custom-cmd");

    const maxIcon = maxBtn.querySelector(".max-icon");
    const restoreIcon = maxBtn.querySelector(".restore-icon");

    toggleBtn.onclick = () => sidebar.classList.toggle("active");
    closeBtn.onclick = () => {
      sidebar.classList.remove("active");
      sidebar.classList.remove("maximized");
      maxIcon.classList.remove("hidden");
      restoreIcon.classList.add("hidden");
    };

    maxBtn.onclick = () => {
      sidebar.classList.toggle("maximized");
      maxIcon.classList.toggle("hidden");
      restoreIcon.classList.toggle("hidden");
      sidebar.classList.add("active");
    };

    termInput.onkeydown = (e) => {
      if (e.key === "Enter") this._executeCommand();
    };

    selectAll.onchange = (e) => {
      const chks = document.querySelectorAll(".minion-chk");
      chks.forEach(chk => {
        chk.checked = e.target.checked;
        if (e.target.checked) this.selectedMinions.add(chk.dataset.id);
        else this.selectedMinions.delete(chk.dataset.id);
      });
      this._updateLiveUI();
    };

    this._bindTableEvents();

    const handleFilter = () => {
      const val = filterInput.value.toLowerCase();
      const field = filterField.value;
      const filtered = this.minionsData.filter(m => {
        if (field === "id") return m.id.toLowerCase().includes(val);
        if (field === "ip") return m.ip.toLowerCase().includes(val);
        if (field === "os") return m.os.toLowerCase().includes(val);
        if (field === "version") return m.version.toLowerCase().includes(val);
        return m.id.toLowerCase().includes(val) || 
               m.os.toLowerCase().includes(val) ||
               m.ip.toLowerCase().includes(val);
      });
      document.getElementById("mgmt-table-body").innerHTML = this._renderTableRows(filtered);
      this._bindTableEvents();
    };

    this._setupDropdown();
    filterInput.oninput = handleFilter;
    
    runBtn.onclick = () => this._executeCommand();

    this.managementElement.onclick = (e) => {
      const pill = e.target.closest(".cmd-pill");
      if (pill && pill.dataset.cmd && !pill.classList.contains("add-btn")) {
        termInput.value = pill.dataset.cmd;
        termInput.focus();
      }
    };

    addCmdBtn.onclick = () => {
      const cmd = prompt("Enter custom Salt function:");
      if (cmd && !this.customCommands.includes(cmd)) {
        this.customCommands.push(cmd);
        localStorage.setItem('saltmaster_custom_cmds', JSON.stringify(this.customCommands));
        const list = document.getElementById("custom-cmds-list");
        const pill = document.createElement("button");
        pill.className = "cmd-pill custom";
        pill.dataset.cmd = cmd;
        pill.innerText = cmd;
        list.insertBefore(pill, addCmdBtn);
      }
    };
  }

  _bindTableEvents () {
    document.querySelectorAll(".minion-chk").forEach(chk => {
      chk.onchange = (e) => {
        if (e.target.checked) this.selectedMinions.add(e.target.dataset.id);
        else this.selectedMinions.delete(e.target.dataset.id);
        this._updateLiveUI();
      };
    });
  }

  _updateLiveUI () {
    const badge = document.getElementById("sel-count-badge");
    const termTargets = document.getElementById("term-live-targets");
    if (badge) badge.innerText = this.selectedMinions.size;
    if (termTargets) {
      const list = Array.from(this.selectedMinions).join(",");
      termTargets.innerText = list ? `'${list}'` : '[*]';
    }
  }

  _executeCommand () {
    const cmd = document.getElementById("term-input").value;
    if (!cmd) return;
    if (this.selectedMinions.size === 0) {
      alert("Please select minions first.");
      return;
    }

    const history = document.getElementById("term-history");
    const cmdLine = document.createElement("div");
    cmdLine.className = "term-line";
    cmdLine.innerHTML = `<span class="term-prompt">root@saltmaster:~$</span> <span class="term-prefix">salt -L</span> ${cmd}`;
    history.appendChild(cmdLine);

    const loader = document.getElementById("term-loader");
    const display = document.getElementById("terminal-display");
    
    loader.classList.remove("term-loader-hidden");
    
    const tgt = Array.from(this.selectedMinions).join(",");
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: tgt,
      fun: cmd,
      tgt_type: "list"
    }).then(res => {
      loader.classList.add("term-loader-hidden");
      this._displayTerminalResults(res.return[0]);
      
      display.classList.add("execution-complete-flash");
      setTimeout(() => display.classList.remove("execution-complete-flash"), 1500);
      
    }).catch(err => {
      loader.classList.add("term-loader-hidden");
      const line = document.createElement("div");
      line.className = "term-line error";
      line.innerText = `Error: ${err.toString()}`;
      history.appendChild(line);
    });

    document.getElementById("term-input").value = "";
  }

  _displayTerminalResults (results) {
    const history = document.getElementById("term-history");
    Object.keys(results).forEach(minionId => {
      const result = results[minionId];
      const line = document.createElement("div");
      line.className = "term-line result-block";
      let output = typeof result === 'object' ? JSON.stringify(result, null, 2) : result.toString();
      line.innerHTML = `<span class="term-minion-id">${minionId}:</span> <span class="term-result-val">${output}</span>`;
      history.appendChild(line);
    });
    history.scrollTop = history.scrollHeight;
  }

  _setupDropdown () {
    const dropdown = this.managementElement.querySelector("#mgmt-filter-dropdown");
    const trigger = this.managementElement.querySelector("#dropdown-trigger");
    const filterField = this.managementElement.querySelector("#mgmt-filter-field");
    const label = this.managementElement.querySelector("#current-filter-label");
    const options = this.managementElement.querySelectorAll(".dropdown-options li");

    if (!trigger || !dropdown) return;

    trigger.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    };

    options.forEach(li => {
      li.onclick = (e) => {
        e.stopPropagation();
        const val = li.dataset.value;
        filterField.value = val;
        label.innerText = li.innerText;
        
        options.forEach(l => l.classList.remove("active"));
        li.classList.add("active");
        
        dropdown.classList.remove("open");
        
        // Trigger filter manually
        const filterInput = this.managementElement.querySelector("#mgmt-filter-input");
        if (filterInput) {
          const event = new Event('input', { bubbles: true });
          filterInput.dispatchEvent(event);
        }
      };
    });

    const closeHandler = () => dropdown.classList.remove("open");
    window.addEventListener("click", closeHandler);
    
    // Cleanup old listener if needed (though SaltGUI usually replaces the whole panel)
    this._closeDropdownHandler = closeHandler;
  }
}
