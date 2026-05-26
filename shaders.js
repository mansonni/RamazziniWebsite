/* Ramazzini — 5 interactive sage shader wallpapers
   Single ShaderCanvas class hosts a fullscreen quad and swaps fragment shaders.
   All shaders share uMouse / uMouseSmooth / uTime / uClick / uRipples uniforms. */

(function () {
  'use strict';

  const VERT = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  /* Shared header injected into every fragment shader. */
  const HEAD = `
    precision highp float;
    uniform vec2  uResolution;
    uniform vec2  uMouse;        // raw, in px (origin bottom-left)
    uniform vec2  uMouseSmooth;  // eased mouse (px)
    uniform float uTime;         // seconds
    uniform float uClickPulse;   // 1 → 0 decay after a click
    uniform vec4  uRipples[8];   // xy = click pos (0..1), z = startTime, w = strength

    // ---- sage palette --------------------------------------------------------
    #define BG          vec3(0.965, 0.980, 0.965)
    #define MINT_LIGHT  vec3(0.853, 0.945, 0.882)
    #define MINT        vec3(0.580, 0.820, 0.690)
    #define SAGE        vec3(0.408, 0.706, 0.557)
    #define SAGE_DEEP   vec3(0.192, 0.486, 0.341)
    #define FOREST      vec3(0.10,  0.30,  0.21)

    // ---- noise (Ashima simplex) ---------------------------------------------
    vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
    vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
    vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                         -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++){ v += a * snoise(p); p *= 2.02; a *= 0.5; }
      return v;
    }
    // hash for stable point clouds
    vec2 hash22(vec2 p){
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453);
    }
  `;

  /* ============================================================
     1. AURORA — flowing sage gradient mesh, mouse warps the field
     ============================================================ */
  const AURORA = HEAD + `
    void main(){
      vec2 res = uResolution.xy;
      vec2 uv  = gl_FragCoord.xy / res;
      vec2 mse = uMouseSmooth / res;

      // gentle warp toward / around the mouse
      vec2 toM = uv - mse;
      float md = length(toM);
      vec2 warp = -toM * 0.22 * exp(-md * 3.0);

      vec2 p = (uv + warp) * vec2(res.x/res.y, 1.0) * 1.8;
      float t = uTime * 0.07;

      float n1 = snoise(p + vec2(t, t*0.7));
      float n2 = snoise(p * 1.7 + vec2(-t*0.5, t*0.3) + n1 * 0.6);
      float n3 = snoise(p * 0.55 + vec2(t*0.2, -t*0.4) + n2 * 0.5);
      float f = (n1*0.55 + n2*0.30 + n3*0.45) * 0.5 + 0.5;
      f = smoothstep(0.05, 0.95, f);

      vec3 col = mix(BG, MINT_LIGHT, smoothstep(0.0, 0.55, f));
      col = mix(col, SAGE, smoothstep(0.50, 0.85, f) * 0.85);
      col = mix(col, SAGE_DEEP, smoothstep(0.86, 1.0, f) * 0.55);

      // soft mouse glow
      col += SAGE * exp(-md * 5.5) * 0.18 * (0.7 + 0.6 * uClickPulse);

      // click pulse — brief flash of mint
      col = mix(col, MINT_LIGHT, uClickPulse * 0.10);

      // subtle vignette
      vec2 vu = uv - 0.5;
      col *= 1.0 - dot(vu, vu) * 0.25;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ============================================================
     2. LIQUID — sage metaballs; one ball IS the mouse
     ============================================================ */
  const LIQUID = HEAD + `
    void main(){
      vec2 res = uResolution.xy;
      float aspect = res.x / res.y;
      vec2 uv = gl_FragCoord.xy / res;
      uv.x *= aspect;
      vec2 m = uMouseSmooth / res;
      m.x *= aspect;

      float t = uTime * 0.28;

      // 5 balls; first follows mouse
      vec2 b0 = m;
      vec2 b1 = vec2(aspect*0.28 + sin(t)*0.18,        0.42 + cos(t*1.3)*0.18);
      vec2 b2 = vec2(aspect*0.72 + cos(t*0.85)*0.20,   0.58 + sin(t*1.1)*0.16);
      vec2 b3 = vec2(aspect*0.50 + sin(t*0.6)*0.28,    0.28 + cos(t*0.95)*0.14);
      vec2 b4 = vec2(aspect*0.60 + cos(t*1.20)*0.22,   0.74 + sin(t*0.75)*0.16);

      float r0 = 0.24 + 0.04 * uClickPulse;
      float field =
          r0*r0       / (dot(uv-b0,uv-b0) + 0.001)
        + 0.16*0.16   / (dot(uv-b1,uv-b1) + 0.001)
        + 0.18*0.18   / (dot(uv-b2,uv-b2) + 0.001)
        + 0.13*0.13   / (dot(uv-b3,uv-b3) + 0.001)
        + 0.15*0.15   / (dot(uv-b4,uv-b4) + 0.001);

      float a1 = smoothstep(0.55, 1.05, field);
      float a2 = smoothstep(1.05, 1.80, field);
      float a3 = smoothstep(1.80, 3.20, field);

      vec3 col = BG;
      col = mix(col, MINT_LIGHT, a1);
      col = mix(col, SAGE,       a2);
      col = mix(col, SAGE_DEEP,  a3 * 0.85);

      // specular highlight near the metaball edge — gives a wet look
      float edge = smoothstep(0.95, 1.05, field) - smoothstep(1.05, 1.15, field);
      col += vec3(1.0) * edge * 0.35;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ============================================================
     3. RIPPLE POOL — clicks send out concentric rings on a still pool
     ============================================================ */
  const RIPPLE = HEAD + `
    void main(){
      vec2 res = uResolution.xy;
      vec2 uv  = gl_FragCoord.xy / res;
      vec2 m   = uMouseSmooth / res;
      float aspect = res.x / res.y;

      // base wash — soft vertical sage gradient with a wide noise haze
      float haze = fbm(uv * 2.5 + vec2(uTime*0.02, 0.0));
      vec3 col = mix(BG, MINT_LIGHT, 0.45 + 0.35 * haze);
      col = mix(col, SAGE, smoothstep(0.6, 1.0, haze) * 0.25);

      float wave = 0.0;

      // gentle ambient ripple drifting from mouse
      vec2 dm = (uv - m) * vec2(aspect, 1.0);
      float dM = length(dm);
      wave += 0.35 * sin(dM * 22.0 - uTime * 1.6) * exp(-dM * 3.2);

      // click ripples
      for (int i = 0; i < 8; i++){
        vec4 r = uRipples[i];
        float age = uTime - r.z;
        if (age > 0.0 && age < 4.0 && r.w > 0.0){
          vec2 d = (uv - r.xy) * vec2(aspect, 1.0);
          float dist = length(d);
          float radius = age * 0.35;
          float ring = sin((dist - radius) * 60.0) *
                       exp(-abs(dist - radius) * 14.0) *
                       exp(-age * 0.9) * r.w;
          wave += ring;
        }
      }

      // light/dark banding from the wave
      float light = max( wave, 0.0);
      float dark  = max(-wave, 0.0);
      col += SAGE       * light * 0.55;
      col -= SAGE_DEEP  * dark  * 0.18;

      // crisp highlight on wave crests
      col += vec3(1.0) * smoothstep(0.55, 0.95, light) * 0.25;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  /* ============================================================
     4. TOPOGRAPHY — contour lines on a noise field, mouse lifts terrain
     ============================================================ */
  const TOPO = HEAD + `
    void main(){
      vec2 res = uResolution.xy;
      vec2 uv  = gl_FragCoord.xy / res;
      vec2 m   = uMouseSmooth / res;
      float aspect = res.x / res.y;

      vec2 p = uv * vec2(aspect, 1.0) * 2.6;
      float t = uTime * 0.05;

      // base terrain
      float h = fbm(p + vec2(t, -t*0.4));
      // mouse lifts a soft Gaussian peak
      vec2 dm = (uv - m) * vec2(aspect, 1.0);
      float bump = exp(-dot(dm, dm) * 9.0) * (0.6 + 0.4 * uClickPulse);
      h += bump * 0.9;

      // contour lines — fract on scaled height
      float bands = 14.0;
      float band  = fract(h * bands);
      float lineW = 0.04 + 0.06 * (1.0 - bump);
      float line  = smoothstep(0.0, lineW, band) * (1.0 - smoothstep(1.0 - lineW, 1.0, band));
      line = 1.0 - line;

      // gentle hypsometric tint by height
      float hN = clamp(h * 0.5 + 0.5, 0.0, 1.0);
      vec3 fill = mix(BG, MINT_LIGHT, smoothstep(0.0, 0.5, hN));
      fill = mix(fill, MINT, smoothstep(0.45, 0.8, hN) * 0.7);
      fill = mix(fill, SAGE, smoothstep(0.75, 1.0, hN) * 0.55);

      // every 5th contour darker (index lines)
      float idx = floor(h * bands);
      float major = mod(idx, 5.0) < 0.5 ? 1.0 : 0.0;
      vec3 lineCol = mix(SAGE, SAGE_DEEP, major);

      vec3 col = mix(fill, lineCol, line * (0.55 + 0.35 * major));

      // mouse halo
      col += SAGE * exp(-dot(dm, dm) * 14.0) * 0.10;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ============================================================
     5. CONSTELLATION — Voronoi-ish point cloud, mouse attracts cells
     ============================================================ */
  const CONST = HEAD + `
    // F1, F2 Voronoi
    vec2 voronoi(vec2 x, float t, vec2 mse){
      vec2 n = floor(x);
      vec2 f = fract(x);
      float F1 = 8.0, F2 = 8.0;
      vec2  closest = vec2(0.0);
      for (int j = -1; j <= 1; j++){
        for (int i = -1; i <= 1; i++){
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash22(n + g);
          // animated point with subtle drift
          vec2 pos = g + 0.5 + 0.42 * sin(t * 0.6 + 6.2831 * o);
          // pull toward mouse
          vec2 toM = mse - (n + pos);
          float pull = exp(-dot(toM, toM) * 1.4) * 0.35;
          pos += toM * pull;
          float d = length(pos - f);
          if (d < F1){ F2 = F1; F1 = d; closest = pos; }
          else if (d < F2){ F2 = d; }
        }
      }
      return vec2(F1, F2);
    }

    void main(){
      vec2 res = uResolution.xy;
      vec2 uv  = gl_FragCoord.xy / res;
      vec2 m   = uMouseSmooth / res;
      float aspect = res.x / res.y;

      float scale = 7.5;
      vec2 p = uv * vec2(aspect, 1.0) * scale;
      vec2 mp = m  * vec2(aspect, 1.0) * scale;

      vec2 F = voronoi(p, uTime, mp);
      float edge = F.y - F.x;          // edge distance — small at borders

      // soft base wash
      vec3 col = mix(BG, MINT_LIGHT, 0.5 + 0.3 * (1.0 - F.x));

      // cell glow
      float cellGlow = exp(-F.x * 3.0);
      col = mix(col, SAGE, cellGlow * 0.35);

      // bright dots at cell centres
      float dot_ = smoothstep(0.10, 0.0, F.x);
      col = mix(col, SAGE_DEEP, dot_ * 0.9);
      col += MINT * dot_ * 0.4;

      // thin connecting lines (cell edges) — emphasised by mouse proximity
      vec2 dm = (uv - m) * vec2(aspect, 1.0);
      float prox = exp(-dot(dm, dm) * 6.0);
      float line = smoothstep(0.06 + 0.05 * prox, 0.0, edge);
      col = mix(col, SAGE_DEEP, line * (0.35 + 0.55 * prox));

      // click ripple expanding through the lattice
      col += vec3(1.0) * smoothstep(0.0, 0.06, edge) * uClickPulse * 0.0; // (no-op placeholder)
      col += SAGE * uClickPulse * exp(-dot(dm, dm) * 3.0) * 0.18;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const SHADERS = {
    aurora:       { name: 'Aurora',       label: 'Drifting sage mesh',     frag: AURORA },
    liquid:       { name: 'Liquid',       label: 'Mouse-led metaballs',    frag: LIQUID },
    ripple:       { name: 'Ripple Pool',  label: 'Click sends ripples',    frag: RIPPLE },
    topography:   { name: 'Topography',   label: 'Contours lift on hover', frag: TOPO   },
    constellation:{ name: 'Constellation',label: 'Voronoi lattice',        frag: CONST  },
  };

  /* -------------------- GL helpers -------------------- */
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s), src);
      gl.deleteShader(s);
      return null;
    }
    return s;
  }
  function link(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  /* -------------------- ShaderCanvas -------------------- */
  class ShaderCanvas {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.opts = Object.assign({ shader: 'aurora', autoplay: true, listenTarget: window }, opts);

      const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, alpha: false });
      if (!gl) { this._fallback(); return; }
      this.gl = gl;

      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      this.vs = vs;
      this.programs = {};
      this.uniforms = {};
      for (const key of Object.keys(SHADERS)) this._buildProgram(key);

      // fullscreen quad
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,
        -1,  1,  1, -1,   1, 1,
      ]), gl.STATIC_DRAW);
      this.buf = buf;

      // state
      this.shaderKey   = this.opts.shader;
      this.mouse       = [canvas.width / 2, canvas.height / 2];
      this.mouseSmooth = [canvas.width / 2, canvas.height / 2];
      this.targetMouse = this.mouse.slice();
      this.clickPulse  = 0;
      this.ripples     = new Array(8).fill(null).map(() => [0, 0, -999, 0]); // x,y,startT,strength
      this.ripIdx      = 0;
      this.t0          = performance.now() / 1000;
      this.now         = 0;
      this.running     = false;
      this.dpr         = Math.min(window.devicePixelRatio || 1, 1.5);

      this._resize();
      this._bind();
      if (this.opts.autoplay) this.start();
    }

    _buildProgram(key) {
      const gl = this.gl;
      const fs = compile(gl, gl.FRAGMENT_SHADER, SHADERS[key].frag);
      if (!fs) return;
      const p = link(gl, this.vs, fs);
      if (!p) return;
      this.programs[key] = p;
      this.uniforms[key] = {
        aPos:        gl.getAttribLocation (p, 'a_position'),
        uResolution: gl.getUniformLocation(p, 'uResolution'),
        uMouse:      gl.getUniformLocation(p, 'uMouse'),
        uMouseSmooth:gl.getUniformLocation(p, 'uMouseSmooth'),
        uTime:       gl.getUniformLocation(p, 'uTime'),
        uClickPulse: gl.getUniformLocation(p, 'uClickPulse'),
        uRipples:    gl.getUniformLocation(p, 'uRipples'),
      };
    }

    _resize() {
      const c = this.canvas;
      const rect = c.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width  * this.dpr));
      const h = Math.max(1, Math.floor(rect.height * this.dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w; c.height = h;
        if (this.gl) this.gl.viewport(0, 0, w, h);
      }
    }

    _bind() {
      const target = this.opts.listenTarget;
      this._onMove = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * this.dpr;
        const y = (rect.height - (e.clientY - rect.top)) * this.dpr; // flip
        this.targetMouse[0] = x; this.targetMouse[1] = y;
      };
      this._onTouch = (e) => {
        if (!e.touches || !e.touches[0]) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.touches[0].clientX - rect.left) * this.dpr;
        const y = (rect.height - (e.touches[0].clientY - rect.top)) * this.dpr;
        this.targetMouse[0] = x; this.targetMouse[1] = y;
      };
      this._onClick = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = 1.0 - (e.clientY - rect.top) / rect.height;
        this.pingRipple(nx, ny, 1.0);
      };
      this._onResize = () => this._resize();
      target.addEventListener('mousemove', this._onMove, { passive: true });
      target.addEventListener('touchmove', this._onTouch, { passive: true });
      this.canvas.addEventListener('click', this._onClick);
      window.addEventListener('resize', this._onResize);
    }

    pingRipple(nx, ny, strength = 1.0) {
      const r = this.ripples[this.ripIdx];
      r[0] = nx; r[1] = ny; r[2] = this.now; r[3] = strength;
      this.ripIdx = (this.ripIdx + 1) % this.ripples.length;
      this.clickPulse = 1.0;
    }

    setShader(key) {
      if (SHADERS[key]) this.shaderKey = key;
    }

    start() {
      if (this.running) return;
      this.running = true;
      const loop = () => {
        if (!this.running) return;
        this._frame();
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
    }

    _frame() {
      this._resize();
      const gl = this.gl; if (!gl) return;
      this.now = performance.now() / 1000 - this.t0;

      // ease mouse
      const k = 0.12;
      this.mouseSmooth[0] += (this.targetMouse[0] - this.mouseSmooth[0]) * k;
      this.mouseSmooth[1] += (this.targetMouse[1] - this.mouseSmooth[1]) * k;
      this.mouse[0] = this.targetMouse[0];
      this.mouse[1] = this.targetMouse[1];
      this.clickPulse *= 0.93;

      const program  = this.programs[this.shaderKey];
      const uni      = this.uniforms[this.shaderKey];
      if (!program) return;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.enableVertexAttribArray(uni.aPos);
      gl.vertexAttribPointer(uni.aPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uni.uResolution, this.canvas.width, this.canvas.height);
      gl.uniform2f(uni.uMouse, this.mouse[0], this.mouse[1]);
      gl.uniform2f(uni.uMouseSmooth, this.mouseSmooth[0], this.mouseSmooth[1]);
      gl.uniform1f(uni.uTime, this.now);
      gl.uniform1f(uni.uClickPulse, this.clickPulse);

      // ripples → flat array of 8 vec4s
      const rip = new Float32Array(32);
      for (let i = 0; i < 8; i++) {
        const r = this.ripples[i];
        rip[i*4+0] = r[0]; rip[i*4+1] = r[1];
        rip[i*4+2] = r[2]; rip[i*4+3] = r[3];
      }
      if (uni.uRipples) gl.uniform4fv(uni.uRipples, rip);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    _fallback() {
      // canvas-2d fallback so nothing looks broken on unsupported devices
      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      const g = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      g.addColorStop(0, '#F8FBF8');
      g.addColorStop(1, '#DAF1E1');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  window.ShaderCanvas    = ShaderCanvas;
  window.ShaderCanvas.SHADERS = SHADERS;
})();
