'use client';
import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { GraphTopology, GraphNode, GraphEdge } from '@/lib/types';
import { NODE_COLORS, TIER_COLORS } from '@/lib/types';

interface Props {
  topology: GraphTopology;
  width?: number;
  height?: number;
}

export default function ThreatGraph({ topology, width = 800, height = 480 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const W = containerRef.current?.clientWidth || width;
    const H = height;

    svg.attr('width', W).attr('height', H);

    // Defs: arrow markers and filters
    const defs = svg.append('defs');

    // Glow filter
    const filter = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Anomaly glow
    const anomalyFilter = defs.append('filter').attr('id', 'anomaly-glow');
    anomalyFilter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge2 = anomalyFilter.append('feMerge');
    feMerge2.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge2.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arrow marker
    defs.append('marker')
      .attr('id', 'arrow-normal')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'rgba(125,143,168,0.5)');

    defs.append('marker')
      .attr('id', 'arrow-anomalous')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#ef4444');

    // Deep background
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'transparent');

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // Clone nodes/edges for D3 mutation
    const nodes: GraphNode[] = topology.nodes.map(n => ({ ...n }));
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges: GraphEdge[] = topology.edges
      .filter(e => {
        const s = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id;
        const t = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id;
        return nodeIds.has(s) && nodeIds.has(t);
      })
      .map(e => ({
        ...e,
        source: typeof e.source === 'string' ? e.source : (e.source as GraphNode).id,
        target: typeof e.target === 'string' ? e.target : (e.target as GraphNode).id,
      }));

    // Force simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edges)
        .id(d => d.id)
        .distance(d => (d as GraphEdge).is_anomalous ? 80 : 120)
        .strength(0.4))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(22))
      .force('x', d3.forceX(W / 2).strength(0.04))
      .force('y', d3.forceY(H / 2).strength(0.04));

    // Edges
    const link = g.append('g').attr('class', 'links').selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', d => d.is_anomalous ? '#ef4444' : 'rgba(125,143,168,0.25)')
      .attr('stroke-width', d => d.is_anomalous ? 2 : 1)
      .attr('stroke-dasharray', d => d.type === 'emailed' ? '4,3' : 'none')
      .attr('marker-end', d => `url(#arrow-${d.is_anomalous ? 'anomalous' : 'normal'})`)
      .attr('filter', d => d.is_anomalous ? 'url(#anomaly-glow)' : 'none')
      .style('opacity', d => d.is_anomalous ? 1 : 0.5);

    // Node groups
    const node = g.append('g').attr('class', 'nodes').selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          }) as never
      );

    // Node circles
    const nodeRadius = (d: GraphNode) =>
      d.type === 'USER' ? (14 + d.threat_score * 10) : d.type === 'PC' ? 10 : 8;

    node.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => {
        const base = NODE_COLORS[d.type];
        return d.threat_score > 0.65 ? TIER_COLORS[d.risk_tier].text : base;
      })
      .attr('fill-opacity', d => 0.15 + d.threat_score * 0.25)
      .attr('stroke', d => {
        if (d.threat_score > 0.85) return '#ef4444';
        if (d.threat_score > 0.65) return '#f97316';
        return NODE_COLORS[d.type];
      })
      .attr('stroke-width', d => d.threat_score > 0.65 ? 2 : 1.5)
      .attr('filter', d => d.threat_score > 0.5 ? 'url(#glow)' : 'none');

    // Threat score ring for high-risk users
    node.filter(d => d.type === 'USER' && d.threat_score > 0.4)
      .append('circle')
      .attr('r', d => nodeRadius(d) + 5)
      .attr('fill', 'none')
      .attr('stroke', d => TIER_COLORS[d.risk_tier].text)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', d => {
        const r = nodeRadius(d) + 5;
        const circ = 2 * Math.PI * r;
        const filled = circ * d.threat_score;
        return `${filled} ${circ - filled}`;
      })
      .attr('stroke-dashoffset', d => {
        const r = nodeRadius(d) + 5;
        return 2 * Math.PI * r * 0.25;
      })
      .attr('opacity', 0.6)
      .style('transform-origin', 'center');

    // Node icons (shapes for type differentiation)
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => d.type === 'USER' ? 10 : 8)
      .attr('fill', d => NODE_COLORS[d.type])
      .attr('pointer-events', 'none')
      .text(d => d.type === 'USER' ? '◈' : d.type === 'PC' ? '▣' : '◆');

    // Labels
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', d => nodeRadius(d) + 12)
      .attr('font-size', 9)
      .attr('fill', d => d.threat_score > 0.65 ? TIER_COLORS[d.risk_tier].text : 'var(--color-text-secondary)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('pointer-events', 'none')
      .text(d => d.label);

    // Tooltip
    const tooltip = d3.select(containerRef.current)
      .append('div')
      .style('position', 'absolute')
      .style('background', 'rgba(13,20,36,0.95)')
      .style('border', '1px solid rgba(34,211,238,0.3)')
      .style('border-radius', '8px')
      .style('padding', '10px 14px')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '11px')
      .style('color', '#e2e8f0')
      .style('pointer-events', 'none')
      .style('opacity', '0')
      .style('transition', 'opacity 150ms')
      .style('z-index', '100')
      .style('max-width', '220px');

    node.on('mouseover', (event, d) => {
      const tierColor = TIER_COLORS[d.risk_tier].text;
      tooltip
        .style('opacity', '1')
        .html(`
          <div style="color:${tierColor};font-weight:700;margin-bottom:6px">${d.label}</div>
          <div style="color:var(--color-text-secondary)">Type: ${d.type}</div>
          <div style="color:var(--color-text-secondary)">Threat: 
            <span style="color:${tierColor}">${(d.threat_score * 100).toFixed(1)}%</span>
          </div>
          <div style="color:var(--color-text-secondary)">Tier: 
            <span style="color:${tierColor}">${d.risk_tier}</span>
          </div>
        `);
    })
    .on('mousemove', (event) => {
      const rect = containerRef.current!.getBoundingClientRect();
      tooltip
        .style('left', `${event.clientX - rect.left + 12}px`)
        .style('top', `${event.clientY - rect.top - 10}px`);
    })
    .on('mouseout', () => tooltip.style('opacity', '0'));

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x ?? 0)
        .attr('y1', d => (d.source as GraphNode).y ?? 0)
        .attr('x2', d => (d.target as GraphNode).x ?? 0)
        .attr('y2', d => (d.target as GraphNode).y ?? 0);

      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Fit to view after settle
    simulation.on('end', () => {
      const bounds = (g.node() as SVGGElement).getBBox();
      if (bounds.width > 0 && bounds.height > 0) {
        const scale = Math.min(
          0.9 * W / bounds.width,
          0.9 * H / bounds.height,
          1.4
        );
        const tx = W / 2 - scale * (bounds.x + bounds.width / 2);
        const ty = H / 2 - scale * (bounds.y + bounds.height / 2);
        svg.transition().duration(600)
          .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      }
    });

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [topology, width, height]);

  useEffect(() => {
    const cleanup = draw();
    return cleanup;
  }, [draw]);

  return (
    <div ref={containerRef} style={{ width: '100%', height, position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', height }} />
    </div>
  );
}
