// The header logo as a real 3D model: extruded, bevelled letters with a navy rim, jewel blocks
// and sparks, built in Blender (tools/logo-model/build.py). It draws on its own little WebGL
// canvas laid over the <img>, which stays in the page for layout and as the fallback.

import modelURL from '../assets/branding/epic-blast-logo.bin?url';
import { parseLogoModel, type LogoModel } from './logo-model.ts';

/** Largest lean toward the finger, in radians. */
export const LOGO_MAX_LEAN = (12 * Math.PI) / 180;
/** Resting pose: seen a little from below and the right, like the drawn logo, so the depth always shows. */
const REST_PITCH = (-9 * Math.PI) / 180;
const REST_YAW = (-7 * Math.PI) / 180;
/** Camera distance, in logo widths. */
const CAMERA = 2.6;
/** Share of the canvas width the model fills at rest; the rest is room for the lean. */
const FILL = 0.86;

const VERTEX = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uModel;
uniform mat4 uProjection;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uProjection * world;
}`;

const FRAGMENT = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(-vWorld);
  vec3 key = normalize(vec3(-0.45, 0.7, 0.75));
  vec3 fill = normalize(vec3(0.6, -0.3, 0.6));
  float diffuse = max(dot(n, key), 0.0) * 0.55 + max(dot(n, fill), 0.0) * 0.18;
  float spec = pow(max(dot(n, normalize(key + view)), 0.0), 36.0) * 0.45;
  float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0) * 0.12;
  gl_FragColor = vec4(vColor * (0.52 + diffuse) + spec + rim, 1.0);
}`;

export class Logo3D {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly img: HTMLImageElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly count: number;
  private readonly indexType: number;
  private readonly aspect: number;
  private leanX = NaN;
  private leanY = NaN;
  private width = 0;
  private height = 0;

  /** Builds the 3D logo over `img`, or returns null without WebGL or the model; the plain logo then stays. */
  static async mount(img: HTMLImageElement, source: string | ArrayBuffer = modelURL): Promise<Logo3D | null> {
    try {
      const [model] = await Promise.all([
        (typeof source === 'string' ? fetch(source).then(r => r.arrayBuffer()) : Promise.resolve(source)).then(
          parseLogoModel,
        ),
        img.decode(),
      ]);
      const canvas = document.createElement('canvas');
      canvas.className = 'logo-3d';
      canvas.setAttribute('aria-hidden', 'true');
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
      if (!gl) return null;
      const logo = new Logo3D(img, canvas, gl, model);
      img.after(canvas);
      logo.render(0, 0, true);
      img.parentElement?.classList.add('has-logo-3d');
      return logo;
    } catch {
      return null;
    }
  }

  private constructor(img: HTMLImageElement, canvas: HTMLCanvasElement, gl: WebGLRenderingContext, model: LogoModel) {
    this.img = img;
    this.canvas = canvas;
    this.gl = gl;
    this.aspect = img.naturalHeight / img.naturalWidth;
    this.program = link(gl, VERTEX, FRAGMENT);
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);
    const attrib = (name: string, size: number, type: number, normalized: boolean, offset: number) => {
      const at = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, size, type, normalized, 12, offset);
    };
    // Positions are int16 in 1/16384 logo widths; the model matrix scales them back.
    attrib('aPos', 3, gl.SHORT, false, 0);
    attrib('aNormal', 3, gl.BYTE, true, 6);
    attrib('aColor', 3, gl.UNSIGNED_BYTE, true, 9);

    const wide = model.indices instanceof Uint32Array;
    if (wide && !gl.getExtension('OES_element_index_uint')) throw new Error('32-bit indices');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);
    this.indexType = wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    this.count = model.indices.length;
    gl.enable(gl.DEPTH_TEST);

    new ResizeObserver(() => this.render(this.leanX, this.leanY, true)).observe(img);
  }

  /** Leans the logo; `x` and `y` are the board's parallax, each in [-1, 1]. */
  lean(x: number, y: number): void {
    this.render(x, y, false);
  }

  private render(x: number, y: number, force: boolean): void {
    if (!force && x === this.leanX && y === this.leanY) return;
    this.leanX = x;
    this.leanY = y;
    this.fit();
    const gl = this.gl;
    const p = this.program;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Same sense as the board: the side toward the finger dips away, so the far sides show.
    const pitch = REST_PITCH - (y || 0) * LOGO_MAX_LEAN;
    const yaw = REST_YAW + (x || 0) * LOGO_MAX_LEAN;
    const model = multiply(multiply(rotateX(pitch), rotateY(yaw)), scale(FILL / 16384));
    model[14] = -CAMERA;
    const fovY = 2 * Math.atan(this.aspect / 2 / CAMERA);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uModel'), false, model);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uProjection'), false, perspective(fovY, 1 / this.aspect, 2, 3.2));
    gl.drawElements(gl.TRIANGLES, this.count, this.indexType, 0);
  }

  /** Matches the canvas to the <img>'s box. */
  private fit(): void {
    const img = this.img;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const style = this.canvas.style;
    style.left = `${img.offsetLeft}px`;
    style.top = `${img.offsetTop}px`;
    style.width = `${img.offsetWidth}px`;
    style.height = `${img.offsetHeight}px`;
    const w = Math.max(1, Math.round(img.offsetWidth * dpr));
    const h = Math.max(1, Math.round(img.offsetHeight * dpr));
    if (w === this.width && h === this.height) return;
    this.width = this.canvas.width = w;
    this.height = this.canvas.height = h;
  }
}

function link(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
  return program;
}

// Column-major 4×4 matrices, as WebGL takes them.
type Mat4 = Float32Array;

function scale(k: number): Mat4 {
  return new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]);
}

function rotateX(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function rotateY(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  return out;
}

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
