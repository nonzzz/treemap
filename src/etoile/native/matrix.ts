const DEG_TO_RAD = Math.PI / 180
export const PI_2 = Math.PI * 2

export interface MatrixLoc {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const DEFAULT_MATRIX_LOC: MatrixLoc = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0
}

export class Matrix2D implements MatrixLoc {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
  constructor(loc: Partial<MatrixLoc> = {}) {
    this.a = loc.a || 1
    this.b = loc.b || 0
    this.c = loc.c || 0
    this.d = loc.d || 1
    this.e = loc.e || 0
    this.f = loc.f || 0
  }

  create(loc: MatrixLoc) {
    Object.assign(this, loc)
    return this
  }

  transform(x: number, y: number, scaleX: number, scaleY: number, rotation: number, skewX: number, skewY: number) {
    this.scale(scaleX, scaleY).translation(x, y)
    if (skewX || skewY) {
      this.skew(skewX, skewY)
    } else {
      this.roate(rotation)
    }

    return this
  }

  transformPoint(x: number, y: number) {
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f
    }
  }

  translation(x: number, y: number) {
    this.e += x
    this.f += y
    return this
  }

  scale(a: number, d: number) {
    this.a *= a
    this.d *= d
    return this
  }

  private skew(x: number, y: number) {
    const tanX = Math.tan(x * DEG_TO_RAD)
    const tanY = Math.tan(y * DEG_TO_RAD)
    const a = this.a + this.b * tanX
    const b = this.b + this.a * tanY
    const c = this.c + this.d * tanX
    const d = this.d + this.c * tanY
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    return this
  }

  private roate(rotation: number) {
    if (rotation > 0) {
      const rad = rotation * DEG_TO_RAD
      const cosTheta = Math.cos(rad)
      const sinTheta = Math.sin(rad)
      const a = this.a * cosTheta - this.b * sinTheta
      const b = this.a * sinTheta + this.b * cosTheta
      const c = this.c * cosTheta - this.d * sinTheta
      const d = this.c * sinTheta + this.d * cosTheta
      this.a = a
      this.b = b
      this.c = c
      this.d = d
    }
    return this
  }
}
