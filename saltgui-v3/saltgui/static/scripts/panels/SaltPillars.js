import {Panel} from "./Panel.js";
import {Utils} from "../Utils.js";

export class SaltPillarsPanel extends Panel {

  constructor () {
    super("salt-pillars");

    this.addTitle("Infrastructure Secret Monolith");
    this.addMsg();

    this.pillarsElement = Utils.createDiv("salt-pillars-layout");
    this.div.appendChild(this.pillarsElement);

    this.minionsPillarData = {};
    this.currentMinion = null;
    this.viewMode = "explorer"; // explorer or architect
    this.pillarFiles = [];
    this.pillarPath = "/srv/pillar";
    this.masterMinionId = "imsadmin";
  }

  onShow () {
    this._refresh();
  }

  _refresh () {
    this.setMsg("Synchronizing infrastructure secrets...");
    
    // Fetch all pillars for all minions
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: "*",
      fun: "pillar.items"
    }).then(res => {
      this.minionsPillarData = res.return[0];
      this._renderPillars();
      this.setMsg("");
    }).catch(err => {
      this.setMsg("Error fetching pillars: " + err, true);
    });
  }

  _renderPillars () {
    this.pillarsElement.innerHTML = `
      <div class="pillar-panel-pro">
        <div class="panel-header-pro">
          <div class="panel-title-pro">Fleet Source Files</div>
          <button id="add-pillar-btn" class="cmd-pill add-btn" style="font-size: 0.6rem;">+ New Pillar</button>
        </div>
        <div class="panel-body-pro" id="architect-file-list">
          ${this._renderFileList()}
        </div>
      </div>

      <div class="pillar-panel-pro">
        <div class="panel-header-pro">
          <div class="panel-title-pro">Top File Architect</div>
          <div style="display: flex; gap: 10px;">
            <button id="edit-top-btn" class="cmd-pill" style="font-size: 0.6rem;">Edit top.sls</button>
            <button id="global-refresh-btn" class="cmd-pill" style="font-size: 0.6rem; color: var(--term-green);">Pulse Refresh</button>
          </div>
        </div>
        <div class="panel-body-pro" id="top-file-content">
          ${this._renderTopFileView()}
        </div>
      </div>
      
      <div id="pillar-editor-viewport" style="display:none; position: fixed; top: 10%; left: 10%; width: 80%; height: 80%; z-index: 2000; background: #0a0a0f; border: 1px solid #333; border-radius: 20px; padding: 20px; box-shadow: 0 50px 100px rgba(0,0,0,0.8);"></div>
    `;

    this._setupEventListeners();
  }

  _renderFileList () {
    const files = this.pillarFiles.filter(f => f !== "." && f !== ".." && f !== "top.sls");
    return `
      <div class="architect-file-list">
        ${files.length > 0 ? files.map(file => `
          <div class="pillar-file-item" data-file="${file}">
            <div class="file-info">
              <div class="file-icon">📄</div>
              <div class="file-name">${file}</div>
            </div>
            <button class="cmd-pill edit-file-btn" data-file="${file}" style="font-size: 0.6rem;">Edit</button>
          </div>
        `).join('') : `<div class="empty-state">No source files found</div>`}
      </div>
    `;
  }

  _renderTopFileView () {
    // We'll read top.sls to show assignments
    return `<div class="empty-state">Loading assignment architecture...</div>`;
  }

  _setupEventListeners () {
    const fileList = this.pillarsElement.querySelector("#architect-file-list");
    if (fileList) {
      fileList.querySelectorAll(".edit-file-btn").forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          this._editFile(btn.dataset.file);
        };
      });
      
      fileList.querySelectorAll(".pillar-file-item").forEach(item => {
        item.onclick = () => {
          this._editFile(item.dataset.file);
        };
      });
    }

    const addBtn = this.pillarsElement.querySelector("#add-pillar-btn");
    if (addBtn) addBtn.onclick = () => this._addPillar();

    const editTopBtn = this.pillarsElement.querySelector("#edit-top-btn");
    if (editTopBtn) editTopBtn.onclick = () => this._editFile("top.sls");

    const globalRefresh = this.pillarsElement.querySelector("#global-refresh-btn");
    if (globalRefresh) {
      globalRefresh.onclick = () => {
        globalRefresh.innerHTML = "Synchronizing...";
        this.api.apiRequest("POST", "/", {
          client: "local",
          tgt: "*",
          fun: "saltutil.refresh_pillar"
        }).then(() => {
          globalRefresh.innerHTML = "Pulse Refresh";
          this._refresh();
        }).catch(err => {
          this.setMsg("Refresh failed: " + err, true);
          globalRefresh.innerHTML = "Pulse Refresh";
        });
      };
    }
  }

  _loadFiles () {
    this.setMsg("Browsing architect sources...");
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: this.masterMinionId,
      fun: "file.readdir",
      arg: [this.pillarPath]
    }).then(res => {
      this.pillarFiles = res.return[0][this.masterMinionId] || [];
      this._renderPillars();
      this._loadTopFile();
      this.setMsg("");
    }).catch(err => {
      this.api.apiRequest("POST", "/", {
        client: "local",
        tgt: this.masterMinionId,
        fun: "file.mkdir",
        arg: [this.pillarPath]
      }).then(() => this._loadFiles());
    });
  }

  _loadTopFile () {
    const fullPath = `${this.pillarPath}/top.sls`;
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: this.masterMinionId,
      fun: "file.read",
      arg: [fullPath]
    }).then(res => {
      const content = res.return[0][this.masterMinionId];
      this._parseAndRenderTop(content);
    }).catch(() => {
      document.getElementById("top-file-content").innerHTML = `<div class="empty-state">No top.sls found. Create one to begin assignment.</div>`;
    });
  }

  _parseAndRenderTop (content) {
    const container = document.getElementById("top-file-content");
    // Simple naive parser for YAML top file
    const lines = content.split('\n');
    let currentEnv = "";
    let html = `<div class="assignment-grid">`;
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      
      if (line.match(/^\S/)) {
        // New environment (e.g. base:)
        currentEnv = trimmed.replace(':', '');
        html += `</div><div class="assignment-env"><div class="env-header">${currentEnv}</div>`;
      } else if (line.match(/^\s{2,}\S/)) {
        // New target (e.g. '*')
        const target = trimmed.replace(':', '');
        html += `<div class="mapping-row"><div class="target-spec">${target}</div><div class="pillar-tags">`;
      } else if (line.match(/^\s{4,}- \S/)) {
        // New pillar file
        const pillar = trimmed.replace('- ', '');
        html += `<span class="pillar-tag">${pillar}</span>`;
      }
    });
    
    html += `</div></div></div>`;
    container.innerHTML = html;
  }

  _showEditor (filename, content) {
    const editorViewport = document.getElementById("pillar-editor-viewport");
    editorViewport.style.display = "flex";
    
    editorViewport.innerHTML = `
      <div class="pillar-editor-container">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="color: var(--pillar-gold); font-weight: 800; font-size: 0.9rem; letter-spacing: 1px;">EDITING SOURCE: ${filename}</div>
          <button id="close-editor-btn" class="cmd-pill" style="font-size: 0.6rem;">Cancel</button>
        </div>
        <textarea id="pillar-editor-area" class="pillar-editor-textarea" spellcheck="false" placeholder="# YAML Architecture...">${content}</textarea>
        <div class="pillar-editor-actions">
          <button id="save-pillar-btn" class="cmd-pill" style="background: var(--pillar-gold); color: #000; border: none; font-weight: 800;">Commit & Sync Fleet</button>
        </div>
      </div>
    `;
    
    editorViewport.querySelector("#close-editor-btn").onclick = () => {
      editorViewport.style.display = "none";
    };
    
    editorViewport.querySelector("#save-pillar-btn").onclick = () => {
      const newContent = document.getElementById("pillar-editor-area").value;
      this._saveFile(filename, newContent);
      editorViewport.style.display = "none";
    };
  }

  _loadFiles () {
    this.setMsg("Browsing architect sources...");
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: this.masterMinionId,
      fun: "file.readdir",
      arg: [this.pillarPath]
    }).then(res => {
      this.pillarFiles = res.return[0][this.masterMinionId] || [];
      this._renderPillars();
      this.setMsg("");
    }).catch(err => {
      // Create directory if it doesn't exist
      this.api.apiRequest("POST", "/", {
        client: "local",
        tgt: this.masterMinionId,
        fun: "file.mkdir",
        arg: [this.pillarPath]
      }).then(() => this._loadFiles());
    });
  }

  _editFile (filename) {
    const fullPath = `${this.pillarPath}/${filename}`;
    this.setMsg(`Reading ${filename}...`);
    
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: this.masterMinionId,
      fun: "file.read",
      arg: [fullPath]
    }).then(res => {
      const content = res.return[0][this.masterMinionId];
      this._showEditor(filename, content);
      this.setMsg("");
    });
  }

  _showEditor (filename, content) {
    const architectMain = document.getElementById("architect-main");
    const editorViewport = document.getElementById("pillar-editor-viewport");
    
    architectMain.style.display = "none";
    editorViewport.style.display = "flex";
    
    editorViewport.innerHTML = `
      <div class="pillar-editor-container">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="color: var(--pillar-gold); font-weight: 800;">EDITING: ${filename}</div>
          <button id="close-editor-btn" class="cmd-pill" style="font-size: 0.6rem;">Cancel</button>
        </div>
        <textarea id="pillar-editor-area" class="pillar-editor-textarea" spellcheck="false">${content}</textarea>
        <div class="pillar-editor-actions">
          <button id="save-pillar-btn" class="cmd-pill" style="background: var(--pillar-gold); color: #000; border: none;">Commit to Master</button>
        </div>
      </div>
    `;
    
    editorViewport.querySelector("#close-editor-btn").onclick = () => {
      architectMain.style.display = "flex";
      editorViewport.style.display = "none";
    };
    
    editorViewport.querySelector("#save-pillar-btn").onclick = () => {
      const newContent = document.getElementById("pillar-editor-area").value;
      this._saveFile(filename, newContent);
    };
  }

  _saveFile (filename, content) {
    const fullPath = `${this.pillarPath}/${filename}`;
    this.setMsg(`Committing ${filename}...`);
    
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: this.masterMinionId,
      fun: "file.write",
      arg: [fullPath, content]
    }).then(() => {
      this.setMsg(`${filename} committed successfully!`);
      setTimeout(() => {
        this._loadFiles();
        // Trigger global refresh
        this.api.apiRequest("POST", "/", { client: "local", tgt: "*", fun: "saltutil.refresh_pillar" });
      }, 1000);
    });
  }

  _addPillar () {
    const name = prompt("Enter new pillar filename (e.g. users.sls):");
    if (name) {
      const filename = name.endsWith(".sls") ? name : name + ".sls";
      this._saveFile(filename, "# New Salt Pillar Architecture\n\n");
    }
  }

  _showPillarData (minionId) {
    this.currentMinion = minionId;
    const title = document.getElementById("pillar-focus-id");
    if (title) title.innerText = `Decrypted: ${minionId}`;

    const container = document.getElementById("pillar-tree-container");
    container.innerHTML = "";
    
    const data = this.minionsPillarData[minionId];
    if (data && typeof data === 'object') {
      container.appendChild(this._buildTree(data));
    } else {
      container.innerHTML = `<div class="empty-state">No pillar data found for ${minionId}</div>`;
    }
  }

  _buildTree (data, label = "root") {
    const root = Utils.createDiv("pillar-tree-root");
    
    Object.keys(data).sort().forEach(key => {
      const val = data[key];
      const node = Utils.createDiv("pillar-tree-node");
      const header = Utils.createDiv("node-header");
      
      const isObject = val !== null && typeof val === 'object';
      
      if (isObject) {
        header.innerHTML = `
          <div class="node-toggle">▸</div>
          <div class="node-key">${key}</div>
        `;
        const children = Utils.createDiv("node-children");
        children.appendChild(this._buildTree(val, key));
        
        header.onclick = (e) => {
          e.stopPropagation();
          const toggle = header.querySelector(".node-toggle");
          toggle.classList.toggle("open");
          children.classList.toggle("active");
          toggle.innerText = children.classList.contains("active") ? "▾" : "▸";
        };
        
        node.appendChild(header);
        node.appendChild(children);
      } else {
        header.innerHTML = `
          <div class="node-toggle" style="visibility: hidden;">▸</div>
          <div class="node-key">${key}:</div>
          <div class="node-value">${val === null ? 'null' : val}</div>
        `;
        node.appendChild(header);
      }
      
      root.appendChild(node);
    });
    
    return root;
  }
}
