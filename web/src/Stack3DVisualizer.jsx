import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  Compass, RotateCcw, ZoomIn, ZoomOut, Eye, Layers, Sparkles, 
  Workflow, CheckCircle2, AlertTriangle, ArrowRightLeft, ShieldAlert,
  Cpu, Database, ArrowRight, X, ExternalLink
} from 'lucide-react';

export default function Stack3DVisualizer({ stackItems, analysis, onSelectRepo }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const [rotation, setRotation] = useState({ x: 0.28, y: -0.42 });
  const [zoom, setZoom] = useState(1.1);
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedPair, setSelectedPair] = useState(null);

  const isDragging = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const rotRef = useRef({ x: 0.28, y: -0.42 });
  const autoRotateRef = useRef(true);
  const zoomRef = useRef(1.1);
  const particleOffsetRef = useRef(0);
  const animationFrameId = useRef(null);

  useEffect(() => { rotRef.current = rotation; }, [rotation]);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Color palette for roles
  const ROLE_COLORS = [
    { hex: "#38bdf8", glow: "rgba(56, 189, 248, 0.45)" }, // Layer 1 (Storage)
    { hex: "#c084fc", glow: "rgba(192, 132, 252, 0.45)" }, // Layer 2 (Inference)
    { hex: "#34d399", glow: "rgba(52, 211, 153, 0.45)" }, // Layer 3 (Backend)
    { hex: "#fbbf24", glow: "rgba(251, 191, 36, 0.45)" }, // Layer 4 (Frontend)
    { hex: "#f472b6", glow: "rgba(244, 114, 182, 0.45)" }, // Layer 5 (Security/DevTools)
  ];

  // 1. Calculate 3D Cylindrical Ring & Pillar Layout for the Stack
  const { nodes, bridges } = useMemo(() => {
    if (!stackItems || stackItems.length === 0) return { nodes: [], bridges: [] };

    const activeNodes = stackItems.map((item, idx) => {
      const angle = (idx / stackItems.length) * Math.PI * 2;
      const radius = 170;
      // Stagger vertical elevation by layer order
      const y = (idx - (stackItems.length - 1) / 2) * 55;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const color = ROLE_COLORS[idx % ROLE_COLORS.length];

      return {
        idx,
        id: item.repo.id,
        name: item.repo.name,
        owner: item.repo.owner,
        role: item.role,
        repo: item.repo,
        language: item.repo.language,
        stars: item.repo.stars,
        primitives: item.repo.primitives || [],
        color,
        x, y, z,
        screenX: 0, screenY: 0, screenSize: 0, depth: 0
      };
    });

    // Extract Pairwise Bridges from Analysis Matrix
    const activeBridges = [];
    if (analysis && analysis.matrix) {
      analysis.matrix.forEach((m) => {
        const srcNode = activeNodes.find(n => n.id === m.nodeA.id);
        const tgtNode = activeNodes.find(n => n.id === m.nodeB.id);
        if (srcNode && tgtNode) {
          activeBridges.push({
            source: srcNode,
            target: tgtNode,
            score: m.score,
            status: m.status,
            notes: m.notes,
            isSynergy: m.score >= 70,
            isFriction: m.score < 50
          });
        }
      });
    }

    return { nodes: activeNodes, bridges: activeBridges };
  }, [stackItems, analysis]);

  // 2. Render 3D Canvas Loop with Interactive Energy Beams
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
      const fov = 400;
      const cx = width / 2;
      const cy = height / 2;
      const curZoom = zoomRef.current;

      if (autoRotateRef.current) {
        rotRef.current.y += 0.003;
      }

      particleOffsetRef.current = (particleOffsetRef.current + 0.008) % 1.0;

      const cosX = Math.cos(rotRef.current.x);
      const sinX = Math.sin(rotRef.current.x);
      const cosY = Math.cos(rotRef.current.y);
      const sinY = Math.sin(rotRef.current.y);

      // Deep Space Vignette
      ctx.fillStyle = '#060911';
      ctx.fillRect(0, 0, width, height);

      const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, width * 0.65);
      grad.addColorStop(0, 'rgba(20, 26, 45, 0.6)');
      grad.addColorStop(0.7, 'rgba(10, 13, 22, 0.4)');
      grad.addColorStop(1, 'rgba(6, 9, 17, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Perspective Projection
      nodes.forEach((node) => {
        const x1 = node.x * cosY - node.z * sinY;
        const z1 = node.z * cosY + node.x * sinY;
        const y2 = node.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + node.y * sinX;

        const zAdjusted = (z2 * curZoom) + 520;
        const scale = fov / Math.max(zAdjusted, 100);

        node.screenX = cx + x1 * curZoom * scale;
        node.screenY = cy + y2 * curZoom * scale;
        node.screenSize = Math.max(8.0, 12.0 * curZoom * scale);
        node.depth = zAdjusted;
      });

      // Sort nodes by depth
      const sortedNodes = [...nodes].sort((a, b) => b.depth - a.depth);

      // Draw Bridge Laser Links
      bridges.forEach((bridge) => {
        const src = bridge.source;
        const tgt = bridge.target;
        if (src.depth > 50 && tgt.depth > 50) {
          const isBridgeSelected = selectedPair && 
            ((selectedPair.source.id === src.id && selectedPair.target.id === tgt.id) ||
             (selectedPair.source.id === tgt.id && selectedPair.target.id === src.id));

          let strokeColor = bridge.isSynergy ? '#10b981' : bridge.isFriction ? '#f59e0b' : '#6366f1';
          let lineWidth = isBridgeSelected ? 2.5 : bridge.isSynergy ? 1.8 : 1.2;
          let alpha = isBridgeSelected ? 0.95 : 0.45;

          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = lineWidth;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(src.screenX, src.screenY);
          ctx.lineTo(tgt.screenX, tgt.screenY);
          ctx.stroke();

          // Animated Particle Energy Pulse
          const pRatio = particleOffsetRef.current;
          const px = src.screenX + (tgt.screenX - src.screenX) * pRatio;
          const py = src.screenY + (tgt.screenY - src.screenY) * pRatio;

          ctx.beginPath();
          ctx.arc(px, py, bridge.isSynergy ? 3.0 : 2.2, 0, Math.PI * 2);
          ctx.fillStyle = bridge.isSynergy ? '#34d399' : bridge.isFriction ? '#fbbf24' : '#a5b4fc';
          ctx.globalAlpha = 0.9;
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1.0;

      // Draw Stack Nodes
      sortedNodes.forEach((node) => {
        const isHovered = hoveredNode && hoveredNode.id === node.id;

        // Glow Aura
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, node.screenSize * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = node.color.glow;
        ctx.fill();

        // Node Body
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, isHovered ? node.screenSize * 1.2 : node.screenSize, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#ffffff' : node.color.hex;
        ctx.fill();

        // Outer Ring
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, node.screenSize * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = isHovered ? '#ffffff' : node.color.hex;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Label Tag
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.screenX, node.screenY - node.screenSize - 6);

        ctx.font = '9px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(203, 213, 225, 0.8)';
        ctx.fillText(`L0${node.idx + 1}: ${node.role}`, node.screenX, node.screenY + node.screenSize + 14);
      });

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [nodes, bridges, hoveredNode, selectedPair]);

  // Mouse Handlers
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

      rotRef.current.y += deltaX * 0.006;
      rotRef.current.x += deltaY * 0.006;
      setRotation({ ...rotRef.current });
      return;
    }

    let found = null;
    let closestDist = 22;
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
    setZoom((prev) => Math.min(2.5, Math.max(0.6, prev - e.deltaY * 0.0012)));
  };

  return (
    <div className="bg-[#090d16] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative select-none">
      {/* 3D Canvas Container */}
      <div 
        ref={containerRef}
        className="relative w-full h-[400px] cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Top Floating Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2 z-10 pointer-events-auto">
          <div className="bg-[#161b22]/90 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-lg text-xs">
            <Compass className="w-4 h-4 text-indigo-400 animate-spin-slow" />
            <span className="font-semibold text-white">3D Stack Constellation</span>
            <span className="text-slate-600">|</span>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">
              {bridges.length} Verified Bridges
            </span>
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border backdrop-blur-md transition-colors shadow-lg flex items-center gap-1.5 ${
              autoRotate 
                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40' 
                : 'bg-[#161b22]/90 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{autoRotate ? 'Orbiting' : 'Orbit'}</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 z-10 pointer-events-auto">
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
            className="p-1.5 bg-[#161b22]/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg shadow-lg"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
            className="p-1.5 bg-[#161b22]/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg shadow-lg"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-auto hidden sm:flex items-center gap-3 bg-[#161b22]/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[10px]">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            High Synergy (In-Process / Shared Primitives)
          </span>
          <span className="text-slate-700">&bull;</span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            IPC / Network Boundary
          </span>
        </div>
      </div>
    </div>
  );
}
