import {ParseCommandLine} from "../ParseCommandLine.js";
import {Utils} from "../Utils.js";

export class FilesPanel {
  constructor() {
    this.div = document.createElement("div");
    this.div.className = "panel files-panel";
    this.currentPath = "/srv/salt"; // Folder currently selected for new items
    this.openFile = null;           // File currently open in editor
    this.backendPort = 8000;
    
    // Minions and terminal state
    this.minions = [];
    this.selectedMinions = new Set();
    this.minionSearchQuery = "";
    this.minionsLoaded = false;
    this.selectedOS = "All";
    
    this.initUI();
  }

  async onShow() {
    const lastRoot = localStorage.getItem("explorer_last_root") || "/srv/salt";
    this.loadFolder(lastRoot, this.div.querySelector("#file-tree"));
    this.updateActiveRoot(lastRoot);
    this.loadMinions();
  }

  updateActiveRoot(path) {
    this.div.querySelectorAll(".btn-root").forEach(btn => btn.classList.remove("active"));
    if (path.includes("salt")) this.div.querySelector("#root-salt").classList.add("active");
    if (path.includes("pillar")) this.div.querySelector("#root-pillar").classList.add("active");
  }

  clearPanel() {
    this.div.innerHTML = "";
    this.initUI();
  }

  getBackendUrl(cmd, params = {}) {
    const host = localStorage.getItem("explorer_host") || window.location.hostname;
    const url = new URL(`http://${host}:${this.backendPort}${cmd}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    return url.toString();
  }

  async apiPost(cmd, data) {
    const host = localStorage.getItem("explorer_host") || window.location.hostname;
    const url = `http://${host}:${this.backendPort}${cmd}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Action failed");
    }
    return await response.json();
  }

