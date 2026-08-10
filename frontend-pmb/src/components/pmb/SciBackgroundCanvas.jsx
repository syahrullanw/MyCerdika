import React, { useEffect, useRef } from "react";

export function SciBackgroundCanvas() {
  const canvasRef = useRef(null);
  const glowRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cursorGlow = glowRef.current;
    if (!canvas || !cursorGlow) return;

    const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let pointerX = window.innerWidth * 0.35;
    let pointerY = window.innerHeight * 0.45;
    let pointerPulse = 0;
    let pointerActive = false;
    let animationFrame = 0;
    const projected = { x: 0, y: 0 };

    const createParticleSprite = () => {
      const sprite = document.createElement("canvas");
      const size = 64;
      const spriteContext = sprite.getContext("2d");
      sprite.width = size;
      sprite.height = size;
      if (!spriteContext) return sprite;

      const center = size / 2;
      const glow = spriteContext.createRadialGradient(center, center, 0, center, center, center);
      glow.addColorStop(0, "rgba(160, 241, 255, 1)");
      glow.addColorStop(0.16, "rgba(128, 229, 255, 0.9)");
      glow.addColorStop(0.42, "rgba(32, 201, 255, 0.34)");
      glow.addColorStop(1, "rgba(32, 201, 255, 0)");
      spriteContext.fillStyle = glow;
      spriteContext.fillRect(0, 0, size, size);
      return sprite;
    };
    const particleSprite = createParticleSprite();

    const createRippleSprite = () => {
      const sprite = document.createElement("canvas");
      const size = 256;
      const spriteContext = sprite.getContext("2d");
      sprite.width = size;
      sprite.height = size;
      if (!spriteContext) return sprite;

      const center = size / 2;
      const glow = spriteContext.createRadialGradient(center, center, 0, center, center, center);
      glow.addColorStop(0, "rgba(151, 239, 255, 0.36)");
      glow.addColorStop(0.2, "rgba(36, 191, 255, 0.22)");
      glow.addColorStop(1, "rgba(19, 140, 255, 0)");
      spriteContext.fillStyle = glow;
      spriteContext.fillRect(0, 0, size, size);
      return sprite;
    };
    const rippleSprite = createRippleSprite();

    const particles = Array.from({ length: 32 }, (_, index) => ({
      lane: (index % 17) - 8,
      depth: (index * 0.173) % 1,
      speed: 0.035 + (index % 7) * 0.009,
      size: 0.7 + (index % 4) * 0.35,
      phase: index * 0.71,
    }));

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      pixelRatio = width < 700 ? 1 : Math.min(window.devicePixelRatio || 1, 1.35);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const projectSurfacePoint = (lane, depth, time) => {
      const horizon = height * 0.26;
      const spread = width * (0.12 + depth * 0.94);
      const normalizedLane = lane / 9;
      const baseX = width * 0.38 + normalizedLane * spread;
      const baseY = horizon + Math.pow(depth, 1.72) * height * 0.9;
      const wave = Math.sin(depth * 15 - time * 1.3 + lane * 0.55) * (5 + depth * 20);
      const crossWave = Math.cos(depth * 8 + time * 0.72 + lane * 0.34) * depth * 7;

      projected.x = baseX + crossWave;
      projected.y = baseY + wave;
    };

    const drawGrid = (time) => {
      context.save();
      context.globalCompositeOperation = "screen";
      context.lineWidth = 0.75;

      for (let lane = -11; lane <= 11; lane += 1) {
        const opacity = 0.12 + (1 - Math.min(Math.abs(lane) / 12, 1)) * 0.19;
        context.strokeStyle = `rgba(63, 181, 255, ${opacity})`;
        context.beginPath();
        for (let sample = 0; sample <= 30; sample += 1) {
          const depth = sample / 30;
          projectSurfacePoint(lane, depth, time);
          if (sample === 0) context.moveTo(projected.x, projected.y);
          else context.lineTo(projected.x, projected.y);
        }
        context.stroke();
      }

      for (let row = 0; row <= 24; row += 1) {
        const depth = row / 24;
        const alpha = 0.07 + depth * 0.25;
        context.strokeStyle = `rgba(65, 207, 255, ${alpha})`;
        context.beginPath();
        for (let laneStep = -40; laneStep <= 40; laneStep += 2) {
          const lane = laneStep / 4;
          projectSurfacePoint(lane, depth, time);
          if (laneStep === -40) context.moveTo(projected.x, projected.y);
          else context.lineTo(projected.x, projected.y);
        }
        context.stroke();
      }
      context.restore();
    };

    const drawParticles = (time) => {
      context.save();
      context.globalCompositeOperation = "screen";
      particles.forEach((particle) => {
        const depth = (particle.depth + time * particle.speed) % 1;
        projectSurfacePoint(particle.lane, depth, time);
        const pulse = 0.45 + Math.sin(time * 3 + particle.phase) * 0.25;
        const drawSize = Math.max(12, (particle.size + depth * 1.7) * 8);
        context.globalAlpha = Math.max(pulse, 0.15);
        context.drawImage(
          particleSprite,
          projected.x - drawSize / 2,
          projected.y - drawSize / 2,
          drawSize,
          drawSize
        );
      });
      context.restore();
    };

    const drawRipple = (time) => {
      const ambientPulse = (Math.sin(time * 2.2) + 1) / 2;
      const radius = 28 + ambientPulse * 24 + pointerPulse * 92;
      context.save();
      context.globalCompositeOperation = "screen";
      context.globalAlpha = pointerActive ? 1 : 0.5;
      context.drawImage(rippleSprite, pointerX - radius, pointerY - radius, radius * 2, radius * 2);
      context.globalAlpha = 1;
      context.strokeStyle = `rgba(115, 226, 255, ${Math.max(0, 0.36 - pointerPulse * 0.3)})`;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(pointerX, pointerY, 18 + pointerPulse * 90, 0, Math.PI * 2);
      context.stroke();
      context.restore();
      pointerPulse = Math.max(0, pointerPulse - 0.018);
    };

    const render = (timestamp = 0) => {
      if (document.hidden) {
        animationFrame = 0;
        return;
      }
      const time = timestamp / 1000;
      context.clearRect(0, 0, width, height);
      drawGrid(time);
      drawParticles(time);
      drawRipple(time);
      if (cursorGlow) {
        cursorGlow.style.transform = `translate3d(${pointerX - 46}px, ${pointerY - 46}px, 0)`;
      }
      if (!reducedMotion) animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    render(0);

    const onPointerMove = (e) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      pointerActive = true;
    };
    const onPointerDown = () => {
      pointerPulse = 1;
    };
    const onMouseLeave = () => {
      pointerActive = false;
    };
    const onVisibilityChange = () => {
      if (!document.hidden && !animationFrame) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.documentElement.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <>
      {/* 3D Wave Canvas */}
      <canvas
        ref={canvasRef}
        className="sci-data-canvas pointer-events-none fixed inset-0 z-0 h-full w-full opacity-90"
        aria-hidden="true"
      />
      {/* Interactive Cursor Glow */}
      <div
        ref={glowRef}
        className="sci-cursor-glow pointer-events-none fixed top-0 left-0 z-10 h-[92px] w-[92px] rounded-full opacity-70 transition-opacity duration-200"
        aria-hidden="true"
      />
    </>
  );
}

export default SciBackgroundCanvas;
