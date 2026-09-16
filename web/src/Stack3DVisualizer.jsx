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

  // Role palette — mirrors the desaturated Obsidian domain hues so the stack
  // constellation reads as part of the same system as the 3D galaxy.
  const ROLE_COLORS = [
    { hex: "#7ea3c4", glow: "rgba(126, 163, 196, 0.24)" }, // Layer 1 (Storage)
    { hex: "#d3a273", glow: "rgba(211, 162, 115, 0.24)" }, // Layer 2 (Inference)
    { hex: "#85bb94", glow: "rgba(133, 187, 148, 0.24)" }, // Layer 3 (Backend)
    { hex: "#c9b877", glow: "rgba(201, 184, 119, 0.24)" }, // Layer 4 (Frontend)
    { hex: "#cd8371", glow: "rgba(205, 131, 113, 0.24)" }, // Layer 5 (Security/DevTools)
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
      ctx.fillStyle = '#07080a';
      ctx.fillRect(0, 0, width, height);

      const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, width * 0.65);
      grad.addColorStop(0, 'rgba(20, 26, 45, 0.6)');
      grad.addColorStop(0.7, 'rgba(12, 14, 18, 0.35)');
      grad.addColorStop(1, 'rgba(7, 8, 10, 0.96)');
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

          let strokeColor = bridge.isSynergy ? '#7fbf9b' : bridge.isFriction ? '#d0a06a' : '#8f949e';
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
          ctx.fillStyle = bridge.isSynergy ? '#a9d8c1' : bridge.isFriction ? '#e6c48c' : '#ffffff';
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
        ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.screenX, node.screenY - node.screenSize - 6);

        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = 'rgba(236, 238, 242, 0.72)';
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
    <div className="bg-obs-base border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl relative select-none">
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
          <div className="bg-obs-surface/90 backdrop-blur-md border border-white/[0.07] rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-lg text-xs">
            <Compass className="w-4 h-4 text-zinc-300 animate-spin-slow" />
            <span className="font-semibold text-white">3D Stack Constellation</span>
            <span className="text-zinc-600">|</span>
            <span className="text-[11px] font-mono text-signal-ok font-bold">
              {bridges.length} Verified Bridges
            </span>
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border backdrop-blur-md transition-colors shadow-lg flex items-center gap-1.5 ${
              autoRotate 
                ? 'bg-white/[0.07] text-zinc-100 border-white/[0.14]' 
                : 'bg-obs-surface/90 text-zinc-400 border-white/[0.07] hover:text-white'
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
            className="p-1.5 bg-obs-surface/90 hover:bg-white/[0.06] text-zinc-300 hover:text-white border border-white/[0.07] rounded-lg shadow-lg"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
            className="p-1.5 bg-obs-surface/90 hover:bg-white/[0.06] text-zinc-300 hover:text-white border border-white/[0.07] rounded-lg shadow-lg"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-auto hidden sm:flex items-center gap-3 bg-obs-surface/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/[0.07] text-[10px]">
          <span className="flex items-center gap-1 text-signal-ok">
            <span className="w-2 h-2 rounded-full bg-signal-ok" />
            High Synergy (In-Process / Shared Primitives)
          </span>
          <span className="text-zinc-700">&bull;</span>
          <span className="flex items-center gap-1 text-signal-star">
            <span className="w-2 h-2 rounded-full bg-signal-star" />
            IPC / Network Boundary
          </span>
        </div>
      </div>
    </div>
  );
}
