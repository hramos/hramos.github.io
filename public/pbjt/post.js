import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// A custom finishing shader, cranked to "metal": cold blue-steel desaturated
// grade, hard contrast, chromatic aberration (RGB split that grows toward the
// edges), a heavy crushing vignette and gritty animated grain. Runs in display
// space (after OutputPass applied tone mapping + sRGB), on final 0..1 colors.
const GradeShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uTime:      { value: 0 },
    uResolution:{ value: new THREE.Vector2(1, 1) },
    uVignette:  { value: 0.4 },   // 0 = none, 1 = heavy edge crush
    uWarmth:    { value: 0.4 },   // positive = gentle warm kitchen cast
    uGrain:     { value: 0.04 },  // amplitude of the film grain
    uContrast:  { value: 0.2 },   // strength of the s-curve
    uSaturation:{ value: 0.9 },   // slightly desaturated, still colourful
    uAberration:{ value: 0.0012 },// subtle chromatic aberration / RGB split
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2  uResolution;
    uniform float uVignette;
    uniform float uWarmth;
    uniform float uGrain;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uAberration;
    varying vec2 vUv;

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);

      // Chromatic aberration: pull the colour channels apart radially, harder
      // toward the edges of the frame.
      vec2 off = d * uAberration * (0.4 + r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float a = texture2D(tDiffuse, vUv).a;

      // Cold steel cast.
      col.r *= 1.0 + 0.04 * uWarmth;
      col.b *= 1.0 - 0.03 * uWarmth;

      // Desaturate toward gunmetal grey.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, uSaturation);

      // Hard s-curve contrast — applied twice-ish via stronger blend.
      vec3 sc = col * col * (3.0 - 2.0 * col);
      col = mix(col, sc, uContrast);
      // Lift the blacks slightly toward cold blue so shadows read as steel.
      col += vec3(-0.01, 0.0, 0.02) * (1.0 - luma);

      // Heavy crushing vignette.
      float vig = smoothstep(0.95, 0.18, length(d) * 1.25);
      col *= mix(1.0, vig, uVignette);

      // Gritty animated grain, slightly stronger in the shadows.
      float g = fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain * (1.3 - luma);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
    }
  `,
};

// Build the post-processing chain and return a small controller.
export function buildPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);

  composer.addPass(new RenderPass(scene, camera));

  // Gentle bloom — only the brighter highlights pick up a soft glow.
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.5, 0.75);
  composer.addPass(bloom);

  // Tone mapping + sRGB conversion for the composed result.
  composer.addPass(new OutputPass());

  // Final custom grade in display space.
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uResolution.value.set(size.x, size.y);
  composer.addPass(grade);

  let time = 0;

  return {
    composer,
    bloom,
    grade,
    render(dt) {
      time += dt;
      grade.uniforms.uTime.value = time;
      composer.render(dt);
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
      grade.uniforms.uResolution.value.set(w, h);
    },
  };
}