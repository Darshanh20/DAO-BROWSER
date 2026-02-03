// ==================== SHORTCUTS PAGE MODULE ====================

class ShortcutsPage {
    constructor() {
        this.init();
    }

    init() {
        console.log('Shortcuts page loaded');
        this.addInteractivity();
    }

    addInteractivity() {
        // Add animation to shortcut cards on scroll
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animation = 'fadeInUp 0.6s ease-out forwards';
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.shortcut-card').forEach((card, index) => {
            card.style.opacity = '0';
            card.style.animationDelay = `${index * 0.05}s`;
            observer.observe(card);
        });

        // Add copy-to-clipboard functionality (optional)
        this.addCopyToClipboard();
    }

    addCopyToClipboard() {
        document.querySelectorAll('.shortcut-card').forEach(card => {
            card.addEventListener('click', () => {
                // Get the keyboard shortcut text
                const keysElement = card.querySelector('.shortcut-keys');
                const descElement = card.querySelector('.shortcut-description');
                
                if (keysElement && descElement) {
                    const text = `${keysElement.innerText.trim()} - ${descElement.innerText.trim()}`;
                    navigator.clipboard.writeText(text).then(() => {
                        // Visual feedback
                        const originalBg = card.style.background;
                        card.style.background = 'rgba(96, 165, 250, 0.2)';
                        setTimeout(() => {
                            card.style.background = originalBg;
                        }, 300);
                    });
                }
            });
        });
    }
}

// Initialize when page loads
window.addEventListener('load', () => {
    new ShortcutsPage();
});
