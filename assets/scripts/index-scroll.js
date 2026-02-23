document.addEventListener('DOMContentLoaded', () => {
    const nudge = document.createElement('div');
    nudge.id = 'scroll-nudge-wrapper';

    const nudgeContent = document.createElement('div');
    nudgeContent.id = 'scroll-nudge';
    nudgeContent.innerHTML = 'Scroll down for a cool project! <br> ↓';

    nudge.appendChild(nudgeContent);
    document.body.appendChild(nudge);

    let idleTime = 0;
    let isActive = true; // start active for first show
    let nudgeShown = false;

    // Nudge cycle
    function resetTimer() {
        idleTime = 0;
    }

    // Reset idle timer on user action
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    window.addEventListener('touchstart', resetTimer);

    setInterval(() => {
        idleTime += 1000;

        // if user has been idle for 2 minutes (120000 ms), show it again
        if (idleTime >= 120000) {
            showNudge();
            idleTime = 0; // reset so it loops every 2 mins idle
        }
    }, 1000);

    // Initial show after 2 seconds
    setTimeout(() => {
        showNudge();
    }, 2000);

    function showNudge() {
        if (nudgeShown) return;
        nudgeShown = true;
        nudge.classList.add('visible');

        // Hide after 15 seconds
        setTimeout(() => {
            nudge.classList.remove('visible');
            nudgeShown = false;
        }, 15000);
    }

    // Handle scroll down navigation
    let navigating = false;

    function navigateToSudGPT() {
        if (navigating) return;
        navigating = true;

        // Transition effect
        document.body.style.transition = 'transform 0.8s cubic-bezier(0.65, 0, 0.35, 1), opacity 0.8s ease';
        document.body.style.transform = 'translateY(-100vh)';
        document.body.style.opacity = '0';

        setTimeout(() => {
            window.location.href = '/sudgpt.html?transition=scroll';
        }, 700);
    }

    window.addEventListener('wheel', (e) => {
        if (e.deltaY > 50) {
            navigateToSudGPT();
        }
    }, { passive: true });

    // Touch support
    let touchStartY = 0;
    window.addEventListener('touchstart', e => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchend', e => {
        let touchEndY = e.changedTouches[0].clientY;
        if (touchStartY - touchEndY > 50) { // Swiped up (scrolled down)
            navigateToSudGPT();
        }
    }, { passive: true });
});
