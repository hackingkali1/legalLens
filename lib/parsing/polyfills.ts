/**
 * Polyfills for browser canvas and geometry globals required by pdf-parse and pdfjs-dist
 * when running in headless Node.js serverless runtimes (such as Vercel Serverless / AWS Lambda).
 */

if (typeof globalThis !== 'undefined') {
  const g = globalThis as Record<string, unknown>;

  if (typeof g.DOMMatrix === 'undefined') {
    class PolyfillDOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      m11 = 1;
      m12 = 0;
      m13 = 0;
      m14 = 0;
      m21 = 0;
      m22 = 1;
      m23 = 0;
      m24 = 0;
      m31 = 0;
      m32 = 0;
      m33 = 1;
      m34 = 0;
      m41 = 0;
      m42 = 0;
      m43 = 0;
      m44 = 1;
      is2D = true;
      isIdentity = true;

      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length >= 6) {
          this.a = this.m11 = init[0];
          this.b = this.m12 = init[1];
          this.c = this.m21 = init[2];
          this.d = this.m22 = init[3];
          this.e = this.m41 = init[4];
          this.f = this.m42 = init[5];
        }
      }

      inverse() {
        return new PolyfillDOMMatrix();
      }
      multiply() {
        return new PolyfillDOMMatrix();
      }
      translate() {
        return new PolyfillDOMMatrix();
      }
      scale() {
        return new PolyfillDOMMatrix();
      }
      rotate() {
        return new PolyfillDOMMatrix();
      }
      transformPoint(p: unknown) {
        return p;
      }
      static fromMatrix() {
        return new PolyfillDOMMatrix();
      }
      static fromFloat32Array() {
        return new PolyfillDOMMatrix();
      }
      static fromFloat64Array() {
        return new PolyfillDOMMatrix();
      }
    }
    g.DOMMatrix = PolyfillDOMMatrix;
  }

  if (typeof g.ImageData === 'undefined') {
    class PolyfillImageData {
      width: number;
      height: number;
      data: Uint8ClampedArray;
      colorSpace = 'srgb';

      constructor(widthOrData: number | Uint8ClampedArray, height?: number) {
        if (typeof widthOrData === 'number') {
          this.width = widthOrData;
          this.height = height || 0;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        } else {
          this.data = widthOrData;
          this.width = height || 0;
          this.height = this.data.length / (this.width * 4) || 0;
        }
      }
    }
    g.ImageData = PolyfillImageData;
  }

  if (typeof g.Path2D === 'undefined') {
    class PolyfillPath2D {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
    }
    g.Path2D = PolyfillPath2D;
  }
}
