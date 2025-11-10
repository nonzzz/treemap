import { Display, DisplayType } from './display'
import { asserts } from './types'

export abstract class C extends Display {
  elements: Display[]
  constructor(shallowCount = 0) {
    super(shallowCount)
    this.elements = []
  }
  abstract get __instanceOf__(): DisplayType

  add(...elements: Display[]) {
    const cap = elements.length
    for (let i = 0; i < cap; i++) {
      const element = elements[i]
      if (element.parent) {
        // todo
      }
      this.elements.push(element)
      element.parent = this
    }
  }

  remove(...elements: Display[]) {
    const cap = elements.length
    for (let i = 0; i < cap; i++) {
      for (let j = this.elements.length - 1; j >= 0; j--) {
        const element = this.elements[j]
        if (element.id === elements[i].id) {
          this.elements.splice(j, 1)
          element.parent = null
        }
      }
    }
  }

  destory() {
    this.elements.forEach((element) => element.parent = null)
    this.elements.length = 0
  }
}

export class Box extends C {
  elements: Display[]

  constructor(shallowCount = 0) {
    super(shallowCount)
    this.elements = []
  }

  add(...elements: Display[]) {
    const cap = elements.length
    for (let i = 0; i < cap; i++) {
      const element = elements[i]
      if (element.parent) {
        // todo
      }
      this.elements.push(element)
      element.parent = this
    }
  }

  remove(...elements: Display[]) {
    const cap = elements.length
    for (let i = 0; i < cap; i++) {
      for (let j = this.elements.length - 1; j >= 0; j--) {
        const element = this.elements[j]
        if (element.id === elements[i].id) {
          this.elements.splice(j, 1)
          element.parent = null
        }
      }
    }
  }

  destory() {
    this.elements.forEach((element) => element.parent = null)
    this.elements.length = 0
  }

  get __instanceOf__(): DisplayType.Box {
    return DisplayType.Box
  }

  clone() {
    const box = new Box()
    if (this.elements.length) {
      const stack: { elements: Display[], parent: Box }[] = [{ elements: this.elements, parent: box }]

      while (stack.length > 0) {
        const { elements, parent } = stack.pop()!
        const cap = elements.length
        for (let i = 0; i < cap; i++) {
          const element = elements[i]
          if (asserts.isBox(element)) {
            const newBox = new Box()
            newBox.parent = parent
            parent.add(newBox)
            stack.push({ elements: element.elements, parent: newBox })
          } else if (asserts.isGraph(element)) {
            const el = element.clone()
            el.parent = parent
            parent.add(el)
          }
        }
      }
    }
    return box
  }
}
