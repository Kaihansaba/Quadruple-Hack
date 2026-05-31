"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function ShaderAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    animationId: number;
    geometry: THREE.PlaneGeometry;
    material: THREE.ShaderMaterial;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let disposed = false;

    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      #define TWO_PI 6.2831853072
      #define PI 3.14159265359

      precision highp float;
      uniform vec2 resolution;
      uniform float time;

      void main(void) {
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        float t = time * 0.05;
        float lineWidth = 0.002;

        vec3 color = vec3(0.0);
        for (int j = 0; j < 3; j++) {
          for (int i = 0; i < 5; i++) {
            color[j] += lineWidth * float(i * i) / abs(fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
          }
        }

        color *= vec3(0.82, 1.0, 0.88);
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    try {
      const camera = new THREE.Camera();
      camera.position.z = 1;

      const scene = new THREE.Scene();
      const geometry = new THREE.PlaneGeometry(2, 2);
      const uniforms = {
        time: { value: 1.0 },
        resolution: { value: new THREE.Vector2() }
      };

      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader
      });

      scene.add(new THREE.Mesh(geometry, material));

      const renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "low-power"
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.domElement.style.pointerEvents = "none";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.width = "100%";
      container.appendChild(renderer.domElement);

      const onWindowResize = () => {
        if (disposed) return;
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height, false);
        uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
      };

      const animate = () => {
        if (disposed) return;
        uniforms.time.value += 0.05;
        renderer.render(scene, camera);
        const animationId = requestAnimationFrame(animate);
        if (sceneRef.current) {
          sceneRef.current.animationId = animationId;
        }
      };

      sceneRef.current = {
        renderer,
        animationId: 0,
        geometry,
        material
      };

      onWindowResize();
      window.addEventListener("resize", onWindowResize, false);
      animate();

      return () => {
        disposed = true;
        window.removeEventListener("resize", onWindowResize);

        if (!sceneRef.current) return;

        cancelAnimationFrame(sceneRef.current.animationId);
        if (sceneRef.current.renderer.domElement.parentNode === container) {
          container.removeChild(sceneRef.current.renderer.domElement);
        }
        sceneRef.current.renderer.dispose();
        sceneRef.current.geometry.dispose();
        sceneRef.current.material.dispose();
        sceneRef.current = null;
      };
    } catch (error) {
      setFailed(true);
      sceneRef.current = null;
      return undefined;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-shader-fallback={failed ? "true" : "false"}
      className="pointer-events-none h-full w-full overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(34,197,94,0.15),transparent_34%),linear-gradient(to_bottom,#050608,#09090b)]"
    />
  );
}
