import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Mail } from 'lucide-react';
import GUI from 'lil-gui';

const vertexShader = `
#include <fog_pars_vertex>

uniform float uTime;
uniform float uBigWavesElevation;
uniform vec2 uBigWavesFrequency;
uniform float uBigWaveSpeed;
uniform float uSmallWavesElevation;
uniform float uSmallWavesFrequency;
uniform float uSmallWavesSpeed;
uniform float uSmallWavesIterations;

varying float vElevation;

//	Classic Perlin 3D Noise 
//	by Stefan Gustavson
//
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

float cnoise(vec3 P){
  vec3 Pi0 = floor(P);
  vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
  vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
  vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
  vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
  vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
  return 2.2 * n_xyz;
}

void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <fog_vertex>
  
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  float elevation = 
    sin(modelPosition.x * uBigWavesFrequency.x + uTime * uBigWaveSpeed) 
    * sin(modelPosition.z * uBigWavesFrequency.y + uTime * uBigWaveSpeed) 
    * uBigWavesElevation;
  
  for(float i = 1.0; i <= 10.0; i++) {
    elevation -= abs(
      cnoise(
        vec3(modelPosition.xz * uSmallWavesFrequency * i, uTime * uSmallWavesSpeed)
      ) 
      * uSmallWavesElevation / i
    );
    if(i >= uSmallWavesIterations) {
      break;
    }
  }
  
  modelPosition.y += elevation;
  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectedPosition = projectionMatrix * viewPosition;
  gl_Position = projectedPosition;

  vElevation = elevation;
}`;

