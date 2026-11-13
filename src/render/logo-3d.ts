// The header logo as a small 3D model: the logo art is the front face of a thick, extruded
// badge that leans with the board's parallax. It draws on its own little WebGL canvas laid
// over the <img>, which stays in the page for layout and as the fallback.

import { bevelNormals } from './logo-relief.ts';

/** Largest lean of the logo, in radians. More than the board's: the logo is small and far from the finger. */
export const LOGO_MAX_LEAN = (9 * Math.PI) / 180;
/** Extrusion depth, in logo widths. */
const DEPTH = 0.11;
/** Slices that build the extruded sides. Enough that no gaps show at the largest lean. */
const SLICES = 32;
/** Camera distance, in logo widths. Far enough to keep the art undistorted, near enough to show depth. */
const CAMERA = 2.4;
/** Width of the rounded front edge, in art pixels. */
const BEVEL = 5;
/** Side colour near the front and at the back: the art's navy outline, darkening into the depth. */
const SIDE_FRONT = [0.16, 0.2, 0.85];
const SIDE_BACK = [0.05, 0.03, 0.3];

const VERTEX = `
attribute vec2 aUv;
uniform mat4 uModel;
uniform mat4 uProjection;
uniform float uZ;
uniform float uAspect;
uniform vec2 uUvScale;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aUv.x - 0.5, (0.5 - aUv.y) * uAspect, uZ, 1.0);
  vUv = aUv * uUvScale;
  vWorld = world.xyz;
  gl_Position = uProjection * world;
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D uArt;
uniform sampler2D uNormals;
uniform mat3 uNormalMatrix;
uniform vec3 uCamera;
uniform vec3 uSide;
uniform float uFront;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec4 art = texture2D(uArt, vUv);
  if (uFront < 0.5) {
    float cover = smoothstep(0.3, 0.7, art.a);
    gl_FragColor = vec4(uSide * cover, cover);
    return;
  }
  vec3 n = normalize(uNormalMatrix * (texture2D(uNormals, vUv).xyz * 2.0 - 1.0));
  vec3 light = normalize(vec3(-0.35, 0.55, 1.0));
  vec3 view = normalize(uCamera - vWorld);
  // Lit relative to the flat pose, so the logo at rest looks exactly like the art.
  float shade = 1.0 + 0.45 * (dot(n, light) - light.z);
  float gloss = pow(max(dot(n, normalize(light + view)), 0.0), 48.0) * 0.22;
  gl_FragColor = vec4(art.rgb * shade + gloss * art.a, art.a);
}`;

export class Logo3D {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly art: WebGLTexture;
  private readonly normals: WebGLTexture;
  private readonly aspect: number;
  private readonly uvScale: [number, number];
  private leanX = NaN;
  private leanY = NaN;
  private width = 0;
  private height = 0;

  /** Builds the 3D logo over `img`, or returns null where WebGL is missing; the plain logo then stays. */
  static async mount(img: HTMLImageElement): Promise<Logo3D | null> {
    try {
      await img.decode();
    } catch {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.className = 'logo-3d';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return null;
    try {
      const logo = new Logo3D(img, canvas, gl);
      img.after(canvas);
      img.parentElement?.classList.add('has-logo-3d');
      return logo;
    } catch {
      return null;
    }
  }

  private readonly img: HTMLImageElement;
  private readonly canvas: HTMLCanvasElement;

  private constructor(img: HTMLImageElement, canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.img = img;
    this.canvas = canvas;
    this.gl = gl;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    this.aspect = h / w;
    // Padded to powers of two so WebGL 1 can mipmap: the art is drawn at a third of its size.
    const tw = nextPow2(w);
    const th = nextPow2(h);
    this.uvScale = [w / tw, h / th];
    const pad = document.createElement('canvas');
    pad.width = tw;
    pad.height = th;
    const ctx = pad.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const alpha = ctx.getImageData(0, 0, tw, th).data;

    this.program = link(gl, VERTEX, FRAGMENT);
    this.art = texture(gl, pad);
    this.normals = texture(gl, new ImageData(bevelNormals(alpha, tw, th, BEVEL), tw, th));

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(this.program, 'aUv');
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    new ResizeObserver(() => this.render(this.leanX, this.leanY, true)).observe(img);
  }

  /** Leans the logo; `x` and `y` are the board's parallax, each in [-1, 1]. */
  lean(x: number, y: number): void {
    this.render(x, y, false);
  }

  private render(x: number, y: number, resized: boolean): void {
    if (!resized && x === this.leanX && y === this.leanY) return;
    this.leanX = x;
    this.leanY = y;
    this.fit();
    const gl = this.gl;
    const p = this.program;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(p);

    // Same sense as the board: the side toward the finger dips away, so the far sides show.
    const model = multiply(rotateX(-(y || 0) * LOGO_MAX_LEAN), rotateY((x || 0) * LOGO_MAX_LEAN));
    model[14] = -CAMERA;
    const fovY = 2 * Math.atan(this.aspect / 2 / CAMERA);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uModel'), false, model);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uProjection'), false, perspective(fovY, 1 / this.aspect, 0.5, 10));
    gl.uniformMatrix3fv(gl.getUniformLocation(p, 'uNormalMatrix'), false, [
      model[0],
      model[1],
      model[2],
      model[4],
      model[5],
      model[6],
      model[8],
      model[9],
      model[10],
    ]);
    gl.uniform3f(gl.getUniformLocation(p, 'uCamera'), 0, 0, 0);
    gl.uniform1f(gl.getUniformLocation(p, 'uAspect'), this.aspect);
    gl.uniform2f(gl.getUniformLocation(p, 'uUvScale'), ...this.uvScale);
    gl.uniform1i(gl.getUniformLocation(p, 'uArt'), 0);
    gl.uniform1i(gl.getUniformLocation(p, 'uNormals'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.art);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.normals);

    const uZ = gl.getUniformLocation(p, 'uZ');
    const uSide = gl.getUniformLocation(p, 'uSide');
    const uFront = gl.getUniformLocation(p, 'uFront');
    // Back to front: the slices make the sides, then the art goes on the face.
    gl.uniform1f(uFront, 0);
    for (let i = SLICES; i >= 1; i--) {
      const t = i / SLICES;
      gl.uniform1f(uZ, -DEPTH * t);
      gl.uniform3f(uSide, ...mix(SIDE_FRONT, SIDE_BACK, t));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.uniform1f(uFront, 1);
    gl.uniform1f(uZ, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Matches the canvas to the <img>'s box; true when its size changed. */
  private fit(): boolean {
    const img = this.img;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(img.offsetWidth * dpr);
    const h = Math.round(img.offsetHeight * dpr);
    const style = this.canvas.style;
    style.left = `${img.offsetLeft}px`;
    style.top = `${img.offsetTop}px`;
    style.width = `${img.offsetWidth}px`;
    style.height = `${img.offsetHeight}px`;
    if (w === this.width && h === this.height) return false;
    this.width = this.canvas.width = Math.max(1, w);
    this.height = this.canvas.height = Math.max(1, h);
    return true;
  }
}

const nextPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

const mix = (a: number[], b: number[], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function texture(gl: WebGLRenderingContext, source: TexImageSource): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, source instanceof HTMLCanvasElement);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
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