  initUI() {
    this.div.innerHTML = `
      <div class="file-explorer">
          <div class="file-explorer-sidebar">
              <div class="file-tree-header">
                EXPLORER
                <div class="sidebar-actions">
                    <span class="action-icon" title="New File" id="action-new-file"></span>
                    <span class="action-icon" title="New Folder" id="action-new-folder"></span>
                    <span class="action-icon" title="Refresh" id="action-refresh"></span>
                </div>
              </div>
              <div class="sidebar-roots">
                  <button class="btn-root active" id="root-salt">
                      <span class="root-icon icon-salt"></span>
                      <span class="root-text">Salt States</span>
                  </button>
                  <button class="btn-root" id="root-pillar">
                      <span class="root-icon icon-pillar"></span>
                      <span class="root-text">Pillar Data</span>
                  </button>
              </div>
              <div class="file-tree" id="file-tree"></div>
          </div>
          <div class="file-explorer-content">
              <div class="editor-toolbar">
                  <div class="editor-tabs" id="editor-tabs">
                    <div class="tab active" id="current-tab">No file open</div>
                  </div>
                  <button class="btn-ide" id="btn-save" disabled>Save Changes</button>
              </div>
              <div class="editor-container">
                  <div class="line-numbers" id="line-numbers">1</div>
                  <div style="position:relative; flex:1; display:flex;">
                      <pre class="syntax-highlight" id="syntax-highlight"></pre>
                      <textarea class="code-editor" id="code-editor" spellcheck="false" wrap="off"></textarea>
                  </div>
              </div>
              <!-- TERMINAL COMPONENT -->
              <div class="terminal-container" id="terminal-container">
                  <!-- DRAG HANDLE -->
                  <div class="terminal-resizer" id="terminal-resizer"></div>
                  <div class="terminal-header">
                      <div class="terminal-title">
                          <span class="terminal-title-icon">&#9654;_</span>
                          TERMINAL
                          <span class="terminal-target-badge" id="terminal-target-badge">0 selected</span>
                      </div>
                      <div class="terminal-actions">
                          <button class="btn-terminal-clear" id="btn-terminal-clear">Clear</button>
                      </div>
                  </div>
                  <!-- RESOLVED COMMAND DISPLAY -->
                  <div class="terminal-cmd-display" id="terminal-cmd-display">
                      <span class="terminal-cmd-label">LAST CMD</span>
                      <span class="terminal-cmd-text" id="terminal-cmd-text">—</span>
                  </div>
                  <div class="terminal-log" id="terminal-log">
                      <div class="terminal-line">&#9679; Salt Terminal ready &mdash; use <span style="color:#00f3ff">$minions</span> for selected targets.</div>
                  </div>
                  <div class="terminal-input-row">
                      <span class="terminal-prompt">&gt;_</span>
                      <input type="text" class="terminal-input" id="terminal-input" placeholder="e.g. test.ping $minions" spellcheck="false" />
                      <button class="btn-terminal-run" id="btn-terminal-run">&#9658; Run</button>
                  </div>
              </div>
          </div>
          <!-- MINIONS SIDEBAR (RIGHT) -->
          <div class="minions-sidebar">
              <div class="minions-header">&#11044; Minions</div>
              <div class="minions-controls">
                  <input type="text" class="minions-search" id="minions-search" placeholder="Search minions..." spellcheck="false" />
                  <div class="minions-os-filters" id="minions-os-filters"></div>
                  <div class="minions-bulk-actions">
                      <button class="btn-minion-action" id="btn-minions-select-all">&#10003; All</button>
                      <button class="btn-minion-action" id="btn-minions-select-none">&#10007; None</button>
                  </div>
              </div>
              <div class="minions-list" id="minions-list">
                  <div style="padding:10px 15px; font-size:12px; color:#666;">Loading minions...</div>
              </div>
          </div>
      </div>
    `;

    const editor = this.div.querySelector("#code-editor");
    editor.addEventListener("input", () => {
        this.updateLineNumbers();
        this.highlightSyntax();
    });
    editor.addEventListener("scroll", () => {
        this.div.querySelector("#line-numbers").scrollTop = editor.scrollTop;
        this.div.querySelector("#syntax-highlight").scrollTop = editor.scrollTop;
        this.div.querySelector("#syntax-highlight").scrollLeft = editor.scrollLeft;
    });
    
    // Tab key support in textarea
    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + "    " + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
            this.updateLineNumbers();
        }
    });

    this.div.querySelector("#btn-save").addEventListener("click", () => this.saveFile());

    this.div.querySelector("#root-salt").addEventListener("click", () => {
        this.currentPath = "/srv/salt";
        localStorage.setItem("explorer_last_root", "/srv/salt");
        this.updateActiveRoot("/srv/salt");
        this.loadFolder("/srv/salt", this.div.querySelector("#file-tree"));
    });
    this.div.querySelector("#root-pillar").addEventListener("click", () => {
        this.currentPath = "/srv/pillar";
        localStorage.setItem("explorer_last_root", "/srv/pillar");
        this.updateActiveRoot("/srv/pillar");
        this.loadFolder("/srv/pillar", this.div.querySelector("#file-tree"));
    });
    
    this.div.querySelector("#action-refresh").addEventListener("click", () => this.onShow());
    this.div.querySelector("#action-new-file").addEventListener("click", () => this.promptNewItem('file'));
    this.div.querySelector("#action-new-folder").addEventListener("click", () => this.promptNewItem('folder'));

    // Minions and Terminal event listeners
    const minionSearch = this.div.querySelector("#minions-search");
    minionSearch.addEventListener("input", () => {
      this.minionSearchQuery = minionSearch.value;
      this.renderMinionsList();
    });

    this.div.querySelector("#btn-minions-select-all").addEventListener("click", () => {
      this.minions.forEach(m => this.selectedMinions.add(m.id));
      this.renderMinionsList();
      this.updateTargetBadge();
    });

    this.div.querySelector("#btn-minions-select-none").addEventListener("click", () => {
      this.selectedMinions.clear();
      this.renderMinionsList();
      this.updateTargetBadge();
    });

    this.div.querySelector("#btn-terminal-clear").addEventListener("click", () => {
      const log = this.div.querySelector("#terminal-log");
      if (log) log.innerHTML = "";
      const cmdText = this.div.querySelector("#terminal-cmd-text");
      if (cmdText) cmdText.textContent = "\u2014";
    });

    const terminalInput = this.div.querySelector("#terminal-input");
    const runBtn = this.div.querySelector("#btn-terminal-run");

    const runCmd = () => {
      const cmd = terminalInput.value;
      if (cmd.trim()) {
        this.runTerminalCommand(cmd);
        terminalInput.value = "";
      }
    };

    runBtn.addEventListener("click", runCmd);
    terminalInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        runCmd();
      }
    });

    // --- Terminal resize logic ---
    const terminalContainer = this.div.querySelector("#terminal-container");
    const resizer = this.div.querySelector("#terminal-resizer");
    if (resizer && terminalContainer) {
      let startY = 0;
      let startHeight = 0;
      const onMouseMove = (e) => {
        const delta = startY - e.clientY;
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.9, startHeight + delta));
        terminalContainer.style.height = newHeight + "px";
        terminalContainer.style.minHeight = newHeight + "px";
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.userSelect = "";
      };
      resizer.addEventListener("mousedown", (e) => {
        startY = e.clientY;
        startHeight = terminalContainer.offsetHeight;
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        e.preventDefault();
      });
    }
  }

  updateLineNumbers() {
      const editor = this.div.querySelector("#code-editor");
      const lineNumbers = this.div.querySelector("#line-numbers");
      const lines = editor.value.split("\n").length;
      lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join("<br>");
      this.div.querySelector("#btn-save").disabled = false;
  }

  highlightSyntax() {
      const editor = this.div.querySelector("#code-editor");
      const highlight = this.div.querySelector("#syntax-highlight");
      let code = editor.value;

      // Basic regex highlighting for YAML/SLS/JSON
      code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      
      // Strings in quotes
      code = code.replace(/("[^"]*")/g, '<span class="hl-string">$1</span>');
      code = code.replace(/('[^']*')/g, '<span class="hl-string">$1</span>');
      
      // Keys (text followed by colon)
      code = code.replace(/([\w-]+)\s*:/g, '<span class="hl-key">$1</span>:');
      
      // Numbers
      code = code.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hl-number">$1</span>');
      
      // Comments
      code = code.replace(/(#.*)/g, '<span class="hl-comment">$1</span>');

      highlight.innerHTML = code + "\n";
  }

  async loadFolder(path, container) {
    container.innerHTML = `<div style="padding:5px 15px; font-size:12px; color:#666;">Loading...</div>`;
    const url = this.getBackendUrl('/list', { path });
    
    try {
      // Add a timeout to the fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Server error");
      }
      
      const files = await response.json();
      
      container.innerHTML = "";
      // Folders first, then files
      files.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
      
      if (files.length === 0) {
          container.innerHTML = `<div style="padding:5px 15px; font-size:12px; color:#666;">(empty)</div>`;
          return;
      }

      files.forEach(file => {
          const item = document.createElement("div");
          item.className = `file-item ${file.isDir ? 'directory' : ''}`;
          item.setAttribute("data-name", file.name);
          item.innerHTML = `<span class="file-icon">${file.isDir ? '📁' : '📄'}</span> ${file.name}`;
          
          const childContainer = document.createElement("div");
          childContainer.className = "folder-content";
          
          item.onclick = (e) => {
              e.stopPropagation();
              this.div.querySelectorAll(".file-item").forEach(el => el.classList.remove("active"));
              item.classList.add("active");
              this.currentPath = file.isDir ? file.path : path;

              if (file.isDir) {
                  item.classList.toggle("expanded");
                  childContainer.classList.toggle("show");
                  if (childContainer.classList.contains("show") && !childContainer.innerHTML) {
                      this.loadFolder(file.path, childContainer);
                  }
              } else {
                  this.openFileContent(file.path, file.name);
              }
          };
          
          container.appendChild(item);
          if (file.isDir) container.appendChild(childContainer);
      });
    } catch (err) {
      const msg = err.name === 'AbortError' ? "Connection Timeout" : err.message;
      container.innerHTML = `
        <div style="color:#ef4444; padding:5px 15px; font-size:11px;">
            <b>Error:</b> ${msg}<br>
            <span style="color:#666; font-size:9px; cursor:pointer;" onclick="alert('${url}')">Show URL</span>
        </div>`;
    }
  }

  async openFileContent(path, name) {
      this.openFile = path;
      const editor = this.div.querySelector("#code-editor");
      const tab = this.div.querySelector("#current-tab");
      const saveBtn = this.div.querySelector("#btn-save");
      
      tab.innerText = name;
      editor.value = "Loading...";
      
      try {
          const response = await fetch(this.getBackendUrl('/read', { path }));
          const data = await response.json();
          editor.value = data.content || "";
          this.updateLineNumbers();
          this.highlightSyntax();
          saveBtn.disabled = true;
          saveBtn.innerText = "Save Changes";
      } catch (err) {
          editor.value = "Error loading file: " + err.message;
      }
  }

  async saveFile() {
      if (!this.openFile) return;
      const editor = this.div.querySelector("#code-editor");
      const saveBtn = this.div.querySelector("#btn-save");
      
      saveBtn.innerText = "Saving...";
      saveBtn.disabled = true;
      
      try {
          await this.apiPost('/save', { path: this.openFile, content: editor.value });
          saveBtn.innerText = "Saved!";
          setTimeout(() => {
              saveBtn.innerText = "Save Changes";
          }, 2000);
      } catch (err) {
          alert("Failed to save: " + err.message);
          saveBtn.innerText = "Error!";
          saveBtn.disabled = false;
      }
  }

  promptNewItem(type) {
      const name = prompt(`Enter new ${type} name in: ${this.currentPath}`);
      if (!name) return;
      
      const path = (this.currentPath.endsWith('/') ? this.currentPath : this.currentPath + '/') + name;
      const cmd = type === 'file' ? '/create_file' : '/create_dir';
      
      this.apiPost(cmd, { path })
        .then(() => {
            // Refresh folder list (brute force refresh for now)
            this.onShow();
        })
        .catch(err => alert("Error creating " + type + ": " + err.message));
  }

  async loadMinions() {
    const container = this.div.querySelector("#minions-list");
    if (!container) return;

    if (!this.api) {
      container.innerHTML = `<div style="padding:10px 15px; font-size:12px; color:#ef4444;">API not initialized</div>`;
      return;
    }

    try {
      const keysPromise = this.api.getWheelKeyListAll();
      const connectedPromise = this.api.getWheelMinionsConnected();
      const grainsPromise = this.api.getLocalGrainsItems(null);

      const [keysData, connectedData, grainsData] = await Promise.all([
        keysPromise.catch(e => { console.error(e); return {return: [{data: {return: {minions: []}}}]}; }),
        connectedPromise.catch(e => { console.error(e); return {return: [{data: {return: []}}]}; }),
        grainsPromise.catch(e => { console.error(e); return null; })
      ]);
      
      const allMinions = (keysData && keysData.return && keysData.return[0] && keysData.return[0].data && keysData.return[0].data.return && keysData.return[0].data.return.minions) || [];
      const connectedMinions = new Set((connectedData && connectedData.return && connectedData.return[0] && connectedData.return[0].data && connectedData.return[0].data.return) || []);
      const allGrains = (grainsData && grainsData.return && grainsData.return[0]) ? grainsData.return[0] : {};

      this.minions = allMinions.map(id => {
        const grain = allGrains[id] || {};
        let os = "";
        let ip = "";
        if (typeof grain === 'object') {
          os = grain.os || "";
          const ipField = grain.fqdn_ip4 || grain.ipv4 || [];
          if (Array.isArray(ipField)) {
            const validIps = ipField.filter(addr => addr !== '127.0.0.1' && addr !== '::1');
            ip = validIps.length > 0 ? validIps[0] : (ipField.length > 0 ? ipField[0] : "");
          } else if (typeof ipField === 'string') {
            ip = ipField;
          }
        }
        return {
          id,
          online: connectedMinions.has(id),
          os: os,
          ip: ip
        };
      });
      this.minionsLoaded = true;

      this.renderOSFilters();
      this.renderMinionsList();
    } catch (err) {
      container.innerHTML = `
        <div style="padding:10px 15px; font-size:11px; color:#ef4444;">
          Failed to load minions: ${err.message}<br/>
          <span style="color:#007acc; cursor:pointer;" id="minions-retry">Retry</span>
        </div>`;
      const retryBtn = container.querySelector("#minions-retry");
      if (retryBtn) {
        retryBtn.onclick = () => {
          container.innerHTML = `<div style="padding:10px 15px; font-size:12px; color:#666;">Retrying...</div>`;
          this.loadMinions();
        };
      }
    }
  }

  renderOSFilters() {
    const filterContainer = this.div.querySelector("#minions-os-filters");
    if (!filterContainer) return;
    
    filterContainer.innerHTML = "";
    
    // Always include "All"
    const allBtn = document.createElement("button");
    allBtn.className = `btn-os-filter ${this.selectedOS === "All" ? "active" : ""}`;
    allBtn.innerText = "All";
    allBtn.addEventListener("click", () => {
      this.selectedOS = "All";
      this.renderOSFilters();
      this.renderMinionsList();
    });
    filterContainer.appendChild(allBtn);

    // Other unique OS names
    const uniqueOSes = Array.from(new Set(this.minions.map(m => m.os).filter(Boolean)));
    uniqueOSes.sort().forEach(os => {
      const btn = document.createElement("button");
      btn.className = `btn-os-filter ${this.selectedOS === os ? "active" : ""}`;
      btn.innerText = os;
      btn.addEventListener("click", () => {
        this.selectedOS = os;
        this.renderOSFilters();
        this.renderMinionsList();
      });
      filterContainer.appendChild(btn);
    });
  }

  renderMinionsList() {
    const container = this.div.querySelector("#minions-list");
    if (!container) return;

    const filtered = this.minions.filter(m => {
      const matchesSearch = m.id.toLowerCase().includes(this.minionSearchQuery.toLowerCase());
      const matchesOS = this.selectedOS === "All" || m.os === this.selectedOS;
      return matchesSearch && matchesOS;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="padding:10px 15px; font-size:12px; color:#666;">No minions found</div>`;
      return;
    }

    container.innerHTML = "";
    filtered.forEach(minion => {
      const row = document.createElement("div");
      const isSelected = this.selectedMinions.has(minion.id);
      row.className = `minion-row ${isSelected ? 'selected' : ''}`;
      row.setAttribute("data-id", minion.id);

      const osName = minion.os ? minion.os.replace(/ /g, "-").toLowerCase() : "unknown";
      const osLogoSrc = `static/images/os-${osName}.png`;

      row.innerHTML = `
        <input type="checkbox" class="minion-checkbox" ${isSelected ? 'checked' : ''} />
        <span class="minion-status-dot ${minion.online ? 'online' : 'offline'}"></span>
        <img class="minion-os-logo" src="${osLogoSrc}" onerror="this.onerror=null; this.src='static/images/UNKNOWN.png'" />
        <div class="minion-details">
            <span class="minion-row-name">${minion.id}</span>
            <span class="minion-ip">${minion.ip || 'No IP'}</span>
        </div>
      `;

      // Event listener on checkbox and row click
      const cb = row.querySelector(".minion-checkbox");
      const toggle = (e) => {
        if (e.target !== cb) {
          cb.checked = !cb.checked;
        }
        if (cb.checked) {
          this.selectedMinions.add(minion.id);
          row.classList.add("selected");
        } else {
          this.selectedMinions.delete(minion.id);
          row.classList.remove("selected");
        }
        this.updateTargetBadge();
      };
      
      row.addEventListener("click", toggle);
      cb.addEventListener("click", (e) => e.stopPropagation());

      container.appendChild(row);
    });
  }

  updateTargetBadge() {
    const badge = this.div.querySelector("#terminal-target-badge");
    if (badge) {
      const count = this.selectedMinions.size;
      if (count === 0) {
        badge.innerText = `No target`;
        badge.classList.add("no-target");
        badge.title = "Select at least one minion to run commands";
      } else {
        badge.innerText = `${count} minion${count > 1 ? 's' : ''} selected`;
        badge.classList.remove("no-target");
        badge.title = Array.from(this.selectedMinions).join(", ");
      }
    }
  }

  async runTerminalCommand(cmdString) {
    if (!cmdString.trim()) return;

    const selectedList = Array.from(this.selectedMinions);
    const hasMinionsVar = /\$minion(s)?/i.test(cmdString);

    // GUARD: block execution when no minions selected
    if (selectedList.length === 0) {
      this.writeTerminalLine(`⚠  No minions selected. Please select at least one minion from the panel on the right.`, 'error');
      return;
    }

    const target = selectedList.join(",");
    const targetType = "list";

    // Replace $minions or $minion with target list
    let processedCmd = cmdString;
    if (hasMinionsVar) {
      processedCmd = processedCmd.replace(/\$minion(s)?/gi, target);
    }

    // Update the resolved command display banner
    const cmdTextEl = this.div.querySelector("#terminal-cmd-text");
    if (cmdTextEl) {
      cmdTextEl.textContent = `${processedCmd}  →  [${selectedList.length} minion${selectedList.length > 1 ? 's' : ''}: ${target}]`;
    }

    this.writeTerminalLine(`❯  ${cmdString}`, 'command');
    this.writeTerminalLine(`   ↳ target: ${target}`, 'info');

    // Parse the command line
    const argsArray = [];
    const argsObject = {};
    const err = ParseCommandLine.parseCommandLine(processedCmd, argsArray, argsObject);
    if (err) {
      this.writeTerminalLine(`❌  Parse error: ${err}`, 'error');
      return;
    }

    if (argsArray.length === 0) {
      this.writeTerminalLine(`❌  Empty command`, 'error');
      return;
    }

    const fun = argsArray.shift();
    const isRunner = fun.startsWith("runners.") || fun === "runner";
    const isWheel = fun.startsWith("wheel.") || fun === "wheel";

    let params = {};
    if (isRunner) {
      params = argsObject;
      params.client = "runner";
      params.fun = fun.startsWith("runners.") ? fun.substring(8) : fun;
      if (argsArray.length > 0) params.arg = argsArray;
    } else if (isWheel) {
      params = argsObject;
      params.client = "wheel";
      params.fun = fun.startsWith("wheel.") ? fun.substring(6) : fun;
      params.match = target;
    } else {
      params.client = "local";
      params.fun = fun;
      params.tgt = target;
      params.tgt_type = targetType;
      if (argsArray.length > 0) params.arg = argsArray;
      if (Object.keys(argsObject).length > 0) params.kwarg = argsObject;
    }

    try {
      this.writeTerminalLine(`⧖  Running…`, 'pending');
      const response = await this.api.apiRequest("POST", "/", params);
      if (response && response.return && response.return[0]) {
        const result = response.return[0];
        if (typeof result === 'object' && !Array.isArray(result)) {
          const entries = Object.entries(result);
          this.writeTerminalLine(`─── ${entries.length} result${entries.length !== 1 ? 's' : ''} ───`, 'separator');
          for (const [minion, val] of entries) {
            const isSuccess = val === true || (typeof val === 'string' && val.length > 0);
            const isFail = val === false;
            const icon = isFail ? '✘' : (isSuccess ? '✔' : '○');
            const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
            this.writeTerminalLine(`${icon}  ${minion}`, isFail ? 'result-fail' : 'result-ok');
            if (valStr !== 'true' && valStr !== 'false') {
              this.writeTerminalLine(`   ${valStr}`, 'result-detail');
            }
          }
        } else {
          this.writeTerminalLine(JSON.stringify(result, null, 2), 'output');
        }
      } else {
        this.writeTerminalLine(JSON.stringify(response, null, 2), 'output');
      }
    } catch (e) {
      this.writeTerminalLine(`❌  ${e.message || e}`, 'error');
    }
  }

  writeTerminalLine(text, type = 'output') {
    const log = this.div.querySelector("#terminal-log");
    if (!log) return;
    const line = document.createElement("div");
    line.className = `terminal-line ${type}`;
    line.innerText = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }
}
