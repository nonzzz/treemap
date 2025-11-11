import { runtime } from '../native/runtime'
import type { ColorDecoratorResult } from '../native/runtime'
import { DisplayType, Graph } from './display'
import type { GraphOptions, GraphStyleSheet } from './display'

export type RectStyleOptions = GraphStyleSheet & { fill: ColorDecoratorResult, padding?: number }

export type RectOptions = GraphOptions & { style: Partial<RectStyleOptions> }

export type RoundRectStyleOptions = RectStyleOptions & { radius: number }

export type RoundRectOptions = RectOptions & { style: Partial<RoundRectStyleOptions> }

export class RoundRect<T extends Any = Any> extends Graph {
  style: Required<RoundRectStyleOptions>
  constructor(options: Partial<RoundRectOptions> = {}, widget?: T) {
    super(options, widget)
    this.style = (options.style || Object.create(null)) as Required<RoundRectStyleOptions>
  }

  get __shape__() {
    return DisplayType.RoundRect
  }

  create() {
    const padding = this.style.padding
    const x = 0
    const y = 0
    const width = this.width - padding * 2
    const height = this.height - padding * 2
    const radius = this.style.radius || 0
    this.instruction.beginPath()
    this.instruction.moveTo(x + radius, y)
    this.instruction.arcTo(x + width, y, x + width, y + height, radius)
    this.instruction.arcTo(x + width, y + height, x, y + height, radius)
    this.instruction.arcTo(x, y + height, x, y, radius)
    this.instruction.arcTo(x, y, x + width, y, radius)
    this.instruction.closePath()
    if (this.style.fill) {
      this.instruction.closePath()
      this.instruction.fillStyle(runtime.evaluateFillStyle(this.style.fill, this.style.opacity))
      this.instruction.fill()
    }
    if (this.style.stroke) {
      if (typeof this.style.lineWidth === 'number') {
        this.instruction.lineWidth(this.style.lineWidth)
      }
      this.instruction.strokeStyle(this.style.stroke)
      this.instruction.stroke()
    }
  }

  clone() {
    return new RoundRect({ ...this.style, ...this.__options__, __id__: this.id }, this.__widget__)
  }
}
