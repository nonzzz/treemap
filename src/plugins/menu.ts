import { DOMEvent, isContextMenuEvent } from '../dom-event'
import type { Box } from '../etoile'
import type { LayoutModule } from '../primitives/squarify'
import { definePlugin } from '../shared/plugin-driver'

export interface MenuRenderConfig {
  html: string
  action: string
}

export interface MenuPluginOptions {
  style?: Partial<CSSStyleDeclaration>
  render?: (menu: HTMLDivElement) => MenuRenderConfig[]
  onClick?: (action: string, module: Box<LayoutModule> | null) => void
}

export function presetMenuPlugin(options?: MenuPluginOptions) {
  let menu: HTMLDivElement | null = null
  let domEvent: DOMEvent | null = null

  const handleMenuClick = (e: MouseEvent) => {
    if (!domEvent) {
      return
    }
    if (!menu) {
      return
    }
    const target = e.target as HTMLElement

    if (target.parentNode) {
      const parent = target.parentNode as HTMLElement
      const action = parent.getAttribute('data-action')
      if (!action) { return }
      if (options?.onClick) {
        options.onClick(
          action,
          domEvent.findRelativeGraphicNode({ kind: 'click', native: e })
        )
      }
    }

    menu.style.display = 'none'
  }

  return definePlugin({
    name: 'treemap:preset-menu',

    onDOMEventTriggered(_, event, __, DOMEvent) {
      if (isContextMenuEvent(event)) {
        event.native.stopPropagation()
        event.native.preventDefault()
        if (!menu) {
          menu = document.createElement('div')
          domEvent = DOMEvent
          Object.assign(menu.style, { backgroundColor: '#fff', ...options?.style, position: 'absolute', zIndex: '9999' })
          menu.addEventListener('click', handleMenuClick)
          if (menu && options?.render) {
            const result = options.render(menu)
            menu.innerHTML = result.map((item) => {
              return `<div data-action='${item.action}'>${item.html}</div>`
            }).join('')
          }
          document.body.append(menu)
        }
        menu.style.left = event.native.clientX + 'px'
        menu.style.top = event.native.clientY + 'px'
        menu.style.display = 'initial'
      }
    },
    onDispose() {
      if (!menu) { return }
      menu.removeEventListener('click', handleMenuClick)
      menu = null
      domEvent = null
    }
  })
}
