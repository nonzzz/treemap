import { raf } from '../../shared'

export function getOffset(el: HTMLElement) {
  let e = 0
  let f = 0
  if (document.documentElement.getBoundingClientRect && el.getBoundingClientRect) {
    const { top, left } = el.getBoundingClientRect()
    e = top
    f = left
  } else {
    for (let elt: HTMLElement | null = el; elt; elt = el.offsetParent as HTMLElement | null) {
      e += el.offsetLeft
      f += el.offsetTop
    }
  }

  return [
    e + Math.max(document.documentElement.scrollLeft, document.body.scrollLeft),
    f + Math.max(document.documentElement.scrollTop, document.body.scrollTop)
  ]
}

export interface BBox {
  x: number
  y: number
}

export function captureBoxXY(c: HTMLElement, evt: unknown, a: number, d: number, translateX: number, translateY: number): BBox {
  const boundingClientRect = c.getBoundingClientRect()
  if (evt instanceof MouseEvent) {
    const [e, f] = getOffset(c)
    return {
      x: ((evt.clientX - boundingClientRect.left - e - translateX) / a),
      y: ((evt.clientY - boundingClientRect.top - f - translateY) / d)
    }
  }
  return { x: 0, y: 0 }
}

export interface EffectScopeContext {
  animationFrameID: number | null
}

function createEffectRun(c: EffectScopeContext) {
  return (fn: () => boolean | void) => {
    const effect = () => {
      const done = fn()
      if (!done) {
        c.animationFrameID = raf(effect)
      }
    }
    if (!c.animationFrameID) {
      c.animationFrameID = raf(effect)
    }
  }
}

function createEffectStop(c: EffectScopeContext) {
  return () => {
    if (c.animationFrameID) {
      window.cancelAnimationFrame(c.animationFrameID)
      c.animationFrameID = null
    }
  }
}

export function createSmoothFrame() {
  const c: EffectScopeContext = {
    animationFrameID: null
  }

  const run = createEffectRun(c)
  const stop = createEffectStop(c)

  return { run, stop }
}