const fragmentShader = `
#include <fog_pars_fragment>
precision mediump float;

uniform vec3 uDepthColor;
uniform vec3 uSurfaceColor;
uniform float uColorOffset;
uniform float uColorMultiplier;

varying float vElevation;

void main() {
  float mixStrength = (vElevation + uColorOffset) * uColorMultiplier;
  vec3 color = mix(uDepthColor, uSurfaceColor, mixStrength);
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}`;

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const heroRef = useRef<HTMLHeadingElement>(null);
  const waterRef = useRef<THREE.Mesh>();
  const clockRef = useRef<THREE.Clock>();
  const controlsRef = useRef<OrbitControls>();
  const guiRef = useRef<GUI>();
  const hoverAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const debugObject = {
      waveDepthColor: '#000000',
      waveSurfaceColor: '#bdbdbd',
      fogNear: 1,
      fogFar: 3,
      fogColor: '#2a2a2a',
      heroKerning: 0
    };

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.Fog(
      debugObject.fogColor,
      debugObject.fogNear,
      debugObject.fogFar
    );
    scene.background = new THREE.Color(debugObject.fogColor);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(1, 1, 1);
    cameraRef.current = camera;
    scene.add(camera);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, canvasRef.current);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // Water
    const waterGeometry = new THREE.PlaneGeometry(12, 12, 512, 512);
    const waterMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      fog: true,
      uniforms: {
        uTime: { value: 0 },
        uBigWavesElevation: { value: 0.268 },
        uBigWavesFrequency: { value: new THREE.Vector2(0.665, 1.825) },
        uBigWaveSpeed: { value: 0.456 },
        uSmallWavesElevation: { value: 0 },
        uSmallWavesFrequency: { value: 17.076 },
        uSmallWavesSpeed: { value: 0.043 },
        uSmallWavesIterations: { value: 5 },
        uDepthColor: { value: new THREE.Color(debugObject.waveDepthColor) },
        uSurfaceColor: { value: new THREE.Color(debugObject.waveSurfaceColor) },
        uColorOffset: { value: 0.1202 },
        uColorMultiplier: { value: 5 },
        ...THREE.UniformsLib['fog']
      }
    });

    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI * 0.5;
    waterRef.current = water;
    scene.add(water);

    // GUI
    const gui = new GUI({ 
      width: 220,
      title: '' // Remove the title
    });
    gui.domElement.classList.add('control-panel');
    guiRef.current = gui;
    gui.hide();
    
    // Create folders but don't show their titles
    const bigWavesFolder = gui.addFolder('');
    const smallWavesFolder = gui.addFolder('');

    // Open all folders by default
    bigWavesFolder.open();
    smallWavesFolder.open();

    bigWavesFolder
      .add(waterMaterial.uniforms.uBigWavesElevation, 'value')
      .min(0)
      .max(1)
      .step(0.001)
      .name('');
    bigWavesFolder
      .add(waterMaterial.uniforms.uBigWavesFrequency.value, 'x')
      .min(0)
      .max(10)
      .step(0.001)
      .name('');
    bigWavesFolder
      .add(waterMaterial.uniforms.uBigWavesFrequency.value, 'y')
      .min(0)
      .max(10)
      .step(0.001)
      .name('');
    bigWavesFolder
      .add(waterMaterial.uniforms.uBigWaveSpeed, 'value')
      .min(0.25)
      .max(5)
      .step(0.001)
      .name('');

    smallWavesFolder
      .add(waterMaterial.uniforms.uSmallWavesElevation, 'value')
      .min(0)
      .max(0.3)
      .step(0.001)
      .name('');
    smallWavesFolder
      .add(waterMaterial.uniforms.uSmallWavesFrequency, 'value')
      .min(0)
      .max(30)
      .step(0.001)
      .name('');
    smallWavesFolder
      .add(waterMaterial.uniforms.uSmallWavesSpeed, 'value')
      .min(0)
      .max(1)
      .step(0.001)
      .name('');
    smallWavesFolder
      .add(waterMaterial.uniforms.uSmallWavesIterations, 'value')
      .min(0)
      .max(10)
      .step(1)
      .name('');

    // Clock
    const clock = new THREE.Clock();
    clockRef.current = clock;

    // Animation
    const animate = () => {
      if (!clockRef.current || !waterRef.current || !controlsRef.current) return;

      const elapsedTime = clockRef.current.getElapsedTime();
      controlsRef.current.update();

      if (waterRef.current.material instanceof THREE.ShaderMaterial) {
        waterRef.current.material.uniforms.uTime.value = elapsedTime;
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;

      const width = window.innerWidth;
      const height = window.innerHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();

      rendererRef.current.setSize(width, height);
      rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      gui.destroy();
      guiRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const isInTopLeft = e.clientX <= 70 && e.clientY <= 70;
      const isOverPanel = e.target instanceof Element && 
        (e.target.closest('.control-panel') || e.target.classList.contains('control-panel'));
      
      if (guiRef.current) {
        const panel = guiRef.current.domElement;
        if (isInTopLeft || isOverPanel) {
          panel.classList.add('visible');
          guiRef.current.show();
        } else {
          panel.classList.remove('visible');
          guiRef.current.hide();
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 outline-none w-full h-full"
      />
      <div className="absolute top-0 left-0 w-[400px] h-[400px] group">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          {/* This empty div serves as a container for the GUI controls */}
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <h1 ref={heroRef} className="hero-text text-[2.75rem] xs:text-5xl sm:text-7xl md:text-8xl lg:text-9xl text-white text-center">
          Samar Qupty
        </h1>
        <p className="hero-subtitle text-white/90 text-base sm:text-lg md:text-xl mt-4 uppercase">
          Actress & Filmmaker
        </p>
      </div>
      <a
        href="mailto:connect@samarqupty.com"
        className="absolute top-8 right-8 text-white/85 hover:text-white tracking-[0.15em] text-s uppercase transition-all duration-700 group inquiries-text select-none"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <span className="relative">
          <Mail className="inline-block w-[16px] h-[16px] mr-[3px] -translate-y-[2px]" />
          Contact
          <span className="absolute -bottom-2 left-0 w-0 h-[1px] bg-white/40 group-hover:w-full transition-all duration-700 ease-in-out" />
        </span>
      </a>
      <div className="fixed bottom-4 left-0 right-0 px-4 flex justify-center text-white/60 tracking-wider font-light copyright-text">
        <span className="whitespace-nowrap text-[10px] sm:text-xs">©2025 SQ Creative. All rights reserved; all wrongs reversed.</span>
      </div>
    </div>
  );
}

export default App;