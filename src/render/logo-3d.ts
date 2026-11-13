// The header logo as a real 3D model, traced from the painted logo (tools/logo-model/build.py):
// a thick navy body with every letter, jewel and spark standing in front of it as its own solid.
// The painted art is projected onto the model, so at rest it looks exactly like the <img>; as it
// leans, the letters shift against the rim and their sides come into view. It draws on its own
// little WebGL canvas laid over the <img>, which stays in the page for layout and as the fallback.

import modelURL from '../assets/branding/epic-blast-logo.bin?url';
import { VERTEX_BYTES, parseLogoModel, type LogoModel } from './logo-model.ts';

/** Largest lean toward the finger, in radians. */
export const LOGO_MAX_LEAN = (16 * Math.PI) / 180;
/** Camera distance, in logo widths; tools/logo-model/build.py lines the raised parts up for it. */
const CAMERA = 2.6;

const VERTEX = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute float aKind;
attribute vec2 aUv;
uniform mat4 uModel;
uniform mat4 uProjection;
uniform vec2 uUvScale;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying float vSide;
varying float vBody;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUv = aUv * uUvScale;
  vSide = 1.0 - step(0.5, abs(aNormal.z));
  vBody = 1.0 - step(0.5, aKind);
  gl_Position = uProjection * world;
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D uArt;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying float vSide;
varying float vBody;
void main() {
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(-0.4, 0.6, 1.0));
  vec3 hv = normalize(light + normalize(-vWorld));
  // Lit relative to the flat pose, so the faces at rest look exactly like the painted art.
  float shade = 1.0 + 0.6 * (dot(n, light) - light.z);
  float gloss = max(0.0, pow(max(dot(n, hv), 0.0), 40.0) - pow(max(hv.z, 0.0), 40.0)) * 0.35;
  vec4 art = texture2D(uArt, vUv);
  if (vSide > 0.5) {
    // Sides carry the colour at their edge of the art; the body's sides are the outline's navy.
    vec3 edge = art.a > 0.05 ? art.rgb / art.a : vec3(0.0);
    vec3 side = mix(edge * 0.8, vec3(0.03, 0.05, 0.42), vBody > 0.5 ? 1.0 : 0.35);
    gl_FragColor = vec4(side * shade + gloss, 1.0);
    return;
  }
  gl_FragColor = vec4(art.rgb * shade + gloss * art.a, art.a);
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
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    this.aspect = h / w;
    this.program = link(gl, VERTEX, FRAGMENT);
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);
    const attrib = (name: string, size: number, type: number, normalized: boolean, offset: number) => {
      const at = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, size, type, normalized, VERTEX_BYTES, offset);
    };
    // Positions are int16 in 1/16384 logo widths; the model matrix scales them back.
    attrib('aPos', 3, gl.SHORT, false, 0);
    attrib('aNormal', 3, gl.BYTE, true, 6);
    attrib('aKind', 1, gl.UNSIGNED_BYTE, false, 9);
    attrib('aUv', 2, gl.UNSIGNED_SHORT, true, 10);

    const wide = model.indices instanceof Uint32Array;
    if (wide && !gl.getExtension('OES_element_index_uint')) throw new Error('32-bit indices');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);
    this.indexType = wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    this.count = model.indices.length;

    // The art, padded to powers of two so WebGL 1 can mipmap it: it is drawn at about a third of its size.
    const pad = document.createElement('canvas');
    pad.width = nextPow2(w);
    pad.height = nextPow2(h);
    pad.getContext('2d')?.drawImage(img, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pad);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform2f(gl.getUniformLocation(this.program, 'uUvScale'), w / pad.width, h / pad.height);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

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
    const pitch = -(y || 0) * LOGO_MAX_LEAN;
    const yaw = (x || 0) * LOGO_MAX_LEAN;
    const model = multiply(multiply(rotateX(pitch), rotateY(yaw)), scale(1 / 16384));
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

const nextPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

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
