import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Compass, RotateCcw, ZoomIn, ZoomOut, Eye, Layers, Sparkles, 
  Cpu, Database, Shield, Zap, Info, Filter, X, Search, Maximize2,
  SlidersHorizontal, Target, Crosshair, ArrowRight, Play, ExternalLink,
  Share2, Network, Sliders, Activity, Focus, Orbit, Radio
} from 'lucide-react';

export default function Graph3DExplorer({ repos, onSelectRepo, selectedDomain }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Camera & Perspective Transformation State
  const [rotation, setRotation] = useState({ x: 0.32, y: -0.45 });
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [autoRotate, setAutoRotate] = useState(true);

  // Advanced Visual Controls & Modes
  const [viewMode, setViewMode] = useState('clusters'); // 'clusters' | 'spherical' | 'starfield'
  const [graphSearch, setGraphSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [filterDomain, setFilterDomain] = useState(selectedDomain || 'all');
  const [filterMinStars, setFilterMinStars] = useState(500);

  // Second Brain / Obsidian & 3D Force Graph Interactive Controls
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [nodeSizingMetric, setNodeSizingMetric] = useState('stars'); // 'stars' | 'forks' | 'uniform'
  const [repulsionForce, setRepulsionForce] = useState(1.0);
  const [enableParticles, setEnableParticles] = useState(true);
  const [enableBloom, setEnableBloom] = useState(true);
  const [hopDepth, setHopDepth] = useState(1); // 1 or 2 hops
  const [isolateFocusMode, setIsolateFocusMode] = useState(false);

  // Interaction Refs (for 60 FPS physics & rendering loops)
  const isDragging = useRef(false);
  const isPanning = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef(null);
  const rotRef = useRef({ x: 0.32, y: -0.45 });
  const autoRotateRef = useRef(true);
  const zoomRef = useRef(1.0);
  const panRef = useRef({ x: 0, y: 0 });
  const particleOffsetRef = useRef(0);

  // Camera Fly-To & Pivot Animation Ref
  const targetCam = useRef(null);

  useEffect(() => { rotRef.current = rotation; }, [rotation]);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Desaturated Obsidian domain palette — hue separation without neon glow.
  // No purple/violet/pink: the canvas stays achromatic apart from these hues.
  const DOMAIN_CONFIG = {
    "Databases & Storage": { hex: "#7ea3c4", glow: "rgba(126, 163, 196, 0.28)", name: "Databases" },
    "AI & Machine Learning": { hex: "#d3a273", glow: "rgba(211, 162, 115, 0.28)", name: "AI / ML" },
    "Cloud & Infrastructure": { hex: "#6fb3ab", glow: "rgba(111, 179, 171, 0.28)", name: "Cloud & Infra" },
    "Security & Cryptography": { hex: "#cd8371", glow: "rgba(205, 131, 113, 0.28)", name: "Security" },
    "Developer Tooling & Compilers": { hex: "#85bb94", glow: "rgba(133, 187, 148, 0.28)", name: "Dev Tools" },
    "Web Platforms & Frameworks": { hex: "#c9b877", glow: "rgba(201, 184, 119, 0.28)", name: "Web Platforms" },
    "Operating Systems & Low-Level": { hex: "#aeb6bf", glow: "rgba(174, 182, 191, 0.26)", name: "Systems / OS" },
    "Education & Curated Learning": { hex: "#a9bc7d", glow: "rgba(169, 188, 125, 0.28)", name: "Education" },
    "Networking & Distributed Systems": { hex: "#86bcc4", glow: "rgba(134, 188, 196, 0.28)", name: "Networking" },
    "Other / General": { hex: "#767b85", glow: "rgba(118, 123, 133, 0.24)", name: "General" }
  };

  // Cosmic Background Starfield
  const backgroundStars = useMemo(() => {
    const stars = [];
    for (let i = 0; i < 280; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 1800,
        y: (Math.random() - 0.5) * 1800,
        z: (Math.random() - 0.5) * 1800,
        size: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.6 + 0.15
      });
    }
    return stars;
  }, []);

  // 1. Build Canonical Cluster Centers across all domains in the catalog
  const allDomainNames = useMemo(() => {
    return Array.from(new Set(repos.map((r) => r.domain).filter(Boolean))).sort();
  }, [repos]);

  const clusterCenters = useMemo(() => {
    const centers = {};
    allDomainNames.forEach((d, idx) => {
      const angle = (idx / Math.max(1, allDomainNames.length)) * Math.PI * 2;
      const elevation = ((idx % 2 === 0 ? 1 : -1) * 0.35);
      const clusterRadius = 310 * repulsionForce;
      centers[d] = {
        x: Math.cos(angle) * clusterRadius,
        y: elevation * 140 * repulsionForce,
        z: Math.sin(angle) * clusterRadius
      };
    });
    return centers;
  }, [allDomainNames, repulsionForce]);

  // Synchronize filterDomain immediately when selectedDomain prop changes from parent
  useEffect(() => {
    const dom = selectedDomain || 'all';
    setFilterDomain(dom);

    if (dom !== 'all' && clusterCenters[dom]) {
      const center = clusterCenters[dom];
      const targetRotY = -Math.atan2(center.x, center.z);
      targetCam.current = {
        targetRotX: 0.22,
        targetRotY,
        targetZoom: 1.55,
        frames: 35
      };
      setAutoRotate(false);
    }
  }, [selectedDomain, clusterCenters]);

  // 2. Build Graph Topology, Node Geometries & Force-Layout Positioning
  const { nodes, links, domainClusters, nodeLookup } = useMemo(() => {
    const validRepos = repos.filter((r) => {
      if (filterDomain !== 'all' && r.domain !== filterDomain) return false;
      if (r.stars < filterMinStars) return false;
      return true;
    });

    const lookup = {};
    const sampleLimit = Math.min(validRepos.length, 1600);
    const graphNodes = validRepos.slice(0, sampleLimit).map((repo, idx) => {
      let x = 0, y = 0, z = 0;

      if (viewMode === 'clusters') {
        const center = clusterCenters[repo.domain] || { x: 0, y: 0, z: 0 };
        const phi = Math.acos(-1 + (2 * (idx % 32)) / 32);
        const theta = Math.sqrt(32 * Math.PI) * phi;
        const orbitDist = (55 + (idx % 12) * 14) * repulsionForce;

        x = center.x + Math.sin(phi) * Math.cos(theta) * orbitDist;
        y = center.y + Math.sin(phi) * Math.sin(theta) * orbitDist;
        z = center.z + Math.cos(phi) * orbitDist;
      } else if (viewMode === 'spherical') {
        const phi = Math.acos(-1 + (2 * idx) / sampleLimit);
        const theta = Math.sqrt(sampleLimit * Math.PI) * phi;
        const r = 360 * repulsionForce;
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.sin(phi) * Math.sin(theta);
        z = r * Math.cos(phi);
      } else {
        // Logarithmic Galaxy Spiral
        const arm = idx % 4;
        const angle = (idx / sampleLimit) * Math.PI * 6 + (arm * (Math.PI / 2));
        const dist = (50 + Math.pow(idx / sampleLimit, 0.7) * 460) * repulsionForce;
        x = Math.cos(angle) * dist;
        y = ((idx % 30) - 15) * 8 * repulsionForce;
        z = Math.sin(angle) * dist;
      }

      // Dynamic Node Sizing
      let size = 4.0;
      if (nodeSizingMetric === 'stars') {
        size = Math.max(3.2, Math.min(10.5, Math.log10(repo.stars) * 1.75));
      } else if (nodeSizingMetric === 'forks') {
        size = Math.max(3.2, Math.min(10.5, Math.log10(Math.max(repo.forks, 10)) * 2.0));
      } else {
        size = 5.0;
      }

      const nodeObj = {
        id: repo.id,
        name: repo.name,
        owner: repo.owner,
        repo: repo,
        domain: repo.domain,
        subsystem: repo.subsystem,
        stars: repo.stars,
        forks: repo.forks,
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

    // 2. Synthesize High-Signal Relationships & Multi-Hop Bridges
    const graphLinks = [];
    const maxLinkNodes = Math.min(graphNodes.length, 450);

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

    return { nodes: graphNodes, links: graphLinks, domainClusters: allDomainNames, nodeLookup: lookup };
  }, [repos, filterDomain, filterMinStars, viewMode, repulsionForce, nodeSizingMetric, clusterCenters, allDomainNames]);

  // Active Focus & Connected Neighborhood Computation (with Hop Depth support)
  const activeFocusNode = selectedNode || hoveredNode;
  const connectedNeighborhood = useMemo(() => {
    if (!activeFocusNode) return { neighborIds: new Set(), activeLinks: [] };

    const neighborIds = new Set([activeFocusNode.id]);
    const hop1Links = [];

    // Hop 1
    links.forEach((l) => {
      if (l.source.id === activeFocusNode.id) {
        neighborIds.add(l.target.id);
        hop1Links.push(l);
      } else if (l.target.id === activeFocusNode.id) {
        neighborIds.add(l.source.id);
        hop1Links.push(l);
      }
    });

    // Hop 2 (If depth slider is set to 2)
    if (hopDepth > 1) {
      const hop1Ids = Array.from(neighborIds);
      links.forEach((l) => {
        if (hop1Ids.includes(l.source.id)) {
          neighborIds.add(l.target.id);
        } else if (hop1Ids.includes(l.target.id)) {
          neighborIds.add(l.source.id);
        }
      });
    }

    return { neighborIds, activeLinks: hop1Links };
  }, [activeFocusNode, links, hopDepth]);

  // Smooth Fly-To Camera Transition (Geocentric Pivot Around Selected Node)
  const flyToNode = useCallback((node) => {
    setSelectedNode(node);
    setAutoRotate(false);

    // Calculate angle towards node to center it in viewport
    const targetRotY = -Math.atan2(node.baseX, node.baseZ);
    const targetRotX = 0.22;
    targetCam.current = {
      targetRotX,
      targetRotY,
      targetZoom: 1.65,
      frames: 35
    };
  }, []);

  // 3. Render Canvas & 3D Perspective Projection Engine (60 FPS)
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

      // Handle Smooth Camera Interpolation (Fly-to)
      if (targetCam.current && targetCam.current.frames > 0) {
        const t = targetCam.current;
        rotRef.current.x += (t.targetRotX - rotRef.current.x) * 0.12;
        rotRef.current.y += (t.targetRotY - rotRef.current.y) * 0.12;
        zoomRef.current += (t.targetZoom - zoomRef.current) * 0.12;
        t.frames--;
        if (t.frames === 0) targetCam.current = null;
      } else if (autoRotateRef.current) {
        rotRef.current.y += 0.0022;
      }

      particleOffsetRef.current = (particleOffsetRef.current + 0.006) % 1.0;

      const cosX = Math.cos(rotRef.current.x);
      const sinX = Math.sin(rotRef.current.x);
      const cosY = Math.cos(rotRef.current.y);
      const sinY = Math.sin(rotRef.current.y);

      // Deep Space Canvas Background with Radial Cosmic Vignette
      ctx.fillStyle = '#07080a';
      ctx.fillRect(0, 0, width, height);

      const grad = ctx.createRadialGradient(cx, cy, 60, cx, cy, width * 0.7);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.045)');
      grad.addColorStop(0.6, 'rgba(12, 14, 18, 0.35)');
      grad.addColorStop(1, 'rgba(7, 8, 10, 0.96)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Render Background Starfield
      ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
      backgroundStars.forEach((star) => {
        const x1 = star.x * cosY - star.z * sinY;
        const z1 = star.z * cosY + star.x * sinY;
        const y2 = star.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + star.y * sinX;
        const zAdj = z2 + 850;
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
      const lodStarThreshold = curZoom < 0.8 ? 2500 : curZoom < 1.2 ? 1200 : 0;
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

      // Filter visible nodes by LOD, depth, and Isolate Focus Mode
      const visibleNodes = nodes.filter(n => {
        if (n.depth <= 80) return false;
        if (isolateFocusMode && selectedNode && !connectedNeighborhood.neighborIds.has(n.id)) {
          return false;
        }
        return (
          n.stars >= lodStarThreshold ||
          (activeFocusNode && connectedNeighborhood.neighborIds.has(n.id)) ||
          (searchLower && n.name.toLowerCase().includes(searchLower))
        );
      });
      visibleNodes.sort((a, b) => b.depth - a.depth);

      // Draw Relationship Links (Edges) with Directional Particle Beams
      links.forEach((link) => {
        const src = link.source;
        const tgt = link.target;
        if (src.depth > 80 && tgt.depth > 80) {
          const isLinkActive = activeFocusNode && (activeFocusNode.id === src.id || activeFocusNode.id === tgt.id);
          if (isolateFocusMode && selectedNode && !isLinkActive) return;

          const alpha = isLinkActive ? 0.9 : 0.08;

          ctx.strokeStyle = isLinkActive ? '#eceef2' : src.color.hex;
          ctx.lineWidth = isLinkActive ? 1.8 : 0.7;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(src.screenX, src.screenY);
          ctx.lineTo(tgt.screenX, tgt.screenY);
          ctx.stroke();

          // 3D-Force-Graph / Obsidian Style: Moving Directional Beam Particles
          if (enableParticles && isLinkActive) {
            const pRatio = particleOffsetRef.current;
            const px = src.screenX + (tgt.screenX - src.screenX) * pRatio;
            const py = src.screenY + (tgt.screenY - src.screenY) * pRatio;

            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.95;
            ctx.fill();
          }
        }
      });
      ctx.globalAlpha = 1.0;

      // Draw Nodes with Additive Bloom & Spatial Rims
      visibleNodes.forEach((node) => {
        const isSelected = selectedNode && selectedNode.id === node.id;
        const isHovered = hoveredNode && hoveredNode.id === node.id;
        const isInNeighborhood = connectedNeighborhood.neighborIds.has(node.id);
        const matchesSearch = searchLower && node.name.toLowerCase().includes(searchLower);

        // Highlight Glow / Bloom Halos
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
        } else if (enableBloom && isInNeighborhood && activeFocusNode) {
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

        // Node Label (Visible for landmark nodes > 45k stars, selected/hovered nodes, or search matches)
        const showLabel = isSelected || isHovered || matchesSearch || node.stars > 45000 || (curZoom > 1.4 && node.screenSize > 5.5);
        if (showLabel) {
          ctx.font = `${isSelected || isHovered ? 'bold 11px' : '9px'} ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.fillStyle = isSelected || isHovered || matchesSearch ? '#ffffff' : 'rgba(236, 238, 242, 0.78)';
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
  }, [nodes, links, hoveredNode, selectedNode, connectedNeighborhood, graphSearch, enableBloom, enableParticles, isolateFocusMode]);

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

    // Raycast / Proximity Check
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

  // Attach non-passive wheel event listener to container to cleanly intercept zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      setZoom((prev) => Math.min(2.8, Math.max(0.4, prev - e.deltaY * 0.0012)));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const handleClick = () => {
    if (hoveredNode) {
      flyToNode(hoveredNode);
    }
  };

  return (
    <div className="relative w-full h-[700px] bg-obs-base rounded-2xl border border-white/[0.07] overflow-hidden shadow-2xl flex flex-col select-none">
      <div 
        ref={containerRef}
        className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Top Control Bar */}
        <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 z-10 pointer-events-auto">
          <div className="flex items-center gap-2">
            {/* Search within 3D Space */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Find node in 3D (e.g. 'react', 'duckdb')..."
                value={graphSearch}
                onChange={(e) => setGraphSearch(e.target.value)}
                className="bg-obs-surface/90 backdrop-blur-md border border-white/[0.09] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] w-52 sm:w-60 transition-all"
              />
              {graphSearch && (
                <button
                  onClick={() => setGraphSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Layout Topology Selector */}
            <div className="bg-obs-surface/90 backdrop-blur-md border border-white/[0.07] rounded-xl p-1 flex items-center text-xs">
              <button
                onClick={() => setViewMode('clusters')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  viewMode === 'clusters' ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Domain Clusters
              </button>
              <button
                onClick={() => setViewMode('starfield')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  viewMode === 'starfield' ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Galaxy Spiral
              </button>
              <button
                onClick={() => setViewMode('spherical')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  viewMode === 'spherical' ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white' : 'text-zinc-400 hover:text-zinc-200'
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
                  ? 'bg-white/[0.07] text-zinc-100 border-white/[0.14]' 
                  : 'bg-obs-surface/90 text-zinc-400 border-white/[0.07] hover:text-white'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{autoRotate ? 'Orbiting' : 'Orbit'}</span>
            </button>

            {/* Obsidian / Second Brain Settings Drawer Toggle */}
            <button
              onClick={() => setShowSettingsPanel(!showSettingsPanel)}
              className={`p-2 rounded-xl text-xs font-medium border backdrop-blur-md transition-colors shadow-lg flex items-center gap-1.5 ${
                showSettingsPanel 
                  ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white border-white/[0.18]' 
                  : 'bg-obs-surface/90 text-zinc-400 border-white/[0.07] hover:text-white'
              }`}
              title="Graph Physics & Filters Palette"
            >
              <Sliders className="w-4 h-4" />
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
                setIsolateFocusMode(false);
              }}
              className="p-2 bg-obs-surface/90 hover:bg-white/[0.06] text-zinc-300 hover:text-white border border-white/[0.07] rounded-xl shadow-lg transition-colors"
              title="Reset View"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="absolute right-4 top-20 flex flex-col gap-1.5 z-10 pointer-events-auto">
          <button
            onClick={() => setZoom((z) => Math.min(2.8, z + 0.25))}
            className="p-2 bg-obs-surface/90 hover:bg-white/[0.06] text-zinc-300 hover:text-white border border-white/[0.07] rounded-lg shadow-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.25))}
            className="p-2 bg-obs-surface/90 hover:bg-white/[0.06] text-zinc-300 hover:text-white border border-white/[0.07] rounded-lg shadow-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Obsidian / Second Brain Graph Settings Palette (Slide-out) */}
        {showSettingsPanel && (
          <div className="absolute top-16 right-4 z-20 pointer-events-auto w-72 bg-obs-surface/95 border border-white/[0.09] backdrop-blur-md p-4 rounded-2xl shadow-2xl space-y-4 animate-in fade-in slide-in-from-right duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-300" />
                <span>3D Physics & Visuals</span>
              </span>
              <button
                onClick={() => setShowSettingsPanel(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Node Sizing Metric */}
            <div>
              <label className="text-[10px] font-semibold uppercase text-zinc-400 block mb-1">
                Node Sizing Metric
              </label>
              <div className="grid grid-cols-3 gap-1 bg-obs-inset p-1 rounded-lg border border-white/[0.07]">
                {['stars', 'forks', 'uniform'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setNodeSizingMetric(m)}
                    className={`py-1 text-[11px] rounded capitalize transition-colors ${
                      nodeSizingMetric === m ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white font-medium' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Repulsion Force Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-semibold uppercase text-zinc-400">
                  Cluster Repulsion Force
                </label>
                <span className="font-mono text-zinc-300">{repulsionForce.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={repulsionForce}
                onChange={(e) => setRepulsionForce(parseFloat(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            {/* Neighborhood Hop Depth */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-semibold uppercase text-zinc-400">
                  Neighborhood Depth
                </label>
                <span className="font-mono text-zinc-300">{hopDepth} Hop{hopDepth > 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 bg-obs-inset p-1 rounded-lg border border-white/[0.07]">
                {[1, 2].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHopDepth(h)}
                    className={`py-1 text-[11px] rounded transition-colors ${
                      hopDepth === h ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white font-medium' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {h} Hop{h > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Toggles */}
            <div className="pt-2 border-t border-white/[0.07] space-y-2">
              <label className="flex items-center justify-between text-zinc-300 cursor-pointer">
                <span>Moving Link Particles</span>
                <input
                  type="checkbox"
                  checked={enableParticles}
                  onChange={(e) => setEnableParticles(e.target.checked)}
                  className="accent-white rounded"
                />
              </label>
              <label className="flex items-center justify-between text-zinc-300 cursor-pointer">
                <span>Additive Bloom Halos</span>
                <input
                  type="checkbox"
                  checked={enableBloom}
                  onChange={(e) => setEnableBloom(e.target.checked)}
                  className="accent-white rounded"
                />
              </label>
              <label className="flex items-center justify-between text-zinc-300 cursor-pointer">
                <span>Isolate Focused Cluster</span>
                <input
                  type="checkbox"
                  checked={isolateFocusMode}
                  onChange={(e) => setIsolateFocusMode(e.target.checked)}
                  className="accent-white rounded"
                />
              </label>
            </div>
          </div>
        )}

        {/* Focused Architecture Inspector Sidebar */}
        {selectedNode && (
          <div className="absolute top-16 left-4 z-20 pointer-events-auto max-w-sm w-full bg-obs-surface/95 border border-white/[0.16] backdrop-blur-md p-5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-left duration-200">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-white/[0.06] text-zinc-100 border border-white/[0.12]">
                  {selectedNode.domain}
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  {selectedNode.owner} / {selectedNode.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed mb-3">
              {selectedNode.repo.description}
            </p>

            <div className="bg-obs-inset p-3 rounded-xl border border-white/[0.07] mb-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-400">Stars:</span>
                <span className="font-mono text-signal-star font-semibold">{selectedNode.stars.toLocaleString()}★</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Subsystem:</span>
                <span className="text-signal-ok font-medium">{selectedNode.subsystem}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Language:</span>
                <span className="text-zinc-100 font-medium">{selectedNode.language}</span>
              </div>
            </div>

            {/* Neighborhood / Connected Repos (Interactive Hops) */}
            <div className="mb-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Network className="w-3 h-3 text-zinc-300" />
                  <span>Connected Tech (<span className="num">{connectedNeighborhood.activeLinks.length}</span>)</span>
                </span>
                <button
                  onClick={() => setIsolateFocusMode(!isolateFocusMode)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    isolateFocusMode ? 'bg-white/[0.07] border-white/[0.18] text-zinc-100' : 'bg-white/[0.05] border-white/[0.10] text-zinc-400'
                  }`}
                >
                  {isolateFocusMode ? 'Isolated' : 'Isolate'}
                </button>
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1 text-xs">
                {connectedNeighborhood.activeLinks.length === 0 ? (
                  <span className="text-zinc-500 text-[11px] italic">No direct semantic bridges in view</span>
                ) : (
                  connectedNeighborhood.activeLinks.slice(0, 6).map((link, idx) => {
                    const other = link.source.id === selectedNode.id ? link.target : link.source;
                    return (
                      <div
                        key={idx}
                        onClick={() => flyToNode(other)}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.06] text-zinc-200 hover:text-white cursor-pointer border border-white/[0.07] transition-colors"
                      >
                        <span className="truncate max-w-[170px] font-medium">{other.name}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">{link.relationship.split('(')[0]}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.07]">
              <button
                onClick={() => onSelectRepo && onSelectRepo(selectedNode.repo)}
                className="btn-primary flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
              >
                <span>Deep Inspect Sheet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <a
                href={`https://github.com/${selectedNode.owner}/${selectedNode.name}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-white/[0.05] hover:bg-white/[0.09] text-zinc-300 hover:text-white rounded-xl border border-white/[0.10] transition-colors"
                title="View on GitHub"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {/* Hover Inspection Tooltip (When Not Selected) */}
        {hoveredNode && !selectedNode && (
          <div className="absolute bottom-4 left-4 z-20 pointer-events-none max-w-sm bg-obs-surface/95 border border-white/[0.14] backdrop-blur-md p-3.5 rounded-xl shadow-2xl animate-in fade-in duration-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-white/[0.06] text-zinc-100 border border-white/[0.12]">
                {hoveredNode.domain}
              </span>
              <span className="text-[10px] font-mono text-signal-star font-semibold">
                {hoveredNode.stars.toLocaleString()}★
              </span>
            </div>
            <h4 className="text-sm font-bold text-white mb-0.5">
              {hoveredNode.owner} / {hoveredNode.name}
            </h4>
            <p className="text-[11px] text-zinc-300 line-clamp-2 mb-2">
              {hoveredNode.repo.description}
            </p>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1.5 border-t border-white/[0.07]">
              <span className="text-signal-ok font-medium">Subsystem: {hoveredNode.subsystem}</span>
              <span className="text-zinc-100 font-mono">Click to lock &amp; inspect</span>
            </div>
          </div>
        )}

        {/* Interactive Controls Legend */}
        <div className="absolute bottom-4 right-4 z-10 pointer-events-auto hidden sm:flex items-center gap-3 bg-obs-surface/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/[0.07] text-[10px] text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-white/70" />
            Drag to Rotate
          </span>
          <span className="text-zinc-700">&bull;</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-signal-ok" />
            Shift+Drag to Pan
          </span>
          <span className="text-zinc-700">&bull;</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-signal-star" />
            Scroll to Zoom
          </span>
        </div>
      </div>
    </div>
  );
}
