'use client';
import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { GraphTopology, GraphNode, GraphEdge } from '@/lib/types';
import { NODE_COLORS, TIER_COLORS } from '@/lib/types';

interface Props {
  topology: GraphTopology;
}

export default function ThreatGraph({ topology }: Props) {
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef   = useRef<(() => void) | undefined>(undefined);

  const draw = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return undefined;

    // Stop previous simulation / remove old tooltip
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = undefined;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const W = containerRef.current.clientWidth  || 600;
    const H = containerRef.current.clientHeight || 400;

    svg.attr('width', W).attr('height', H);

    // ─── Defs ──────────────────────────────────────────────────────
    const defs = svg.append('defs');

    const glow = defs.append('filter').attr('id', 'node-glow')
      .attr('x', '-40%').attr('y', '-40%').attr('width', '180%').attr('height', '180%');
    glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    const m1 = glow.append('feMerge');
    m1.append('feMergeNode').attr('in', 'blur');
    m1.append('feMergeNode').attr('in', 'SourceGraphic');

    const anomGlow = defs.append('filter').attr('id', 'edge-glow');
    anomGlow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    const m2 = anomGlow.append('feMerge');
    m2.append('feMergeNode').attr('in', 'blur');
    m2.append('feMergeNode').attr('in', 'SourceGraphic');

    defs.append('marker').attr('id', 'arrow-normal')
      .attr('viewBox', '0 -5 10 10').attr('refX', 20).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'rgba(125,143,168,0.4)');

    defs.append('marker').attr('id', 'arrow-anomalous')
      .attr('viewBox', '0 -5 10 10').attr('refX', 20).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#ef4444');

    // ─── Background ────────────────────────────────────────────────
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'transparent');

    const g = svg.append('g');

    // ─── Zoom ──────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 3.5])
      .on('zoom', event => g.attr('transform', event.transform));
    svg.call(zoom);

    // ─── Clone data ────────────────────────────────────────────────
    const nodes: GraphNode[] = topology.nodes.map(n => ({ ...n }));
    const nodeSet = new Set(nodes.map(n => n.id));
    const edges: GraphEdge[] = topology.edges
      .filter(e => {
        const s = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id;
        const t = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id;
        return nodeSet.has(s) && nodeSet.has(t);
      })
      .map(e => ({
        ...e,
        source: typeof e.source === 'string' ? e.source : (e.source as GraphNode).id,
        target: typeof e.target === 'string' ? e.target : (e.target as GraphNode).id,
      }));

    // ─── Simulation ────────────────────────────────────────────────
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edges)
        .id(d => d.id)
        .distance(d => (d as GraphEdge).is_anomalous ? 70 : 110)
        .strength(0.5))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(20))
      .force('x', d3.forceX(W / 2).strength(0.05))
      .force('y', d3.forceY(H / 2).strength(0.05));

    // ─── Edges ─────────────────────────────────────────────────────
    const link = g.append('g').attr('class', 'links').selectAll('line')
      .data(edges).join('line')
      .attr('stroke', d => d.is_anomalous ? '#ef4444' : 'rgba(125,143,168,0.22)')
      .attr('stroke-width', d => d.is_anomalous ? 1.8 : 1)
      .attr('stroke-dasharray', d => d.type === 'emailed' ? '4,3' : 'none')
      .attr('marker-end', d => `url(#arrow-${d.is_anomalous ? 'anomalous' : 'normal'})`)
      .attr('filter', d => d.is_anomalous ? 'url(#edge-glow)' : 'none')
      .style('opacity', d => d.is_anomalous ? 0.9 : 0.45);

    // ─── Node groups ───────────────────────────────────────────────
    const node = g.append('g').attr('class', 'nodes').selectAll('g')
      .data(nodes).join('g')
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end',   (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }) as never
      );

    const nodeR = (d: GraphNode) =>
      d.type === 'USER' ? (13 + d.threat_score * 9) : d.type === 'PC' ? 9 : 7;

    // Circle fill
    node.append('circle')
      .attr('r', nodeR)
      .attr('fill', d => d.threat_score > 0.65 ? TIER_COLORS[d.risk_tier].text : NODE_COLORS[d.type])
      .attr('fill-opacity', d => 0.13 + d.threat_score * 0.22)
      .attr('stroke', d => {
        if (d.threat_score > 0.85) return '#ef4444';
        if (d.threat_score > 0.65) return '#f97316';
        return NODE_COLORS[d.type];
      })
      .attr('stroke-width', d => d.threat_score > 0.65 ? 1.8 : 1.5)
      .attr('filter', d => d.threat_score > 0.5 ? 'url(#node-glow)' : 'none');

    // Threat arc ring on high-risk users
    node.filter(d => d.type === 'USER' && d.threat_score > 0.4)
      .append('circle')
      .attr('r', d => nodeR(d) + 5)
      .attr('fill', 'none')
      .attr('stroke', d => TIER_COLORS[d.risk_tier].text)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', d => {
        const r = nodeR(d) + 5;
        const c = 2 * Math.PI * r;
        return `${c * d.threat_score} ${c * (1 - d.threat_score)}`;
      })
      .attr('stroke-dashoffset', d => 2 * Math.PI * (nodeR(d) + 5) * 0.25)
      .attr('opacity', 0.55);

    // Icon
    node.append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('font-size', d => d.type === 'USER' ? 9 : 7)
      .attr('fill', d => NODE_COLORS[d.type])
      .attr('pointer-events', 'none')
      .text(d => d.type === 'USER' ? '◈' : d.type === 'PC' ? '▣' : '◆');

    // Label
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', d => nodeR(d) + 11)
      .attr('font-size', 8)
      .attr('fill', d => d.threat_score > 0.65 ? TIER_COLORS[d.risk_tier].text : 'var(--color-text-secondary)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('pointer-events', 'none')
      .text(d => d.label);

    // ─── Tooltip ───────────────────────────────────────────────────
    const tooltip = d3.select(containerRef.current)
      .append('div')
      .style('position', 'absolute')
      .style('background', 'rgba(4, 7, 13, 0.96)')
      .style('backdrop-filter', 'blur(12px)')
      .style('border', '1px solid rgba(34,211,238,0.4)')
      .style('border-radius', '8px')
      .style('padding', '12px 16px')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '11px')
      .style('color', '#e2e8f0')
      .style('pointer-events', 'none')
      .style('opacity', '0')
      .style('transition', 'opacity 150ms ease-out')
      .style('z-index', '100')
      .style('max-width', '220px')
      .style('box-shadow', '0 8px 32px rgba(0,0,0,0.8), 0 0 24px rgba(34, 211, 238, 0.2) inset');

    node
      .on('mouseover', (event, d) => {
        const c = TIER_COLORS[d.risk_tier].text;
        tooltip.style('opacity', '1').html(`
          <div style="color:${c};font-weight:700;margin-bottom:5px">${d.label}</div>
          <div style="color:#7d8fa8">Type: <span style="color:#e2e8f0">${d.type}</span></div>
          <div style="color:#7d8fa8">Threat: <span style="color:${c}">${(d.threat_score * 100).toFixed(1)}%</span></div>
          <div style="color:#7d8fa8">Tier: <span style="color:${c}">${d.risk_tier}</span></div>
        `);
      })
      .on('mousemove', event => {
        const rect = containerRef.current!.getBoundingClientRect();
        tooltip
          .style('left', (event.clientX - rect.left + 14) + 'px')
          .style('top',  (event.clientY - rect.top - 10) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', '0'));

    // ─── Tick ──────────────────────────────────────────────────────
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x ?? 0)
        .attr('y1', d => (d.source as GraphNode).y ?? 0)
        .attr('x2', d => (d.target as GraphNode).x ?? 0)
        .attr('y2', d => (d.target as GraphNode).y ?? 0);
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Auto-fit after settle
    simulation.on('end', () => {
      const b = (g.node() as SVGGElement).getBBox();
      if (b.width > 0 && b.height > 0) {
        const scale = Math.min(0.88 * W / b.width, 0.88 * H / b.height, 1.5);
        const tx = W / 2 - scale * (b.x + b.width  / 2);
        const ty = H / 2 - scale * (b.y + b.height / 2);
        svg.transition().duration(600)
          .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      }
    });

    // Return cleanup
    const destroy = () => {
      simulation.stop();
      tooltip.remove();
    };
    cleanupRef.current = destroy;
    return destroy;
  }, [topology]);

  // ResizeObserver: redraw whenever the container changes size
  useEffect(() => {
    if (!containerRef.current) return;

    const ro = new ResizeObserver(() => { draw(); });
    ro.observe(containerRef.current);

    // Initial draw
    draw();

    return () => {
      ro.disconnect();
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [draw]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
