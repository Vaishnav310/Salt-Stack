import {Panel} from "./Panel.js";
import {Utils} from "../Utils.js";

export class SaltStatesPanel extends Panel {

  constructor () {
    super("salt-states");

    this.addTitle("Infrastructure Architect Console");
    this.addMsg();

    this.statesElement = Utils.createDiv("salt-states-layout");
    this.div.appendChild(this.statesElement);

    this.rootPath = "/srv/salt";
    this.masterMinionId = "imsadmin";
    this.currentFile = null;
    this.viewMode = "architect"; // architect (editor) or visualizer (graph)
    this.fileStructure = {};
  }

  onShow () {
    this._refresh();
  }

  _refresh () {
    this.setMsg("Synchronizing state architecture...");
    this._loadTree();
  }

  _loadTree () {
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: this.masterMinionId,
      fun: "file.find",
      arg: [this.rootPath, "name=*.sls"]
    }).then(res => {
      const files = res.return[0][this.masterMinionId] || [];
      this._renderLayout(files);
      this.setMsg("");
    }).catch(err => {
      this.setMsg("Error loading states: " + err, true);
    });
  }

  _renderLayout (files) {
    this.statesElement.innerHTML = `
      <div class="states-explorer">
        <div class="explorer-header">
          <div class="explorer-title">State Repository</div>
          <div class="explorer-actions">
            <button id="add-dir-btn" class="btn-pro" style="padding: 4px 8px;">+ Dir</button>
            <button id="add-file-btn" class="btn-pro" style="padding: 4px 8px;">+ File</button>
          </div>
        </div>
        <div class="explorer-tree" id="states-tree">
          ${this._buildTreeHtml(files)}
        </div>
      </div>

      <div class="states-workspace">
        <div class="workspace-header">
          <div class="workspace-tabs">
            <div class="view-tab ${this.viewMode === 'architect' ? 'active' : ''}" data-mode="architect">Architect (Editor)</div>
            <div class="view-tab ${this.viewMode === 'visualizer' ? 'active' : ''}" data-mode="visualizer">Visualizer (Graph)</div>
          </div>
          <div class="workspace-actions">
             <button id="save-state-btn" class="btn-pro primary" style="display: ${this.viewMode === 'architect' ? 'block' : 'none'}">Commit State</button>
          </div>
        </div>
        <div id="states-viewport" style="flex: 1; display: flex; flex-direction: column;">
          ${this.viewMode === 'architect' ? this._renderEditor() : this._renderGraph()}
        </div>
      </div>
    `;

    this._setupEventListeners();
  }

  _buildTreeHtml (files) {
    // Sort files to handle directory structure
    const tree = {};
    files.forEach(f => {
      const rel = f.replace(this.rootPath + "/", "");
      const parts = rel.split("/");
      let curr = tree;
      parts.forEach((p, i) => {
        if (!curr[p]) curr[p] = (i === parts.length - 1) ? f : {};
        curr = curr[p];
      });
    });

    const renderNode = (obj, name, depth = 0) => {
      if (typeof obj === 'string') {
        return `
          <div class="tree-row file-node" data-path="${obj}" style="padding-left: ${depth * 15 + 10}px">
            <span class="tree-icon">📄</span>
            <span class="tree-text">${name}</span>
          </div>
        `;
      } else {
        return `
          <div class="tree-item">
            <div class="tree-row dir-node" style="padding-left: ${depth * 15 + 10}px">
              <span class="dir-toggle open">▸</span>
              <span class="tree-icon">📁</span>
              <span class="tree-text">${name}</span>
            </div>
            <div class="tree-children active">
              ${Object.keys(obj).map(k => renderNode(obj[k], k, depth + 1)).join('')}
            </div>
          </div>
        `;
      }
    };

    return Object.keys(tree).map(k => renderNode(tree[k], k)).join('');
  }

  _renderEditor () {
    return `
      <div class="states-editor-container">
        <div id="editor-filename" style="color: #6c7293; font-size: 0.75rem; font-weight: 700;">No file selected</div>
        <textarea id="state-editor-area" class="states-editor" spellcheck="false" placeholder="# Start architecting infrastructure..."></textarea>
      </div>
    `;
  }

  _renderGraph () {
    return `<div id="states-graph-viewport"></div>`;
  }

  _setupEventListeners () {
    this.statesElement.querySelectorAll(".view-tab").forEach(tab => {
      tab.onclick = () => {
        this.viewMode = tab.dataset.mode;
        this._loadTree();
        if (this.viewMode === 'visualizer') {
           setTimeout(() => this._initGraph(), 100);
        }
      };
    });

    this.statesElement.querySelectorAll(".file-node").forEach(node => {
      node.onclick = () => {
        this.statesElement.querySelectorAll(".tree-row").forEach(r => r.classList.remove("selected"));
        node.classList.add("selected");
        this._loadFile(node.dataset.path);
      };
    });

    this.statesElement.querySelectorAll(".dir-node").forEach(node => {
      node.onclick = () => {
        const toggle = node.querySelector(".dir-toggle");
        const children = node.nextElementSibling;
        toggle.classList.toggle("open");
        children.classList.toggle("active");
        toggle.innerText = children.classList.contains("active") ? "▸" : "▹";
      };
    });

    const saveBtn = this.statesElement.querySelector("#save-state-btn");
    if (saveBtn) {
      saveBtn.onclick = () => this._saveFile();
    }

    const addFileBtn = this.statesElement.querySelector("#add-file-btn");
    if (addFileBtn) {
      addFileBtn.onclick = () => this._addFile();
    }

    const addDirBtn = this.statesElement.querySelector("#add-dir-btn");
    if (addDirBtn) {
      addDirBtn.onclick = () => this._addDir();
    }
  }

  _addFile () {
    const name = prompt("Enter new SLS filename (e.g. users.sls):");
    if (name) {
      const filename = name.endsWith(".sls") ? name : name + ".sls";
      const path = this.rootPath + "/" + filename;
      this._saveFile(path, "# New Infrastructure State\n\n");
    }
  }

  _addDir () {
    const name = prompt("Enter new directory name:");
    if (name) {
      const path = this.rootPath + "/" + name;
      this.setMsg(`Provisioning directory: ${name}...`);
      this.api.apiRequest("POST", "/", {
        client: "local",
        tgt: this.masterMinionId,
        fun: "file.mkdir",
        arg: [path]
      }).then(() => {
        this.setMsg("Directory provisioned.");
        this._loadTree();
      }).catch(err => {
        this.setMsg("Provisioning failed: " + err, true);
      });
    }
  }

  _loadFile (path) {
    this.currentFile = path;
    this.setMsg(`Reading ${path}...`);
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: this.masterMinionId,
      fun: "file.read",
      arg: [path]
    }).then(res => {
      const content = res.return[0][this.masterMinionId];
      const area = document.getElementById("state-editor-area");
      const label = document.getElementById("editor-filename");
      if (area) area.value = content;
      if (label) label.innerText = path;
      this.setMsg("");
    });
  }

  _saveFile (path = this.currentFile, content = null) {
    if (!path) return;
    const finalContent = content || document.getElementById("state-editor-area").value;
    this.setMsg(`Committing ${path}...`);
    this.api.apiRequest("POST", "/", {
      client: "local",
      tgt: this.masterMinionId,
      fun: "file.write",
      arg: [path, finalContent]
    }).then(() => {
      this.setMsg("State committed successfully!");
      this._loadTree();
    });
  }

  _initGraph () {
    const container = document.getElementById("states-graph-viewport");
    if (!container) return;
    
    // Simulate nodes and links based on includes (in a real app we'd parse the SLS files)
    // For now, let's just create a nice visual representation
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const svg = d3.select(container).append("svg")
      .attr("width", width)
      .attr("height", height)
      .call(d3.zoom().on("zoom", (event) => g.attr("transform", event.transform)));
      
    const g = svg.append("g");
    
    // Placeholder data
    const nodes = [
      { id: "top.sls", group: 1 },
      { id: "init.sls", group: 2 },
      { id: "webserver.sls", group: 3 },
      { id: "database.sls", group: 3 },
      { id: "common.sls", group: 2 }
    ];
    
    const links = [
      { source: "top.sls", target: "init.sls" },
      { source: "init.sls", target: "common.sls" },
      { source: "init.sls", target: "webserver.sls" },
      { source: "init.sls", target: "database.sls" }
    ];
    
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));
      
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("class", "graph-link");
      
    const node = g.append("g")
      .selectAll(".graph-node")
      .data(nodes)
      .enter().append("g")
      .attr("class", "graph-node")
      .call(d3.drag()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }));
        
    node.append("circle").attr("r", 15).attr("fill", "#12121f");
    node.append("text").attr("dx", 20).attr("dy", 5).text(d => d.id);
    
    simulation.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
  }
}
