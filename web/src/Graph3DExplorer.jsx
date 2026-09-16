import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  Compass, RotateCcw, ZoomIn, ZoomOut, Eye, Layers, Sparkles, 
  Cpu, Database, Shield, Zap, Info, Filter, X
} from 'lucide-react';

export default function Graph3DExplorer({ repos, onSelectRepo, selectedDomain }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // Interactive Controls State
  const [rotation, setRotation] = useState({ x: 0.35, y: -0.45 });
  const [zoom, setZoom] = useState(1.0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [filterDomain, setFilterDomain] = useState(selectedDomain || 'all');

  // Drag interaction refs
  const isDragging = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef(null);
  const rotRef = useRef({ x: 0.35, y: -0.45 });
  const autoRotateRef = useRef(true);
  const zoomRef = useRef(1.0);

  useEffect(() => {
    rotRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Distinct cluster colors by Domain
  const DOMAIN_COLORS = {
    "Databases & Storage": { hex: "#3b82f6", glow: "rgba(59, 130, 246, 0.4)", name: "Databases" },
    "AI & Machine Learning": { hex: "#a855f7", glow: "rgba(168, 85, 247, 0.4)", name: "AI / ML" },
    "Cloud & Infrastructure": { hex: "#06b6d4", glow: "rgba(6, 182, 212, 0.4)", name: "Cloud & Infra" },
    "Security & Cryptography": { hex: "#ef4444", glow: "rgba(239, 68, 68, 0.4)", name: "Security" },
    "Developer Tooling & Compilers": { hex: "#10b981", glow: "rgba(16, 185, 129, 0.4)", name: "Dev Tools" },
    "Web Platforms & Frameworks": { hex: "#f59e0b", glow: "rgba(245, 158, 11, 0.4)", name: "Web Platforms" },
    "Operating Systems & Low-Level": { hex: "#8b5cf6", glow: "rgba(139, 92, 246, 0.4)", name: "Systems / OS" },
    "Education & Curated Learning": { hex: "#14b8a6", glow: "rgba(20, 184, 166, 0.4)", name: "Education" },
    "Networking & Distributed Systems": { hex: "#ec4899", glow: "rgba(236, 72, 153, 0.4)", name: "Networking" },
    "Other / General": { hex: "#94a3b8", glow: "rgba(148, 163, 184, 0.4)", name: "General" }
  };

  // 1. Build Graph Topology with Level-of-Detail (LOD) & Cluster Geometry
  const { nodes, links, domainClusters } = useMemo(() => {
    const validRepos = repos.filter((r) => {
      if (filterDomain !== 'all' && r.domain !== filterDomain) return false;
      return true;
    });

    const domainNames = Array.from(new Set(validRepos.map((r) => r.domain).filter(Boolean)));
    const clusterCenters = {};

    domainNames.forEach((d, idx) => {
      const angle = (idx / domainNames.length) * Math.PI * 2;
      const elevation = ((idx % 2 === 0 ? 1 : -1) * 0.35);
      const clusterRadius = 280;
      clusterCenters[d] = {
        x: Math.cos(angle) * clusterRadius,
        y: elevation * 130,
        z: Math.sin(angle) * clusterRadius
      };
    });

    // Create 3D Nodes
    const graphNodes = validRepos.map((repo, idx) => {
      const center = clusterCenters[repo.domain] || { x: 0, y: 0, z: 0 };
      const phi = Math.acos(-1 + (2 * (idx % 24)) / 24);
      const theta = Math.sqrt(24 * Math.PI) * phi;
      const orbitDist = 45 + (idx % 8) * 16;

      const x = center.x + Math.sin(phi) * Math.cos(theta) * orbitDist;
      const y = center.y + Math.sin(phi) * Math.sin(theta) * orbitDist;
      const z = center.z + Math.cos(phi) * orbitDist;

      const size = Math.max(3.2, Math.min(9.5, Math.log10(repo.stars) * 1.7));

      return {
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
        color: DOMAIN_COLORS[repo.domain] || DOMAIN_COLORS["Other / General"],
        size,
        x,
        y,
        z,
        screenX: 0,
        screenY: 0,
        screenSize: 0,
        depth: 0
      };
    });

    // 2. Optimized Semantic Link Synthesis (High-Signal Relations Only)
    // To maintain 60 FPS at scale, synthesize links selectively for top anchor repositories
    const graphLinks = [];
    const maxLinkNodes = Math.min(graphNodes.length, 300);
    for (let i = 0; i < maxLinkNodes; i++) {
      for (let j = i + 1; j < maxLinkNodes; j++) {
        const a = graphNodes[i];
        const b = graphNodes[j];
        
        let strength = 0;
        let reason = "";

        if (a.subsystem && b.subsystem && a.subsystem === b.subsystem) {
          strength += 3;
          reason = `Shared Subsystem (${a.subsystem})`;
        }
        const commonPrim = a.primitives.find((p) => b.primitives.includes(p));
        if (commonPrim) {
          strength += 2;
          reason = `Shared Primitive (${commonPrim})`;
        }
        const commonComp = a.compatibility.find((c) => b.compatibility.includes(c));
        if (commonComp) {
          strength += 2;
          reason = `Shared Interop (${commonComp})`;
        }

        if (strength >= 3) {
          graphLinks.push({ source: a, target: b, strength, reason });
        }
      }
    }

    return { nodes: graphNodes, links: graphLinks, domainClusters: domainNames };
  }, [repos, filterDomain]);

  // 3. Render Canvas & 3D Perspective Projection Engine with Level-of-Detail (60 FPS)
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
      const fov = 440;
      const cx = width / 2;
      const cy = height / 2;
      const curZoom = zoomRef.current;

      // Auto rotation
      if (autoRotateRef.current) {
        rotRef.current.y += 0.003;
      }

      const cosX = Math.cos(rotRef.current.x);
      const sinX = Math.sin(rotRef.current.x);
      const cosY = Math.cos(rotRef.current.y);
      const sinY = Math.sin(rotRef.current.y);

      // Clear Frame
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Level-of-Detail (LOD) Threshold
      // If zoomed out, hide minor nodes under 1,500 stars to eliminate visual clutter
      const lodStarThreshold = curZoom < 0.8 ? 2000 : curZoom < 1.2 ? 1000 : 0;

      // 3D Matrix Rotation & Perspective Projection
      nodes.forEach((node) => {
        const x1 = node.x * cosY - node.z * sinY;
        const z1 = node.z * cosY + node.x * sinY;

        const y2 = node.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + node.y * sinX;

        const zAdjusted = (z2 * curZoom) + 720;
        const scale = fov / Math.max(zAdjusted, 100);

        node.screenX = cx + x1 * curZoom * scale;
        node.screenY = cy + y2 * curZoom * scale;
        node.screenSize = Math.max(2.2, node.size * curZoom * scale);
        node.depth = zAdjusted;
      });

      // Filter visible nodes by LOD and depth
      const visibleNodes = nodes.filter(n => n.depth > 100 && (n.stars >= lodStarThreshold || (hoveredNode && hoveredNode.id === n.id)));
      visibleNodes.sort((a, b) => b.depth - a.depth);

      // Draw Relationship Links (Edges)
      ctx.lineWidth = 0.8;
      links.forEach((link) => {
        const src = link.source;
        const tgt = link.target;
        if (src.depth > 100 && tgt.depth > 100) {
          const isHighlighted = hoveredNode && (hoveredNode.id === src.id || hoveredNode.id === tgt.id);
          const alpha = isHighlighted ? 0.85 : 0.09;

          ctx.strokeStyle = isHighlighted ? '#a5b4fc' : src.color.hex;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(src.screenX, src.screenY);
          ctx.lineTo(tgt.screenX, tgt.screenY);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1.0;

      // Draw Nodes
      visibleNodes.forEach((node) => {
        const isHovered = hoveredNode && hoveredNode.id === node.id;
        const isNeighbor = hoveredNode && links.some(
          (l) => (l.source.id === hoveredNode.id && l.target.id === node.id) ||
                 (l.target.id === hoveredNode.id && l.source.id === node.id)
        );

        // Halo / Glow
        if (isHovered || isNeighbor) {
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, node.screenSize * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = node.color.glow;
          ctx.fill();
        }

        // Core Sphere
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, isHovered ? node.screenSize * 1.5 : node.screenSize, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#ffffff' : node.color.hex;
        ctx.fill();

        // Node Label (Visible for landmark nodes > 30,000 stars or when hovered)
        if (isHovered || isNeighbor || node.stars > 35000 || (curZoom > 1.3 && node.screenSize > 5.5)) {
          ctx.font = `${isHovered ? 'bold 11px' : '9px'} -apple-system, sans-serif`;
          ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(226, 232, 240, 0.85)';
          ctx.textAlign = 'center';
          ctx.fillText(node.name, node.screenX, node.screenY - node.screenSize - 4);
        }
      });

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [nodes, links, hoveredNode]);

  // Mouse & Touch Interaction Handlers
  const handleMouseDown = (e) => {
    isDragging.current = true;
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

    let found = null;
    let closestDist = 16;

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
  };

  const handleWheel = (e) => {
    e.preventDefault();
    setZoom((prev) => Math.min(2.5, Math.max(0.4, prev - e.deltaY * 0.001)));
  };

  const handleClick = () => {
    if (hoveredNode && onSelectRepo) {
      onSelectRepo(hoveredNode.repo);
    }
  };

  return (
    <div className="relative w-full h-[640px] bg-[#090d16] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col select-none">
      <div 
        ref={containerRef}
        className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Top Control Overlay */}
        <div className="absolute top-4 left-4 flex items-center gap-2 z-10 pointer-events-auto">
          <div className="bg-[#161b22]/90 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-2 flex items-center gap-3 shadow-lg">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-indigo-400 animate-spin-slow" />
              <span>3D Galaxy</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="text-[11px] text-slate-400 font-mono">
              {nodes.length} Star Systems &bull; LOD Culling Active
            </span>
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2 rounded-xl text-xs font-medium border backdrop-blur-md transition-colors shadow-lg flex items-center gap-1.5 ${
              autoRotate 
                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40' 
                : 'bg-[#161b22]/90 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Toggle Orbital Auto-Rotation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Auto-Orbit</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-1.5 z-10 pointer-events-auto">
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
            className="p-2 bg-[#161b22]/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg shadow-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
            className="p-2 bg-[#161b22]/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg shadow-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              rotRef.current = { x: 0.35, y: -0.45 };
              setRotation({ x: 0.35, y: -0.45 });
              setZoom(1.0);
            }}
            className="p-2 bg-[#161b22]/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg shadow-lg transition-colors"
            title="Reset Perspective"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>

        {/* Hovered Node Inspection Card */}
        {hoveredNode && (
          <div className="absolute bottom-4 left-4 z-20 pointer-events-none max-w-sm bg-[#161b22]/95 border border-indigo-500/40 backdrop-blur-md p-4 rounded-xl shadow-2xl animate-in fade-in duration-100">
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
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-800">
              <span className="text-emerald-400 font-medium">Subsystem: {hoveredNode.subsystem}</span>
              <span className="text-indigo-300 font-mono">Click to inspect</span>
            </div>
          </div>
        )}

        {/* Cluster Legend Footer */}
        <div className="absolute bottom-4 right-4 z-10 pointer-events-auto hidden md:flex items-center gap-2 bg-[#161b22]/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[10px]">
          <span className="text-slate-500 font-medium mr-1">Clusters:</span>
          {Object.entries(DOMAIN_COLORS).slice(0, 5).map(([dom, val]) => (
            <div key={dom} className="flex items-center gap-1 text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: val.hex }} />
              <span>{val.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
