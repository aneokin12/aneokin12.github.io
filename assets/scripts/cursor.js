// Custom smooth-following dot cursor

document.addEventListener('DOMContentLoaded', () => {
    // Create cursor elements
    const cursorDot = document.createElement('div');
    const cursorOutline = document.createElement('div');

    cursorDot.classList.add('cursor-dot');
    cursorOutline.classList.add('cursor-outline');

    document.body.appendChild(cursorDot);
    document.body.appendChild(cursorOutline);

    let mouseX = 0;
    let mouseY = 0;
    let outlineX = 0;
    let outlineY = 0;

    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;

        // Dot follows instantly
        cursorDot.style.transform = `translate(calc(${mouseX}px - 50%), calc(${mouseY}px - 50%))`;
    });

    // Smooth animation for outline
    function animate() {
        // Easing factor
        let dx = mouseX - outlineX;
        let dy = mouseY - outlineY;

        outlineX += dx * 0.15;
        outlineY += dy * 0.15;

        cursorOutline.style.transform = `translate(calc(${outlineX}px - 50%), calc(${outlineY}px - 50%))`;

        requestAnimationFrame(animate);
    }

    animate();

    // Hover effects on interactable elements
    const interactables = document.querySelectorAll('a, button, input, .interactable');

    interactables.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursorOutline.classList.add('hovering');
            cursorDot.classList.add('hovering');
        });

        el.addEventListener('mouseleave', () => {
            cursorOutline.classList.remove('hovering');
            cursorDot.classList.remove('hovering');
        });
    });
});
