import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Compass, RotateCcw, ZoomIn, ZoomOut, Eye, Layers, Sparkles, 
  Cpu, Database, Shield, Zap, Info, Filter, X, Search, Maximize2,
  SlidersHorizontal, Target, Crosshair, ArrowRight, Play, ExternalLink,
  Share2, Network
} from 'lucide-react';

export default function Graph3DExplorer({ repos, onSelectRepo, selectedDomain }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Viewport / Camera Transformation State
  const [rotation, setRotation] = useState({ x: 0.32, y: -0.45 });
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [autoRotate, setAutoRotate] = useState(true);

  // Visual Modes & Controls
  const [bloomIntensity, setBloomIntensity] = useState(true);
  const [viewMode, setViewMode] = useState('clusters'); // 'clusters' | 'spherical' | 'starfield'
  const [graphSearch, setGraphSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [filterDomain, setFilterDomain] = useState(selectedDomain || 'all');
  const [hopDepth, setHopDepth] = useState(1);

  // Interaction Refs (Prevent React re-render churn in 60fps loop)
  const isDragging = useRef(false);
  const isPanning = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef(null);
  const rotRef = useRef({ x: 0.32, y: -0.45 });
  const autoRotateRef = useRef(true);
  const zoomRef = useRef(1.0);
  const panRef = useRef({ x: 0, y: 0 });

  // Camera Fly-To Animation Ref
  const targetCam = useRef(null);

  useEffect(() => { rotRef.current = rotation; }, [rotation]);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Distinct chromatic palettes & neon glow for domains
  const DOMAIN_CONFIG = {
    "Databases & Storage": { hex: "#38bdf8", glow: "rgba(56, 189, 248, 0.45)", name: "Databases" },
    "AI & Machine Learning": { hex: "#c084fc", glow: "rgba(192, 132, 252, 0.45)", name: "AI / ML" },
    "Cloud & Infrastructure": { hex: "#2dd4bf", glow: "rgba(45, 212, 191, 0.45)", name: "Cloud & Infra" },
    "Security & Cryptography": { hex: "#f87171", glow: "rgba(248, 113, 113, 0.45)", name: "Security" },
    "Developer Tooling & Compilers": { hex: "#34d399", glow: "rgba(52, 211, 153, 0.45)", name: "Dev Tools" },
    "Web Platforms & Frameworks": { hex: "#fbbf24", glow: "rgba(251, 191, 36, 0.45)", name: "Web Platforms" },
    "Operating Systems & Low-Level": { hex: "#a78bfa", glow: "rgba(167, 139, 250, 0.45)", name: "Systems / OS" },
    "Education & Curated Learning": { hex: "#22d3ee", glow: "rgba(34, 211, 238, 0.45)", name: "Education" },
    "Networking & Distributed Systems": { hex: "#f472b6", glow: "rgba(244, 114, 182, 0.45)", name: "Networking" },
    "Other / General": { hex: "#94a3b8", glow: "rgba(148, 163, 184, 0.4)", name: "General" }
  };

  // Background Starfield Particles
  const backgroundStars = useMemo(() => {
    const stars = [];
    for (let i = 0; i < 220; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1600,
        z: (Math.random() - 0.5) * 1600,
        size: Math.random() * 1.5 + 0.4,
        alpha: Math.random() * 0.6 + 0.2
      });
    }
    return stars;
  }, []);

  // 1. Build Graph Topology & Synthesize Multi-Hop Semantic Relationships
  const { nodes, links, domainClusters, nodeLookup } = useMemo(() => {
    const validRepos = repos.filter((r) => {
      if (filterDomain !== 'all' && r.domain !== filterDomain) return false;
      return true;
    });

    const domainNames = Array.from(new Set(validRepos.map((r) => r.domain).filter(Boolean)));
    const clusterCenters = {};

    domainNames.forEach((d, idx) => {
      const angle = (idx / domainNames.length) * Math.PI * 2;
      const elevation = ((idx % 2 === 0 ? 1 : -1) * 0.35);
      const clusterRadius = 310;
      clusterCenters[d] = {
        x: Math.cos(angle) * clusterRadius,
        y: elevation * 140,
        z: Math.sin(angle) * clusterRadius
      };
    });

    // Create 3D Nodes
    const lookup = {};
    const graphNodes = validRepos.slice(0, 1500).map((repo, idx) => {
      let x = 0, y = 0, z = 0;

      if (viewMode === 'clusters') {
        const center = clusterCenters[repo.domain] || { x: 0, y: 0, z: 0 };
        const phi = Math.acos(-1 + (2 * (idx % 32)) / 32);
        const theta = Math.sqrt(32 * Math.PI) * phi;
        const orbitDist = 55 + (idx % 12) * 14;

        x = center.x + Math.sin(phi) * Math.cos(theta) * orbitDist;
        y = center.y + Math.sin(phi) * Math.sin(theta) * orbitDist;
        z = center.z + Math.cos(phi) * orbitDist;
      } else if (viewMode === 'spherical') {
        const phi = Math.acos(-1 + (2 * idx) / validRepos.length);
        const theta = Math.sqrt(validRepos.length * Math.PI) * phi;
        const r = 360;
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.sin(phi) * Math.sin(theta);
        z = r * Math.cos(phi);
      } else {
        // Starfield galaxy spiral
        const arm = idx % 4;
        const angle = (idx / validRepos.length) * Math.PI * 6 + (arm * (Math.PI / 2));
        const dist = 50 + Math.pow(idx / validRepos.length, 0.7) * 450;
        x = Math.cos(angle) * dist;
        y = ((idx % 30) - 15) * 8;
        z = Math.sin(angle) * dist;
      }

      const size = Math.max(3.2, Math.min(10.5, Math.log10(repo.stars) * 1.75));

      const nodeObj = {
        id: repo.id,
        name: repo.name,
        owner: repo.owner,
        repo: repo,
        domain: repo.domain,
        subsystem: repo.subsystem,
        stars: repo.stars,
        language: repo.language,
        primitives: repo.primitives || [],
        compatibility: repo.compatibility || [],
        color: DOMAIN_CONFIG[repo.domain] || DOMAIN_CONFIG["Other / General"],
        size,
        baseX: x, baseY: y, baseZ: z,
        x, y, z,
        screenX: 0, screenY: 0, screenSize: 0, depth: 0
      };

      lookup[repo.id] = nodeObj;
      return nodeObj;
    });

    // 2. Synthesize High-Signal Relationships & Complementary Links
    const graphLinks = [];
    const maxLinkNodes = Math.min(graphNodes.length, 400);

    for (let i = 0; i < maxLinkNodes; i++) {
      for (let j = i + 1; j < maxLinkNodes; j++) {
        const a = graphNodes[i];
        const b = graphNodes[j];
        
        let strength = 0;
        let relationship = "";

        if (a.subsystem && b.subsystem && a.subsystem === b.subsystem) {
          strength += 3;
          relationship = `Shared Subsystem (${a.subsystem})`;
        }
        const commonPrim = a.primitives.find((p) => b.primitives.includes(p));
        if (commonPrim) {
          strength += 2;
          relationship = `Shared Primitive (${commonPrim})`;
        }
        const commonComp = a.compatibility.find((c) => b.compatibility.includes(c));
        if (commonComp) {
          strength += 2;
          relationship = `Shared Interop (${commonComp})`;
        }

        if (strength >= 3) {
          graphLinks.push({ source: a, target: b, strength, relationship });
        }
      }
    }

    return { nodes: graphNodes, links: graphLinks, domainClusters: domainNames, nodeLookup: lookup };
  }, [repos, filterDomain, viewMode]);

  // Compute Neighbors for Selected or Hovered Node
  const activeFocusNode = selectedNode || hoveredNode;
  const connectedNeighborhood = useMemo(() => {
    if (!activeFocusNode) return { neighborIds: new Set(), activeLinks: [] };

    const neighborIds = new Set([activeFocusNode.id]);
    const activeLinks = [];

    links.forEach((l) => {
      if (l.source.id === activeFocusNode.id) {
        neighborIds.add(l.target.id);
        activeLinks.push(l);
      } else if (l.target.id === activeFocusNode.id) {
        neighborIds.add(l.source.id);
        activeLinks.push(l);
      }
    });

    return { neighborIds, activeLinks };
  }, [activeFocusNode, links]);

  // Smooth Fly-To Animation Helper
  const flyToNode = useCallback((node) => {
    setSelectedNode(node);
    setAutoRotate(false);

    // Calculate angle towards node to center it
    const targetRotY = -Math.atan2(node.baseX, node.baseZ);
    const targetRotX = 0.2;
    targetCam.current = {
      targetRotX,
      targetRotY,
      targetZoom: 1.6,
      frames: 35
    };
  }, []);

  // 3. Render Canvas & 3D Perspective Projection Engine with Dynamic Bloom (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const handleResize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      canvas.width = clientWidth * window.devicePixelRatio;
      canvas.height = clientHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const render = () => {
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;
      const fov = 460;
      const cx = width / 2 + panRef.current.x;
      const cy = height / 2 + panRef.current.y;
      const curZoom = zoomRef.current;

      // Handle Camera Interpolation (Fly-to)
      if (targetCam.current && targetCam.current.frames > 0) {
        const t = targetCam.current;
        rotRef.current.x += (t.targetRotX - rotRef.current.x) * 0.12;
        rotRef.current.y += (t.targetRotY - rotRef.current.y) * 0.12;
        zoomRef.current += (t.targetZoom - zoomRef.current) * 0.12;
        t.frames--;
        if (t.frames === 0) targetCam.current = null;
      } else if (autoRotateRef.current) {
        rotRef.current.y += 0.0024;
      }

      const cosX = Math.cos(rotRef.current.x);
      const sinX = Math.sin(rotRef.current.x);
      const cosY = Math.cos(rotRef.current.y);
      const sinY = Math.sin(rotRef.current.y);

      // Deep Space Canvas Background with Radial Cosmic Vignette
      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, 0, width, height);

      const grad = ctx.createRadialGradient(cx, cy, 80, cx, cy, width * 0.7);
      grad.addColorStop(0, 'rgba(26, 32, 53, 0.6)');
      grad.addColorStop(0.6, 'rgba(10, 14, 24, 0.4)');
      grad.addColorStop(1, 'rgba(7, 10, 18, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Render Background Starfield
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      backgroundStars.forEach((star) => {
        const x1 = star.x * cosY - star.z * sinY;
        const z1 = star.z * cosY + star.x * sinY;
        const y2 = star.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + star.y * sinX;
        const zAdj = z2 + 800;
        if (zAdj > 80) {
          const s = (fov / zAdj) * curZoom;
          const sx = cx + x1 * s;
          const sy = cy + y2 * s;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.7, star.size * s * 0.8), 0, Math.PI * 2);
          ctx.globalAlpha = star.alpha;
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1.0;

      // Project Nodes
      const lodStarThreshold = curZoom < 0.8 ? 2000 : curZoom < 1.2 ? 1000 : 0;
      const searchLower = graphSearch.trim().toLowerCase();

      nodes.forEach((node) => {
        const x1 = node.x * cosY - node.z * sinY;
        const z1 = node.z * cosY + node.x * sinY;

        const y2 = node.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + node.y * sinX;

        const zAdjusted = (z2 * curZoom) + 750;
        const scale = fov / Math.max(zAdjusted, 100);

        node.screenX = cx + x1 * curZoom * scale;
        node.screenY = cy + y2 * curZoom * scale;
        node.screenSize = Math.max(2.4, node.size * curZoom * scale);
        node.depth = zAdjusted;
      });

      // Filter visible nodes by LOD and depth
      const visibleNodes = nodes.filter(n => 
        n.depth > 80 && (n.stars >= lodStarThreshold || 
        (activeFocusNode && activeFocusNode.id === n.id) ||
        (searchLower && n.name.toLowerCase().includes(searchLower)))
      );
      visibleNodes.sort((a, b) => b.depth - a.depth);

      // Draw Relationship Links
      links.forEach((link) => {
        const src = link.source;
        const tgt = link.target;
        if (src.depth > 80 && tgt.depth > 80) {
          const isLinkActive = activeFocusNode && (activeFocusNode.id === src.id || activeFocusNode.id === tgt.id);
          const alpha = isLinkActive ? 0.9 : 0.08;

          ctx.strokeStyle = isLinkActive ? '#818cf8' : src.color.hex;
          ctx.lineWidth = isLinkActive ? 1.8 : 0.7;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(src.screenX, src.screenY);
          ctx.lineTo(tgt.screenX, tgt.screenY);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1.0;

      // Draw Nodes with Additive Bloom Core
      visibleNodes.forEach((node) => {
        const isSelected = selectedNode && selectedNode.id === node.id;
        const isHovered = hoveredNode && hoveredNode.id === node.id;
        const isInNeighborhood = connectedNeighborhood.neighborIds.has(node.id);
        const matchesSearch = searchLower && node.name.toLowerCase().includes(searchLower);

        // Highlight Glow
        if (isSelected || isHovered || matchesSearch) {
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, node.screenSize * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = node.color.glow;
          ctx.fill();

          // Outer Pulse Ring
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, node.screenSize * 2.2, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (bloomIntensity && isInNeighborhood && activeFocusNode) {
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, node.screenSize * 2.0, 0, Math.PI * 2);
          ctx.fillStyle = node.color.glow;
          ctx.fill();
        }

        // Core Sphere
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, isSelected || isHovered ? node.screenSize * 1.4 : node.screenSize, 0, Math.PI * 2);
        ctx.fillStyle = isSelected || isHovered ? '#ffffff' : node.color.hex;
        ctx.fill();

        // Node Label (Visible for landmark nodes > 30k stars, selected/hovered nodes, or search matches)
        const showLabel = isSelected || isHovered || matchesSearch || node.stars > 45000 || (curZoom > 1.4 && node.screenSize > 5.5);
        if (showLabel) {
          ctx.font = `${isSelected || isHovered ? 'bold 11px' : '9px'} -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.fillStyle = isSelected || isHovered || matchesSearch ? '#ffffff' : 'rgba(226, 232, 240, 0.85)';
          ctx.textAlign = 'center';
          ctx.fillText(node.name, node.screenX, node.screenY - node.screenSize - 5);
        }
      });

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [nodes, links, hoveredNode, selectedNode, connectedNeighborhood, graphSearch, bloomIntensity]);

  // Mouse & Touch Controls
  const handleMouseDown = (e) => {
    if (e.button === 2 || e.shiftKey) {
      isPanning.current = true;
    } else {
      isDragging.current = true;
    }
    prevMousePos.current = { x: e.clientX, y: e.clientY };
    setAutoRotate(false);
  };

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDragging.current) {
      const deltaX = e.clientX - prevMousePos.current.x;
      const deltaY = e.clientY - prevMousePos.current.y;
      prevMousePos.current = { x: e.clientX, y: e.clientY };

      rotRef.current.y += deltaX * 0.005;
      rotRef.current.x += deltaY * 0.005;
      setRotation({ ...rotRef.current });
      return;
    }

    if (isPanning.current) {
      const deltaX = e.clientX - prevMousePos.current.x;
      const deltaY = e.clientY - prevMousePos.current.y;
      prevMousePos.current = { x: e.clientX, y: e.clientY };

      panRef.current.x += deltaX;
      panRef.current.y += deltaY;
      setPan({ ...panRef.current });
      return;
    }

    // Raycast / Proximity check
    let found = null;
    let closestDist = 18;

    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dist = Math.hypot(n.screenX - mouseX, n.screenY - mouseY);
      if (dist < closestDist) {
        found = n;
        closestDist = dist;
      }
    }
    setHoveredNode(found);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    isPanning.current = false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    setZoom((prev) => Math.min(2.8, Math.max(0.4, prev - e.deltaY * 0.0012)));
  };

  const handleClick = () => {
    if (hoveredNode) {
      flyToNode(hoveredNode);
    }
  };

  return (
    <div className="relative w-full h-[680px] bg-[#070a12] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col select-none">
      <div 
        ref={containerRef}
        className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Top Control Bar */}
        <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 z-10 pointer-events-auto">
          <div className="flex items-center gap-2">
            {/* Search within 3D Space */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Find node in 3D (e.g. 'react', 'duckdb')..."
                value={graphSearch}
                onChange={(e) => setGraphSearch(e.target.value)}
                className="bg-[#161b22]/90 backdrop-blur-md border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-56 sm:w-64 transition-all"
              />
              {graphSearch && (
                <button
                  onClick={() => setGraphSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Layout Topology Selector */}
            <div className="bg-[#161b22]/90 backdrop-blur-md border border-slate-800 rounded-xl p-1 flex items-center text-xs">
              <button
                onClick={() => setViewMode('clusters')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  viewMode === 'clusters' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Domain Clusters
              </button>
              <button
                onClick={() => setViewMode('starfield')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  viewMode === 'starfield' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Galaxy Spiral
              </button>
              <button
                onClick={() => setViewMode('spherical')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  viewMode === 'spherical' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sphere
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto Orbit Toggle */}
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border backdrop-blur-md transition-colors shadow-lg flex items-center gap-1.5 ${
                autoRotate 
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40' 
                  : 'bg-[#161b22]/90 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{autoRotate ? 'Orbiting' : 'Orbit'}</span>
            </button>

            {/* Reset Perspective */}
            <button
              onClick={() => {
                rotRef.current = { x: 0.32, y: -0.45 };
                panRef.current = { x: 0, y: 0 };
                zoomRef.current = 1.0;
                setRotation({ x: 0.32, y: -0.45 });
                setPan({ x: 0, y: 0 });
                setZoom(1.0);
                setSelectedNode(null);
              }}
              className="p-2 bg-[#161b22]/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl shadow-lg transition-colors"
              title="Reset View"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Zoom Overlay Tools */}
        <div className="absolute right-4 top-20 flex flex-col gap-1.5 z-10 pointer-events-auto">
          <button
            onClick={() => setZoom((z) => Math.min(2.8, z + 0.25))}
            className="p-2 bg-[#161b22]/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg shadow-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.25))}
            className="p-2 bg-[#161b22]/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg shadow-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Focused Architecture Inspector Sidebar */}
        {selectedNode && (
          <div className="absolute top-16 left-4 z-20 pointer-events-auto max-w-sm w-full bg-[#161b22]/95 border border-indigo-500/50 backdrop-blur-md p-5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-left duration-200">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {selectedNode.domain}
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  {selectedNode.owner} / {selectedNode.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed mb-3">
              {selectedNode.repo.description}
            </p>

            <div className="bg-[#0d1117] p-3 rounded-xl border border-slate-800 mb-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Stars:</span>
                <span className="font-mono text-amber-400 font-semibold">{selectedNode.stars.toLocaleString()}★</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Subsystem:</span>
                <span className="text-emerald-400 font-medium">{selectedNode.subsystem}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Language:</span>
                <span className="text-indigo-300 font-medium">{selectedNode.language}</span>
              </div>
            </div>

            {/* Neighborhood / Connected Repos */}
            <div className="mb-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5 flex items-center gap-1">
                <Network className="w-3 h-3 text-indigo-400" />
                <span>Connected Tech ({connectedNeighborhood.activeLinks.length})</span>
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1 text-xs">
                {connectedNeighborhood.activeLinks.length === 0 ? (
                  <span className="text-slate-500 text-[11px] italic">No direct semantic bridges in view</span>
                ) : (
                  connectedNeighborhood.activeLinks.slice(0, 6).map((link, idx) => {
                    const other = link.source.id === selectedNode.id ? link.target : link.source;
                    return (
                      <div
                        key={idx}
                        onClick={() => flyToNode(other)}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/80 hover:bg-indigo-600/20 text-slate-200 hover:text-white cursor-pointer border border-slate-700/50 transition-colors"
                      >
                        <span className="truncate max-w-[170px] font-medium">{other.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{link.relationship.split('(')[0]}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => onSelectRepo && onSelectRepo(selectedNode.repo)}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Deep Inspect Sheet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <a
                href={`https://github.com/${selectedNode.owner}/${selectedNode.name}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors"
                title="View on GitHub"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {/* Hover Inspection Tooltip (When Not Selected) */}
        {hoveredNode && !selectedNode && (
          <div className="absolute bottom-4 left-4 z-20 pointer-events-none max-w-sm bg-[#161b22]/95 border border-indigo-500/40 backdrop-blur-md p-3.5 rounded-xl shadow-2xl animate-in fade-in duration-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {hoveredNode.domain}
              </span>
              <span className="text-[10px] font-mono text-amber-400 font-semibold">
                {hoveredNode.stars.toLocaleString()}★
              </span>
            </div>
            <h4 className="text-sm font-bold text-white mb-0.5">
              {hoveredNode.owner} / {hoveredNode.name}
            </h4>
            <p className="text-[11px] text-slate-300 line-clamp-2 mb-2">
              {hoveredNode.repo.description}
            </p>
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800">
              <span className="text-emerald-400 font-medium">Subsystem: {hoveredNode.subsystem}</span>
              <span className="text-indigo-300 font-mono">Click to lock &amp; inspect</span>
            </div>
          </div>
        )}

        {/* Interactive Controls Legend */}
        <div className="absolute bottom-4 right-4 z-10 pointer-events-auto hidden sm:flex items-center gap-3 bg-[#161b22]/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            Drag to Rotate
          </span>
          <span className="text-slate-700">&bull;</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Shift+Drag to Pan
          </span>
          <span className="text-slate-700">&bull;</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Scroll to Zoom
          </span>
        </div>
      </div>
    </div>
  );
}
