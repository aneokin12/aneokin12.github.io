// 3D Tilt and Magnetic Button Effect

document.addEventListener('DOMContentLoaded', () => {
    // --- 3D Tilt Effect ---
    const tiltCards = document.querySelectorAll('[data-tilt]');

    tiltCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left; // x position within the element
            const y = e.clientY - rect.top;  // y position within the element

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Adjust divisor for stronger/weaker tilt (higher number = weaker tilt)
            const rotateX = ((y - centerY) / centerY) * -15;
            const rotateY = ((x - centerX) / centerX) * 15;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            card.style.transition = 'transform 0.1s ease-out';

            // Glare effect (if card has a .glare child)
            const glare = card.querySelector('.glare');
            if (glare) {
                const rx = (x / rect.width) * 100;
                const ry = (y / rect.height) * 100;
                glare.style.background = `radial-gradient(circle at ${rx}% ${ry}%, rgba(255,255,255,0.15), transparent 40%)`;
            }
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
            card.style.transition = 'transform 0.5s ease-out';

            const glare = card.querySelector('.glare');
            if (glare) {
                glare.style.background = `radial-gradient(circle at 50% 50%, rgba(255,255,255,0), transparent 50%)`;
            }
        });
    });

    // --- Magnetic Button Effect ---
    const magneticBtns = document.querySelectorAll('.magnetic-btn');

    magneticBtns.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            // Move button slightly towards cursor
            btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;

            // Move text inside button slightly more for parallax
            const span = btn.querySelector('span') || btn.querySelector('svg');
            if (span) {
                span.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
            }
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = '';

            const span = btn.querySelector('span') || btn.querySelector('svg');
            if (span) {
                span.style.transform = '';
            }
        });
    });
});
