import { applyCanvasTransform } from '../../shared'
import { Box, asserts } from '../graph'
import { Display } from '../graph/display'
import { Event } from '../native/event'
import type { DefaultEventDefinition } from '../native/event'
import { log } from '../native/log'
import { Render } from './render'

import type { RenderViewportOptions } from './render'

export type ApplyTo = string | HTMLElement

export interface DrawGraphIntoCanvasOptions {
  c: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  dpr: number
}

export function drawGraphIntoCanvas(
  graph: Display,
  opts: DrawGraphIntoCanvasOptions,
  visibleSet?: Set<number>
) {
  const { ctx, dpr } = opts

  if (asserts.isBox(graph)) {
    const elements = graph.elements
    for (let i = 0; i < elements.length; i++) {
      drawGraphIntoCanvas(elements[i], opts, visibleSet)
    }
    return
  }
  if (asserts.isGraph(graph)) {
    if (visibleSet && !visibleSet.has(graph.id)) {
      return
    }
    ctx.save()
    const matrix = graph.matrix.create({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    matrix.transform(graph.x, graph.y, graph.scaleX, graph.scaleY, graph.rotation, graph.skewX, graph.skewY)
    applyCanvasTransform(ctx, matrix, dpr)
    graph.render(ctx)
    ctx.restore()
  }
}

export interface DirtyRect {
  x: number
  y: number
  width: number
  height: number
}

interface SpatialEntry {
  id: number
  x: number
  y: number
  w: number
  h: number
}

function collectSpatialEntries(graph: Display, out: SpatialEntry[]) {
  if (asserts.isBox(graph)) {
    const elements = graph.elements
    for (let i = 0; i < elements.length; i++) {
      collectSpatialEntries(elements[i], out)
    }
    return
  }
  if (asserts.isGraph(graph)) {
    out.push({ id: graph.id, x: graph.x, y: graph.y, w: graph.width, h: graph.height })
  }
}

function intersects(b: SpatialEntry, dr: DirtyRect) {
  return b.x < dr.x + dr.width && b.x + b.w > dr.x &&
    b.y < dr.y + dr.height && b.y + b.h > dr.y
}

export class Schedule<D extends DefaultEventDefinition = DefaultEventDefinition> extends Box {
  render: Render
  to: HTMLElement
  event: Event<D>
  private _overlays: Display[]
  private _spatialIndex: SpatialEntry[]

  constructor(to: ApplyTo, renderOptions: Partial<RenderViewportOptions> = {}) {
    super()
    this.to = typeof to === 'string' ? document.querySelector(to)! : to
    if (!this.to) {
      log.panic('The element to bind is not found.')
    }
    const { width, height } = this.to.getBoundingClientRect()
    Object.assign(renderOptions, { width, height }, { devicePixelRatio: window.devicePixelRatio || 1 })
    this.event = new Event()
    this.render = new Render(this.to, renderOptions as RenderViewportOptions)
    this._overlays = []
    this._spatialIndex = []
  }

  addOverlay(...elements: Display[]) {
    for (const el of elements) {
      this._overlays.push(el)
    }
  }

  clearOverlay() {
    this._overlays.length = 0
  }

  /** Full redraw: clear canvas, draw all elements and overlay. Rebuilds spatial index. */
  update() {
    const { width, height, devicePixelRatio: dpr } = this.render.options
    this.render.clear(width, height)
    const drawOpts: DrawGraphIntoCanvasOptions = { c: this.render.canvas, ctx: this.render.ctx, dpr }
    this.execute(this.render, this)
    for (let i = 0; i < this._overlays.length; i++) {
      drawGraphIntoCanvas(this._overlays[i], drawOpts)
    }
    const identity = this.matrix.create({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    applyCanvasTransform(this.render.ctx, identity, dpr)
    // Rebuild spatial index after full draw (positions are now finalised).
    this._spatialIndex.length = 0
    collectSpatialEntries(this, this._spatialIndex)
  }

  updateDirty(rects: ReadonlyArray<DirtyRect>) {
    // Partial redraw: for each dirty rect, clip → clear → redraw only the elements
    // that spatially intersect that rect → redraw overlay within the clip.
    // Vastly cheaper than a full update for small regions like hover highlights.
    if (rects.length === 0) { return }
    const { devicePixelRatio: dpr } = this.render.options
    const ctx = this.render.ctx
    const drawOpts: DrawGraphIntoCanvasOptions = { c: this.render.canvas, ctx, dpr }

    const identity = this.matrix.create({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    applyCanvasTransform(ctx, identity, dpr)

    for (const dr of rects) {
      // Build a culled visible-set: only leaf-graph IDs whose bbox overlaps dr.
      const visibleSet = new Set<number>()
      for (let i = 0; i < this._spatialIndex.length; i++) {
        if (intersects(this._spatialIndex[i], dr)) {
          visibleSet.add(this._spatialIndex[i].id)
        }
      }

      ctx.save()
      ctx.beginPath()
      ctx.rect(dr.x, dr.y, dr.width, dr.height)
      ctx.clip()
      ctx.clearRect(dr.x, dr.y, dr.width, dr.height)
      this.execute(this.render, this, visibleSet)
      for (let i = 0; i < this._overlays.length; i++) {
        drawGraphIntoCanvas(this._overlays[i], drawOpts)
      }
      ctx.restore()
    }

    applyCanvasTransform(ctx, identity, dpr)
  }

  // Execute (draw) graph elements; pass visibleSet to skip non-intersecting leaves.
  execute(render: Render, graph: Display = this, visibleSet?: Set<number>) {
    drawGraphIntoCanvas(graph, { c: render.canvas, ctx: render.ctx, dpr: render.options.devicePixelRatio }, visibleSet)
  }
}
