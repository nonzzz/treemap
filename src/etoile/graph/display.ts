/* eslint-disable no-use-before-define */

import { Matrix2D } from '../native/matrix'

const SELF_ID = {
  id: 0,
  get() {
    return this.id++
  }
}

export const enum DisplayType {
  Graph = 'Graph',
  Box = 'Box',
  Text = 'Text',
  RoundRect = 'RoundRect'
}

export abstract class Display {
  parent: Display | null
  id: number
  matrix: Matrix2D
  abstract get __instanceOf__(): DisplayType
  constructor(id?: number) {
    this.parent = null
    this.id = id ?? SELF_ID.get()
    this.matrix = new Matrix2D()
  }

  destory() {
    //
  }
}

export interface GraphStyleSheet {
  stroke: string
  opacity: number
  font: string
  lineWidth: number
}

interface RequestID {
  __id__?: number
}

export interface LocOptions extends RequestID {
  width: number
  height: number
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  skewX: number
  skewY: number
}

export interface GraphOptions extends LocOptions {
  [key: string]: unknown
}

export interface InstructionAssignMappings {
  fillStyle: (arg: string) => void
  strokeStyle: (arg: string) => void
  font: (arg: string) => void
  lineWidth: (arg: number) => void
  textAlign: (arg: CanvasTextAlign) => void
  textBaseline: (arg: CanvasTextBaseline) => void
}

export interface InstructionWithFunctionCall extends CanvasDrawImage {
  fillRect: (x: number, y: number, w: number, h: number) => void
  strokeRect: (x: number, y: number, w: number, h: number) => void
  fillText: (text: string, x: number, y: number, maxWidth?: number) => void
  beginPath: () => void
  moveTo: (x: number, y: number) => void
  arcTo: (x1: number, y1: number, x2: number, y2: number, radius: number) => void
  closePath: () => void
  fill: () => void
  stroke: () => void
}

type Mod<
  T extends InstructionAssignMappings & InstructionWithFunctionCall = InstructionAssignMappings & InstructionWithFunctionCall,
  K extends keyof T = keyof T
> = T[K] extends (...args: Any) => Any ? [K, Parameters<T[K]>] : never

interface Instruction extends InstructionAssignMappings, InstructionWithFunctionCall {
  mods: Array<{ mod: Mod, type: number }>
}

const ASSIGN_MAPPINGS = {
  fillStyle: 0o1,
  strokeStyle: 0o2,
  font: 0o4,
  lineWidth: 0o10,
  textAlign: 0o20,
  textBaseline: 0o40
} as const

export const ASSIGN_MAPPINGS_MODE = ASSIGN_MAPPINGS.fillStyle | ASSIGN_MAPPINGS.strokeStyle | ASSIGN_MAPPINGS.font |
  ASSIGN_MAPPINGS.lineWidth | ASSIGN_MAPPINGS.textAlign | ASSIGN_MAPPINGS.textBaseline

export const CALL_MAPPINGS_MODE = 0o0

function createInstruction() {
  return <Instruction> {
    mods: [],
    fillStyle(...args) {
      this.mods.push({ mod: ['fillStyle', args], type: ASSIGN_MAPPINGS.fillStyle })
    },
    fillRect(...args) {
      this.mods.push({ mod: ['fillRect', args], type: CALL_MAPPINGS_MODE })
    },
    strokeStyle(...args) {
      this.mods.push({ mod: ['strokeStyle', args], type: ASSIGN_MAPPINGS.strokeStyle })
    },
    lineWidth(...args) {
      this.mods.push({ mod: ['lineWidth', args], type: ASSIGN_MAPPINGS.lineWidth })
    },
    strokeRect(...args) {
      this.mods.push({ mod: ['strokeRect', args], type: CALL_MAPPINGS_MODE })
    },
    fillText(...args) {
      this.mods.push({ mod: ['fillText', args], type: CALL_MAPPINGS_MODE })
    },
    font(...args) {
      this.mods.push({ mod: ['font', args], type: ASSIGN_MAPPINGS.font })
    },
    textBaseline(...args) {
      this.mods.push({ mod: ['textBaseline', args], type: ASSIGN_MAPPINGS.textBaseline })
    },
    textAlign(...args) {
      this.mods.push({ mod: ['textAlign', args], type: ASSIGN_MAPPINGS.textAlign })
    },
    beginPath() {
      this.mods.push({ mod: ['beginPath', []], type: CALL_MAPPINGS_MODE })
    },
    moveTo(...args) {
      this.mods.push({ mod: ['moveTo', args], type: CALL_MAPPINGS_MODE })
    },
    arcTo(...args) {
      this.mods.push({ mod: ['arcTo', args], type: CALL_MAPPINGS_MODE })
    },
    closePath() {
      this.mods.push({ mod: ['closePath', []], type: CALL_MAPPINGS_MODE })
    },
    fill() {
      this.mods.push({ mod: ['fill', []], type: CALL_MAPPINGS_MODE })
    },
    stroke() {
      this.mods.push({ mod: ['stroke', []], type: CALL_MAPPINGS_MODE })
    },
    drawImage(this: Instruction, ...args: Any[]) {
      // @ts-expect-error safe
      this.mods.push({ mod: ['drawImage', args], type: CALL_MAPPINGS_MODE })
    }
  }
}

export abstract class S extends Display {
  width: number
  height: number
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  skewX: number
  skewY: number

  constructor(options: Partial<LocOptions> = {}) {
    super(options.__id__)
    this.width = options.width || 0
    this.height = options.height || 0
    this.x = options.x || 0
    this.y = options.y || 0
    this.scaleX = options.scaleX || 1
    this.scaleY = options.scaleY || 1
    this.rotation = options.rotation || 0
    this.skewX = options.skewX || 0
    this.skewY = options.skewY || 0
  }
}

// For performance. we need impl AABB Check for render.

export abstract class Graph<T extends Any = Any> extends S {
  instruction: ReturnType<typeof createInstruction>
  __options__: Partial<LocOptions>
  __widget__: T
  abstract style: GraphStyleSheet
  constructor(options: Partial<GraphOptions> = {}, widget?: T) {
    super(options)
    this.instruction = createInstruction()
    this.__options__ = options
    this.__widget__ = widget as T
  }
  abstract create(): void
  abstract clone(): Graph
  abstract get __shape__(): DisplayType

  render(ctx: CanvasRenderingContext2D) {
    this.create()
    const cap = this.instruction.mods.length

    for (let i = 0; i < cap; i++) {
      const { mod, type } = this.instruction.mods[i]
      const [direct, ...args] = mod
      if (type & ASSIGN_MAPPINGS_MODE) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        ctx[direct] = args[0]
        continue
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      ctx[direct].apply(ctx, ...args)
    }
  }

  get __instanceOf__(): DisplayType.Graph {
    return DisplayType.Graph
  }
}
