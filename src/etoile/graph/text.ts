import { DisplayType, Graph } from './display'
import type { GraphOptions, GraphStyleSheet } from './display'

export interface TextOptions extends Omit<GraphOptions, 'style'> {
  text: string
  style: Partial<
    GraphStyleSheet & {
      font: string,
      textAlign: CanvasTextAlign,
      baseline: CanvasTextBaseline,
      lineWidth: number,
      fill: string
    }
  >
}

export class Text<T extends Any = Any> extends Graph {
  text: string
  style: Required<TextOptions['style']>
  constructor(options: Partial<TextOptions> = {}, widget?: T) {
    super(options, widget)
    this.text = options.text || ''
    this.style = (options.style || Object.create(null)) as Required<TextOptions['style']>
  }

  create() {
    if (this.style.fill) {
      this.instruction.font(this.style.font)
      this.instruction.lineWidth(this.style.lineWidth)
      this.instruction.textBaseline(this.style.baseline)
      this.instruction.textAlign(this.style.textAlign)
      this.instruction.fillStyle(this.style.fill)
      this.instruction.fillText(this.text, 0, 0)
    }
  }

  clone() {
    return new Text({ ...this.style, ...this.__options__, __id__: this.id }, this.__widget__)
  }

  get __shape__() {
    return DisplayType.Text
  }
}
