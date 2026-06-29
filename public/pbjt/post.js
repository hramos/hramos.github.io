import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// A custom finishing shader: warm color grade, gentle s-curve contrast,
// a soft vignette and fine animated film grain. It runs in display space
// (after OutputPass has applied tone mapping + sRGB), so it operates on
// final 0..1 colors — which is exactly what vignette and grain want.
const GradeShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uTime:      { value: 0 },
    uResolution:{ value: new THREE.Vector2(1, 1) },
    uVignette:  { value: 0.32 }, // 0 = none, 1 = heavy darkening at edges
    uWarmth:    { value: 1.0 },  // pushes reds up / blues down a touch
    uGrain:     { value: 0.035 },// amplitude of the film grain
    uContrast:  { value: 0.12 }, // strength of the s-curve
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
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb;

      // Warm kitchen grade.
      col.r *= 1.0 + 0.04 * uWarmth;
      col.b *= 1.0 - 0.03 * uWarmth;

      // Gentle s-curve contrast (smoothstep-style), blended in lightly.
      vec3 sc = col * col * (3.0 - 2.0 * col);
      col = mix(col, sc, uContrast);

      // Soft vignette.
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.85, 0.25, length(d) * 1.15);
      col *= mix(1.0, vig, uVignette);

      // Fine animated film grain.
      float g = fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), texel.a);
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

  // Subtle bloom — threshold kept high so only bright specular highlights
  // (jar lids, the knife, glossy jelly) glow, not the whole frame.
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.18, 0.4, 0.85);
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