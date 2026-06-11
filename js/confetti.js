/* Tiny dependency-free confetti. Call confettiBurst() for a celebration. */
const Confetti = (() => {
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  const COLORS = ['#ffd60a', '#ffb703', '#7c5cff', '#28d8a1', '#ff5d73', '#9dc3e6', '#ffffff'];
  let particles = [];
  let raf = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function spawn(count, originX, originY, spread) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const speed = 7 + Math.random() * 9;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1,
        decay: 0.006 + Math.random() * 0.008,
      });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(p => p.life > 0 && p.y < canvas.height + 40);
    for (const p of particles) {
      p.vy += 0.22;          // gravity
      p.vx *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= p.decay;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (particles.length) {
      raf = requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      raf = null;
    }
  }

  function burst() {
    spawn(90, canvas.width / 2, canvas.height * 0.55, 2.4);
    spawn(45, canvas.width * 0.2, canvas.height * 0.7, 1.6);
    spawn(45, canvas.width * 0.8, canvas.height * 0.7, 1.6);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function burstAt(x, y) {
    spawn(60, x, y, 2.2);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  return { burst, burstAt };
})();
