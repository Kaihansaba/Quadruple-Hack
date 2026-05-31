"use client";

import { useId } from "react";
import Particles, { ParticlesProvider, useParticlesProvider } from "@tsparticles/react";
import type { Container, Engine, SingleOrMultiple } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";
import { motion, useAnimation } from "framer-motion";
import { cn } from "@/lib/utils";

type ParticlesProps = {
  id?: string;
  className?: string;
  background?: string;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  particleColor?: string;
  particleDensity?: number;
};

export function SparklesCore(props: ParticlesProps) {
  return (
    <ParticlesProvider
      init={async (engine: Engine) => {
        try {
          await loadSlim(engine);
        } catch {
          // Keep the host page on its plain dark fallback if particles cannot initialize.
        }
      }}
    >
      <SparklesParticles {...props} />
    </ParticlesProvider>
  );
}

function SparklesParticles({
  id,
  className,
  background,
  minSize,
  maxSize,
  speed,
  particleColor,
  particleDensity
}: ParticlesProps) {
  const { loaded } = useParticlesProvider();
  const controls = useAnimation();
  const generatedId = useId();

  const particlesLoaded = async (container?: Container) => {
    if (!container) return;

    await controls.start({
      opacity: 1,
      transition: { duration: 1 }
    });
  };

  return (
    <motion.div
      animate={controls}
      className={cn("pointer-events-none h-full w-full opacity-0", className)}
      aria-hidden="true"
    >
      {loaded && (
        <Particles
          id={id || generatedId}
          className="h-full w-full"
          particlesLoaded={particlesLoaded}
          options={{
            background: {
              color: {
                value: background || "#020617"
              }
            },
            fullScreen: {
              enable: false,
              zIndex: 1
            },
            fpsLimit: 60,
            interactivity: {
              events: {
                onClick: {
                  enable: false,
                  mode: "push"
                },
                onHover: {
                  enable: false,
                  mode: "repulse"
                },
                resize: true as any
              },
              modes: {
                push: {
                  quantity: 2
                },
                repulse: {
                  distance: 120,
                  duration: 0.4
                }
              }
            },
            particles: {
              bounce: {
                horizontal: { value: 1 },
                vertical: { value: 1 }
              },
              collisions: {
                absorb: { speed: 2 },
                bounce: {
                  horizontal: { value: 1 },
                  vertical: { value: 1 }
                },
                enable: false,
                maxSpeed: 50,
                mode: "bounce",
                overlap: {
                  enable: true,
                  retries: 0
                }
              },
              color: {
                value: particleColor || "#ffffff",
                animation: {
                  h: { count: 0, enable: false, speed: 1, decay: 0, delay: 0, sync: true, offset: 0 },
                  s: { count: 0, enable: false, speed: 1, decay: 0, delay: 0, sync: true, offset: 0 },
                  l: { count: 0, enable: false, speed: 1, decay: 0, delay: 0, sync: true, offset: 0 }
                }
              },
              effect: {
                close: true,
                fill: true,
                options: {},
                type: {} as SingleOrMultiple<string> | undefined
              },
              groups: {},
              move: {
                angle: { offset: 0, value: 90 },
                attract: {
                  distance: 200,
                  enable: false,
                  rotate: { x: 3000, y: 3000 }
                },
                center: {
                  x: 50,
                  y: 50,
                  mode: "percent",
                  radius: 0
                },
                decay: 0,
                distance: {},
                direction: "none",
                drift: 0,
                enable: true,
                gravity: {
                  acceleration: 9.81,
                  enable: false,
                  inverse: false,
                  maxSpeed: 50
                },
                path: {
                  clamp: true,
                  delay: { value: 0 },
                  enable: false,
                  options: {}
                },
                outModes: { default: "out" },
                random: false,
                size: false,
                speed: {
                  min: 0.08,
                  max: 0.45
                },
                spin: { acceleration: 0, enable: false },
                straight: false,
                trail: {
                  enable: false,
                  length: 10,
                  fill: {}
                },
                vibrate: false,
                warp: false
              },
              number: {
                density: {
                  enable: true,
                  width: 900,
                  height: 900
                },
                limit: {
                  mode: "delete",
                  value: 0
                },
                value: Math.min(particleDensity || 75, 90)
              },
              opacity: {
                value: {
                  min: 0.08,
                  max: 0.65
                },
                animation: {
                  count: 0,
                  enable: true,
                  speed: speed || 1.8,
                  decay: 0,
                  delay: 0,
                  sync: false,
                  mode: "auto",
                  startValue: "random",
                  destroy: "none"
                }
              },
              reduceDuplicates: false,
              shadow: {
                blur: 0,
                color: { value: "#000" },
                enable: false,
                offset: { x: 0, y: 0 }
              },
              shape: {
                close: true,
                fill: true,
                options: {},
                type: "circle"
              },
              size: {
                value: {
                  min: minSize || 0.7,
                  max: maxSize || 1.8
                },
                animation: {
                  count: 0,
                  enable: false,
                  speed: 5,
                  decay: 0,
                  delay: 0,
                  sync: false,
                  mode: "auto",
                  startValue: "random",
                  destroy: "none"
                }
              },
              stroke: { width: 0 },
              zIndex: {
                value: 0,
                opacityRate: 1,
                sizeRate: 1,
                velocityRate: 1
              },
              links: {
                blink: false,
                color: { value: "#fff" },
                consent: false,
                distance: 100,
                enable: false,
                frequency: 1,
                opacity: 1,
                shadow: {
                  blur: 5,
                  color: { value: "#000" },
                  enable: false
                },
                triangles: { enable: false, frequency: 1 },
                width: 1,
                warp: false
              },
              life: {
                count: 0,
                delay: { value: 0, sync: false },
                duration: { value: 0, sync: false }
              }
            },
            detectRetina: true
          } as any}
        />
      )}
    </motion.div>
  );
}
