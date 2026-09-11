import { useEffect, useRef } from 'react';

/**
 * NeonBackground — fundo 3D neon renderizado em <canvas> (sem dependências).
 * Partículas orbitando em um campo pseudo-3D com linhas de conexão e brilho
 * ciano/violeta. Leve, desliga-se quando a aba não está visível.
 */
export function NeonBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      hue: number;
    }

    const N = Math.min(90, Math.floor((window.innerWidth * window.innerHeight) / 22000));
    const particles: Particle[] = [];
    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        z: Math.random() * 600 - 300,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        vz: (Math.random() - 0.5) * 0.25,
        hue: Math.random() > 0.5 ? 187 : 262, // ciano / violeta
      });
    }

    const project = (p: Particle) => {
      const scale = 600 / (600 + p.z);
      return {
        x: window.innerWidth / 2 + (p.x - window.innerWidth / 2) * scale,
        y: window.innerHeight / 2 + (p.y - window.innerHeight / 2) * scale,
        scale,
      };
    };

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const projected = particles.map((p) => ({ p, ...project(p) }));

      // Linhas de conexão (constelação)
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const a = projected[i];
          const b = projected[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.14;
            ctx.strokeStyle = `hsla(${a.p.hue}, 90%, 60%, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Partículas com brilho
      for (const { p, x, y, scale } of projected) {
        const radius = Math.max(0.6, 1.8 * scale);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 6);
        glow.addColorStop(0, `hsla(${p.hue}, 95%, 65%, 0.9)`);
        glow.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius * 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.hue}, 100%, 82%, 0.95)`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Movimento
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        if (p.x < 0 || p.x > window.innerWidth) p.vx *= -1;
        if (p.y < 0 || p.y > window.innerHeight) p.vy *= -1;
        if (p.z < -300 || p.z > 300) p.vz *= -1;
      }

      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        draw();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    raf = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ opacity: 0.55 }}
    />
  );
}
